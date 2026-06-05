export const referenceDate = '2026-06-05';

export const employees = [
  {
    id: 'emp-001',
    name: 'Maya Chen',
    position: 'Field Technician',
    crew: 'Field Service',
    homeBase: 'Labrador City',
    active: true,
  },
  {
    id: 'emp-002',
    name: 'Noah Bennett',
    position: 'Equipment Operator',
    crew: 'Operations',
    homeBase: 'Wabush',
    active: true,
  },
  {
    id: 'emp-003',
    name: 'Priya Singh',
    position: 'Safety Supervisor',
    crew: 'HSE',
    homeBase: 'Labrador City',
    active: true,
  },
  {
    id: 'emp-004',
    name: 'Logan Murphy',
    position: 'Maintenance Specialist',
    crew: 'Maintenance',
    homeBase: 'Happy Valley-Goose Bay',
    active: true,
  },
  {
    id: 'emp-005',
    name: 'Grace Okafor',
    position: 'Site Coordinator',
    crew: 'Operations',
    homeBase: 'Labrador City',
    active: true,
  },
  {
    id: 'emp-006',
    name: 'Ethan Ross',
    position: 'Heavy Equipment Mechanic',
    crew: 'Maintenance',
    homeBase: 'Wabush',
    active: true,
  },
  {
    id: 'emp-007',
    name: 'Sofia Martin',
    position: 'Customer Trainer',
    crew: 'Training',
    homeBase: 'Labrador City',
    active: true,
  },
  {
    id: 'emp-008',
    name: 'Caleb White',
    position: 'Apprentice Technician',
    crew: 'Field Service',
    homeBase: 'Labrador City',
    active: true,
  },
];

export const customers = [
  { id: 'customer-aurora', name: 'Aurora Mining', contact: 'Megan Pierce', active: true },
  { id: 'customer-boreal', name: 'Boreal Ironworks', contact: 'Thomas Doyle', active: true },
  { id: 'customer-tundra', name: 'Tundra Resources', contact: 'Alicia Ward', active: true },
  { id: 'customer-northern', name: 'Northern Aggregate', contact: 'Graham Lee', active: true },
];

export const sites = [
  {
    id: 'site-aurora-north-ridge',
    customerId: 'customer-aurora',
    name: 'North Ridge Mine',
    region: 'Labrador West',
    active: true,
  },
  {
    id: 'site-boreal-millwright',
    customerId: 'customer-boreal',
    name: 'Millwright Yard',
    region: 'Wabush',
    active: true,
  },
  {
    id: 'site-tundra-east-pit',
    customerId: 'customer-tundra',
    name: 'East Pit',
    region: 'Schefferville Corridor',
    active: true,
  },
  {
    id: 'site-northern-harbour',
    customerId: 'customer-northern',
    name: 'Harbour Quarry',
    region: 'Happy Valley-Goose Bay',
    active: true,
  },
];

export const courses = [
  {
    id: 'course-aurora-orientation',
    siteId: 'site-aurora-north-ridge',
    code: 'AUR-100',
    name: 'North Ridge Site Orientation',
    category: 'Site Access',
    renewalMonths: 12,
    active: true,
  },
  {
    id: 'course-aurora-lockout',
    siteId: 'site-aurora-north-ridge',
    code: 'AUR-220',
    name: 'North Ridge Lockout / Tagout',
    category: 'Safety',
    renewalMonths: 24,
    active: true,
  },
  {
    id: 'course-aurora-winter',
    siteId: 'site-aurora-north-ridge',
    code: 'AUR-310',
    name: 'North Ridge Winter Access',
    category: 'Site Access',
    renewalMonths: 12,
    active: true,
  },
  {
    id: 'course-boreal-orientation',
    siteId: 'site-boreal-millwright',
    code: 'BOR-100',
    name: 'Millwright Yard Orientation',
    category: 'Site Access',
    renewalMonths: 12,
    active: true,
  },
  {
    id: 'course-boreal-lockout',
    siteId: 'site-boreal-millwright',
    code: 'BOR-230',
    name: 'Millwright Yard Lockout / Tagout',
    category: 'Safety',
    renewalMonths: 24,
    active: true,
  },
  {
    id: 'course-boreal-hydraulics',
    siteId: 'site-boreal-millwright',
    code: 'BOR-340',
    name: 'Boreal Hydraulic Service Safety',
    category: 'Technical',
    renewalMonths: 24,
    active: true,
  },
  {
    id: 'course-tundra-orientation',
    siteId: 'site-tundra-east-pit',
    code: 'TUN-100',
    name: 'East Pit Site Orientation',
    category: 'Site Access',
    renewalMonths: 12,
    active: true,
  },
  {
    id: 'course-tundra-confined',
    siteId: 'site-tundra-east-pit',
    code: 'TUN-250',
    name: 'East Pit Confined Space',
    category: 'Safety',
    renewalMonths: 24,
    active: true,
  },
  {
    id: 'course-tundra-winter',
    siteId: 'site-tundra-east-pit',
    code: 'TUN-315',
    name: 'East Pit Winter Travel',
    category: 'Site Access',
    renewalMonths: 12,
    active: true,
  },
  {
    id: 'course-northern-orientation',
    siteId: 'site-northern-harbour',
    code: 'NOR-100',
    name: 'Harbour Quarry Orientation',
    category: 'Site Access',
    renewalMonths: 12,
    active: true,
  },
  {
    id: 'course-northern-first-aid',
    siteId: 'site-northern-harbour',
    code: 'NOR-180',
    name: 'Harbour Quarry First Aid',
    category: 'Safety',
    renewalMonths: 36,
    active: true,
  },
  {
    id: 'course-northern-quarry',
    siteId: 'site-northern-harbour',
    code: 'NOR-275',
    name: 'Harbour Quarry Hazard Awareness',
    category: 'Safety',
    renewalMonths: 24,
    active: true,
  },
];

