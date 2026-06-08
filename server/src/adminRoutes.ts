import { CompletionExpirySource, Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin } from './auth.js';
import { getPrisma } from './database.js';
import {
  addCalendarMonths,
  formatDateOnly,
  parseDateOnly,
  todayInTimeZone,
} from './dates.js';
import { AppError } from './errors.js';
import {
  dateOnlyString,
  editConflict,
  ensureFound,
  expectedVersion,
  identifier,
  jsonSnapshot,
  pageResult,
  paginationQuery,
  parseId,
} from './routeUtils.js';

const employeeInput = z.object({
  displayName: z.string().trim().min(1).max(160),
  jobTitle: z.string().trim().min(1).max(120),
  crew: z.string().trim().max(120).nullable().optional(),
  homeBase: z.string().trim().max(120).nullable().optional(),
});
const customerInput = z.object({
  name: z.string().trim().min(1).max(160),
  contact: z.string().trim().max(160).nullable().optional(),
});
const siteInput = z.object({
  customerId: identifier,
  name: z.string().trim().min(1).max(160),
  region: z.string().trim().max(160).nullable().optional(),
  timeZone: z.string().trim().min(1).max(80),
});
const courseInput = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(180),
  category: z.string().trim().max(100).nullable().optional(),
  defaultValidityMonths: z.number().int().min(1).max(120).nullable().optional(),
});
const versionBody = z.object({ expectedVersion });
const requirementInput = z.object({
  siteId: identifier,
  courseId: identifier,
  effectiveFrom: dateOnlyString,
  effectiveTo: dateOnlyString.nullable().optional(),
  warningDays: z.number().int().min(0).max(365).default(45),
});
const completionInput = z
  .object({
    employeeId: identifier,
    courseId: identifier,
    completedOn: dateOnlyString,
    expirySource: z.nativeEnum(CompletionExpirySource),
    expiresOn: dateOnlyString.optional(),
  })
  .superRefine((value, context) => {
    if (value.expirySource === CompletionExpirySource.MANUAL && !value.expiresOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresOn'],
        message: 'An expiry date is required for manual expiry.',
      });
    }
  });
const voidInput = z.object({
  reason: z.string().trim().min(3).max(500),
});

type Transaction = Prisma.TransactionClient;

function jsonValue(value: unknown) {
  return jsonSnapshot(value) as Prisma.InputJsonValue;
}

async function audit(
  tx: Transaction,
  request: FastifyRequest,
  action: string,
  entityType: string,
  entityId: string,
  beforeData: unknown,
  afterData: unknown,
) {
  await tx.auditEvent.create({
    data: {
      actorSubject: request.auth.subject,
      actorName: request.auth.userName,
      action,
      entityType,
      entityId,
      requestId: request.id,
      beforeData: beforeData === null ? Prisma.JsonNull : jsonValue(beforeData),
      afterData: afterData === null ? Prisma.JsonNull : jsonValue(afterData),
    },
  });
}

function activeFilter(includeArchived: string) {
  return includeArchived === 'true' ? {} : { archivedAt: null };
}

function dateFields<T extends { completedOn: Date; expiresOn: Date }>(row: T) {
  return {
    ...row,
    completedOn: formatDateOnly(row.completedOn),
    expiresOn: formatDateOnly(row.expiresOn),
  };
}

async function updateEmployee(
  prisma: PrismaClient,
  request: FastifyRequest,
  id: string,
  body: z.infer<typeof employeeInput> & { expectedVersion: number },
) {
  const { expectedVersion: version, ...data } = body;
  return prisma.$transaction(async (tx) => {
    const before = await tx.employee.findUnique({ where: { id } });
    ensureFound(before, 'EMPLOYEE_NOT_FOUND', 'The employee was not found.');
    const result = await tx.employee.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (!result.count) throw editConflict();
    const after = await tx.employee.findUniqueOrThrow({ where: { id } });
    await audit(tx, request, 'employee.updated', 'employee', id, before, after);
    return after;
  });
}

