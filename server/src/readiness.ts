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

type EmployeeRecord = {
  id: string;
  displayName: string;
  archivedAt: Date | null;
};

type SiteRecord = {
  id: string;
  name: string;
  timeZone: string;
  archivedAt: Date | null;
};

type RequirementRecord = {
  siteId: string;
  courseId: string;
  course: {
    id: string;
    name: string;
    validityMonths: number;
    archivedAt: Date | null;
  };
};

type CompletionRecord = {
  id: string;
  employeeId: string;
  courseId: string;
  completedOn: Date;
  expiresOn: Date;
  validityMonthsApplied: number | null;
  recordedAt: Date;
};

function serializeEmployee(employee: EmployeeRecord) {
  return {
    id: employee.id,
    name: employee.displayName,
    active: !employee.archivedAt,
  };
}

function serializeCourse(requirement: RequirementRecord) {
  return {
    id: requirement.course.id,
    siteId: requirement.siteId,
    name: requirement.course.name,
    renewalMonths: requirement.course.validityMonths,
    validityMonths: requirement.course.validityMonths,
    active: !requirement.course.archivedAt,
  };
}

function serializeCompletion(completion: CompletionRecord) {
  return {
    id: completion.id,
    completedOn: formatDateOnly(completion.completedOn),
    expiresOn: formatDateOnly(completion.expiresOn),
    validityMonthsApplied: completion.validityMonthsApplied,
    recordedAt: completion.recordedAt.toISOString(),
  };
}

function buildSummary(
  employee: EmployeeRecord,
  site: SiteRecord,
  requirements: RequirementRecord[],
  completions: CompletionRecord[],
  asOf: string,
) {
  const asOfDate = parseDateOnly(asOf);
  const latestByCourse = new Map<string, CompletionRecord>();

  for (const completion of completions) {
    if (
      completion.employeeId === employee.id &&
      completion.completedOn <= asOfDate &&
      !latestByCourse.has(completion.courseId)
    ) {
      latestByCourse.set(completion.courseId, completion);
    }
  }

  const courseRows = requirements.map((requirement) => {
    const completion = latestByCourse.get(requirement.courseId);
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
      siteId: site.id,
      courseId: requirement.courseId,
      course: serializeCourse(requirement),
      completion: completion ? serializeCompletion(completion) : null,
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
}

function sortSummaries<T extends ReturnType<typeof buildSummary>>(summaries: T[]) {
  return summaries.sort((a, b) => {
    const eligibilityDelta = Number(a.eligible) - Number(b.eligible);
    if (eligibilityDelta !== 0) return eligibilityDelta;
    const statusDelta =
      statusRank[b.status as keyof typeof statusRank] -
      statusRank[a.status as keyof typeof statusRank];
    if (statusDelta !== 0) return statusDelta;
    return a.employee.name.localeCompare(b.employee.name);
  });
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

  return sortSummaries(
    employees.map((employee) =>
      buildSummary(employee, site, requirements, completions, asOf),
    ),
  );
}

export async function getEmployeeReadiness(
  prisma: PrismaClient,
  employeeId: string,
  requestedAsOf?: string,
) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, archivedAt: null },
  });
  if (!employee) {
    throw new AppError(
      403,
      'EMPLOYEE_ACCOUNT_INACTIVE',
      'Your employee training record is inactive.',
    );
  }

  const sites = await prisma.site.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
  });
  const requirements = sites.length
    ? await prisma.siteCourseRequirement.findMany({
        where: {
          siteId: { in: sites.map((site) => site.id) },
          course: { archivedAt: null },
        },
        include: { course: true },
        orderBy: { course: { name: 'asc' } },
      })
    : [];
  const courseIds = [...new Set(requirements.map((requirement) => requirement.courseId))];
  const completions = courseIds.length
    ? await prisma.courseCompletion.findMany({
        where: {
          employeeId,
          courseId: { in: courseIds },
          voidedAt: null,
        },
        orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
      })
    : [];

  return sortSummaries(
    sites.map((site) => {
      const asOf = requestedAsOf || todayInTimeZone(site.timeZone);
      return buildSummary(
        employee,
        site,
        requirements.filter((requirement) => requirement.siteId === site.id),
        completions,
        asOf,
      );
    }),
  );
}