const completionExceptions = {
  'emp-002:course-aurora-lockout': { completedOn: '2024-06-25', expiresOn: '2026-06-25' },
  'emp-003:course-aurora-orientation': { completedOn: '2025-04-20', expiresOn: '2026-04-20' },
  'emp-004:course-aurora-winter': null,
  'emp-006:course-aurora-lockout': null,
  'emp-007:course-aurora-orientation': { completedOn: '2025-06-18', expiresOn: '2026-06-18' },
  'emp-008:course-aurora-lockout': null,
  'emp-008:course-aurora-winter': null,
  'emp-001:course-boreal-hydraulics': { completedOn: '2024-05-30', expiresOn: '2026-05-30' },
  'emp-003:course-boreal-lockout': { completedOn: '2024-07-10', expiresOn: '2026-07-10' },
  'emp-004:course-boreal-orientation': null,
  'emp-005:course-boreal-hydraulics': null,
  'emp-007:course-boreal-orientation': { completedOn: '2025-06-30', expiresOn: '2026-06-30' },
  'emp-008:course-boreal-lockout': null,
  'emp-002:course-tundra-winter': { completedOn: '2025-05-01', expiresOn: '2026-05-01' },
  'emp-003:course-tundra-confined': null,
  'emp-004:course-tundra-orientation': { completedOn: '2025-06-22', expiresOn: '2026-06-22' },
  'emp-006:course-tundra-winter': null,
  'emp-008:course-tundra-orientation': null,
  'emp-001:course-northern-orientation': { completedOn: '2025-05-20', expiresOn: '2026-05-20' },
  'emp-002:course-northern-first-aid': null,
  'emp-004:course-northern-quarry': { completedOn: '2024-06-28', expiresOn: '2026-06-28' },
  'emp-006:course-northern-orientation': null,
  'emp-007:course-northern-quarry': { completedOn: '2024-04-12', expiresOn: '2026-04-12' },
  'emp-008:course-northern-first-aid': null,
};

export const completions = employees.flatMap((employee) =>
  courses.flatMap((course) => {
    const exception = completionExceptions[`${employee.id}:${course.id}`];

    if (exception === null) {
      return [];
    }

    return [
      {
        id: `completion-${employee.id}-${course.id}`,
        employeeId: employee.id,
        courseId: course.id,
        completedOn: exception?.completedOn || '2025-01-15',
        expiresOn: exception?.expiresOn || '2027-01-15',
        recordedBySubject: 'demo-seed',
        createdAt: '2026-06-05T12:00:00.000Z',
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
  return dateString ? new Date(`${dateString}T00:00:00`) : null;
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
    .sort((a, b) => b.completedOn.localeCompare(a.completedOn))[0];
}

export function getDemoSiteCourses(siteId) {
  return courses.filter((course) => course.siteId === siteId && course.active);
}

export function getDemoSiteReadiness(siteId) {
  const site = sites.find((item) => item.id === siteId);
  const customer = customers.find((item) => item.id === site?.customerId);
  const siteCourses = getDemoSiteCourses(siteId);

  if (!site || !customer) return [];

  return employees
    .filter((employee) => employee.active)
    .map((employee) => {
      const courseRows = siteCourses.map((course) => {
        const completion = latestCompletion(employee.id, course.id);
        const remainingDays = completion ? daysUntil(completion.expiresOn) : null;
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

      return summarizeEmployeeReadiness(employee, customer, site, courseRows);
    })
    .sort(sortReadiness);
}

export function summarizeEmployeeReadiness(employee, customer, site, courseRows) {
  if (!courseRows.length) {
    return {
      id: `${employee.id}-${site.id}`,
      employee,
      customer,
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
    customer,
    site,
    courses: courseRows,
    requiredCount: courseRows.length,
    completedCount: courseRows.filter((row) => ['compliant', 'expiring'].includes(row.status))
      .length,
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
