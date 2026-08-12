import type { PrismaClient } from '@prisma/client';
import { daysBetween, formatDateOnly, parseDateOnly, todayInTimeZone } from './dates.js';
import { AppError } from './errors.js';

const EXPIRING_WARNING_DAYS = 45;

export type ReadinessStatus =
  | 'noRequirements'
  | 'compliant'
  | 'expiring'
  | 'incomplete'
  | 'overdue';
export type ReadinessDomain = 'training' | 'medical';

const statusRank: Record<ReadinessStatus, number> = {
  noRequirements: -1,
  compliant: 0,
  expiring: 1,
  incomplete: 2,
  overdue: 3,
};

export type ReadinessEmployeeRecord = {
  id: string;
  displayName: string;
  archivedAt: Date | null;
};

export type ReadinessSiteRecord = {
  id: string;
  name: string;
  timeZone: string;
  archivedAt: Date | null;
};

export type ReadinessRequirementRecord = {
  siteId: string;
  itemId: string;
  item: {
    id: string;
    name: string;
    validityMonths: number;
    archivedAt: Date | null;
  };
};

export type ReadinessCompletionRecord = {
  id: string;
  employeeId: string;
  itemId: string;
  completedOn: Date;
  expiresOn: Date;
  validityMonthsApplied: number | null;
  recordedAt: Date;
  voidedAt?: Date | null;
};

type DomainReadinessRow = {
  employeeId: string;
  siteId: string;
  itemId: string;
  item: ReturnType<typeof serializeRequirementItem>;
  completion: ReturnType<typeof serializeCompletion> | null;
  status: Exclude<ReadinessStatus, 'noRequirements'>;
  daysUntilExpiry: number | null;
};

export type DomainReadinessEvaluation = {
  rows: DomainReadinessRow[];
  requiredCount: number;
  completedCount: number;
  expiringCount: number;
  status: ReadinessStatus;
  eligible: boolean;
};

export type CombinedAccess = {
  status: ReadinessStatus;
  eligible: boolean;
  requiredCount: number;
  completedCount: number;
  expiringCount: number;
  blockingDomains: ReadinessDomain[];
};

function serializeEmployee(employee: ReadinessEmployeeRecord) {
  return {
    id: employee.id,
    name: employee.displayName,
    active: !employee.archivedAt,
  };
}

function serializeSite(site: ReadinessSiteRecord) {
  return {
    id: site.id,
    name: site.name,
    timeZone: site.timeZone,
    active: !site.archivedAt,
  };
}

function serializeRequirementItem(requirement: ReadinessRequirementRecord) {
  return {
    id: requirement.item.id,
    siteId: requirement.siteId,
    name: requirement.item.name,
    renewalMonths: requirement.item.validityMonths,
    validityMonths: requirement.item.validityMonths,
    active: !requirement.item.archivedAt,
  };
}

function serializeCompletion(completion: ReadinessCompletionRecord) {
  return {
    id: completion.id,
    completedOn: formatDateOnly(completion.completedOn),
    expiresOn: formatDateOnly(completion.expiresOn),
    validityMonthsApplied: completion.validityMonthsApplied,
    recordedAt: completion.recordedAt.toISOString(),
  };
}

function worstStatus(statuses: ReadinessStatus[]): ReadinessStatus {
  return statuses.length
    ? statuses.reduce((worst, current) =>
        statusRank[current] > statusRank[worst] ? current : worst,
      )
    : 'noRequirements';
}

function isCurrent(status: ReadinessStatus) {
  return status === 'compliant' || status === 'expiring';
}

function isLaterCompletion(
  candidate: ReadinessCompletionRecord,
  current: ReadinessCompletionRecord,
) {
  const completedDelta =
    candidate.completedOn.getTime() - current.completedOn.getTime();
  return completedDelta > 0 ||
    (completedDelta === 0 && candidate.recordedAt > current.recordedAt);
}

/**
 * Evaluates one requirement domain from complete, unfiltered records. Keeping
 * this pure makes Training and Medical follow exactly the same date and status
 * rules, and ensures view filters cannot alter site-access eligibility.
 */
