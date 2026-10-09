import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminRepository } from './adminRepository';
import { trainingRepository } from './trainingRepository';
import { medicalRepository } from './medicalRepository';
import {
  DEMO_STORAGE_KEY, exportDemoDatabase, importDemoDatabase, readDemoDatabase, resetDemoDatabase,
} from './demoDatabase';

describe('persistent demo records', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T16:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('seeds training and medical records and saves changes between reads', async () => {
    const seed = readDemoDatabase();
    expect(seed.employees).toHaveLength(8);
    expect(seed.medicalCompletions.length).toBeGreaterThan(0);
    const employee = await adminRepository.createEmployee({ displayName: 'Demo Employee', email: 'demo@example.com' });
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)).employees).toContainEqual(expect.objectContaining({ id: employee.id }));
    expect((await adminRepository.getEmployee(employee.id)).displayName).toBe('Demo Employee');
    await adminRepository.updateEmployee(employee.id, { displayName: 'Updated Demo', email: 'updated@example.com' });
    expect((await adminRepository.getEmployee(employee.id)).email).toBe('updated@example.com');
  });

  it('rejects duplicate email edits without overwriting saved records', async () => {
    const [first, second] = readDemoDatabase().employees;
    const before = exportDemoDatabase();
    await expect(adminRepository.updateEmployee(first.id, { email: second.email })).rejects.toMatchObject({ code: 'EMPLOYEE_EMAIL_EXISTS' });
    expect(exportDemoDatabase()).toBe(before);
  });

  it('calculates combined readiness from the saved course and medical requirements', async () => {
    const employee = await adminRepository.createEmployee({ displayName: 'New Demo', email: 'new@example.com' });
    const site = await adminRepository.createSite({ name: 'Demo Site', timeZone: 'America/Toronto' });
    const course = await adminRepository.createCourse({ name: 'Demo Training', validityMonths: 12, siteIds: [site.id] });
    const medical = await adminRepository.createMedical({ name: 'Demo Medical', validityMonths: 12, siteIds: [site.id] });
    await adminRepository.createCompletion({ employeeId: employee.id, courseId: course.id, completedOn: '2026-10-08' });
    let summary = (await trainingRepository.getSiteReadiness(site.id)).find((row) => row.employee.id === employee.id);
    expect(summary.status).toBe('compliant');
    expect(summary.combinedAccess).toMatchObject({ eligible: false, blockingDomains: ['medical'] });
    await adminRepository.createMedicalCompletion({ employeeId: employee.id, medicalId: medical.id, completedOn: '2026-10-08' });
    summary = (await medicalRepository.getSiteReadiness(site.id)).find((row) => row.employee.id === employee.id);
    expect(summary.combinedAccess).toMatchObject({ eligible: true, requiredCount: 2, completedCount: 2 });
  });

  it('keeps pending records separate and applies the saved renewal period when finalized', async () => {
    const employee = readDemoDatabase().employees[0];
    const course = await adminRepository.createCourse({ name: 'Pending Training', validityMonths: 12, siteIds: [] });
    const pending = await adminRepository.createPendingCompletion({ employeeId: employee.id, courseId: course.id });
    await adminRepository.updateCourse(course.id, { name: course.name, validityMonths: 24, siteIds: [] });
    const finalized = await adminRepository.finalizePendingCompletion(pending.id, '2026-01-31');
    expect(finalized.completion).toMatchObject({ completedOn: '2026-01-31', expiresOn: '2027-01-31', validityMonthsApplied: 12 });
    expect((await adminRepository.listPendingCompletions()).items.map((row) => row.id)).not.toContain(pending.id);
    await expect(adminRepository.finalizePendingCompletion(pending.id, '2026-02-01')).rejects.toMatchObject({ code: 'PENDING_COMPLETION_ALREADY_RESOLVED' });
  });

  it('corrects dates with linked history and preserves that history through import', async () => {
    const seed = readDemoDatabase();
    const original = seed.medicalCompletions[0];
    const replacement = await adminRepository.correctMedicalCompletionDates(original.id, {
      completedOn: '2026-09-01', expiresOn: '2027-09-01', reason: 'Corrected mock certificate date',
    });
    expect(replacement.correctsCompletionId).toBe(original.id);
    expect((await adminRepository.getMedicalCompletion(original.id)).voidReason).toBe('Corrected mock certificate date');
    const snapshot = exportDemoDatabase();
    resetDemoDatabase();
    importDemoDatabase(snapshot);
    expect((await adminRepository.getMedicalCompletion(replacement.id)).correctsCompletionId).toBe(original.id);
  });

  it('preserves the database when an import has invalid relationships or dates', () => {
    const before = exportDemoDatabase();
    const invalidReference = JSON.parse(before);
    invalidReference.siteMedicalRequirements[0].medicalId = 'missing';
    expect(() => importDemoDatabase(invalidReference)).toThrow('Unknown medicalId');
    const invalidDate = JSON.parse(before);
    invalidDate.completions[0].completedOn = '2026-02-30';
    expect(() => importDemoDatabase(invalidDate)).toThrow('Enter a valid date');
    expect(() => importDemoDatabase('{invalid JSON')).toThrow('not valid JSON');
    expect(exportDemoDatabase()).toBe(before);
  });

  it('archives employees without losing their completion history', async () => {
    const employee = readDemoDatabase().employees[0];
    await adminRepository.setEmployeeArchived(employee.id, true);
    expect((await trainingRepository.listEmployees()).map((row) => row.id)).not.toContain(employee.id);
    expect((await adminRepository.getEmployee(employee.id)).completions.length).toBeGreaterThan(0);
    await adminRepository.setEmployeeArchived(employee.id, false);
    expect((await trainingRepository.listEmployees()).map((row) => row.id)).toContain(employee.id);
  });
});
