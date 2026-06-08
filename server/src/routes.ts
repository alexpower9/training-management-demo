import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from './auth.js';
import { getPrisma } from './database.js';
import { formatDateOnly, parseDateOnly, todayInTimeZone } from './dates.js';
import { AppError } from './errors.js';
import { getSiteReadiness } from './readiness.js';
import { identifier, parseId } from './routeUtils.js';
import { registerAdminRoutes } from './adminRoutes.js';

function publicEmployee(employee: {
  id: string;
  displayName: string;
  jobTitle: string;
  crew: string | null;
  homeBase: string | null;
  archivedAt: Date | null;
}) {
  return {
    id: employee.id,
    name: employee.displayName,
    position: employee.jobTitle,
    crew: employee.crew || '',
    homeBase: employee.homeBase || '',
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
    const prisma = await getPrisma();
    const employees = await prisma.employee.findMany({
      where: { archivedAt: null },
      orderBy: { displayName: 'asc' },
    });
    return employees.map(publicEmployee);
  });

  app.get('/api/v1/customers', { preHandler: authenticate }, async () => {
    const prisma = await getPrisma();
    return prisma.customer.findMany({
      where: { archivedAt: null },
      include: {
        sites: {
          where: { archivedAt: null },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  });

  app.get('/api/v1/sites', { preHandler: authenticate }, async () => {
    const prisma = await getPrisma();
    return prisma.site.findMany({
      where: { archivedAt: null, customer: { archivedAt: null } },
      include: { customer: true },
      orderBy: [{ customer: { name: 'asc' } }, { name: 'asc' }],
    });
  });

  app.get('/api/v1/sites/:id/courses', { preHandler: authenticate }, async (request) => {
    const query = z.object({ asOf: z.string().date().optional() }).parse(request.query);
    const prisma = await getPrisma();
    const siteId = parseId(request);
    const site = await prisma.site.findFirst({
      where: { id: siteId, archivedAt: null, customer: { archivedAt: null } },
    });
    if (!site) {
      throw new AppError(404, 'SITE_NOT_FOUND', 'The requested site was not found.');
    }
    const asOfDate = parseDateOnly(query.asOf || todayInTimeZone(site.timeZone));
    const requirements = await prisma.siteCourseRequirement.findMany({
      where: {
        siteId,
        effectiveFrom: { lte: asOfDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOfDate } }],
        site: { archivedAt: null, customer: { archivedAt: null } },
        course: { archivedAt: null },
      },
      include: { course: true },
      orderBy: { course: { name: 'asc' } },
    });

    return requirements.map(({ course }) => ({
      id: course.id,
      siteId,
      code: course.code,
      name: course.name,
      category: course.category || '',
      renewalMonths: course.defaultValidityMonths,
      defaultValidityMonths: course.defaultValidityMonths,
      active: !course.archivedAt,
    }));
  });

  app.get('/api/v1/sites/:id/readiness', { preHandler: authenticate }, async (request) => {
    const query = z.object({ asOf: z.string().date().optional() }).parse(request.query);
    const prisma = await getPrisma();
    return getSiteReadiness(prisma, parseId(request), query.asOf);
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
    const rows = await prisma.courseCompletion.findMany({
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
