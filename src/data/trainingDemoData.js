export const referenceDate = '2026-06-04';

export const employees = [
  {
    id: 'emp-001',
    name: 'Maya Chen',
    position: 'Field Technician',
    crew: 'Field Service',
    homeBase: 'Labrador City',
  },
  {
    id: 'emp-002',
    name: 'Noah Bennett',
    position: 'Equipment Operator',
    crew: 'Operations',
    homeBase: 'Wabush',
  },
  {
    id: 'emp-003',
    name: 'Priya Singh',
    position: 'Safety Supervisor',
    crew: 'HSE',
    homeBase: 'Labrador City',
  },
  {
    id: 'emp-004',
    name: 'Logan Murphy',
    position: 'Maintenance Specialist',
    crew: 'Maintenance',
    homeBase: 'Happy Valley-Goose Bay',
  },
  {
    id: 'emp-005',
    name: 'Grace Okafor',
    position: 'Site Coordinator',
    crew: 'Operations',
    homeBase: 'Labrador City',
  },
  {
    id: 'emp-006',
    name: 'Ethan Ross',
    position: 'Heavy Equipment Mechanic',
    crew: 'Maintenance',
    homeBase: 'Wabush',
  },
  {
    id: 'emp-007',
    name: 'Sofia Martin',
    position: 'Customer Trainer',
    crew: 'Training',
    homeBase: 'Labrador City',
  },
  {
    id: 'emp-008',
    name: 'Caleb White',
    position: 'Apprentice Technician',
    crew: 'Field Service',
    homeBase: 'Labrador City',
  },
];

export const customers = [
  {
    id: 'cust-aurora',
    name: 'Aurora Mining',
    site: 'North Ridge Mine',
    region: 'Labrador West',
    contact: 'Megan Pierce',
  },
  {
    id: 'cust-boreal',
    name: 'Boreal Ironworks',
    site: 'Millwright Yard',
    region: 'Wabush',
    contact: 'Thomas Doyle',
  },
  {
    id: 'cust-tundra',
    name: 'Tundra Resources',
    site: 'East Pit',
    region: 'Schefferville Corridor',
    contact: 'Alicia Ward',
  },
  {
    id: 'cust-northern',
    name: 'Northern Aggregate',
    site: 'Harbour Quarry',
    region: 'Happy Valley-Goose Bay',
    contact: 'Graham Lee',
  },
];

// Legacy dashboard demo data. Keep isolated until the dashboard redesign.
export const courses = [
  {
    id: 'course-heights',
    code: 'SAFE-201',
    name: 'Working at Heights',
    category: 'Safety',
    renewalMonths: 24,
    owner: 'HSE',
  },
  {
    id: 'course-first-aid',
    code: 'SAFE-110',
    name: 'Standard First Aid',
    category: 'Safety',
    renewalMonths: 36,
    owner: 'HSE',
  },
  {
    id: 'course-lockout',
    code: 'SAFE-305',
    name: 'Lockout / Tagout',
    category: 'Safety',
    renewalMonths: 24,
    owner: 'HSE',
  },
  {
    id: 'course-loader',
    code: 'EQP-420',
    name: 'Loader Operation',
    category: 'Equipment',
    renewalMonths: 18,
    owner: 'Operations',
  },
  {
    id: 'course-confined',
    code: 'SAFE-260',
    name: 'Confined Space Entry',
    category: 'Safety',
    renewalMonths: 24,
    owner: 'HSE',
  },
  {
    id: 'course-winter',
    code: 'OPS-144',
    name: 'Winter Site Access',
    category: 'Site Access',
    renewalMonths: 12,
    owner: 'Operations',
  },
  {
    id: 'course-hydraulics',
    code: 'TECH-330',
    name: 'Hydraulic Systems Service',
    category: 'Technical',
    renewalMonths: 36,
    owner: 'Maintenance',
  },
];

