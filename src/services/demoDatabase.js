import { createDemoSeed } from '@/data/demoSeed';

export const DEMO_STORAGE_KEY = 'nme-demo-database-v1';
const collections = [
  'employees', 'sites', 'courses', 'medicals', 'siteCourseRequirements',
  'siteMedicalRequirements', 'completions', 'medicalCompletions',
  'pendingCompletions', 'medicalPendingCompletions',
];

export class DemoDataError extends Error {
  constructor(message, code = 'VALIDATION_ERROR', fieldErrors = {}) {
    super(message);
    this.name = 'DemoDataError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function invalidField(field, message, code = 'VALIDATION_ERROR') {
  throw new DemoDataError(message, code, { [field]: [message] });
}

export function requireText(value, field, max = 180, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    invalidField(field, `Enter ${min} to ${max} characters for ${field}.`);
  }
  return value.trim();
}

export function requireDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    invalidField(field, `Enter a valid date for ${field}.`);
  }
  return value;
}

export function requireMonths(value, field = 'validityMonths') {
  if (!Number.isInteger(value) || value < 1 || value > 120) {
    invalidField(field, 'Validity must be a whole number from 1 to 120 months.');
  }
  return value;
}

export function requireEmail(value) {
  const email = requireText(value, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalidField('email', 'Enter a valid email address.');
  return email;
}

export function requireTimeZone(value) {
  const timeZone = requireText(value, 'timeZone', 80);
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); }
  catch { invalidField('timeZone', 'Enter a valid IANA time zone.'); }
  return timeZone;
}

export function optionalComment(value) {
  return value == null || value === '' ? null : requireText(value, 'comment', 500, 0) || null;
}

function optionalTimestamp(value, field) {
  if (value == null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) invalidField(field, `Invalid ${field} timestamp.`);
  return value;
}

function metadata(row) {
  return {
    archivedAt: optionalTimestamp(row.archivedAt, 'archivedAt'),
    createdAt: optionalTimestamp(row.createdAt, 'createdAt') || new Date().toISOString(),
    updatedAt: optionalTimestamp(row.updatedAt, 'updatedAt') || new Date().toISOString(),
  };
}

