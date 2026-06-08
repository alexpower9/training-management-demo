import demoData from './trainingDemoData.json' with { type: 'json' };

export const referenceDate = demoData.referenceDate;

export const employees = demoData.employees.map((employee) => ({
  ...employee,
  active: true,
  archivedAt: null,
}));

export const sites = demoData.sites.map((site) => ({
  ...site,
  active: true,
  archivedAt: null,
}));

export const courses = demoData.courses.map((course) => ({
  ...course,
  renewalMonths: course.validityMonths,
  active: true,
  archivedAt: null,
}));

export const completions = employees.flatMap((employee) =>
  courses.flatMap((course) => {
    const key = `${employee.id}:${course.id}`;
    const exception = demoData.completionExceptions[key];

    if (exception === null) return [];

    return [
      {
        id: `completion-${employee.id}-${course.id}`,
        employeeId: employee.id,
        courseId: course.id,
        completedOn: exception?.completedOn || demoData.defaultCompletion.completedOn,
        expiresOn: exception?.expiresOn || demoData.defaultCompletion.expiresOn,
        validityMonthsApplied: null,
        recordedBySubject: 'demo-seed',
        recordedAt: '2026-06-05T12:00:00.000Z',
        voidedAt: null,
        voidedBySubject: null,
        voidReason: null,
      },
    ];
  }),
);

export const statusMeta = {
  noRequirements: { label: 'No Requirements', tone: 'neutral' },
  compliant: { label: 'Compliant', tone: 'success' },
  expiring: { label: 'Expiring Soon', tone: 'warning' },
  incomplete: { label: 'Incomplete', tone: 'neutral' },
  overdue: { label: 'Overdue', tone: 'danger' },
};

const statusRank = {
  noRequirements: -1,
  compliant: 0,
  expiring: 1,
  incomplete: 2,
  overdue: 3,
};

function toDate(dateString) {
  return dateString ? new Date(`${dateString}T00:00:00Z`) : null;
}

export function daysUntil(dateString, fromDate = referenceDate) {
  const target = toDate(dateString);
  const today = toDate(fromDate);
  if (!target || !today) return null;
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function formatDate(dateString) {
  if (!dateString) return 'Not completed';
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(toDate(dateString));
}

export function getWorstStatus(statuses) {
  return statuses.reduce(
    (worst, status) => (statusRank[status] > statusRank[worst] ? status : worst),
    'compliant',
  );
}

function latestCompletion(employeeId, courseId) {
  return completions
    .filter(
      (completion) =>
        completion.employeeId === employeeId &&
        completion.courseId === courseId &&
        !completion.voidedAt,
    )
    .sort(
      (a, b) =>
        b.completedOn.localeCompare(a.completedOn) ||
        b.recordedAt.localeCompare(a.recordedAt),
    )[0];
}

export function getDemoSiteCourses(siteId, asOf = referenceDate) {
  if (!asOf) return [];
  const courseIds = new Set(
    demoData.siteCourseRequirements
      .filter((requirement) => requirement.siteId === siteId)
      .map((requirement) => requirement.courseId),
  );
  return courses
    .filter((course) => courseIds.has(course.id) && course.active)
    .map((course) => ({ ...course, siteId }));
}

export function getDemoSiteReadiness(siteId, asOf = referenceDate) {
  const site = sites.find((item) => item.id === siteId);
  const siteCourses = getDemoSiteCourses(siteId, asOf);
  if (!site) return [];

  return employees
    .filter((employee) => employee.active)
    .map((employee) => {
      const courseRows = siteCourses.map((course) => {
        const completion = latestCompletion(employee.id, course.id);
        const remainingDays = completion ? daysUntil(completion.expiresOn, asOf) : null;
        let status = 'compliant';

        if (!completion) status = 'incomplete';
        else if (remainingDays < 0) status = 'overdue';
        else if (remainingDays <= 45) status = 'expiring';

        return {
          employeeId: employee.id,
          siteId,
          courseId: course.id,
          course,
          completion,
          status,
          daysUntilExpiry: remainingDays,
        };
      });

      return summarizeEmployeeReadiness(employee, site, courseRows);
    })
    .sort(sortReadiness);
}

export function summarizeEmployeeReadiness(employee, site, courseRows) {
  if (!courseRows.length) {
    return {
      id: `${employee.id}-${site.id}`,
      employee,
      site,
      courses: [],
      requiredCount: 0,
      completedCount: 0,
      expiringCount: 0,
      status: 'noRequirements',
      eligible: false,
    };
  }

  const statuses = courseRows.map((row) => row.status);
  return {
    id: `${employee.id}-${site.id}`,
    employee,
    site,
    courses: courseRows,
    requiredCount: courseRows.length,
    completedCount: courseRows.filter((row) =>
      ['compliant', 'expiring'].includes(row.status),
    ).length,
    expiringCount: courseRows.filter((row) => row.status === 'expiring').length,
    status: getWorstStatus(statuses),
    eligible: statuses.every((status) => ['compliant', 'expiring'].includes(status)),
  };
}

export function sortReadiness(a, b) {
  const eligibilityDelta = Number(a.eligible) - Number(b.eligible);
  if (eligibilityDelta !== 0) return eligibilityDelta;
  const statusDelta = statusRank[b.status] - statusRank[a.status];
  if (statusDelta !== 0) return statusDelta;
  return a.employee.name.localeCompare(b.employee.name);
}