export function evaluateDomainReadiness(
  employee: ReadinessEmployeeRecord,
  site: ReadinessSiteRecord,
  requirements: ReadinessRequirementRecord[],
  completions: ReadinessCompletionRecord[],
  asOf: string,
): DomainReadinessEvaluation {
  const asOfDate = parseDateOnly(asOf);
  const latestByItem = new Map<string, ReadinessCompletionRecord>();

  for (const completion of completions) {
    if (
      completion.employeeId !== employee.id ||
      completion.voidedAt ||
      completion.completedOn > asOfDate
    ) {
      continue;
    }

    const current = latestByItem.get(completion.itemId);
    if (!current || isLaterCompletion(completion, current)) {
      latestByItem.set(completion.itemId, completion);
    }
  }

  const rows: DomainReadinessRow[] = requirements.map((requirement) => {
    const completion = latestByItem.get(requirement.itemId);
    const expiresOn = completion ? formatDateOnly(completion.expiresOn) : null;
    const remainingDays = expiresOn ? daysBetween(asOf, expiresOn) : null;
    let status: DomainReadinessRow['status'] = 'compliant';

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
      itemId: requirement.itemId,
      item: serializeRequirementItem(requirement),
      completion: completion ? serializeCompletion(completion) : null,
      status,
      daysUntilExpiry: remainingDays,
    };
  });
  const statuses = rows.map((row) => row.status);

  return {
    rows,
    requiredCount: rows.length,
    completedCount: rows.filter((row) => isCurrent(row.status)).length,
    expiringCount: rows.filter((row) => row.status === 'expiring').length,
    status: worstStatus(statuses),
    eligible: rows.length > 0 && rows.every((row) => isCurrent(row.status)),
  };
}

export function combineDomainAccess(
  training: DomainReadinessEvaluation,
  medical: DomainReadinessEvaluation,
): CombinedAccess {
  const requiredCount = training.requiredCount + medical.requiredCount;
  const statuses = [...training.rows, ...medical.rows].map((row) => row.status);

  return {
    status: worstStatus(statuses),
    eligible:
      requiredCount > 0 &&
      statuses.every((status) => isCurrent(status)),
    requiredCount,
    completedCount: training.completedCount + medical.completedCount,
    expiringCount: training.expiringCount + medical.expiringCount,
    blockingDomains: (
      [
        ['training', training],
        ['medical', medical],
      ] as const
    )
      .filter(
        ([, evaluation]) =>
          evaluation.rows.some((row) => !isCurrent(row.status)),
      )
      .map(([domain]) => domain),
  };
}

function buildSummary(
  domain: ReadinessDomain,
  employee: ReadinessEmployeeRecord,
  site: ReadinessSiteRecord,
  domainEvaluation: DomainReadinessEvaluation,
  combinedAccess: CombinedAccess,
  asOf: string,
) {
  const rows = domainEvaluation.rows.map((row) =>
    domain === 'training'
      ? {
          employeeId: row.employeeId,
          siteId: row.siteId,
          courseId: row.itemId,
          course: row.item,
          completion: row.completion,
          status: row.status,
          daysUntilExpiry: row.daysUntilExpiry,
        }
      : {
          employeeId: row.employeeId,
          siteId: row.siteId,
          medicalId: row.itemId,
          medical: row.item,
          completion: row.completion,
          status: row.status,
          daysUntilExpiry: row.daysUntilExpiry,
        },
  );

  return {
    id: `${employee.id}-${site.id}`,
    employee: serializeEmployee(employee),
    site: serializeSite(site),
    ...(domain === 'training' ? { courses: rows } : { medicals: rows }),
    requiredCount: domainEvaluation.requiredCount,
    completedCount: domainEvaluation.completedCount,
    expiringCount: domainEvaluation.expiringCount,
    status: domainEvaluation.status,
    // Preserve the v1 meaning of `eligible`: it remains the authoritative
    // site-access decision. `domainEligible` drives the Training/Medical
    // status strip without inviting older clients to ignore the other domain.
    eligible: combinedAccess.eligible,
    domainEligible: domainEvaluation.eligible,
    combinedAccess,
    asOf,
  };
}

