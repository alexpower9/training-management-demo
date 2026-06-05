import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin } from './auth.js';
import { getPrisma } from './database.js';
import { AppError } from './errors.js';
import { getSiteReadiness } from './readiness.js';

const identifier = z.string().min(1);
const archiveState = z.object({ active: z.boolean() });
const employeeInput = z.object({
  name: z.string().trim().min(1).max(120),
  position: z.string().trim().min(1).max(120),
  crew: z.string().trim().min(1).max(120),
  homeBase: z.string().trim().min(1).max(120),
});
const customerInput = z.object({
  name: z.string().trim().min(1).max(160),
  contact: z.string().trim().max(160).nullable().optional(),
});
const siteInput = z.object({
  customerId: identifier,
  name: z.string().trim().min(1).max(160),
  region: z.string().trim().min(1).max(160),
});
const courseInput = z.object({
  siteId: identifier,
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(180),
  category: z.string().trim().min(1).max(100),
  renewalMonths: z.number().int().min(1).max(120),
});
const completionInput = z
  .object({
    employeeId: identifier,
    courseId: identifier,
    completedOn: z.string().date(),
    expiresOn: z.string().date(),
  })
  .refine((value) => value.expiresOn >= value.completedOn, {
    message: 'Expiry date must be on or after the completion date.',
    path: ['expiresOn'],
  });
const voidInput = z.object({
  reason: z.string().trim().min(3).max(500),
});

function parseId(request: FastifyRequest) {
  return identifier.parse((request.params as { id: string }).id);
}

function archiveFields(active: boolean) {
  return {
    active,
    archivedAt: active ? null : new Date(),
  };
}

function serializeCompletion<T extends { completedOn: Date; expiresOn: Date }>(completion: T) {
  return {
    ...completion,
    completedOn: completion.completedOn.toISOString().slice(0, 10),
    expiresOn: completion.expiresOn.toISOString().slice(0, 10),
  };
}

