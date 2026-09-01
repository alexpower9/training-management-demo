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

const optionalComment = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((comment) => comment || null);

const coursePendingCompletionInput = z
  .object({
    employeeId: identifier,
    courseId: identifier,
    comment: optionalComment,
  })
  .strict();

const medicalPendingCompletionInput = z
  .object({
    employeeId: identifier,
    medicalId: identifier,
    comment: optionalComment,
  })
  .strict();

const finalizeInput = z.object({ completedOn: dateOnlyString }).strict();
const cancelInput = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();

export const coursePendingCompletionInclude = {
  employee: true,
  course: true,
  completion: true,
} satisfies Prisma.CoursePendingCompletionInclude;

export const medicalPendingCompletionInclude = {
  employee: true,
  medical: true,
  completion: true,
} satisfies Prisma.MedicalPendingCompletionInclude;

type CoursePendingWithRelations =
  Prisma.CoursePendingCompletionGetPayload<{
    include: typeof coursePendingCompletionInclude;
  }>;

type MedicalPendingWithRelations =
  Prisma.MedicalPendingCompletionGetPayload<{
    include: typeof medicalPendingCompletionInclude;
  }>;

type PendingWithRelations =
  | CoursePendingWithRelations
  | MedicalPendingWithRelations;

export function publicPendingCompletion(row: PendingWithRelations) {
  return {
    ...row,
    resolution: undefined,
    status:
      row.resolution === 'FINALIZED'
        ? ('finalized' as const)
        : row.resolution === 'CANCELLED'
          ? ('cancelled' as const)
          : ('pending' as const),
    employee: publicEmployeeRecord(row.employee),
    completion: row.completion
      ? {
          ...row.completion,
          completedOn: formatDateOnly(row.completion.completedOn),
          expiresOn: formatDateOnly(row.completion.expiresOn),
        }
      : null,
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function coursePendingExistsError() {
  return new AppError(
    409,
    'PENDING_COMPLETION_EXISTS',
    'A pending date already exists for this employee and course.',
    {
      courseId: [
        'Add a date to or cancel the existing pending completion before creating another.',
      ],
    },
  );
}

function medicalPendingExistsError() {
  return new AppError(
    409,
    'MEDICAL_PENDING_COMPLETION_EXISTS',
    'A pending date already exists for this employee and medical.',
    {
      medicalId: [
        'Add a date to or cancel the existing pending completion before creating another.',
      ],
    },
  );
}

function courseCompletionExistsError() {
  return new AppError(
    409,
    'COMPLETION_EXISTS',
    'That course completion has already been recorded.',
    {
      completedOn: [
        'A non-voided completion already exists for this employee, course, and date.',
      ],
    },
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

function pendingAlreadyResolvedError(domain: 'course' | 'medical') {
  return new AppError(
    409,
    domain === 'course'
      ? 'PENDING_COMPLETION_ALREADY_RESOLVED'
      : 'MEDICAL_PENDING_COMPLETION_ALREADY_RESOLVED',
    'The pending completion has already been resolved.',
  );
}

function coursePendingFilters(query: unknown) {
  return z
    .object({
      employeeId: identifier.optional(),
      courseId: identifier.optional(),
      includeResolved: z.enum(['true', 'false']).default('false'),
    })
    .parse(query);
}

function medicalPendingFilters(query: unknown) {
  return z
    .object({
      employeeId: identifier.optional(),
      medicalId: identifier.optional(),
      includeResolved: z.enum(['true', 'false']).default('false'),
    })
    .parse(query);
}

export async function registerPendingCompletionRoutes(app: FastifyInstance) {
  const admin = { preHandler: [authenticate, requireAdmin] };

  app.get('/api/v1/admin/pending-completions', admin, async (request) => {
    const query = paginationQuery(request);
    const filters = coursePendingFilters(request.query);
    const where: Prisma.CoursePendingCompletionWhereInput = {
      employeeId: filters.employeeId,
      courseId: filters.courseId,
      resolution: filters.includeResolved === 'true' ? undefined : null,
      ...(query.search
        ? {
            OR: [
              {
                employee: {
                  displayName: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                course: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const prisma = await getPrisma();
    const [items, total] = await Promise.all([
      prisma.coursePendingCompletion.findMany({
        where,
        include: coursePendingCompletionInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.coursePendingCompletion.count({ where }),
    ]);
    return pageResult(
      items.map(publicPendingCompletion),
      total,
      query.page,
      query.pageSize,
    );
  });

  app.post('/api/v1/admin/pending-completions', admin, async (request, reply) => {
    const data = coursePendingCompletionInput.parse(request.body);
    const prisma = await getPrisma();
    try {
      const pending = await prisma.$transaction(async (transaction) => {
        const employees = await transaction.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM employee WHERE id = ${data.employeeId}::uuid AND archived_at IS NULL FOR SHARE`,
        );
        ensureFound(
          employees[0],
          'EMPLOYEE_NOT_FOUND',
          'The employee was not found.',
        );
        const courses = await transaction.$queryRaw<
          Array<{ id: string; validityMonths: number }>
        >(
          Prisma.sql`SELECT id, validity_months AS "validityMonths" FROM course WHERE id = ${data.courseId}::uuid AND archived_at IS NULL FOR SHARE`,
        );
        const course = courses[0];
        ensureFound(course, 'COURSE_NOT_FOUND', 'The course was not found.');

        return transaction.coursePendingCompletion.create({
          data: {
            employeeId: data.employeeId,
            courseId: data.courseId,
            validityMonthsSnapshot: course.validityMonths,
            comment: data.comment,
            createdBySubject: request.auth.subject,
          },
          include: coursePendingCompletionInclude,
        });
      });
      return reply.status(201).send(publicPendingCompletion(pending));
    } catch (error) {
      if (isUniqueConstraintError(error)) throw coursePendingExistsError();
      throw error;
    }
  });

  app.get('/api/v1/admin/pending-completions/:id', admin, async (request) => {
    const pending = await (await getPrisma()).coursePendingCompletion.findUnique({
      where: { id: parseId(request) },
      include: coursePendingCompletionInclude,
    });
    ensureFound(
      pending,
      'PENDING_COMPLETION_NOT_FOUND',
      'The pending completion was not found.',
    );
    return publicPendingCompletion(pending);
  });

  app.post(
    '/api/v1/admin/pending-completions/:id/finalize',
    admin,
    async (request) => {
      const id = parseId(request);
      const data = finalizeInput.parse(request.body);
      const prisma = await getPrisma();
      try {
        const pending = await prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw(
            Prisma.sql`SELECT id FROM course_pending_completion WHERE id = ${id}::uuid FOR UPDATE`,
          );
          const current = await transaction.coursePendingCompletion.findUnique({
            where: { id },
          });
          ensureFound(
            current,
            'PENDING_COMPLETION_NOT_FOUND',
            'The pending completion was not found.',
          );
          if (current.resolution) throw pendingAlreadyResolvedError('course');

          const expiresOn = addCalendarMonths(
            data.completedOn,
            current.validityMonthsSnapshot,
          );
          const completion = await transaction.courseCompletion.create({
            data: {
              employeeId: current.employeeId,
              courseId: current.courseId,
              completedOn: parseDateOnly(data.completedOn),
              expiresOn: parseDateOnly(expiresOn),
              validityMonthsApplied: current.validityMonthsSnapshot,
              comment: current.comment,
              recordedBySubject: request.auth.subject,
            },
          });

          return transaction.coursePendingCompletion.update({
            where: { id },
            data: {
              resolution: 'FINALIZED',
              resolvedAt: new Date(),
              resolvedBySubject: request.auth.subject,
              cancellationReason: null,
              completionId: completion.id,
            },
            include: coursePendingCompletionInclude,
          });
        });
        return publicPendingCompletion(pending);
      } catch (error) {
        if (isUniqueConstraintError(error)) throw courseCompletionExistsError();
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/admin/pending-completions/:id/cancel',
    admin,
    async (request) => {
      const id = parseId(request);
      const data = cancelInput.parse(request.body);
      const prisma = await getPrisma();
      return prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM course_pending_completion WHERE id = ${id}::uuid FOR UPDATE`,
        );
        const current = await transaction.coursePendingCompletion.findUnique({
          where: { id },
        });
        ensureFound(
          current,
          'PENDING_COMPLETION_NOT_FOUND',
          'The pending completion was not found.',
        );
        if (current.resolution) throw pendingAlreadyResolvedError('course');

        const pending = await transaction.coursePendingCompletion.update({
          where: { id },
          data: {
            resolution: 'CANCELLED',
            resolvedAt: new Date(),
            resolvedBySubject: request.auth.subject,
            cancellationReason: data.reason,
            completionId: null,
          },
          include: coursePendingCompletionInclude,
        });
        return publicPendingCompletion(pending);
      });
    },
  );

  app.get(
    '/api/v1/admin/medical-pending-completions',
    admin,
    async (request) => {
      const query = paginationQuery(request);
      const filters = medicalPendingFilters(request.query);
      const where: Prisma.MedicalPendingCompletionWhereInput = {
        employeeId: filters.employeeId,
        medicalId: filters.medicalId,
        resolution: filters.includeResolved === 'true' ? undefined : null,
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
      const prisma = await getPrisma();
      const [items, total] = await Promise.all([
        prisma.medicalPendingCompletion.findMany({
          where,
          include: medicalPendingCompletionInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.medicalPendingCompletion.count({ where }),
      ]);
      return pageResult(
        items.map(publicPendingCompletion),
        total,
        query.page,
        query.pageSize,
      );
    },
  );

  app.post(
    '/api/v1/admin/medical-pending-completions',
    admin,
    async (request, reply) => {
      const data = medicalPendingCompletionInput.parse(request.body);
      const prisma = await getPrisma();
      try {
        const pending = await prisma.$transaction(async (transaction) => {
          const employees = await transaction.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`SELECT id FROM employee WHERE id = ${data.employeeId}::uuid AND archived_at IS NULL FOR SHARE`,
          );
          ensureFound(
            employees[0],
            'EMPLOYEE_NOT_FOUND',
            'The employee was not found.',
          );
          const medicals = await transaction.$queryRaw<
            Array<{ id: string; validityMonths: number }>
          >(
            Prisma.sql`SELECT id, validity_months AS "validityMonths" FROM medical WHERE id = ${data.medicalId}::uuid AND archived_at IS NULL FOR SHARE`,
          );
          const medical = medicals[0];
          ensureFound(medical, 'MEDICAL_NOT_FOUND', 'The medical was not found.');

          return transaction.medicalPendingCompletion.create({
            data: {
              employeeId: data.employeeId,
              medicalId: data.medicalId,
              validityMonthsSnapshot: medical.validityMonths,
              comment: data.comment,
              createdBySubject: request.auth.subject,
            },
            include: medicalPendingCompletionInclude,
          });
        });
        return reply.status(201).send(publicPendingCompletion(pending));
      } catch (error) {
        if (isUniqueConstraintError(error)) throw medicalPendingExistsError();
        throw error;
      }
    },
  );

  app.get(
    '/api/v1/admin/medical-pending-completions/:id',
    admin,
    async (request) => {
      const pending = await (
        await getPrisma()
      ).medicalPendingCompletion.findUnique({
        where: { id: parseId(request) },
        include: medicalPendingCompletionInclude,
      });
      ensureFound(
        pending,
        'MEDICAL_PENDING_COMPLETION_NOT_FOUND',
        'The pending medical completion was not found.',
      );
      return publicPendingCompletion(pending);
    },
  );

  app.post(
    '/api/v1/admin/medical-pending-completions/:id/finalize',
    admin,
    async (request) => {
      const id = parseId(request);
      const data = finalizeInput.parse(request.body);
      const prisma = await getPrisma();
      try {
        const pending = await prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw(
            Prisma.sql`SELECT id FROM medical_pending_completion WHERE id = ${id}::uuid FOR UPDATE`,
          );
          const current = await transaction.medicalPendingCompletion.findUnique({
            where: { id },
          });
          ensureFound(
            current,
            'MEDICAL_PENDING_COMPLETION_NOT_FOUND',
            'The pending medical completion was not found.',
          );
          if (current.resolution) throw pendingAlreadyResolvedError('medical');

          const expiresOn = addCalendarMonths(
            data.completedOn,
            current.validityMonthsSnapshot,
          );
          const completion = await transaction.medicalCompletion.create({
            data: {
              employeeId: current.employeeId,
              medicalId: current.medicalId,
              completedOn: parseDateOnly(data.completedOn),
              expiresOn: parseDateOnly(expiresOn),
              validityMonthsApplied: current.validityMonthsSnapshot,
              comment: current.comment,
              recordedBySubject: request.auth.subject,
            },
          });

          return transaction.medicalPendingCompletion.update({
            where: { id },
            data: {
              resolution: 'FINALIZED',
              resolvedAt: new Date(),
              resolvedBySubject: request.auth.subject,
              cancellationReason: null,
              completionId: completion.id,
            },
            include: medicalPendingCompletionInclude,
          });
        });
        return publicPendingCompletion(pending);
      } catch (error) {
        if (isUniqueConstraintError(error)) throw medicalCompletionExistsError();
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/admin/medical-pending-completions/:id/cancel',
    admin,
    async (request) => {
      const id = parseId(request);
      const data = cancelInput.parse(request.body);
      const prisma = await getPrisma();
      return prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM medical_pending_completion WHERE id = ${id}::uuid FOR UPDATE`,
        );
        const current = await transaction.medicalPendingCompletion.findUnique({
          where: { id },
        });
        ensureFound(
          current,
          'MEDICAL_PENDING_COMPLETION_NOT_FOUND',
          'The pending medical completion was not found.',
        );
        if (current.resolution) throw pendingAlreadyResolvedError('medical');

        const pending = await transaction.medicalPendingCompletion.update({
          where: { id },
          data: {
            resolution: 'CANCELLED',
            resolvedAt: new Date(),
            resolvedBySubject: request.auth.subject,
            cancellationReason: data.reason,
            completionId: null,
          },
          include: medicalPendingCompletionInclude,
        });
        return publicPendingCompletion(pending);
      });
    },
  );
}
