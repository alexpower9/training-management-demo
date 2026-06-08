import type { PrismaClient } from '@prisma/client';
import { AppError } from './errors.js';
import { daysBetween, formatDateOnly, parseDateOnly, todayInTimeZone } from './dates.js';

const EXPIRING_WARNING_DAYS = 45;
const statusRank = {
  noRequirements: -1,
  compliant: 0,
  expiring: 1,
  incomplete: 2,
  overdue: 3,
};

function serializeEmployee(employee: {
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

function serializeCourse(
  course: {
    id: string;
    name: string;
    validityMonths: number;
    archivedAt: Date | null;
  },
  siteId: string,
) {
  return {
    id: course.id,
    siteId,
    name: course.name,
    renewalMonths: course.validityMonths,
    validityMonths: course.validityMonths,
    active: !course.archivedAt,
  };
}

export async function getSiteReadiness(
  prisma: PrismaClient,
  siteId: string,
  requestedAsOf?: string,
) {
  const site = await prisma.site.findFirst({
    where: { id: siteId, archivedAt: null },
  });
  if (!site) {
    throw new AppError(404, 'SITE_NOT_FOUND', 'The requested site was not found.');
  }

  const asOf = requestedAsOf || todayInTimeZone(site.timeZone);
  const asOfDate = parseDateOnly(asOf);
  const [requirements, employees] = await Promise.all([
    prisma.siteCourseRequirement.findMany({
      where: { siteId, course: { archivedAt: null } },
      include: { course: true },
      orderBy: { course: { name: 'asc' } },
    }),
    prisma.employee.findMany({
      where: { archivedAt: null },
      orderBy: { displayName: 'asc' },
    }),
  ]);
  const courseIds = requirements.map((requirement) => requirement.courseId);
  const completions = courseIds.length
    ? await prisma.courseCompletion.findMany({
        where: {
          voidedAt: null,
          completedOn: { lte: asOfDate },
          courseId: { in: courseIds },
        },
        orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
      })
    : [];
  const latestByEmployeeCourse = new Map<string, (typeof completions)[number]>();

  for (const completion of completions) {
    const key = `${completion.employeeId}:${completion.courseId}`;
    if (!latestByEmployeeCourse.has(key)) {
      latestByEmployeeCourse.set(key, completion);
    }
  }

  return employees
    .map((employee) => {
      const courseRows = requirements.map((requirement) => {
        const completion = latestByEmployeeCourse.get(
          `${employee.id}:${requirement.courseId}`,
        );
        const expiresOn = completion ? formatDateOnly(completion.expiresOn) : null;
        const remainingDays = expiresOn ? daysBetween(asOf, expiresOn) : null;
        let status = 'compliant';

        if (!completion) status = 'incomplete';
        else if (remainingDays !== null && remainingDays < 0) status = 'overdue';
        else if (
          remainingDays !== null &&
          remainingDays <= EXPIRING_WARNING_DAYS
        ) {
          status = 'expiring';
        }

        return {
          employeeId: employee.id,
          siteId,
          courseId: requirement.courseId,
          course: serializeCourse(requirement.course, siteId),
          completion: completion
            ? {
                ...completion,
                completedOn: formatDateOnly(completion.completedOn),
                expiresOn,
                recordedAt: completion.recordedAt.toISOString(),
                voidedAt: completion.voidedAt?.toISOString() || null,
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
        employee: serializeEmployee(employee),
        site: {
          id: site.id,
          name: site.name,
          timeZone: site.timeZone,
          active: !site.archivedAt,
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
        asOf,
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
