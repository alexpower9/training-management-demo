export const statusMeta = {
  noRequirements: { label: 'No Requirements', tone: 'neutral' },
  compliant: { label: 'Compliant', tone: 'success' },
  expiring: { label: 'Expiring Soon', tone: 'warning' },
  incomplete: { label: 'Incomplete', tone: 'neutral' },
  overdue: { label: 'Overdue', tone: 'danger' },
};

export const statusRank = {
  noRequirements: -1,
  compliant: 0,
  expiring: 1,
  incomplete: 2,
  overdue: 3,
};

export function getWorstStatus(statuses) {
  if (!statuses.length) return 'noRequirements';
  return statuses.reduce(
    (worst, status) =>
      statusRank[status] > statusRank[worst] ? status : worst,
    'compliant',
  );
}

export function summarizeReadiness(employee, site, requirements, options = {}) {
  const statuses = requirements.map((row) => row.status);
  const status = getWorstStatus(statuses);

  return {
    id: `${employee.id}-${site.id}`,
    employee,
    site,
    requirements,
    requiredCount: requirements.length,
    completedCount: requirements.filter((row) =>
      ['compliant', 'expiring'].includes(row.status),
    ).length,
    expiringCount: requirements.filter((row) => row.status === 'expiring').length,
    status,
    eligible:
      requirements.length > 0 &&
      requirements.every((row) => ['compliant', 'expiring'].includes(row.status)),
    ...options,
  };
}

export function sortReadiness(a, b) {
  const aEligible = a.combinedAccess?.eligible ?? a.eligible;
  const bEligible = b.combinedAccess?.eligible ?? b.eligible;
  const eligibilityDelta = Number(aEligible) - Number(bEligible);
  if (eligibilityDelta !== 0) return eligibilityDelta;
  const statusDelta = statusRank[b.status] - statusRank[a.status];
  if (statusDelta !== 0) return statusDelta;
  return a.employee.name.localeCompare(b.employee.name);
}
