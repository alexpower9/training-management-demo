import { DemoDataError, readDemoDatabase, requireDate } from './demoDatabase';
import { completionStatus, daysUntilExpiry } from '@/utils/completionStatus';
import { getWorstStatus, sortReadiness, summarizeReadiness } from '@/utils/readiness';

const domains = {
  training: { items: 'courses', item: 'course', key: 'courseId', requirements: 'siteCourseRequirements', completions: 'completions' },
  medical: { items: 'medicals', item: 'medical', key: 'medicalId', requirements: 'siteMedicalRequirements', completions: 'medicalCompletions' },
};
const publicEmployee = (row) => ({ id: row.id, name: row.displayName, active: !row.archivedAt });
const publicSite = (row) => ({ ...row, active: !row.archivedAt });

function siteDate(site, asOf) {
  if (asOf) return requireDate(asOf, 'asOf');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: site.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function findSite(database, siteId) {
  const site = database.sites.find((row) => row.id === siteId && !row.archivedAt);
  if (!site) throw new DemoDataError('The requested site was not found.', 'SITE_NOT_FOUND');
  return site;
}

function requirements(database, siteId, domain) {
  const config = domains[domain];
  const ids = new Set(database[config.requirements].filter((row) => row.siteId === siteId).map((row) => row[config.key]));
  return database[config.items].filter((row) => ids.has(row.id) && !row.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name)).map((row) => ({
      ...row, siteId, renewalMonths: row.validityMonths, active: true,
    }));
}

function evaluate(database, employee, site, domain, asOf) {
  const config = domains[domain];
  const rows = requirements(database, site.id, domain).map((item) => {
    const completion = database[config.completions].filter((row) => row.employeeId === employee.id
      && row[config.key] === item.id && !row.voidedAt && row.completedOn <= asOf)
      .sort((a, b) => b.completedOn.localeCompare(a.completedOn) || b.recordedAt.localeCompare(a.recordedAt))[0] || null;
    return { employeeId: employee.id, siteId: site.id, [config.key]: item.id, [config.item]: item,
      completion, status: completion ? completionStatus(completion, asOf) : 'incomplete',
      daysUntilExpiry: daysUntilExpiry(completion, asOf) };
  });
  return summarizeReadiness(publicEmployee(employee), publicSite(site), rows, { [config.items]: rows });
}

function readiness(database, siteId, domain, requestedAsOf) {
  const site = findSite(database, siteId);
  const asOf = siteDate(site, requestedAsOf);
  return database.employees.filter((row) => !row.archivedAt).map((employee) => {
    const training = evaluate(database, employee, site, 'training', asOf);
    const medical = evaluate(database, employee, site, 'medical', asOf);
    const statuses = [...training.requirements, ...medical.requirements].map((row) => row.status);
    const combinedAccess = {
      status: getWorstStatus(statuses),
      eligible: statuses.length > 0 && statuses.every((status) => ['compliant', 'expiring'].includes(status)),
      requiredCount: training.requiredCount + medical.requiredCount,
      completedCount: training.completedCount + medical.completedCount,
      expiringCount: training.expiringCount + medical.expiringCount,
      blockingDomains: [['training', training], ['medical', medical]]
        .filter(([, value]) => value.requirements.some((row) => ['incomplete', 'overdue'].includes(row.status)))
        .map(([key]) => key),
    };
    const summary = domain === 'training' ? training : medical;
    return { ...summary, eligible: combinedAccess.eligible, domainEligible: summary.eligible, combinedAccess, asOf };
  }).sort(sortReadiness);
}

export function createReadinessRepository(domain) {
  return {
    async listEmployees() {
      return readDemoDatabase().employees.filter((row) => !row.archivedAt)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)).map(publicEmployee);
    },
    async listSites() {
      return readDemoDatabase().sites.filter((row) => !row.archivedAt)
        .sort((a, b) => a.name.localeCompare(b.name)).map(publicSite);
    },
    async listSiteRequirements(siteId, asOf) {
      const database = readDemoDatabase();
      siteDate(findSite(database, siteId), asOf);
      return requirements(database, siteId, domain);
    },
    async getSiteReadiness(siteId, asOf) { return readiness(readDemoDatabase(), siteId, domain, asOf); },
  };
}