async function ensureAdminEntity(
  exists: unknown,
  code: string,
  message: string,
) {
  if (!exists) {
    throw new AppError(404, code, message);
  }
}

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/api/v1/health', async () => ({ status: 'ok' }));

  app.get('/api/v1/me', { preHandler: authenticate }, async (request) => ({
    subject: request.auth.subject,
    role: request.auth.role,
    userName: request.auth.userName,
  }));

  app.get('/api/v1/employees', { preHandler: authenticate }, async () => {
    const prisma = await getPrisma();
    return prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  });

  app.get('/api/v1/customers', { preHandler: authenticate }, async () => {
    const prisma = await getPrisma();
    return prisma.customer.findMany({
      where: { active: true },
      include: {
        sites: {
          where: { active: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  });

  app.get('/api/v1/sites', { preHandler: authenticate }, async () => {
    const prisma = await getPrisma();
    return prisma.site.findMany({
      where: { active: true, customer: { active: true } },
      include: { customer: true },
      orderBy: [{ customer: { name: 'asc' } }, { name: 'asc' }],
    });
  });

  app.get('/api/v1/sites/:id/courses', { preHandler: authenticate }, async (request) => {
    const prisma = await getPrisma();
    const siteId = parseId(request);
    const site = await prisma.site.findFirst({
      where: { id: siteId, active: true, customer: { active: true } },
    });
    await ensureAdminEntity(site, 'SITE_NOT_FOUND', 'The requested site was not found.');

    return prisma.course.findMany({
      where: { siteId, active: true },
      orderBy: { name: 'asc' },
    });
  });

  app.get('/api/v1/sites/:id/readiness', { preHandler: authenticate }, async (request) => {
    const prisma = await getPrisma();
    return getSiteReadiness(prisma, parseId(request));
  });

  app.get('/api/v1/completions', { preHandler: authenticate }, async (request) => {
    const query = z
      .object({
        employeeId: identifier.optional(),
        courseId: identifier.optional(),
        includeVoided: z.enum(['true', 'false']).optional(),
      })
      .parse(request.query);
    const prisma = await getPrisma();

    const completionRows = await prisma.completion.findMany({
      where: {
        employeeId: query.employeeId,
        courseId: query.courseId,
        voidedAt: query.includeVoided === 'true' ? undefined : null,
      },
      include: {
        employee: true,
        course: { include: { site: { include: { customer: true } } } },
      },
      orderBy: [{ completedOn: 'desc' }, { createdAt: 'desc' }],
    });

    return completionRows.map(serializeCompletion);
  });

  app.post(
    '/api/v1/employees',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const data = employeeInput.parse(request.body);
      const prisma = await getPrisma();
      const employee = await prisma.$transaction(async (tx) => {
        const created = await tx.employee.create({ data });
        await tx.auditEvent.create({
          data: {
            actorSubject: request.auth.subject,
            action: 'employee.created',
            entityType: 'employee',
            entityId: created.id,
            details: data,
          },
        });
        return created;
      });

      return reply.status(201).send(employee);
    },
  );

  app.patch(
    '/api/v1/employees/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const id = parseId(request);
      const data = employeeInput.partial().merge(archiveState.partial()).parse(request.body);
      const prisma = await getPrisma();
      const existing = await prisma.employee.findUnique({ where: { id } });
      await ensureAdminEntity(existing, 'EMPLOYEE_NOT_FOUND', 'The employee was not found.');
      const updateData = {
        ...data,
        ...(data.active === undefined ? {} : archiveFields(data.active)),
      };

      return prisma.$transaction(async (tx) => {
        const updated = await tx.employee.update({ where: { id }, data: updateData });
        await tx.auditEvent.create({
          data: {
            actorSubject: request.auth.subject,
            action: data.active === false ? 'employee.archived' : 'employee.updated',
            entityType: 'employee',
            entityId: id,
            details: data,
          },
        });
        return updated;
      });
    },
  );

  app.post(
    '/api/v1/customers',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const data = customerInput.parse(request.body);
      const prisma = await getPrisma();
      const customer = await prisma.$transaction(async (tx) => {
        const created = await tx.customer.create({ data });
        await tx.auditEvent.create({
          data: {
            actorSubject: request.auth.subject,
            action: 'customer.created',
            entityType: 'customer',
            entityId: created.id,
            details: data,
          },
        });
        return created;
      });
      return reply.status(201).send(customer);
    },
  );

  app.patch(
    '/api/v1/customers/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const id = parseId(request);
      const data = customerInput.partial().merge(archiveState.partial()).parse(request.body);
      const prisma = await getPrisma();
      const existing = await prisma.customer.findUnique({ where: { id } });
      await ensureAdminEntity(existing, 'CUSTOMER_NOT_FOUND', 'The customer was not found.');

      return prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id },
          data: {
            ...data,
            ...(data.active === undefined ? {} : archiveFields(data.active)),
          },
        });
        await tx.auditEvent.create({
          data: {
            actorSubject: request.auth.subject,
            action: data.active === false ? 'customer.archived' : 'customer.updated',
            entityType: 'customer',
            entityId: id,
            details: data,
          },
        });
        return updated;
      });
    },
  );

  app.post(
    '/api/v1/sites',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const data = siteInput.parse(request.body);
      const prisma = await getPrisma();
      const customer = await prisma.customer.findFirst({
        where: { id: data.customerId, active: true },
      });
      await ensureAdminEntity(customer, 'CUSTOMER_NOT_FOUND', 'The customer was not found.');
      const site = await prisma.$transaction(async (tx) => {
        const created = await tx.site.create({ data });
        await tx.auditEvent.create({
          data: {
            actorSubject: request.auth.subject,
            action: 'site.created',
            entityType: 'site',
            entityId: created.id,
            details: data,
          },
        });
        return created;
      });
      return reply.status(201).send(site);
    },
  );

  app.patch(
    '/api/v1/sites/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const id = parseId(request);
      const data = siteInput.partial().merge(archiveState.partial()).parse(request.body);
      const prisma = await getPrisma();
      const existing = await prisma.site.findUnique({ where: { id } });
      await ensureAdminEntity(existing, 'SITE_NOT_FOUND', 'The site was not found.');

      return prisma.$transaction(async (tx) => {
        const updated = await tx.site.update({
          where: { id },
          data: {
            ...data,
            ...(data.active === undefined ? {} : archiveFields(data.active)),
          },
        });
        await tx.auditEvent.create({
          data: {
            actorSubject: request.auth.subject,
            action: data.active === false ? 'site.archived' : 'site.updated',
            entityType: 'site',
            entityId: id,
            details: data,
          },
        });
        return updated;
      });
    },
  );

  app.post(
    '/api/v1/courses',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const data = courseInput.parse(request.body);
      const prisma = await getPrisma();
      const site = await prisma.site.findFirst({
        where: { id: data.siteId, active: true, customer: { active: true } },
      });
      await ensureAdminEntity(site, 'SITE_NOT_FOUND', 'The site was not found.');
      const course = await prisma.$transaction(async (tx) => {
        const created = await tx.course.create({ data });
        await tx.auditEvent.create({
          data: {
            actorSubject: request.auth.subject,
            action: 'course.created',
            entityType: 'course',
            entityId: created.id,
            details: data,
          },
        });
        return created;
      });
      return reply.status(201).send(course);
    },
  );

  app.patch(
    '/api/v1/courses/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const id = parseId(request);
      const data = courseInput.partial().merge(archiveState.partial()).parse(request.body);
      const prisma = await getPrisma();
      const existing = await prisma.course.findUnique({ where: { id } });
      await ensureAdminEntity(existing, 'COURSE_NOT_FOUND', 'The course was not found.');

      return prisma.$transaction(async (tx) => {
        const updated = await tx.course.update({
          where: { id },
          data: {
            ...data,
            ...(data.active === undefined ? {} : archiveFields(data.active)),
          },
        });
        await tx.auditEvent.create({
          data: {
            actorSubject: request.auth.subject,
            action: data.active === false ? 'course.archived' : 'course.updated',
            entityType: 'course',
            entityId: id,
            details: data,
          },
        });
        return updated;
      });
    },
  );

  app.post(
    '/api/v1/completions',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const data = completionInput.parse(request.body);
      const prisma = await getPrisma();
      const [employee, course] = await Promise.all([
        prisma.employee.findFirst({ where: { id: data.employeeId, active: true } }),
        prisma.course.findFirst({ where: { id: data.courseId, active: true } }),
      ]);
      await ensureAdminEntity(employee, 'EMPLOYEE_NOT_FOUND', 'The employee was not found.');
      await ensureAdminEntity(course, 'COURSE_NOT_FOUND', 'The course was not found.');

      const completion = await prisma.$transaction(async (tx) => {
        const created = await tx.completion.create({
          data: {
            employeeId: data.employeeId,
            courseId: data.courseId,
            completedOn: new Date(`${data.completedOn}T00:00:00.000Z`),
            expiresOn: new Date(`${data.expiresOn}T00:00:00.000Z`),
            recordedBySubject: request.auth.subject,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorSubject: request.auth.subject,
            action: 'completion.created',
            entityType: 'completion',
            entityId: created.id,
            details: data,
          },
        });
        return created;
      });
      return reply.status(201).send(serializeCompletion(completion));
    },
  );

  app.post(
    '/api/v1/completions/:id/void',
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const id = parseId(request);
      const data = voidInput.parse(request.body);
      const prisma = await getPrisma();
      const existing = await prisma.completion.findUnique({ where: { id } });
      await ensureAdminEntity(existing, 'COMPLETION_NOT_FOUND', 'The completion was not found.');

      if (existing?.voidedAt) {
        throw new AppError(409, 'COMPLETION_ALREADY_VOIDED', 'The completion is already voided.');
      }

      const completion = await prisma.$transaction(async (tx) => {
        const updated = await tx.completion.update({
          where: { id },
          data: {
            voidedAt: new Date(),
            voidedBySubject: request.auth.subject,
            voidReason: data.reason,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorSubject: request.auth.subject,
            action: 'completion.voided',
            entityType: 'completion',
            entityId: id,
            details: data,
          },
        });
        return updated;
      });

      return serializeCompletion(completion);
    },
  );

  app.get(
    '/api/v1/audit-events',
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const query = z
        .object({
          entityType: z.string().optional(),
          entityId: z.string().optional(),
        })
        .parse(request.query);
      const prisma = await getPrisma();

      return prisma.auditEvent.findMany({
        where: query,
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    },
  );
}
