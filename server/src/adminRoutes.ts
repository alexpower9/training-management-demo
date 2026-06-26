import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin } from './auth.js';
import { provisionEmployeeAccount } from './cognitoAdministration.js';
import { getPrisma } from './database.js';
import {
  addCalendarMonths,
  formatDateOnly,
  isValidTimeZone,
  parseDateOnly,
} from './dates.js';
import { AppError } from './errors.js';
import { publicEmployeeRecord } from './employeeSerialization.js';
import {
  dateOnlyString,
  ensureFound,
  identifier,
  pageResult,
  paginationQuery,
  parseId,
} from './routeUtils.js';

const employeeCreateInput = z.object({
  displayName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
});
const employeeUpdateInput = employeeCreateInput.pick({ displayName: true });
const siteInput = z.object({
  name: z.string().trim().min(1).max(160),
  timeZone: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(isValidTimeZone, 'Enter a valid IANA time zone.'),
});
const siteIdsInput = z
  .array(identifier)
  .max(1000)
  .superRefine((siteIds, context) => {
    if (new Set(siteIds).size !== siteIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Each site may only be selected once.',
      });
    }
  });
const courseInput = z.object({
  name: z.string().trim().min(1).max(180),
  validityMonths: z.number().int().min(1).max(120),
  siteIds: siteIdsInput,
});
const completionInput = z.object({
  employeeId: identifier,
  courseId: identifier,
  completedOn: dateOnlyString,
  comment: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((comment) => comment || null),
});
const voidInput = z.object({
  reason: z.string().trim().min(3).max(500),
});

function activeFilter(includeArchived: string) {
  return includeArchived === 'true' ? {} : { archivedAt: null };
}

const activeCourseRequirementFilter = {
  course: { archivedAt: null },
} satisfies Prisma.SiteCourseRequirementWhereInput;

function dateFields<T extends { completedOn: Date; expiresOn: Date }>(row: T) {
  return {
    ...row,
    completedOn: formatDateOnly(row.completedOn),
    expiresOn: formatDateOnly(row.expiresOn),
  };
}

function employeeEmailExistsError() {
  return new AppError(
    409,
    'EMPLOYEE_EMAIL_EXISTS',
    'An employee already uses that email address.',
    { email: ['Use an email address that is not already assigned to an employee.'] },
  );
}

async function validateCourseSiteSelection(
  transaction: Prisma.TransactionClient,
  siteIds: string[],
  existingSiteIds = new Set<string>(),
) {
  const sites = await transaction.site.findMany({
    where: { id: { in: siteIds } },
    select: { id: true, archivedAt: true },
  });
  if (sites.length !== siteIds.length) {
    throw new AppError(
      400,
      'INVALID_SITE_SELECTION',
      'One or more selected sites do not exist.',
      { siteIds: ['Select valid sites.'] },
    );
  }

  const newlySelectedArchivedSite = sites.some(
    (site) => site.archivedAt && !existingSiteIds.has(site.id),
  );
  if (newlySelectedArchivedSite) {
    throw new AppError(
      400,
      'ARCHIVED_SITE_SELECTION',
      'Archived sites cannot be newly assigned to a course.',
      { siteIds: ['Remove newly selected archived sites.'] },
    );
  }
}