export const trainingRequirements = [
  { employeeId: 'emp-001', customerId: 'cust-aurora', courseId: 'course-heights' },
  { employeeId: 'emp-001', customerId: 'cust-aurora', courseId: 'course-lockout' },
  { employeeId: 'emp-001', customerId: 'cust-aurora', courseId: 'course-winter' },
  { employeeId: 'emp-001', customerId: 'cust-boreal', courseId: 'course-first-aid' },
  { employeeId: 'emp-001', customerId: 'cust-boreal', courseId: 'course-hydraulics' },

  { employeeId: 'emp-002', customerId: 'cust-aurora', courseId: 'course-loader' },
  { employeeId: 'emp-002', customerId: 'cust-aurora', courseId: 'course-lockout' },
  { employeeId: 'emp-002', customerId: 'cust-tundra', courseId: 'course-winter' },
  { employeeId: 'emp-002', customerId: 'cust-tundra', courseId: 'course-first-aid' },

  { employeeId: 'emp-003', customerId: 'cust-aurora', courseId: 'course-heights' },
  { employeeId: 'emp-003', customerId: 'cust-aurora', courseId: 'course-confined' },
  { employeeId: 'emp-003', customerId: 'cust-boreal', courseId: 'course-lockout' },
  { employeeId: 'emp-003', customerId: 'cust-northern', courseId: 'course-first-aid' },

  { employeeId: 'emp-004', customerId: 'cust-boreal', courseId: 'course-lockout' },
  { employeeId: 'emp-004', customerId: 'cust-boreal', courseId: 'course-hydraulics' },
  { employeeId: 'emp-004', customerId: 'cust-northern', courseId: 'course-winter' },

  { employeeId: 'emp-005', customerId: 'cust-aurora', courseId: 'course-first-aid' },
  { employeeId: 'emp-005', customerId: 'cust-tundra', courseId: 'course-winter' },
  { employeeId: 'emp-005', customerId: 'cust-tundra', courseId: 'course-confined' },
  { employeeId: 'emp-005', customerId: 'cust-northern', courseId: 'course-heights' },

  { employeeId: 'emp-006', customerId: 'cust-boreal', courseId: 'course-hydraulics' },
  { employeeId: 'emp-006', customerId: 'cust-boreal', courseId: 'course-lockout' },
  { employeeId: 'emp-006', customerId: 'cust-aurora', courseId: 'course-loader' },

  { employeeId: 'emp-007', customerId: 'cust-aurora', courseId: 'course-heights' },
  { employeeId: 'emp-007', customerId: 'cust-aurora', courseId: 'course-first-aid' },
  { employeeId: 'emp-007', customerId: 'cust-tundra', courseId: 'course-confined' },
  { employeeId: 'emp-007', customerId: 'cust-northern', courseId: 'course-winter' },

  { employeeId: 'emp-008', customerId: 'cust-aurora', courseId: 'course-heights' },
  { employeeId: 'emp-008', customerId: 'cust-aurora', courseId: 'course-lockout' },
  { employeeId: 'emp-008', customerId: 'cust-northern', courseId: 'course-first-aid' },
];

