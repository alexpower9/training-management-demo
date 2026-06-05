import type { PrismaClient } from '@prisma/client';
import { AppError } from './errors.js';

const statusRank = {
  noRequirements: -1,
  compliant: 0,
  expiring: 1,
  incomplete: 2,
  overdue: 3,
};

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function daysUntil(value: Date) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setUTCHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export async function getSiteReadiness(prisma: PrismaClient, siteId: string) {
  const [site, employees, completions] = await Promise.all([
    prisma.site.findFirst({
      where: { id: siteId, active: true, customer: { active: true } },
      include: {
        customer: true,
        courses: {
          where: { active: true },
          orderBy: { name: 'asc' },
        },
      },
    }),
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    }),
    prisma.completion.findMany({
      where: {
        voidedAt: null,
        course: { siteId, active: true },
      },
      orderBy: [{ completedOn: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  if (!site) {
    throw new AppError(404, 'SITE_NOT_FOUND', 'The requested site was not found.');
  }

  const latestByEmployeeCourse = new Map<string, (typeof completions)[number]>();

  for (const completion of completions) {
    const key = `${completion.employeeId}:${completion.courseId}`;
    if (!latestByEmployeeCourse.has(key)) {
      latestByEmployeeCourse.set(key, completion);
    }
  }

  return employees
    .map((employee) => {
      const courseRows = site.courses.map((course) => {
        const completion = latestByEmployeeCourse.get(`${employee.id}:${course.id}`);
        const remainingDays = completion ? daysUntil(completion.expiresOn) : null;
        let status = 'compliant';

        if (!completion) status = 'incomplete';
        else if (remainingDays !== null && remainingDays < 0) status = 'overdue';
        else if (remainingDays !== null && remainingDays <= 45) status = 'expiring';

        return {
          employeeId: employee.id,
          siteId: site.id,
          courseId: course.id,
          course,
          completion: completion
            ? {
                ...completion,
                completedOn: dateOnly(completion.completedOn),
                expiresOn: dateOnly(completion.expiresOn),
              }
            : null,
          status,
          daysUntilExpiry: remainingDays,
        };
      });
      const statuses = courseRows.map((row) => row.status);
      const status = statuses.length
        ? statuses.reduce((worst, current) =>
            statusRank[current as keyof typeof statusRank] >
            statusRank[worst as keyof typeof statusRank]
              ? current
              : worst,
          )
        : 'noRequirements';

      return {
        id: `${employee.id}-${site.id}`,
        employee,
        customer: site.customer,
        site: {
          id: site.id,
          customerId: site.customerId,
          name: site.name,
          region: site.region,
          active: site.active,
        },
        courses: courseRows,
        requiredCount: courseRows.length,
        completedCount: courseRows.filter((row) =>
          ['compliant', 'expiring'].includes(row.status),
        ).length,
        expiringCount: courseRows.filter((row) => row.status === 'expiring').length,
        status,
        eligible:
          courseRows.length > 0 &&
          courseRows.every((row) => ['compliant', 'expiring'].includes(row.status)),
      };
    })
    .sort((a, b) => {
      const eligibilityDelta = Number(a.eligible) - Number(b.eligible);
      if (eligibilityDelta !== 0) return eligibilityDelta;

      const statusDelta =
        statusRank[b.status as keyof typeof statusRank] -
        statusRank[a.status as keyof typeof statusRank];
      if (statusDelta !== 0) return statusDelta;

      return a.employee.name.localeCompare(b.employee.name);
    });
}
