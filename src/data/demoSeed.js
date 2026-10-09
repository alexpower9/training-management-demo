import sample from './trainingDemoData.json' with { type: 'json' };
import { addCalendarMonths, todayDate } from '@/utils/dates';

function shiftDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Synthetic examples are anchored to the day this browser first opens the demo. */
export function createDemoSeed(asOf = todayDate()) {
  const timestamp = `${asOf}T12:00:00.000Z`;
  const metadata = { archivedAt: null, createdAt: timestamp, updatedAt: timestamp };
  const employees = sample.employees.map(({ name, ...employee }) => ({
    ...employee, displayName: name, ...metadata,
  }));
  const sites = sample.sites.map((site) => ({ ...site, ...metadata }));
  const courses = sample.courses.map((course) => ({ ...course, ...metadata }));
  const medicals = [
    { id: 'medical-fitness', name: 'Occupational Fitness Assessment', validityMonths: 12 },
    { id: 'medical-hearing', name: 'Hearing Assessment', validityMonths: 24 },
    { id: 'medical-respiratory', name: 'Respiratory Assessment', validityMonths: 12 },
  ].map((medical) => ({ ...medical, ...metadata }));

  function completion(employee, item, key, expiresOn) {
    return {
      id: `demo-${key}-${employee.id}-${item.id}`,
      employeeId: employee.id,
      [key]: item.id,
      completedOn: addCalendarMonths(expiresOn, -item.validityMonths),
      expiresOn,
      validityMonthsApplied: item.validityMonths,
      expiryManuallySet: false,
      comment: 'Synthetic demo record.',
      recordedBySubject: 'demo',
      recordedAt: timestamp,
      correctsCompletionId: null,
      voidedAt: null,
      voidedBySubject: null,
      voidReason: null,
    };
  }

  const completions = employees.flatMap((employee) => courses.flatMap((course) => {
    const exception = sample.completionExceptions[`${employee.id}:${course.id}`];
    if (exception === null) return [];
    const offset = exception
      ? Math.round((Date.parse(exception.expiresOn) - Date.parse(sample.referenceDate)) / 86400000)
      : 180;
    return [completion(employee, course, 'courseId', shiftDays(asOf, offset))];
  }));

  const medicalCompletions = employees.flatMap((employee, employeeIndex) =>
    medicals.flatMap((medical, medicalIndex) => {
      if ((employeeIndex === 3 || employeeIndex === 7) && medicalIndex === 0) return [];
      const offset = employeeIndex === 2 && medicalIndex === 0 ? -20
        : employeeIndex === 1 && medicalIndex === 1 ? 21 : 180;
      return [completion(employee, medical, 'medicalId', shiftDays(asOf, offset))];
    }),
  );

  function pending(employee, item, key) {
    return {
      id: `demo-pending-${key}-${employee.id}`,
      employeeId: employee.id,
      [key]: item.id,
      validityMonthsSnapshot: item.validityMonths,
      comment: 'Awaiting confirmation of the date. Synthetic demo record.',
      createdBySubject: 'demo',
      createdAt: timestamp,
      status: 'pending',
      resolvedAt: null,
      resolvedBySubject: null,
      cancellationReason: null,
      completionId: null,
    };
  }

  return {
    version: 1,
    seededOn: asOf,
    employees,
    sites,
    courses,
    medicals,
    siteCourseRequirements: sample.siteCourseRequirements.map((row) => ({ ...row })),
    siteMedicalRequirements: sites.flatMap((site, index) =>
      medicals.filter((_, medicalIndex) => medicalIndex === 0 || medicalIndex === (index % 2) + 1)
        .map((medical) => ({ siteId: site.id, medicalId: medical.id })),
    ),
    completions,
    medicalCompletions,
    pendingCompletions: [pending(employees[3], courses[2], 'courseId')],
    medicalPendingCompletions: [pending(employees[3], medicals[0], 'medicalId')],
  };
}