export const courseCompletions = [
  {
    employeeId: 'emp-001',
    customerId: 'cust-aurora',
    courseId: 'course-heights',
    completedOn: '2025-02-18',
    expiresOn: '2027-02-18',
  },
  {
    employeeId: 'emp-001',
    customerId: 'cust-aurora',
    courseId: 'course-lockout',
    completedOn: '2024-07-01',
    expiresOn: '2026-07-01',
  },
  {
    employeeId: 'emp-001',
    customerId: 'cust-aurora',
    courseId: 'course-winter',
    completedOn: '2025-10-15',
    expiresOn: '2026-10-15',
  },
  {
    employeeId: 'emp-001',
    customerId: 'cust-boreal',
    courseId: 'course-first-aid',
    completedOn: '2024-08-12',
    expiresOn: '2027-08-12',
  },
  {
    employeeId: 'emp-001',
    customerId: 'cust-boreal',
    courseId: 'course-hydraulics',
    completedOn: '2023-05-30',
    expiresOn: '2026-05-30',
  },
  {
    employeeId: 'emp-002',
    customerId: 'cust-aurora',
    courseId: 'course-loader',
    completedOn: '2025-03-20',
    expiresOn: '2026-09-20',
  },
  {
    employeeId: 'emp-002',
    customerId: 'cust-aurora',
    courseId: 'course-lockout',
    completedOn: '2025-01-10',
    expiresOn: '2027-01-10',
  },
  {
    employeeId: 'emp-002',
    customerId: 'cust-tundra',
    courseId: 'course-winter',
    completedOn: '2025-05-01',
    expiresOn: '2026-05-01',
  },
  {
    employeeId: 'emp-003',
    customerId: 'cust-aurora',
    courseId: 'course-heights',
    completedOn: '2024-11-08',
    expiresOn: '2026-11-08',
  },
  {
    employeeId: 'emp-003',
    customerId: 'cust-aurora',
    courseId: 'course-confined',
    completedOn: '2025-04-02',
    expiresOn: '2027-04-02',
  },
  {
    employeeId: 'emp-003',
    customerId: 'cust-boreal',
    courseId: 'course-lockout',
    completedOn: '2025-09-18',
    expiresOn: '2027-09-18',
  },
  {
    employeeId: 'emp-003',
    customerId: 'cust-northern',
    courseId: 'course-first-aid',
    completedOn: '2023-09-06',
    expiresOn: '2026-09-06',
  },
  {
    employeeId: 'emp-004',
    customerId: 'cust-boreal',
    courseId: 'course-lockout',
    completedOn: '2024-05-25',
    expiresOn: '2026-05-25',
  },
  {
    employeeId: 'emp-004',
    customerId: 'cust-boreal',
    courseId: 'course-hydraulics',
    completedOn: '2025-02-14',
    expiresOn: '2028-02-14',
  },
  {
    employeeId: 'emp-005',
    customerId: 'cust-aurora',
    courseId: 'course-first-aid',
    completedOn: '2025-06-12',
    expiresOn: '2028-06-12',
  },
  {
    employeeId: 'emp-005',
    customerId: 'cust-tundra',
    courseId: 'course-winter',
    completedOn: '2025-11-02',
    expiresOn: '2026-11-02',
  },
  {
    employeeId: 'emp-005',
    customerId: 'cust-tundra',
    courseId: 'course-confined',
    completedOn: '2024-10-22',
    expiresOn: '2026-10-22',
  },
  {
    employeeId: 'emp-006',
    customerId: 'cust-boreal',
    courseId: 'course-hydraulics',
    completedOn: '2025-08-01',
    expiresOn: '2028-08-01',
  },
  {
    employeeId: 'emp-006',
    customerId: 'cust-boreal',
    courseId: 'course-lockout',
    completedOn: '2025-04-18',
    expiresOn: '2027-04-18',
  },
  {
    employeeId: 'emp-006',
    customerId: 'cust-aurora',
    courseId: 'course-loader',
    completedOn: '2024-12-05',
    expiresOn: '2026-06-18',
  },
  {
    employeeId: 'emp-007',
    customerId: 'cust-aurora',
    courseId: 'course-heights',
    completedOn: '2025-01-17',
    expiresOn: '2027-01-17',
  },
  {
    employeeId: 'emp-007',
    customerId: 'cust-aurora',
    courseId: 'course-first-aid',
    completedOn: '2024-06-20',
    expiresOn: '2027-06-20',
  },
  {
    employeeId: 'emp-007',
    customerId: 'cust-tundra',
    courseId: 'course-confined',
    completedOn: '2024-04-12',
    expiresOn: '2026-04-12',
  },
  {
    employeeId: 'emp-007',
    customerId: 'cust-northern',
    courseId: 'course-winter',
    completedOn: '2025-09-28',
    expiresOn: '2026-09-28',
  },
  {
    employeeId: 'emp-008',
    customerId: 'cust-aurora',
    courseId: 'course-heights',
    completedOn: '2025-03-03',
    expiresOn: '2027-03-03',
  },
];