export async function registerAdminRoutes(app: FastifyInstance) {
  const admin = { preHandler: [authenticate, requireAdmin] };

  app.get('/api/v1/admin/overview', admin, async () => {
    const prisma = await getPrisma();
    const now = new Date();
    const today = parseDateOnly(new Date().toISOString().slice(0, 10));
    const soon = new Date(today.getTime() + 45 * 86400000);
    const [
      employees,
      customers,
      sites,
      courses,
      recentCompletions,
      expiringCompletions,
      sitesWithRequirements,
      recentAudit,
    ] = await Promise.all([
      prisma.employee.count({ where: { archivedAt: null } }),
      prisma.customer.count({ where: { archivedAt: null } }),
      prisma.site.count({ where: { archivedAt: null } }),
      prisma.course.count({ where: { archivedAt: null } }),
      prisma.courseCompletion.count({
        where: {
          voidedAt: null,
          recordedAt: { gte: new Date(now.getTime() - 30 * 86400000) },
        },
      }),
      prisma.courseCompletion.count({
        where: {
          voidedAt: null,
          expiresOn: { gte: today, lte: soon },
        },
      }),
      prisma.siteCourseRequirement.groupBy({
        by: ['siteId'],
        where: {
          effectiveFrom: { lte: today },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        },
      }),
      prisma.auditEvent.findMany({
        orderBy: { occurredAt: 'desc' },
        take: 8,
      }),
    ]);

    return {
      metrics: {
        employees,
        customers,
        sites,
        courses,
        recentCompletions,
        expiringCompletions,
        sitesWithoutRequirements: Math.max(0, sites - sitesWithRequirements.length),
      },
      recentAudit,
    };
  });

  app.get('/api/v1/admin/employees', admin, async (request) => {
    const query = paginationQuery(request);
    const prisma = await getPrisma();
    const where: Prisma.EmployeeWhereInput = {
      ...activeFilter(query.includeArchived),
      ...(query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { jobTitle: { contains: query.search, mode: 'insensitive' } },
              { crew: { contains: query.search, mode: 'insensitive' } },
              { homeBase: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: {
          completions: {
            where: { voidedAt: null },
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
        ...item,
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
    const prisma = await getPrisma();
    const employee = await prisma.employee.findUnique({
      where: { id: parseId(request) },
      include: {
        completions: {
          include: { course: true },
          orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
        },
      },
    });
    ensureFound(employee, 'EMPLOYEE_NOT_FOUND', 'The employee was not found.');
    return {
      ...employee,
      completions: employee.completions.map(dateFields),
    };
  });

  app.post('/api/v1/admin/employees', admin, async (request, reply) => {
    const data = employeeInput.parse(request.body);
    const prisma = await getPrisma();
    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({ data });
      await audit(tx, request, 'employee.created', 'employee', created.id, null, created);
      return created;
    });
    return reply.status(201).send(employee);
  });

  app.patch('/api/v1/admin/employees/:id', admin, async (request) => {
    const data = employeeInput.partial().merge(versionBody).parse(request.body);
    return updateEmployee(await getPrisma(), request, parseId(request), {
      displayName: data.displayName,
      jobTitle: data.jobTitle,
      crew: data.crew,
      homeBase: data.homeBase,
      expectedVersion: data.expectedVersion,
    } as z.infer<typeof employeeInput> & { expectedVersion: number });
  });

  for (const action of ['archive', 'restore'] as const) {
    app.post(`/api/v1/admin/employees/:id/${action}`, admin, async (request) => {
      const { expectedVersion: version } = versionBody.parse(request.body);
      const id = parseId(request);
      const prisma = await getPrisma();
      return prisma.$transaction(async (tx) => {
        const before = await tx.employee.findUnique({ where: { id } });
        ensureFound(before, 'EMPLOYEE_NOT_FOUND', 'The employee was not found.');
        const result = await tx.employee.updateMany({
          where: { id, version },
          data: {
            archivedAt: action === 'archive' ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (!result.count) throw editConflict();
        const after = await tx.employee.findUniqueOrThrow({ where: { id } });
        await audit(
          tx,
          request,
          `employee.${action}d`,
          'employee',
          id,
          before,
          after,
        );
        return after;
      });
    });
  }

  app.get('/api/v1/admin/customers', admin, async (request) => {
    const query = paginationQuery(request);
    const prisma = await getPrisma();
    const where: Prisma.CustomerWhereInput = {
      ...activeFilter(query.includeArchived),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          sites: {
            include: {
              _count: { select: { requirements: true } },
            },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.customer.count({ where }),
    ]);
    return pageResult(items, total, query.page, query.pageSize);
  });

  app.get('/api/v1/admin/customers/:id', admin, async (request) => {
    const customer = await (await getPrisma()).customer.findUnique({
      where: { id: parseId(request) },
      include: {
        sites: {
          include: { _count: { select: { requirements: true } } },
          orderBy: { name: 'asc' },
        },
      },
    });
    ensureFound(customer, 'CUSTOMER_NOT_FOUND', 'The customer was not found.');
    return customer;
  });

  app.post('/api/v1/admin/customers', admin, async (request, reply) => {
    const data = customerInput.parse(request.body);
    const prisma = await getPrisma();
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({ data });
      await audit(tx, request, 'customer.created', 'customer', created.id, null, created);
      return created;
    });
    return reply.status(201).send(customer);
  });

  app.patch('/api/v1/admin/customers/:id', admin, async (request) => {
    const { expectedVersion: version, ...data } = customerInput
      .partial()
      .merge(versionBody)
      .parse(request.body);
    const id = parseId(request);
    const prisma = await getPrisma();
    return prisma.$transaction(async (tx) => {
      const before = await tx.customer.findUnique({ where: { id } });
      ensureFound(before, 'CUSTOMER_NOT_FOUND', 'The customer was not found.');
      const result = await tx.customer.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!result.count) throw editConflict();
      const after = await tx.customer.findUniqueOrThrow({ where: { id } });
      await audit(tx, request, 'customer.updated', 'customer', id, before, after);
      return after;
    });
  });

  for (const action of ['archive', 'restore'] as const) {
    app.post(`/api/v1/admin/customers/:id/${action}`, admin, async (request) => {
      const { expectedVersion: version } = versionBody.parse(request.body);
      const id = parseId(request);
      const prisma = await getPrisma();
      return prisma.$transaction(async (tx) => {
        const before = await tx.customer.findUnique({
          where: { id },
          include: { sites: { where: { archivedAt: null } } },
        });
        ensureFound(before, 'CUSTOMER_NOT_FOUND', 'The customer was not found.');
        if (action === 'archive' && before.sites.length) {
          throw new AppError(
            409,
            'CUSTOMER_HAS_ACTIVE_SITES',
            'Archive all customer sites before archiving the customer.',
          );
        }
        const result = await tx.customer.updateMany({
          where: { id, version },
          data: {
            archivedAt: action === 'archive' ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (!result.count) throw editConflict();
        const after = await tx.customer.findUniqueOrThrow({ where: { id } });
        await audit(tx, request, `customer.${action}d`, 'customer', id, before, after);
        return after;
      });
    });
  }

  app.get('/api/v1/admin/sites', admin, async (request) => {
    const query = paginationQuery(request);
    const customerId = z
      .object({ customerId: identifier.optional() })
      .parse(request.query).customerId;
    const prisma = await getPrisma();
    const where: Prisma.SiteWhereInput = {
      ...activeFilter(query.includeArchived),
      customerId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { region: { contains: query.search, mode: 'insensitive' } },
              { customer: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.site.findMany({
        where,
        include: {
          customer: true,
          _count: { select: { requirements: true } },
        },
        orderBy: [{ customer: { name: 'asc' } }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.site.count({ where }),
    ]);
    return pageResult(items, total, query.page, query.pageSize);
  });

  app.get('/api/v1/admin/sites/:id', admin, async (request) => {
    const site = await (await getPrisma()).site.findUnique({
      where: { id: parseId(request) },
      include: {
        customer: true,
        requirements: {
          include: { course: true },
          orderBy: [{ effectiveTo: 'asc' }, { course: { name: 'asc' } }],
        },
      },
    });
    ensureFound(site, 'SITE_NOT_FOUND', 'The site was not found.');
    return {
      ...site,
      requirements: site.requirements.map((requirement) => ({
        ...requirement,
        effectiveFrom: formatDateOnly(requirement.effectiveFrom),
        effectiveTo: requirement.effectiveTo
          ? formatDateOnly(requirement.effectiveTo)
          : null,
      })),
    };
  });

  app.post('/api/v1/admin/sites', admin, async (request, reply) => {
    const data = siteInput.parse(request.body);
    const prisma = await getPrisma();
    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, archivedAt: null },
    });
    ensureFound(customer, 'CUSTOMER_NOT_FOUND', 'The customer was not found.');
    const site = await prisma.$transaction(async (tx) => {
      const created = await tx.site.create({ data });
      await audit(tx, request, 'site.created', 'site', created.id, null, created);
      return created;
    });
    return reply.status(201).send(site);
  });

  app.patch('/api/v1/admin/sites/:id', admin, async (request) => {
    const { expectedVersion: version, ...data } = siteInput
      .partial()
      .merge(versionBody)
      .parse(request.body);
    const id = parseId(request);
    const prisma = await getPrisma();
    if (data.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: data.customerId, archivedAt: null },
      });
      ensureFound(customer, 'CUSTOMER_NOT_FOUND', 'The customer was not found.');
    }
    return prisma.$transaction(async (tx) => {
      const before = await tx.site.findUnique({ where: { id } });
      ensureFound(before, 'SITE_NOT_FOUND', 'The site was not found.');
      const result = await tx.site.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!result.count) throw editConflict();
      const after = await tx.site.findUniqueOrThrow({ where: { id } });
      await audit(tx, request, 'site.updated', 'site', id, before, after);
      return after;
    });
  });

  for (const action of ['archive', 'restore'] as const) {
    app.post(`/api/v1/admin/sites/:id/${action}`, admin, async (request) => {
      const { expectedVersion: version } = versionBody.parse(request.body);
      const id = parseId(request);
      const prisma = await getPrisma();
      return prisma.$transaction(async (tx) => {
        const before = await tx.site.findUnique({
          where: { id },
          include: { customer: true },
        });
        ensureFound(before, 'SITE_NOT_FOUND', 'The site was not found.');
        if (action === 'restore' && before.customer.archivedAt) {
          throw new AppError(
            409,
            'CUSTOMER_ARCHIVED',
            'Restore the customer before restoring this site.',
          );
        }
        const result = await tx.site.updateMany({
          where: { id, version },
          data: {
            archivedAt: action === 'archive' ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (!result.count) throw editConflict();
        const after = await tx.site.findUniqueOrThrow({ where: { id } });
        await audit(tx, request, `site.${action}d`, 'site', id, before, after);
        return after;
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
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { category: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.course.findMany({
        where,
        include: {
          requirements: {
            where: { effectiveTo: null },
            include: { site: { include: { customer: true } } },
          },
        },
        orderBy: [{ code: 'asc' }],
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
          include: { site: { include: { customer: true } } },
          orderBy: { effectiveFrom: 'desc' },
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
      requirements: course.requirements.map((requirement) => ({
        ...requirement,
        effectiveFrom: formatDateOnly(requirement.effectiveFrom),
        effectiveTo: requirement.effectiveTo
          ? formatDateOnly(requirement.effectiveTo)
          : null,
      })),
      completions: course.completions.map(dateFields),
    };
  });

  app.post('/api/v1/admin/courses', admin, async (request, reply) => {
    const data = courseInput.parse(request.body);
    const prisma = await getPrisma();
    const course = await prisma.$transaction(async (tx) => {
      const created = await tx.course.create({
        data: { ...data, code: data.code.toUpperCase() },
      });
      await audit(tx, request, 'course.created', 'course', created.id, null, created);
      return created;
    });
    return reply.status(201).send(course);
  });

  app.patch('/api/v1/admin/courses/:id', admin, async (request) => {
    const { expectedVersion: version, ...parsed } = courseInput
      .partial()
      .merge(versionBody)
      .parse(request.body);
    const data = {
      ...parsed,
      ...(parsed.code ? { code: parsed.code.toUpperCase() } : {}),
    };
    const id = parseId(request);
    const prisma = await getPrisma();
    return prisma.$transaction(async (tx) => {
      const before = await tx.course.findUnique({ where: { id } });
      ensureFound(before, 'COURSE_NOT_FOUND', 'The course was not found.');
      const result = await tx.course.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!result.count) throw editConflict();
      const after = await tx.course.findUniqueOrThrow({ where: { id } });
      await audit(tx, request, 'course.updated', 'course', id, before, after);
      return after;
    });
  });

  for (const action of ['archive', 'restore'] as const) {
    app.post(`/api/v1/admin/courses/:id/${action}`, admin, async (request) => {
      const { expectedVersion: version } = versionBody.parse(request.body);
      const id = parseId(request);
      const prisma = await getPrisma();
      return prisma.$transaction(async (tx) => {
        const before = await tx.course.findUnique({
          where: { id },
          include: { requirements: { where: { effectiveTo: null } } },
        });
        ensureFound(before, 'COURSE_NOT_FOUND', 'The course was not found.');
        if (action === 'archive' && before.requirements.length) {
          throw new AppError(
            409,
            'COURSE_HAS_OPEN_REQUIREMENTS',
            'End all open site requirements before archiving the course.',
          );
        }
        const result = await tx.course.updateMany({
          where: { id, version },
          data: {
            archivedAt: action === 'archive' ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (!result.count) throw editConflict();
        const after = await tx.course.findUniqueOrThrow({ where: { id } });
        await audit(tx, request, `course.${action}d`, 'course', id, before, after);
        return after;
      });
    });
  }

  app.post('/api/v1/admin/requirements', admin, async (request, reply) => {
    const data = requirementInput.parse(request.body);
    const prisma = await getPrisma();
    const [site, course] = await Promise.all([
      prisma.site.findFirst({
        where: { id: data.siteId, archivedAt: null, customer: { archivedAt: null } },
      }),
      prisma.course.findFirst({ where: { id: data.courseId, archivedAt: null } }),
    ]);
    ensureFound(site, 'SITE_NOT_FOUND', 'The site was not found.');
    ensureFound(course, 'COURSE_NOT_FOUND', 'The course was not found.');
    const requirement = await prisma.$transaction(async (tx) => {
      const created = await tx.siteCourseRequirement.create({
        data: {
          ...data,
          effectiveFrom: parseDateOnly(data.effectiveFrom),
          effectiveTo: data.effectiveTo ? parseDateOnly(data.effectiveTo) : null,
          createdBySubject: request.auth.subject,
        },
      });
      await audit(
        tx,
        request,
        'requirement.created',
        'site_course_requirement',
        created.id,
        null,
        created,
      );
      return created;
    });
    return reply.status(201).send({
      ...requirement,
      effectiveFrom: formatDateOnly(requirement.effectiveFrom),
      effectiveTo: requirement.effectiveTo
        ? formatDateOnly(requirement.effectiveTo)
        : null,
    });
  });

  app.patch('/api/v1/admin/requirements/:id', admin, async (request) => {
    const data = requirementInput.partial().merge(versionBody).parse(request.body);
    const id = parseId(request);
    const prisma = await getPrisma();
    return prisma.$transaction(async (tx) => {
      const before = await tx.siteCourseRequirement.findUnique({
        where: { id },
        include: { site: true },
      });
      ensureFound(before, 'REQUIREMENT_NOT_FOUND', 'The requirement was not found.');
      const today = todayInTimeZone(before.site.timeZone);
      if (formatDateOnly(before.effectiveFrom) <= today) {
        throw new AppError(
          409,
          'REQUIREMENT_ALREADY_EFFECTIVE',
          'An effective requirement must be ended and replaced.',
        );
      }
      const {
        expectedVersion: version,
        effectiveFrom,
        effectiveTo,
        ...updateData
      } = data;
      const result = await tx.siteCourseRequirement.updateMany({
        where: { id, version },
        data: {
          ...updateData,
          ...(effectiveFrom ? { effectiveFrom: parseDateOnly(effectiveFrom) } : {}),
          ...(effectiveTo !== undefined
            ? { effectiveTo: effectiveTo ? parseDateOnly(effectiveTo) : null }
            : {}),
          version: { increment: 1 },
        },
      });
      if (!result.count) throw editConflict();
      const after = await tx.siteCourseRequirement.findUniqueOrThrow({ where: { id } });
      await audit(
        tx,
        request,
        'requirement.updated',
        'site_course_requirement',
        id,
        before,
        after,
      );
      return {
        ...after,
        effectiveFrom: formatDateOnly(after.effectiveFrom),
        effectiveTo: after.effectiveTo ? formatDateOnly(after.effectiveTo) : null,
      };
    });
  });

  app.post('/api/v1/admin/requirements/:id/end', admin, async (request) => {
    const data = z
      .object({ expectedVersion, effectiveTo: dateOnlyString })
      .parse(request.body);
    const id = parseId(request);
    const prisma = await getPrisma();
    return prisma.$transaction(async (tx) => {
      const before = await tx.siteCourseRequirement.findUnique({ where: { id } });
      ensureFound(before, 'REQUIREMENT_NOT_FOUND', 'The requirement was not found.');
      const endDate = parseDateOnly(data.effectiveTo);
      if (endDate < before.effectiveFrom) {
        throw new AppError(
          400,
          'INVALID_REQUIREMENT_DATES',
          'The end date cannot be before the start date.',
        );
      }
      const result = await tx.siteCourseRequirement.updateMany({
        where: { id, version: data.expectedVersion },
        data: { effectiveTo: endDate, version: { increment: 1 } },
      });
      if (!result.count) throw editConflict();
      const after = await tx.siteCourseRequirement.findUniqueOrThrow({ where: { id } });
      await audit(
        tx,
        request,
        'requirement.ended',
        'site_course_requirement',
        id,
        before,
        after,
      );
      return {
        ...after,
        effectiveFrom: formatDateOnly(after.effectiveFrom),
        effectiveTo: formatDateOnly(after.effectiveTo!),
      };
    });
  });

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
              { course: { code: { contains: query.search, mode: 'insensitive' } } },
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
    return pageResult(items.map(dateFields), total, query.page, query.pageSize);
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

    let expiresOn = data.expiresOn;
    let validityMonthsApplied: number | null = null;
    if (data.expirySource === CompletionExpirySource.CALCULATED) {
      if (!course.defaultValidityMonths) {
        throw new AppError(
          400,
          'COURSE_VALIDITY_REQUIRED',
          'This course does not have a default validity period.',
          { expirySource: ['Choose manual expiry or configure the course validity.'] },
        );
      }
      validityMonthsApplied = course.defaultValidityMonths;
      expiresOn = addCalendarMonths(data.completedOn, validityMonthsApplied);
    }
    if (!expiresOn || expiresOn < data.completedOn) {
      throw new AppError(
        400,
        'INVALID_EXPIRY_DATE',
        'The expiry date must be on or after the completion date.',
        { expiresOn: ['Enter a valid expiry date.'] },
      );
    }

    const completion = await prisma.$transaction(async (tx) => {
      const created = await tx.courseCompletion.create({
        data: {
          employeeId: data.employeeId,
          courseId: data.courseId,
          completedOn: parseDateOnly(data.completedOn),
          expiresOn: parseDateOnly(expiresOn),
          expirySource: data.expirySource,
          validityMonthsApplied,
          recordedBySubject: request.auth.subject,
        },
      });
      await audit(
        tx,
        request,
        'completion.created',
        'course_completion',
        created.id,
        null,
        created,
      );
      return created;
    });
    return reply.status(201).send(dateFields(completion));
  });

  app.post('/api/v1/admin/completions/:id/void', admin, async (request) => {
    const data = voidInput.parse(request.body);
    const id = parseId(request);
    const prisma = await getPrisma();
    return prisma.$transaction(async (tx) => {
      const before = await tx.courseCompletion.findUnique({ where: { id } });
      ensureFound(before, 'COMPLETION_NOT_FOUND', 'The completion was not found.');
      if (before.voidedAt) {
        throw new AppError(409, 'COMPLETION_ALREADY_VOIDED', 'The completion is already voided.');
      }
      const after = await tx.courseCompletion.update({
        where: { id },
        data: {
          voidedAt: new Date(),
          voidedBySubject: request.auth.subject,
          voidReason: data.reason,
        },
      });
      await audit(
        tx,
        request,
        'completion.voided',
        'course_completion',
        id,
        before,
        after,
      );
      return dateFields(after);
    });
  });

  app.get('/api/v1/admin/audit-events', admin, async (request) => {
    const query = paginationQuery(request);
    const filters = z
      .object({
        entityType: z.string().trim().max(100).optional(),
        entityId: identifier.optional(),
        actorSubject: z.string().trim().max(255).optional(),
      })
      .parse(request.query);
    const prisma = await getPrisma();
    const where: Prisma.AuditEventWhereInput = {
      entityType: filters.entityType,
      entityId: filters.entityId,
      actorSubject: filters.actorSubject,
      ...(query.search
        ? {
            OR: [
              { actorName: { contains: query.search, mode: 'insensitive' } },
              { action: { contains: query.search, mode: 'insensitive' } },
              { entityType: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.auditEvent.count({ where }),
    ]);
    return pageResult(items, total, query.page, query.pageSize);
  });
}
