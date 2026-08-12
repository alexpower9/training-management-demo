import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin } from './auth.js';
import { getPrisma } from './database.js';
import { addCalendarMonths, formatDateOnly, parseDateOnly } from './dates.js';
import { publicEmployeeRecord } from './employeeSerialization.js';
import { AppError } from './errors.js';
import {
  dateOnlyString,
  ensureFound,
  identifier,
  pageResult,
  paginationQuery,
  parseId,
} from './routeUtils.js';

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

const medicalInput = z.object({
  name: z.string().trim().min(1).max(180),
  validityMonths: z.number().int().min(1).max(120),
  siteIds: siteIdsInput,
});

const medicalCompletionInput = z.object({
  employeeId: identifier,
  medicalId: identifier,
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

function dateFields<T extends { completedOn: Date; expiresOn: Date }>(row: T) {
  return {
    ...row,
    completedOn: formatDateOnly(row.completedOn),
    expiresOn: formatDateOnly(row.expiresOn),
  };
}

function medicalNameExistsError() {
  return new AppError(
    409,
    'MEDICAL_NAME_EXISTS',
    'A medical already uses that name.',
    { name: ['Use a name that is not already assigned to a medical.'] },
  );
}

function medicalCompletionExistsError() {
  return new AppError(
    409,
    'MEDICAL_COMPLETION_EXISTS',
    'That medical completion has already been recorded.',
    {
      completedOn: [
        'A non-voided completion already exists for this employee, medical, and date.',
      ],
    },
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

async function ensureMedicalNameAvailable(
  transaction: Prisma.TransactionClient,
  name: string,
  excludedId?: string,
) {
  const existing = await transaction.medical.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw medicalNameExistsError();
}

async function validateMedicalSiteSelection(
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
      'INVALID_MEDICAL_SITE_SELECTION',
      'One or more sites selected for the medical do not exist.',
      { siteIds: ['Select valid sites.'] },
    );
  }

  const newlySelectedArchivedSite = sites.some(
    (site) => site.archivedAt && !existingSiteIds.has(site.id),
  );
  if (newlySelectedArchivedSite) {
    throw new AppError(
      400,
      'ARCHIVED_MEDICAL_SITE_SELECTION',
      'Archived sites cannot be newly assigned to a medical.',
      { siteIds: ['Remove newly selected archived sites.'] },
    );
  }
}

export async function registerMedicalAdminRoutes(app: FastifyInstance) {
  const admin = { preHandler: [authenticate, requireAdmin] };

  app.get('/api/v1/admin/medical-options', admin, async () => {
    return (await getPrisma()).medical.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        validityMonths: true,
        requirements: { select: { siteId: true } },
      },
      orderBy: { name: 'asc' },
    });
  });

  app.get('/api/v1/admin/medicals', admin, async (request) => {
    const query = paginationQuery(request);
    const prisma = await getPrisma();
    const where: Prisma.MedicalWhereInput = {
      ...activeFilter(query.includeArchived),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.medical.findMany({
        where,
        include: { requirements: { include: { site: true } } },
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.medical.count({ where }),
    ]);
    return pageResult(items, total, query.page, query.pageSize);
  });

  app.get('/api/v1/admin/medicals/:id', admin, async (request) => {
    const medical = await (await getPrisma()).medical.findUnique({
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
    ensureFound(medical, 'MEDICAL_NOT_FOUND', 'The medical was not found.');
    return {
      ...medical,
      completions: medical.completions.map((completion) =>
        dateFields({
          ...completion,
          employee: publicEmployeeRecord(completion.employee),
        }),
      ),
    };
  });

  app.post('/api/v1/admin/medicals', admin, async (request, reply) => {
    const data = medicalInput.parse(request.body);
    const prisma = await getPrisma();
    try {
      const medical = await prisma.$transaction(async (transaction) => {
        await ensureMedicalNameAvailable(transaction, data.name);
        await validateMedicalSiteSelection(transaction, data.siteIds);
        return transaction.medical.create({
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
      return reply.status(201).send(medical);
    } catch (error) {
      if (isUniqueConstraintError(error)) throw medicalNameExistsError();
      throw error;
    }
  });

  app.patch('/api/v1/admin/medicals/:id', admin, async (request) => {
    const id = parseId(request);
    const data = medicalInput.parse(request.body);
    const prisma = await getPrisma();
    try {
      return await prisma.$transaction(async (transaction) => {
        // Serialize replacement-style edits so concurrent requests cannot
        // merge two independently calculated assignment sets.
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM medical WHERE id = ${id}::uuid FOR UPDATE`,
        );
        const medical = await transaction.medical.findUnique({
          where: { id },
          include: { requirements: true },
        });
        ensureFound(medical, 'MEDICAL_NOT_FOUND', 'The medical was not found.');

        const existingSiteIds = new Set(
          medical.requirements.map((requirement) => requirement.siteId),
        );
        await ensureMedicalNameAvailable(transaction, data.name, id);
        await validateMedicalSiteSelection(
          transaction,
          data.siteIds,
          existingSiteIds,
        );

        await transaction.siteMedicalRequirement.deleteMany({
          where: {
            medicalId: id,
            siteId: { notIn: data.siteIds },
          },
        });
        const newSiteIds = data.siteIds.filter(
          (siteId) => !existingSiteIds.has(siteId),
        );
        if (newSiteIds.length) {
          await transaction.siteMedicalRequirement.createMany({
            data: newSiteIds.map((siteId) => ({ siteId, medicalId: id })),
            skipDuplicates: true,
          });
        }

        return transaction.medical.update({
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
    } catch (error) {
      if (isUniqueConstraintError(error)) throw medicalNameExistsError();
      throw error;
    }
  });

  for (const action of ['archive', 'restore'] as const) {
    app.post(`/api/v1/admin/medicals/:id/${action}`, admin, async (request) => {
      const id = parseId(request);
      const prisma = await getPrisma();
      ensureFound(
        await prisma.medical.findUnique({ where: { id } }),
        'MEDICAL_NOT_FOUND',
        'The medical was not found.',
      );
      return prisma.medical.update({
        where: { id },
        data: { archivedAt: action === 'archive' ? new Date() : null },
      });
    });
  }

  app.get('/api/v1/admin/medical-completions', admin, async (request) => {
    const query = paginationQuery(request);
    const filters = z
      .object({
        employeeId: identifier.optional(),
        medicalId: identifier.optional(),
        includeVoided: z.enum(['true', 'false']).default('false'),
      })
      .parse(request.query);
    const prisma = await getPrisma();
    const where: Prisma.MedicalCompletionWhereInput = {
      employeeId: filters.employeeId,
      medicalId: filters.medicalId,
      voidedAt: filters.includeVoided === 'true' ? undefined : null,
      ...(query.search
        ? {
            OR: [
              {
                employee: {
                  displayName: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                medical: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.medicalCompletion.findMany({
        where,
        include: { employee: true, medical: true },
        orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.medicalCompletion.count({ where }),
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

  app.post('/api/v1/admin/medical-completions', admin, async (request, reply) => {
    const data = medicalCompletionInput.parse(request.body);
    const prisma = await getPrisma();
    const [employee, medical] = await Promise.all([
      prisma.employee.findFirst({
        where: { id: data.employeeId, archivedAt: null },
      }),
      prisma.medical.findFirst({
        where: { id: data.medicalId, archivedAt: null },
      }),
    ]);
    ensureFound(employee, 'EMPLOYEE_NOT_FOUND', 'The employee was not found.');
    ensureFound(medical, 'MEDICAL_NOT_FOUND', 'The medical was not found.');

    const validityMonthsApplied = medical.validityMonths;
    const expiresOn = addCalendarMonths(data.completedOn, validityMonthsApplied);
    try {
      const completion = await prisma.medicalCompletion.create({
        data: {
          employeeId: data.employeeId,
          medicalId: data.medicalId,
          completedOn: parseDateOnly(data.completedOn),
          expiresOn: parseDateOnly(expiresOn),
          validityMonthsApplied,
          comment: data.comment,
          recordedBySubject: request.auth.subject,
        },
      });
      return reply.status(201).send(dateFields(completion));
    } catch (error) {
      if (isUniqueConstraintError(error)) throw medicalCompletionExistsError();
      throw error;
    }
  });

  app.post(
    '/api/v1/admin/medical-completions/:id/void',
    admin,
    async (request) => {
      const data = voidInput.parse(request.body);
      const id = parseId(request);
      const prisma = await getPrisma();
      const result = await prisma.medicalCompletion.updateMany({
        where: { id, voidedAt: null },
        data: {
          voidedAt: new Date(),
          voidedBySubject: request.auth.subject,
          voidReason: data.reason,
        },
      });
      if (!result.count) {
        ensureFound(
          await prisma.medicalCompletion.findUnique({ where: { id } }),
          'MEDICAL_COMPLETION_NOT_FOUND',
          'The medical completion was not found.',
        );
        throw new AppError(
          409,
          'MEDICAL_COMPLETION_ALREADY_VOIDED',
          'The medical completion is already voided.',
        );
      }
      const completion = await prisma.medicalCompletion.findUnique({
        where: { id },
      });
      ensureFound(
        completion,
        'MEDICAL_COMPLETION_NOT_FOUND',
        'The medical completion was not found.',
      );
      return dateFields(completion);
    },
  );
}