// Training workspace model: each course belongs to exactly one customer/site.
export const customerCourses = [
  {
    id: 'aurora-orientation',
    customerId: 'cust-aurora',
    code: 'AUR-100',
    name: 'North Ridge Site Orientation',
    category: 'Site Access',
    renewalMonths: 12,
  },
  {
    id: 'aurora-lockout',
    customerId: 'cust-aurora',
    code: 'AUR-220',
    name: 'North Ridge Lockout / Tagout',
    category: 'Safety',
    renewalMonths: 24,
  },
  {
    id: 'aurora-winter',
    customerId: 'cust-aurora',
    code: 'AUR-310',
    name: 'North Ridge Winter Access',
    category: 'Site Access',
    renewalMonths: 12,
  },
  {
    id: 'boreal-orientation',
    customerId: 'cust-boreal',
    code: 'BOR-100',
    name: 'Millwright Yard Orientation',
    category: 'Site Access',
    renewalMonths: 12,
  },
  {
    id: 'boreal-lockout',
    customerId: 'cust-boreal',
    code: 'BOR-230',
    name: 'Millwright Yard Lockout / Tagout',
    category: 'Safety',
    renewalMonths: 24,
  },
  {
    id: 'boreal-hydraulics',
    customerId: 'cust-boreal',
    code: 'BOR-340',
    name: 'Boreal Hydraulic Service Safety',
    category: 'Technical',
    renewalMonths: 24,
  },
  {
    id: 'tundra-orientation',
    customerId: 'cust-tundra',
    code: 'TUN-100',
    name: 'East Pit Site Orientation',
    category: 'Site Access',
    renewalMonths: 12,
  },
  {
    id: 'tundra-confined',
    customerId: 'cust-tundra',
    code: 'TUN-250',
    name: 'East Pit Confined Space',
    category: 'Safety',
    renewalMonths: 24,
  },
  {
    id: 'tundra-winter',
    customerId: 'cust-tundra',
    code: 'TUN-315',
    name: 'East Pit Winter Travel',
    category: 'Site Access',
    renewalMonths: 12,
  },
  {
    id: 'northern-orientation',
    customerId: 'cust-northern',
    code: 'NOR-100',
    name: 'Harbour Quarry Orientation',
    category: 'Site Access',
    renewalMonths: 12,
  },
  {
    id: 'northern-first-aid',
    customerId: 'cust-northern',
    code: 'NOR-180',
    name: 'Harbour Quarry First Aid',
    category: 'Safety',
    renewalMonths: 36,
  },
  {
    id: 'northern-quarry',
    customerId: 'cust-northern',
    code: 'NOR-275',
    name: 'Harbour Quarry Hazard Awareness',
    category: 'Safety',
    renewalMonths: 24,
  },
];

export const customerCourseRequirements = customerCourses.map((course) => ({
  customerId: course.customerId,
  courseId: course.id,
}));

const trainingCompletionExceptions = {
  'emp-002:aurora-lockout': { completedOn: '2024-06-25', expiresOn: '2026-06-25' },
  'emp-003:aurora-orientation': { completedOn: '2025-04-20', expiresOn: '2026-04-20' },
  'emp-004:aurora-winter': null,
  'emp-006:aurora-lockout': null,
  'emp-007:aurora-orientation': { completedOn: '2025-06-18', expiresOn: '2026-06-18' },
  'emp-008:aurora-lockout': null,
  'emp-008:aurora-winter': null,

  'emp-001:boreal-hydraulics': { completedOn: '2024-05-30', expiresOn: '2026-05-30' },
  'emp-003:boreal-lockout': { completedOn: '2024-07-10', expiresOn: '2026-07-10' },
  'emp-004:boreal-orientation': null,
  'emp-005:boreal-hydraulics': null,
  'emp-007:boreal-orientation': { completedOn: '2025-06-30', expiresOn: '2026-06-30' },
  'emp-008:boreal-lockout': null,

  'emp-002:tundra-winter': { completedOn: '2025-05-01', expiresOn: '2026-05-01' },
  'emp-003:tundra-confined': null,
  'emp-004:tundra-orientation': { completedOn: '2025-06-22', expiresOn: '2026-06-22' },
  'emp-005:tundra-confined': { completedOn: '2024-10-22', expiresOn: '2026-10-22' },
  'emp-006:tundra-winter': null,
  'emp-008:tundra-orientation': null,

  'emp-001:northern-orientation': { completedOn: '2025-05-20', expiresOn: '2026-05-20' },
  'emp-002:northern-first-aid': null,
  'emp-003:northern-first-aid': { completedOn: '2023-09-06', expiresOn: '2026-09-06' },
  'emp-004:northern-quarry': { completedOn: '2024-06-28', expiresOn: '2026-06-28' },
  'emp-006:northern-orientation': null,
  'emp-007:northern-quarry': { completedOn: '2024-04-12', expiresOn: '2026-04-12' },
  'emp-008:northern-first-aid': null,
};