type Summary = ReturnType<typeof buildSummary>;

function sortSummaries(summaries: Summary[]) {
  return summaries.sort((a, b) => {
    const eligibilityDelta =
      Number(a.combinedAccess.eligible) - Number(b.combinedAccess.eligible);
    if (eligibilityDelta !== 0) return eligibilityDelta;
    const statusDelta = statusRank[b.status] - statusRank[a.status];
    if (statusDelta !== 0) return statusDelta;
    return a.employee.name.localeCompare(b.employee.name);
  });
}

function courseRequirements(
  requirements: Array<{
    siteId: string;
    courseId: string;
    course: ReadinessRequirementRecord['item'];
  }>,
): ReadinessRequirementRecord[] {
  return requirements.map((requirement) => ({
    siteId: requirement.siteId,
    itemId: requirement.courseId,
    item: requirement.course,
  }));
}

function medicalRequirements(
  requirements: Array<{
    siteId: string;
    medicalId: string;
    medical: ReadinessRequirementRecord['item'];
  }>,
): ReadinessRequirementRecord[] {
  return requirements.map((requirement) => ({
    siteId: requirement.siteId,
    itemId: requirement.medicalId,
    item: requirement.medical,
  }));
}

function courseCompletions(
  completions: Array<
    Omit<ReadinessCompletionRecord, 'itemId'> & { courseId: string }
  >,
): ReadinessCompletionRecord[] {
  return completions.map(({ courseId, ...completion }) => ({
    ...completion,
    itemId: courseId,
  }));
}

function medicalCompletions(
  completions: Array<
    Omit<ReadinessCompletionRecord, 'itemId'> & { medicalId: string }
  >,
): ReadinessCompletionRecord[] {
  return completions.map(({ medicalId, ...completion }) => ({
    ...completion,
    itemId: medicalId,
  }));
}

function summariesForEmployeeSite(
  domain: ReadinessDomain,
  employee: ReadinessEmployeeRecord,
  site: ReadinessSiteRecord,
  allCourseRequirements: ReadinessRequirementRecord[],
  allMedicalRequirements: ReadinessRequirementRecord[],
  allCourseCompletions: ReadinessCompletionRecord[],
  allMedicalCompletions: ReadinessCompletionRecord[],
  asOf: string,
) {
  const training = evaluateDomainReadiness(
    employee,
    site,
    allCourseRequirements.filter((requirement) => requirement.siteId === site.id),
    allCourseCompletions,
    asOf,
  );
  const medical = evaluateDomainReadiness(
    employee,
    site,
    allMedicalRequirements.filter((requirement) => requirement.siteId === site.id),
    allMedicalCompletions,
    asOf,
  );

  return buildSummary(
    domain,
    employee,
    site,
    domain === 'training' ? training : medical,
    combineDomainAccess(training, medical),
    asOf,
  );
}

async function getSiteDomainReadiness(
  prisma: PrismaClient,
  domain: ReadinessDomain,
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
  const [rawCourseRequirements, rawMedicalRequirements, employees] =
    await Promise.all([
      prisma.siteCourseRequirement.findMany({
        where: { siteId, course: { archivedAt: null } },
        include: { course: true },
        orderBy: { course: { name: 'asc' } },
      }),
      prisma.siteMedicalRequirement.findMany({
        where: { siteId, medical: { archivedAt: null } },
        include: { medical: true },
        orderBy: { medical: { name: 'asc' } },
      }),
      prisma.employee.findMany({
        where: { archivedAt: null },
        orderBy: { displayName: 'asc' },
      }),
    ]);
  const trainingRequirements = courseRequirements(rawCourseRequirements);
  const healthRequirements = medicalRequirements(rawMedicalRequirements);
  const courseIds = trainingRequirements.map((requirement) => requirement.itemId);
  const medicalIds = healthRequirements.map((requirement) => requirement.itemId);
  const [rawCourseCompletions, rawMedicalCompletions] = await Promise.all([
    courseIds.length
      ? prisma.courseCompletion.findMany({
          where: {
            voidedAt: null,
            completedOn: { lte: asOfDate },
            courseId: { in: courseIds },
          },
          orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
        })
      : [],
    medicalIds.length
      ? prisma.medicalCompletion.findMany({
          where: {
            voidedAt: null,
            completedOn: { lte: asOfDate },
            medicalId: { in: medicalIds },
          },
          orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
        })
      : [],
  ]);
  const trainingCompletions = courseCompletions(rawCourseCompletions);
  const healthCompletions = medicalCompletions(rawMedicalCompletions);

  return sortSummaries(
    employees.map((employee) =>
      summariesForEmployeeSite(
        domain,
        employee,
        site,
        trainingRequirements,
        healthRequirements,
        trainingCompletions,
        healthCompletions,
        asOf,
      ),
    ),
  );
}