/** Validate a full snapshot before changing storage; malformed imports never partially apply. */
export function validateDemoDatabase(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1) {
    throw new DemoDataError('Use a version 1 demo database JSON export.', 'INVALID_IMPORT');
  }
  const database = { version: 1, seededOn: requireDate(input.seededOn, 'seededOn') };
  for (const key of collections) {
    if (!Array.isArray(input[key])) throw new DemoDataError(`The database needs a ${key} array.`, 'INVALID_IMPORT');
    const ids = new Set();
    database[key] = input[key].map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new DemoDataError(`Invalid ${key} record.`, 'INVALID_IMPORT');
      if (key.endsWith('Requirements')) return { ...row };
      const id = requireText(row.id, 'id', 255);
      if (ids.has(id)) throw new DemoDataError(`Duplicate ID in ${key}: ${id}.`, 'INVALID_IMPORT');
      ids.add(id);
      return { ...row, id };
    });
  }
  const emails = new Set();
  database.employees = database.employees.map((row) => {
    const email = requireEmail(row.email);
    if (emails.has(email)) throw new DemoDataError(`Duplicate employee email: ${email}.`, 'INVALID_IMPORT');
    emails.add(email);
    return { id: row.id, displayName: requireText(row.displayName, 'displayName', 160), email, ...metadata(row) };
  });
  database.sites = database.sites.map((row) => ({
    id: row.id, name: requireText(row.name, 'name', 160), timeZone: requireTimeZone(row.timeZone), ...metadata(row),
  }));
  for (const key of ['courses', 'medicals']) {
    database[key] = database[key].map((row) => ({
      id: row.id, name: requireText(row.name, 'name'), validityMonths: requireMonths(row.validityMonths), ...metadata(row),
    }));
  }
  const indexes = Object.fromEntries(collections.map((key) => [key, new Map(database[key].map((row) => [row.id, row]))]));
  const reference = (key, id, field) => {
    if (!indexes[key].has(id)) invalidField(field, `Unknown ${field}: ${String(id)}.`, 'INVALID_IMPORT');
    return id;
  };
  for (const [items, itemKey, requirements, completions, pending] of [
    ['courses', 'courseId', 'siteCourseRequirements', 'completions', 'pendingCompletions'],
    ['medicals', 'medicalId', 'siteMedicalRequirements', 'medicalCompletions', 'medicalPendingCompletions'],
  ]) {
    const assignments = new Set();
    database[requirements] = database[requirements].map((row) => {
      const siteId = reference('sites', row.siteId, 'siteId');
      const itemId = reference(items, row[itemKey], itemKey);
      const pair = `${siteId}:${itemId}`;
      if (assignments.has(pair)) throw new DemoDataError('Duplicate site requirement.', 'INVALID_IMPORT');
      assignments.add(pair);
      return { siteId, [itemKey]: itemId };
    });
    const completionKeys = new Set();
    const correctionSources = new Set();
    database[completions] = database[completions].map((row) => {
      const completedOn = requireDate(row.completedOn, 'completedOn');
      const expiresOn = requireDate(row.expiresOn, 'expiresOn');
      if (expiresOn < completedOn) invalidField('expiresOn', 'Expiry date must be on or after the completion date.');
      const employeeId = reference('employees', row.employeeId, 'employeeId');
      const itemId = reference(items, row[itemKey], itemKey);
      const voidedAt = optionalTimestamp(row.voidedAt, 'voidedAt');
      const key = `${employeeId}:${itemId}:${completedOn}`;
      if (!voidedAt && completionKeys.has(key)) throw new DemoDataError('Duplicate active completion for the same employee, requirement, and date.', 'INVALID_IMPORT');
      if (!voidedAt) completionKeys.add(key);
      if (row.correctsCompletionId != null) {
        reference(completions, row.correctsCompletionId, 'correctsCompletionId');
        const source = indexes[completions].get(row.correctsCompletionId);
        if (source.id === row.id || !source.voidedAt || source.employeeId !== employeeId
          || source[itemKey] !== itemId || correctionSources.has(source.id)) {
          throw new DemoDataError('Invalid completion correction relationship.', 'INVALID_IMPORT');
        }
        correctionSources.add(source.id);
      }
      return {
        id: row.id, employeeId, [itemKey]: itemId, completedOn, expiresOn,
        validityMonthsApplied: row.validityMonthsApplied == null ? null : requireMonths(row.validityMonthsApplied),
        expiryManuallySet: row.expiryManuallySet === true,
        comment: optionalComment(row.comment),
        recordedAt: optionalTimestamp(row.recordedAt, 'recordedAt') || new Date().toISOString(),
        recordedBySubject: typeof row.recordedBySubject === 'string' ? row.recordedBySubject : 'demo',
        correctsCompletionId: row.correctsCompletionId || null,
        voidedAt, voidedBySubject: voidedAt ? 'demo' : null,
        voidReason: voidedAt ? requireText(row.voidReason, 'voidReason', 500, 3) : null,
      };
    });
    const pendingKeys = new Set();
    const finalizedIds = new Set();
    database[pending] = database[pending].map((row) => {
      const employeeId = reference('employees', row.employeeId, 'employeeId');
      const itemId = reference(items, row[itemKey], itemKey);
      if (!['pending', 'finalized', 'cancelled'].includes(row.status)) invalidField('status', 'Invalid pending completion status.');
      const key = `${employeeId}:${itemId}`;
      if (row.status === 'pending' && pendingKeys.has(key)) throw new DemoDataError('Duplicate pending completion.', 'INVALID_IMPORT');
      if (row.status === 'pending') pendingKeys.add(key);
      if (row.status === 'finalized') {
        reference(completions, row.completionId, 'completionId');
        const linked = indexes[completions].get(row.completionId);
        if (linked.employeeId !== employeeId || linked[itemKey] !== itemId || finalizedIds.has(linked.id)) {
          throw new DemoDataError('Invalid finalized completion relationship.', 'INVALID_IMPORT');
        }
        finalizedIds.add(linked.id);
      }
      const resolvedAt = optionalTimestamp(row.resolvedAt, 'resolvedAt');
      if (row.status !== 'pending' && !resolvedAt) invalidField('resolvedAt', 'Resolved completions need a resolution timestamp.');
      return {
        id: row.id, employeeId, [itemKey]: itemId,
        validityMonthsSnapshot: requireMonths(row.validityMonthsSnapshot),
        comment: optionalComment(row.comment), createdBySubject: 'demo',
        createdAt: optionalTimestamp(row.createdAt, 'createdAt') || new Date().toISOString(),
        status: row.status,
        resolvedAt: row.status === 'pending' ? null : resolvedAt,
        resolvedBySubject: row.status === 'pending' ? null : 'demo',
        cancellationReason: row.status === 'cancelled' ? requireText(row.cancellationReason, 'cancellationReason', 500, 3) : null,
        completionId: row.status === 'finalized' ? row.completionId : null,
      };
    });
  }
  return database;
}