export const employeeCourseCompletions = employees.flatMap((employee) =>
  customerCourses.flatMap((course) => {
    const key = `${employee.id}:${course.id}`;
    const exception = trainingCompletionExceptions[key];

    if (exception === null) {
      return [];
    }

    return [
      {
        employeeId: employee.id,
        courseId: course.id,
        completedOn: exception?.completedOn || '2025-01-15',
        expiresOn: exception?.expiresOn || '2027-01-15',
      },
    ];
  }),
);

export const statusMeta = {
  noRequirements: {
    label: 'No Requirements',
    tone: 'neutral',
  },
  compliant: {
    label: 'Compliant',
    tone: 'success',
  },
  expiring: {
    label: 'Expiring Soon',
    tone: 'warning',
  },
  incomplete: {
    label: 'Incomplete',
    tone: 'neutral',
  },
  overdue: {
    label: 'Overdue',
    tone: 'danger',
  },
};

const statusRank = {
  noRequirements: -1,
  compliant: 0,
  expiring: 1,
  incomplete: 2,
  overdue: 3,
};

const expiryWarningDays = 45;

function toDate(dateString) {
  if (!dateString) return null;
  return new Date(`${dateString}T00:00:00`);
}

export function daysUntil(dateString) {
  const target = toDate(dateString);
  const today = toDate(referenceDate);

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

export function getCompletionForRequirement(requirement) {
  return courseCompletions.find(
    (completion) =>
      completion.employeeId === requirement.employeeId &&
      completion.customerId === requirement.customerId &&
      completion.courseId === requirement.courseId,
  );
}

export function getRequirementStatus(requirement) {
  const completion = getCompletionForRequirement(requirement);

  if (!completion) {
    return 'incomplete';
  }

  const remainingDays = daysUntil(completion.expiresOn);

  if (remainingDays < 0) {
    return 'overdue';
  }

  if (remainingDays <= expiryWarningDays) {
    return 'expiring';
  }

  return 'compliant';
}

export function getWorstStatus(statuses) {
  return statuses.reduce((worst, status) => {
    return statusRank[status] > statusRank[worst] ? status : worst;
  }, 'compliant');
}

export function getComplianceRows() {
  return trainingRequirements.map((requirement) => {
    const employee = employees.find((item) => item.id === requirement.employeeId);
    const customer = customers.find((item) => item.id === requirement.customerId);
    const course = courses.find((item) => item.id === requirement.courseId);
    const completion = getCompletionForRequirement(requirement);
    const status = getRequirementStatus(requirement);

    return {
      ...requirement,
      employee,
      customer,
      course,
      completion,
      status,
      daysUntilExpiry: completion ? daysUntil(completion.expiresOn) : null,
    };
  });
}

export function getEmployeeSiteSummaries(rows = getComplianceRows()) {
  const grouped = rows.reduce((groups, row) => {
    const key = `${row.employeeId}-${row.customerId}`;
    const existing = groups.get(key) || {
      id: key,
      employee: row.employee,
      customer: row.customer,
      courses: [],
    };

    existing.courses.push(row);
    groups.set(key, existing);

    return groups;
  }, new Map());

  return Array.from(grouped.values())
    .map((summary) => {
      const statuses = summary.courses.map((course) => course.status);
      const completedCount = summary.courses.filter((course) =>
        ['compliant', 'expiring'].includes(course.status),
      ).length;

      return {
        ...summary,
        requiredCount: summary.courses.length,
        completedCount,
        status: getWorstStatus(statuses),
      };
    })
    .sort((a, b) => {
      const statusDelta = statusRank[b.status] - statusRank[a.status];

      if (statusDelta !== 0) return statusDelta;

      return a.employee.name.localeCompare(b.employee.name);
    });
}

export function getCustomerEmployeeSummaries(customerId, rows = getComplianceRows()) {
  const customer = customers.find((item) => item.id === customerId);

  if (!customer) {
    return [];
  }

  return employees
    .map((employee) => {
      const coursesForEmployee = rows.filter(
        (row) => row.customerId === customerId && row.employeeId === employee.id,
      );

      if (!coursesForEmployee.length) {
        return {
          id: `${employee.id}-${customerId}`,
          employee,
          customer,
          courses: [],
          requiredCount: 0,
          completedCount: 0,
          status: 'noRequirements',
        };
      }

      const completedCount = coursesForEmployee.filter((course) =>
        ['compliant', 'expiring'].includes(course.status),
      ).length;

      return {
        id: `${employee.id}-${customerId}`,
        employee,
        customer,
        courses: coursesForEmployee,
        requiredCount: coursesForEmployee.length,
        completedCount,
        status: getWorstStatus(coursesForEmployee.map((course) => course.status)),
      };
    })
    .sort((a, b) => {
      const statusDelta = statusRank[b.status] - statusRank[a.status];

      if (statusDelta !== 0) return statusDelta;

      return a.employee.name.localeCompare(b.employee.name);
    });
}

export function getEmployeeCourseCompletion(employeeId, courseId) {
  return employeeCourseCompletions.find(
    (completion) => completion.employeeId === employeeId && completion.courseId === courseId,
  );
}

export function getCustomerTrainingRows(customerId) {
  const customer = customers.find((item) => item.id === customerId);
  const requirements = customerCourseRequirements.filter(
    (requirement) => requirement.customerId === customerId,
  );

  if (!customer) {
    return [];
  }

  return employees.flatMap((employee) =>
    requirements.map((requirement) => {
      const course = customerCourses.find((item) => item.id === requirement.courseId);
      const completion = getEmployeeCourseCompletion(employee.id, requirement.courseId);
      const remainingDays = completion ? daysUntil(completion.expiresOn) : null;

      let status = 'compliant';

      if (!completion) {
        status = 'incomplete';
      } else if (remainingDays < 0) {
        status = 'overdue';
      } else if (remainingDays <= expiryWarningDays) {
        status = 'expiring';
      }

      return {
        employeeId: employee.id,
        customerId,
        courseId: requirement.courseId,
        employee,
        customer,
        course,
        completion,
        status,
        daysUntilExpiry: remainingDays,
      };
    }),
  );
}

export function getCustomerEligibilitySummaries(
  customerId,
  rows = getCustomerTrainingRows(customerId),
) {
  const customer = customers.find((item) => item.id === customerId);

  if (!customer) {
    return [];
  }

  return employees
    .map((employee) => {
      const coursesForEmployee = rows.filter((row) => row.employeeId === employee.id);

      if (!coursesForEmployee.length) {
        return {
          id: `${employee.id}-${customerId}`,
          employee,
          customer,
          courses: [],
          requiredCount: 0,
          completedCount: 0,
          expiringCount: 0,
          status: 'noRequirements',
          eligible: false,
        };
      }

      const statuses = coursesForEmployee.map((course) => course.status);
      const completedCount = coursesForEmployee.filter((course) =>
        ['compliant', 'expiring'].includes(course.status),
      ).length;

      return {
        id: `${employee.id}-${customerId}`,
        employee,
        customer,
        courses: coursesForEmployee,
        requiredCount: coursesForEmployee.length,
        completedCount,
        expiringCount: coursesForEmployee.filter((course) => course.status === 'expiring').length,
        status: getWorstStatus(statuses),
        eligible: statuses.every((status) => ['compliant', 'expiring'].includes(status)),
      };
    })
    .sort((a, b) => {
      const eligibilityDelta = Number(a.eligible) - Number(b.eligible);

      if (eligibilityDelta !== 0) return eligibilityDelta;

      const statusDelta = statusRank[b.status] - statusRank[a.status];

      if (statusDelta !== 0) return statusDelta;

      return a.employee.name.localeCompare(b.employee.name);
    });
}