export async function registerAdminRoutes(app: FastifyInstance) {
  const admin = { preHandler: [authenticate, requireAdmin] };

  app.get('/api/v1/admin/employees', admin, async (request) => {
    const query = paginationQuery(request);
    const prisma = await getPrisma();
    const where: Prisma.EmployeeWhereInput = {
      ...activeFilter(query.includeArchived),
      ...(query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: {
          completions: {
            where: { voidedAt: null, course: { archivedAt: null } },
            select: { completedOn: true },
            orderBy: { completedOn: 'desc' },
            take: 1,
          },
        },
        orderBy: { displayName: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.employee.count({ where }),
    ]);
    return pageResult(
      items.map((item) => ({
        ...publicEmployeeRecord(item),
        latestCompletionOn: item.completions[0]
          ? formatDateOnly(item.completions[0].completedOn)
          : null,
        completions: undefined,
      })),
      total,
      query.page,
      query.pageSize,
    );
  });

  app.get('/api/v1/admin/employees/:id', admin, async (request) => {
    const employee = await (await getPrisma()).employee.findUnique({
      where: { id: parseId(request) },
      include: {
        completions: {
          where: { course: { archivedAt: null } },
          include: { course: true },
          orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
        },
      },
    });
    ensureFound(employee, 'EMPLOYEE_NOT_FOUND', 'The employee was not found.');
    const publicRecord = publicEmployeeRecord(employee);
    return {
      ...publicRecord,
      completions: employee.completions.map(dateFields),
    };
  });

  app.post('/api/v1/admin/employees', admin, async (request, reply) => {
    const data = employeeCreateInput.parse(request.body);
    const prisma = await getPrisma();
    const existingEmployee = await prisma.employee.findFirst({
      where: { email: { equals: data.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingEmployee) throw employeeEmailExistsError();

    const employee = await provisionEmployeeAccount(
      data,
      async (account, sendInvitation) =>
        prisma.$transaction(async (transaction) => {
          let created;
          try {
            created = await transaction.employee.create({
              data: {
                displayName: data.displayName,
                email: data.email,
                cognitoSubject: account.subject,
              },
            });
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            ) {
              throw employeeEmailExistsError();
            }
            throw error;
          }

          await sendInvitation();
          return created;
        }),
      (cleanupError, originalError) => {
        request.log.error(
          {
            cleanupError,
            originalError,
            employeeEmail: data.email,
          },
          'Failed to remove Cognito user after employee provisioning failure.',
        );
      },
    );

    return reply.status(201).send(publicEmployeeRecord(employee));
  });

  app.patch('/api/v1/admin/employees/:id', admin, async (request) => {
    const id = parseId(request);
    const data = employeeUpdateInput.partial().parse(request.body);
    const prisma = await getPrisma();
    ensureFound(
      await prisma.employee.findUnique({ where: { id } }),
      'EMPLOYEE_NOT_FOUND',
      'The employee was not found.',
    );
    return publicEmployeeRecord(await prisma.employee.update({
      where: { id },
      data,
    }));
  });

  for (const action of ['archive', 'restore'] as const) {
    app.post(`/api/v1/admin/employees/:id/${action}`, admin, async (request) => {
      const id = parseId(request);
      const prisma = await getPrisma();
      ensureFound(
        await prisma.employee.findUnique({ where: { id } }),
        'EMPLOYEE_NOT_FOUND',
        'The employee was not found.',
      );
      return publicEmployeeRecord(await prisma.employee.update({
        where: { id },
        data: { archivedAt: action === 'archive' ? new Date() : null },
      }));
    });
  }

  app.get('/api/v1/admin/sites', admin, async (request) => {
    const query = paginationQuery(request);
    const prisma = await getPrisma();
    const where: Prisma.SiteWhereInput = {
      ...activeFilter(query.includeArchived),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.site.findMany({
        where,
        include: {
          _count: {
            select: {
              requirements: { where: activeCourseRequirementFilter },
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.site.count({ where }),
    ]);
    return pageResult(items, total, query.page, query.pageSize);
  });

  app.get('/api/v1/admin/site-options', admin, async () => {
    return (await getPrisma()).site.findMany({
      select: {
        id: true,
        name: true,
        archivedAt: true,
      },
      orderBy: { name: 'asc' },
    });
  });

  app.get('/api/v1/admin/sites/:id', admin, async (request) => {
    const site = await (await getPrisma()).site.findUnique({
      where: { id: parseId(request) },
      include: {
        requirements: {
          where: activeCourseRequirementFilter,
          include: { course: true },
          orderBy: { course: { name: 'asc' } },
        },
      },
    });
    ensureFound(site, 'SITE_NOT_FOUND', 'The site was not found.');
    return site;
  });

  app.post('/api/v1/admin/sites', admin, async (request, reply) => {
    const data = siteInput.parse(request.body);
    const site = await (await getPrisma()).site.create({
      data,
    });
    return reply.status(201).send(site);
  });

  app.patch('/api/v1/admin/sites/:id', admin, async (request) => {
    const id = parseId(request);
    const data = siteInput.partial().parse(request.body);
    const prisma = await getPrisma();
    ensureFound(
      await prisma.site.findUnique({ where: { id } }),
      'SITE_NOT_FOUND',
      'The site was not found.',
    );
    return prisma.site.update({
      where: { id },
      data,
    });
  });

  for (const action of ['archive', 'restore'] as const) {
    app.post(`/api/v1/admin/sites/:id/${action}`, admin, async (request) => {
      const id = parseId(request);
      const prisma = await getPrisma();
      ensureFound(
        await prisma.site.findUnique({ where: { id } }),
        'SITE_NOT_FOUND',
        'The site was not found.',
      );
      return prisma.site.update({
        where: { id },
        data: { archivedAt: action === 'archive' ? new Date() : null },
      });
    });
  }

  app.get('/api/v1/admin/courses', admin, async (request) => {
    const query = paginationQuery(request);
    const prisma = await getPrisma();
    const where: Prisma.CourseWhereInput = {
      ...activeFilter(query.includeArchived),
      ...(query.search
        ? {
            name: { contains: query.search, mode: 'insensitive' },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.course.findMany({
        where,
        include: { requirements: { include: { site: true } } },
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.course.count({ where }),
    ]);
    return pageResult(items, total, query.page, query.pageSize);
  });

  app.get('/api/v1/admin/courses/:id', admin, async (request) => {
    const course = await (await getPrisma()).course.findUnique({
      where: { id: parseId(request) },
      include: {
        requirements: {
          include: { site: true },
          orderBy: { site: { name: 'asc' } },
        },
        completions: {
          where: { voidedAt: null },
          include: { employee: true },
          orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
          take: 100,
        },
      },
    });
    ensureFound(course, 'COURSE_NOT_FOUND', 'The course was not found.');
    return {
      ...course,
      completions: course.completions.map((completion) =>
        dateFields({
          ...completion,
          employee: publicEmployeeRecord(completion.employee),
        }),
      ),
    };
  });

  app.post('/api/v1/admin/courses', admin, async (request, reply) => {
    const data = courseInput.parse(request.body);
    const course = await (await getPrisma()).$transaction(async (transaction) => {
      await validateCourseSiteSelection(transaction, data.siteIds);
      return transaction.course.create({
        data: {
          name: data.name,
          validityMonths: data.validityMonths,
          ...(data.siteIds.length
            ? {
                requirements: {
                  create: data.siteIds.map((siteId) => ({ siteId })),
                },
              }
            : {}),
        },
        include: { requirements: { include: { site: true } } },
      });
    });
    return reply.status(201).send(course);
  });

  app.patch('/api/v1/admin/courses/:id', admin, async (request) => {
    const id = parseId(request);
    const data = courseInput.parse(request.body);
    const prisma = await getPrisma();
    return prisma.$transaction(async (transaction) => {
      const course = await transaction.course.findUnique({
        where: { id },
        include: { requirements: true },
      });
      ensureFound(course, 'COURSE_NOT_FOUND', 'The course was not found.');

      const existingSiteIds = new Set(
        course.requirements.map((requirement) => requirement.siteId),
      );
      await validateCourseSiteSelection(
        transaction,
        data.siteIds,
        existingSiteIds,
      );

      await transaction.siteCourseRequirement.deleteMany({
        where: {
          courseId: id,
          siteId: { notIn: data.siteIds },
        },
      });
      const newSiteIds = data.siteIds.filter(
        (siteId) => !existingSiteIds.has(siteId),
      );
      if (newSiteIds.length) {
        await transaction.siteCourseRequirement.createMany({
          data: newSiteIds.map((siteId) => ({ siteId, courseId: id })),
          skipDuplicates: true,
        });
      }

      return transaction.course.update({
        where: { id },
        data: {
          name: data.name,
          validityMonths: data.validityMonths,
        },
        include: {
          requirements: {
            include: { site: true },
            orderBy: { site: { name: 'asc' } },
          },
        },
      });
    });
  });

  for (const action of ['archive', 'restore'] as const) {
    app.post(`/api/v1/admin/courses/:id/${action}`, admin, async (request) => {
      const id = parseId(request);
      const prisma = await getPrisma();
      ensureFound(
        await prisma.course.findUnique({ where: { id } }),
        'COURSE_NOT_FOUND',
        'The course was not found.',
      );
      return prisma.course.update({
        where: { id },
        data: { archivedAt: action === 'archive' ? new Date() : null },
      });
    });
  }

  app.get('/api/v1/admin/completions', admin, async (request) => {
    const query = paginationQuery(request);
    const filters = z
      .object({
        employeeId: identifier.optional(),
        courseId: identifier.optional(),
        includeVoided: z.enum(['true', 'false']).default('false'),
      })
      .parse(request.query);
    const prisma = await getPrisma();
    const where: Prisma.CourseCompletionWhereInput = {
      employeeId: filters.employeeId,
      courseId: filters.courseId,
      voidedAt: filters.includeVoided === 'true' ? undefined : null,
      ...(query.search
        ? {
            OR: [
              {
                employee: {
                  displayName: { contains: query.search, mode: 'insensitive' },
                },
              },
              { course: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.courseCompletion.findMany({
        where,
        include: { employee: true, course: true },
        orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.courseCompletion.count({ where }),
    ]);
    return pageResult(
      items.map((completion) =>
        dateFields({
          ...completion,
          employee: publicEmployeeRecord(completion.employee),
        }),
      ),
      total,
      query.page,
      query.pageSize,
    );
  });

  app.post('/api/v1/admin/completions', admin, async (request, reply) => {
    const data = completionInput.parse(request.body);
    const prisma = await getPrisma();
    const [employee, course] = await Promise.all([
      prisma.employee.findFirst({ where: { id: data.employeeId, archivedAt: null } }),
      prisma.course.findFirst({ where: { id: data.courseId, archivedAt: null } }),
    ]);
    ensureFound(employee, 'EMPLOYEE_NOT_FOUND', 'The employee was not found.');
    ensureFound(course, 'COURSE_NOT_FOUND', 'The course was not found.');

    const validityMonthsApplied = course.validityMonths;
    const expiresOn = addCalendarMonths(data.completedOn, validityMonthsApplied);

    const completion = await prisma.courseCompletion.create({
      data: {
        employeeId: data.employeeId,
        courseId: data.courseId,
        completedOn: parseDateOnly(data.completedOn),
        expiresOn: parseDateOnly(expiresOn),
        validityMonthsApplied,
        comment: data.comment,
        recordedBySubject: request.auth.subject,
      },
    });
    return reply.status(201).send(dateFields(completion));
  });

  app.post('/api/v1/admin/completions/:id/void', admin, async (request) => {
    const data = voidInput.parse(request.body);
    const id = parseId(request);
    const prisma = await getPrisma();
    const result = await prisma.courseCompletion.updateMany({
      where: { id, voidedAt: null },
      data: {
        voidedAt: new Date(),
        voidedBySubject: request.auth.subject,
        voidReason: data.reason,
      },
    });
    if (!result.count) {
      ensureFound(
        await prisma.courseCompletion.findUnique({ where: { id } }),
        'COMPLETION_NOT_FOUND',
        'The completion was not found.',
      );
      throw new AppError(
        409,
        'COMPLETION_ALREADY_VOIDED',
        'The completion is already voided.',
      );
    }
    const completion = await prisma.courseCompletion.findUnique({ where: { id } });
    ensureFound(
      completion,
      'COMPLETION_NOT_FOUND',
      'The completion was not found.',
    );
    return dateFields(completion);
  });
}