async function getEmployeeDomainReadiness(
  prisma: PrismaClient,
  domain: ReadinessDomain,
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
      'Your employee record is inactive.',
    );
  }

  const sites = await prisma.site.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
  });
  const siteIds = sites.map((site) => site.id);
  const [rawCourseRequirements, rawMedicalRequirements] = siteIds.length
    ? await Promise.all([
        prisma.siteCourseRequirement.findMany({
          where: {
            siteId: { in: siteIds },
            course: { archivedAt: null },
          },
          include: { course: true },
          orderBy: { course: { name: 'asc' } },
        }),
        prisma.siteMedicalRequirement.findMany({
          where: {
            siteId: { in: siteIds },
            medical: { archivedAt: null },
          },
          include: { medical: true },
          orderBy: { medical: { name: 'asc' } },
        }),
      ])
    : [[], []];
  const trainingRequirements = courseRequirements(rawCourseRequirements);
  const healthRequirements = medicalRequirements(rawMedicalRequirements);
  const courseIds = [
    ...new Set(trainingRequirements.map((requirement) => requirement.itemId)),
  ];
  const medicalIds = [
    ...new Set(healthRequirements.map((requirement) => requirement.itemId)),
  ];
  const [rawCourseCompletions, rawMedicalCompletions] = await Promise.all([
    courseIds.length
      ? prisma.courseCompletion.findMany({
          where: {
            employeeId,
            courseId: { in: courseIds },
            voidedAt: null,
          },
          orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
        })
      : [],
    medicalIds.length
      ? prisma.medicalCompletion.findMany({
          where: {
            employeeId,
            medicalId: { in: medicalIds },
            voidedAt: null,
          },
          orderBy: [{ completedOn: 'desc' }, { recordedAt: 'desc' }],
        })
      : [],
  ]);
  const trainingCompletions = courseCompletions(rawCourseCompletions);
  const healthCompletions = medicalCompletions(rawMedicalCompletions);

  return sortSummaries(
    sites.map((site) => {
      const asOf = requestedAsOf || todayInTimeZone(site.timeZone);
      return summariesForEmployeeSite(
        domain,
        employee,
        site,
        trainingRequirements,
        healthRequirements,
        trainingCompletions,
        healthCompletions,
        asOf,
      );
    }),
  );
}

export function getSiteReadiness(
  prisma: PrismaClient,
  siteId: string,
  requestedAsOf?: string,
) {
  return getSiteDomainReadiness(prisma, 'training', siteId, requestedAsOf);
}

export function getSiteMedicalReadiness(
  prisma: PrismaClient,
  siteId: string,
  requestedAsOf?: string,
) {
  return getSiteDomainReadiness(prisma, 'medical', siteId, requestedAsOf);
}

export function getEmployeeReadiness(
  prisma: PrismaClient,
  employeeId: string,
  requestedAsOf?: string,
) {
  return getEmployeeDomainReadiness(
    prisma,
    'training',
    employeeId,
    requestedAsOf,
  );
}

export function getEmployeeMedicalReadiness(
  prisma: PrismaClient,
  employeeId: string,
  requestedAsOf?: string,
) {
  return getEmployeeDomainReadiness(
    prisma,
    'medical',
    employeeId,
    requestedAsOf,
  );
}
