import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from './auth.js';
import { registerAdminRoutes } from './adminRoutes.js';
import { getPrisma } from './database.js';
import { formatDateOnly, parseDateOnly, todayInTimeZone } from './dates.js';
import { AppError } from './errors.js';
import { getSiteReadiness } from './readiness.js';
import { identifier, parseId } from './routeUtils.js';

function publicEmployee(employee: {
  id: string;
  displayName: string;
  archivedAt: Date | null;
}) {
  return {
    id: employee.id,
    name: employee.displayName,
    active: !employee.archivedAt,
  };
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
    const employees = await (await getPrisma()).employee.findMany({
      where: { archivedAt: null },
      orderBy: { displayName: 'asc' },
    });
    return employees.map(publicEmployee);
  });

  app.get('/api/v1/sites', { preHandler: authenticate }, async () => {
    return (await getPrisma()).site.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
    });
  });

  app.get('/api/v1/sites/:id/courses', { preHandler: authenticate }, async (request) => {
    const query = z.object({ asOf: z.string().date().optional() }).parse(request.query);
    const prisma = await getPrisma();
    const siteId = parseId(request);
    const site = await prisma.site.findFirst({
      where: { id: siteId, archivedAt: null },
    });
    if (!site) {
      throw new AppError(404, 'SITE_NOT_FOUND', 'The requested site was not found.');
    }
    parseDateOnly(query.asOf || todayInTimeZone(site.timeZone));
    const requirements = await prisma.siteCourseRequirement.findMany({
      where: { siteId, course: { archivedAt: null } },
      include: { course: true },
      orderBy: { course: { name: 'asc' } },
    });

    return requirements.map(({ course }) => ({
      id: course.id,
      siteId,
      name: course.name,
      renewalMonths: course.validityMonths,
      validityMonths: course.validityMonths,
      active: !course.archivedAt,
    }));
  });

  app.get('/api/v1/sites/:id/readiness', { preHandler: authenticate }, async (request) => {
    const query = z.object({ asOf: z.string().date().optional() }).parse(request.query);
    return getSiteReadiness(await getPrisma(), parseId(request), query.asOf);
  });

  app.get('/api/v1/completions', { preHandler: authenticate }, async (request) => {
    const query = z
      .object({
        employeeId: identifier.optional(),
        courseId: identifier.optional(),
        includeVoided: z.enum(['true', 'false']).optional(),
      })
      .parse(request.query);
    const rows = await (await getPrisma()).courseCompletion.findMany({
      where: {
        employeeId: query.employeeId,
        courseId: query.courseId,
        voidedAt: query.includeVoided === 'true' ? undefined : null,
      },
      include: { employee: true, course: true },
      orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
    });

    return rows.map((row) => ({
      ...row,
      completedOn: formatDateOnly(row.completedOn),
      expiresOn: formatDateOnly(row.expiresOn),
      recordedAt: row.recordedAt.toISOString(),
      voidedAt: row.voidedAt?.toISOString() || null,
    }));
  });

  await registerAdminRoutes(app);
}
