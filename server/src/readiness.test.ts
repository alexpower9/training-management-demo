import assert from 'node:assert/strict';
import test from 'node:test';
import {
  combineDomainAccess,
  evaluateDomainReadiness,
  type ReadinessCompletionRecord,
  type ReadinessEmployeeRecord,
  type ReadinessRequirementRecord,
  type ReadinessSiteRecord,
} from './readiness.js';

const employee: ReadinessEmployeeRecord = {
  id: 'employee-1',
  displayName: 'Test Employee',
  archivedAt: null,
};
const site: ReadinessSiteRecord = {
  id: 'site-1',
  name: 'Test Site',
  timeZone: 'America/St_Johns',
  archivedAt: null,
};

function requirement(itemId: string): ReadinessRequirementRecord {
  return {
    siteId: site.id,
    itemId,
    item: {
      id: itemId,
      name: `Requirement ${itemId}`,
      validityMonths: 12,
      archivedAt: null,
    },
  };
}

function completion(
  itemId: string,
  completedOn: string,
  expiresOn: string,
  overrides: Partial<ReadinessCompletionRecord> = {},
): ReadinessCompletionRecord {
  return {
    id: `completion-${itemId}-${completedOn}`,
    employeeId: employee.id,
    itemId,
    completedOn: new Date(`${completedOn}T00:00:00.000Z`),
    expiresOn: new Date(`${expiresOn}T00:00:00.000Z`),
    validityMonthsApplied: 12,
    recordedAt: new Date(`${completedOn}T12:00:00.000Z`),
    ...overrides,
  };
}

test('no requirements in either domain remains ineligible without blockers', () => {
  const training = evaluateDomainReadiness(employee, site, [], [], '2026-06-05');
  const medical = evaluateDomainReadiness(employee, site, [], [], '2026-06-05');

  assert.deepEqual(training, {
    rows: [],
    requiredCount: 0,
    completedCount: 0,
    expiringCount: 0,
    status: 'noRequirements',
    eligible: false,
  });
  assert.deepEqual(combineDomainAccess(training, medical), {
    status: 'noRequirements',
    eligible: false,
    requiredCount: 0,
    completedCount: 0,
    expiringCount: 0,
    blockingDomains: [],
  });
});

test('an empty Medical domain is neutral to current Training access', () => {
  const training = evaluateDomainReadiness(
    employee,
    site,
    [requirement('course-1')],
    [completion('course-1', '2026-01-01', '2026-07-20')],
    '2026-06-05',
  );
  const medical = evaluateDomainReadiness(employee, site, [], [], '2026-06-05');

  assert.equal(training.status, 'expiring');
  assert.equal(training.eligible, true);
  assert.deepEqual(combineDomainAccess(training, medical), {
    status: 'expiring',
    eligible: true,
    requiredCount: 1,
    completedCount: 1,
    expiringCount: 1,
    blockingDomains: [],
  });
});

test('Medical-only requirements independently determine combined access', () => {
  const training = evaluateDomainReadiness(employee, site, [], [], '2026-06-05');
  const medical = evaluateDomainReadiness(
    employee,
    site,
    [requirement('medical-1')],
    [],
    '2026-06-05',
  );

  assert.equal(training.status, 'noRequirements');
  assert.equal(medical.status, 'incomplete');
  assert.deepEqual(combineDomainAccess(training, medical), {
    status: 'incomplete',
    eligible: false,
    requiredCount: 1,
    completedCount: 0,
    expiringCount: 0,
    blockingDomains: ['medical'],
  });
});

test('combined counts include current requirements from both domains', () => {
  const training = evaluateDomainReadiness(
    employee,
    site,
    [requirement('course-1')],
    [completion('course-1', '2026-01-01', '2027-01-01')],
    '2026-06-05',
  );
  const medical = evaluateDomainReadiness(
    employee,
    site,
    [requirement('medical-1')],
    [completion('medical-1', '2026-01-01', '2026-06-20')],
    '2026-06-05',
  );

  assert.deepEqual(combineDomainAccess(training, medical), {
    status: 'expiring',
    eligible: true,
    requiredCount: 2,
    completedCount: 2,
    expiringCount: 1,
    blockingDomains: [],
  });
});

test('overdue outranks incomplete and both blocking domains are reported', () => {
  const training = evaluateDomainReadiness(
    employee,
    site,
    [requirement('course-1')],
    [],
    '2026-06-05',
  );
  const medical = evaluateDomainReadiness(
    employee,
    site,
    [requirement('medical-1')],
    [completion('medical-1', '2025-01-01', '2026-06-04')],
    '2026-06-05',
  );

  assert.deepEqual(combineDomainAccess(training, medical), {
    status: 'overdue',
    eligible: false,
    requiredCount: 2,
    completedCount: 0,
    expiringCount: 0,
    blockingDomains: ['training', 'medical'],
  });
});

test('the 45-day expiry boundary is current and one day beyond is compliant', () => {
  const evaluation = evaluateDomainReadiness(
    employee,
    site,
    [requirement('boundary'), requirement('beyond')],
    [
      completion('boundary', '2026-01-01', '2026-07-20'),
      completion('beyond', '2026-01-01', '2026-07-21'),
    ],
    '2026-06-05',
  );

  assert.equal(evaluation.rows[0]?.daysUntilExpiry, 45);
  assert.equal(evaluation.rows[0]?.status, 'expiring');
  assert.equal(evaluation.rows[1]?.daysUntilExpiry, 46);
  assert.equal(evaluation.rows[1]?.status, 'compliant');
  assert.equal(evaluation.eligible, true);
});

test('latest applicable selection ignores future and voided completions', () => {
  const current = completion('course-1', '2026-01-01', '2027-01-01');
  const future = completion('course-1', '2026-06-06', '2027-06-06');
  const voided = completion('course-1', '2026-05-01', '2026-05-31', {
    voidedAt: new Date('2026-05-02T00:00:00.000Z'),
  });
  const older = completion('course-1', '2025-01-01', '2025-12-31');
  const evaluation = evaluateDomainReadiness(
    employee,
    site,
    [requirement('course-1')],
    [future, voided, older, current],
    '2026-06-05',
  );

  assert.equal(evaluation.rows[0]?.completion?.id, current.id);
  assert.equal(evaluation.rows[0]?.status, 'compliant');
});

test('recorded time breaks ties without depending on input order', () => {
  const first = completion('course-1', '2026-01-01', '2026-06-01', {
    id: 'first',
    recordedAt: new Date('2026-01-02T10:00:00.000Z'),
  });
  const correction = completion('course-1', '2026-01-01', '2027-01-01', {
    id: 'correction',
    recordedAt: new Date('2026-01-02T11:00:00.000Z'),
  });
  const evaluation = evaluateDomainReadiness(
    employee,
    site,
    [requirement('course-1')],
    [first, correction],
    '2026-06-05',
  );

  assert.equal(evaluation.rows[0]?.completion?.id, correction.id);
  assert.equal(evaluation.rows[0]?.status, 'compliant');
});