function storage() {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch { /* Surface the same actionable error for disabled browser storage. */ }
  throw new DemoDataError('Browser storage is unavailable. Allow local storage to save demo data.', 'STORAGE_UNAVAILABLE');
}

function persist(database) {
  try { storage().setItem(DEMO_STORAGE_KEY, JSON.stringify(database)); }
  catch (error) {
    if (error instanceof DemoDataError) throw error;
    throw new DemoDataError('Demo data could not be saved. Browser storage may be full or disabled.', 'STORAGE_UNAVAILABLE');
  }
}

export function readDemoDatabase() {
  let value;
  try { value = storage().getItem(DEMO_STORAGE_KEY); }
  catch (error) {
    if (error instanceof DemoDataError) throw error;
    throw new DemoDataError('Browser storage is unavailable. Allow local storage to use demo data.', 'STORAGE_UNAVAILABLE');
  }
  if (value == null) {
    const database = validateDemoDatabase(createDemoSeed());
    persist(database);
    return database;
  }
  try { return validateDemoDatabase(JSON.parse(value)); }
  catch {
    throw new DemoDataError("Saved demo data is invalid. Clear this site's browser storage to restore the sample records.", 'INVALID_STORED_DATA');
  }
}

/** All operations finish synchronously so a mutation is saved as one complete snapshot. */
export function mutateDemoDatabase(change) {
  const database = readDemoDatabase();
  const result = change(database);
  persist(database);
  return result;
}

function summary(database) {
  return { version: database.version, seededOn: database.seededOn,
    ...Object.fromEntries(collections.map((key) => [key, database[key].length])) };
}

export function getDemoDatabaseSummary() { return summary(readDemoDatabase()); }
export function exportDemoDatabase() { return JSON.stringify(readDemoDatabase(), null, 2); }
export function importDemoDatabase(json) {
  let input = json;
  if (typeof json === 'string') {
    if (json.length > 5 * 1024 * 1024) throw new DemoDataError('Choose a demo database JSON file smaller than 5 MB.', 'INVALID_IMPORT');
    try { input = JSON.parse(json); }
    catch { throw new DemoDataError('The file is not valid JSON.', 'INVALID_IMPORT'); }
  }
  const database = validateDemoDatabase(input);
  persist(database);
  return summary(database);
}
export function resetDemoDatabase() {
  const database = validateDemoDatabase(createDemoSeed());
  persist(database);
  return summary(database);
}
