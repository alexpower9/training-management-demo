import {
  DemoDataError, invalidField, mutateDemoDatabase, optionalComment, readDemoDatabase,
  requireDate, requireEmail, requireMonths, requireText, requireTimeZone,
} from './demoDatabase';
import { addCalendarMonths } from '@/utils/dates';

const now = () => new Date().toISOString();
const newId = () => globalThis.crypto.randomUUID();
const byName = (a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name);
const newestFirst = (a, b) => b.completedOn.localeCompare(a.completedOn) || b.recordedAt.localeCompare(a.recordedAt);
const enabled = (value) => value === true || value === 'true';
const training = { items: 'courses', item: 'course', key: 'courseId', requirements: 'siteCourseRequirements', completions: 'completions', pending: 'pendingCompletions' };
const medical = { items: 'medicals', item: 'medical', key: 'medicalId', requirements: 'siteMedicalRequirements', completions: 'medicalCompletions', pending: 'medicalPendingCompletions' };

function find(database, collection, id, activeOnly = false) {
  const row = database[collection].find((item) => item.id === id && (!activeOnly || !item.archivedAt));
  if (!row) throw new DemoDataError('The requested record was not found.', 'RECORD_NOT_FOUND');
  return row;
}

function paginate(items, options = {}) {
  const page = Math.max(1, Math.trunc(Number(options.page)) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(options.pageSize)) || 25));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
}

function matches(row, search, fields) {
  const needle = String(search || '').trim().toLowerCase();
  return !needle || fields.some((field) => String(field(row) || '').toLowerCase().includes(needle));
}

const publicEmployee = (row) => ({ ...row, name: row.displayName, active: !row.archivedAt });

function publicCompletion(database, row, domain) {
  return { ...row, employee: publicEmployee(find(database, 'employees', row.employeeId)),
    [domain.item]: { ...find(database, domain.items, row[domain.key]) } };
}

function publicPending(database, row, domain) {
  return { ...row, employee: publicEmployee(find(database, 'employees', row.employeeId)),
    [domain.item]: { ...find(database, domain.items, row[domain.key]) },
    completion: row.completionId ? { ...find(database, domain.completions, row.completionId) } : null };
}

function catalogRecord(database, row, domain, detail = false) {
  return { ...row,
    requirements: database[domain.requirements].filter((item) => item[domain.key] === row.id)
      .map((item) => ({ ...item, site: { ...find(database, 'sites', item.siteId) } }))
      .sort((a, b) => byName(a.site, b.site)),
    ...(detail ? { completions: database[domain.completions]
      .filter((item) => item[domain.key] === row.id && !item.voidedAt)
      .sort(newestFirst).map((item) => publicCompletion(database, item, domain)) } : {}),
  };
}

function siteRecord(database, row) {
  const requirements = database.siteCourseRequirements.filter((item) => item.siteId === row.id)
    .map((item) => ({ ...item, course: find(database, 'courses', item.courseId) }))
    .filter((item) => !item.course.archivedAt).sort((a, b) => byName(a.course, b.course));
  const medicalRequirements = database.siteMedicalRequirements.filter((item) => item.siteId === row.id)
    .map((item) => ({ ...item, medical: find(database, 'medicals', item.medicalId) }))
    .filter((item) => !item.medical.archivedAt).sort((a, b) => byName(a.medical, b.medical));
  return { ...row, requirements, medicalRequirements,
    _count: { requirements: requirements.length, medicalRequirements: medicalRequirements.length } };
}

function employeeRecord(database, row, detail = false) {
  const completions = database.completions.filter((item) => item.employeeId === row.id).sort(newestFirst);
  const medicalCompletions = database.medicalCompletions.filter((item) => item.employeeId === row.id).sort(newestFirst);
  const latest = (items, domain) => items.find((item) => !item.voidedAt && !find(database, domain.items, item[domain.key]).archivedAt)?.completedOn || null;
  return { ...publicEmployee(row), latestCompletionOn: latest(completions, training),
    latestMedicalCompletionOn: latest(medicalCompletions, medical),
    ...(detail ? {
      completions: completions.map((item) => publicCompletion(database, item, training)),
      medicalCompletions: medicalCompletions.map((item) => publicCompletion(database, item, medical)),
      pendingCompletions: database.pendingCompletions.filter((item) => item.employeeId === row.id && item.status === 'pending').map((item) => publicPending(database, item, training)),
      pendingMedicalCompletions: database.medicalPendingCompletions.filter((item) => item.employeeId === row.id && item.status === 'pending').map((item) => publicPending(database, item, medical)),
    } : {}),
  };
}

function newRecord(body) {
  const timestamp = now();
  return { id: newId(), ...body, archivedAt: null, createdAt: timestamp, updatedAt: timestamp };
}

async function setArchived(collection, id, archived) {
  return mutateDemoDatabase((database) => {
    const row = find(database, collection, id);
    row.archivedAt = archived ? now() : null;
    row.updatedAt = now();
    return { ...row };
  });
}

function employeeInput(database, body, existing = {}) {
  const displayName = requireText(body.displayName ?? existing.displayName, 'displayName', 160);
  const email = requireEmail(body.email ?? existing.email);
  if (database.employees.some((row) => row.id !== existing.id && row.email === email)) {
    invalidField('email', 'An employee already uses that email address.', 'EMPLOYEE_EMAIL_EXISTS');
  }
  return { displayName, email };
}

function catalogInput(database, body, domain, existing) {
  const name = requireText(body.name, 'name');
  const validityMonths = requireMonths(body.validityMonths);
  if (!Array.isArray(body.siteIds) || new Set(body.siteIds).size !== body.siteIds.length) {
    invalidField('siteIds', 'Select each site only once.');
  }
  const previous = new Set(database[domain.requirements].filter((row) => row[domain.key] === existing?.id).map((row) => row.siteId));
  for (const siteId of body.siteIds) {
    const site = database.sites.find((row) => row.id === siteId);
    if (!site || (site.archivedAt && !previous.has(siteId))) {
      invalidField('siteIds', 'Select valid, active sites. Existing archived assignments may be retained.');
    }
  }
  return { name, validityMonths };
}

async function saveCatalog(domain, id, body) {
  return mutateDemoDatabase((database) => {
    const existing = id ? find(database, domain.items, id) : null;
    const input = catalogInput(database, body, domain, existing);
    const row = existing || newRecord(input);
    if (existing) Object.assign(row, input, { updatedAt: now() });
    else database[domain.items].push(row);
    database[domain.requirements] = database[domain.requirements].filter((item) => item[domain.key] !== row.id);
    database[domain.requirements].push(...body.siteIds.map((siteId) => ({ siteId, [domain.key]: row.id })));
    return catalogRecord(database, row, domain);
  });
}

async function listCatalog(domain, options = {}) {
  const database = readDemoDatabase();
  return paginate(database[domain.items].filter((row) => (enabled(options.includeArchived) || !row.archivedAt)
    && matches(row, options.search, [(item) => item.name]))
    .sort(byName).map((row) => catalogRecord(database, row, domain)), options);
}

async function listRecords(domain, options = {}, pending = false) {
  const database = readDemoDatabase();
  const filters = options.filters || {};
  const rows = database[pending ? domain.pending : domain.completions]
    .filter((row) => (!filters.employeeId || row.employeeId === filters.employeeId)
      && (!filters[domain.key] || row[domain.key] === filters[domain.key])
      && (pending ? enabled(filters.includeResolved) || row.status === 'pending'
        : enabled(filters.includeVoided) || !row.voidedAt))
    .map((row) => pending ? publicPending(database, row, domain) : publicCompletion(database, row, domain))
    .filter((row) => matches(row, options.search, [(item) => item.employee.displayName, (item) => item[domain.item].name]))
    .sort(pending ? (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id) : newestFirst);
  return paginate(rows, options);
}

function ensureUniqueCompletion(database, domain, employeeId, itemId, completedOn, excludedId) {
  if (database[domain.completions].some((row) => row.id !== excludedId && row.employeeId === employeeId
    && row[domain.key] === itemId && row.completedOn === completedOn && !row.voidedAt)) {
    invalidField('completedOn', 'A completion already exists for this employee, requirement, and date.',
      domain === medical ? 'MEDICAL_COMPLETION_EXISTS' : 'COMPLETION_EXISTS');
  }
}

function appendCompletion(database, domain, body, validityMonths, options = {}) {
  const completedOn = requireDate(body.completedOn, 'completedOn');
  ensureUniqueCompletion(database, domain, body.employeeId, body[domain.key], completedOn, options.excludedId);
  const row = {
    id: newId(), employeeId: body.employeeId, [domain.key]: body[domain.key], completedOn,
    expiresOn: options.expiresOn || addCalendarMonths(completedOn, validityMonths),
    validityMonthsApplied: validityMonths, expiryManuallySet: Boolean(options.expiresOn),
    comment: optionalComment(body.comment), recordedAt: now(), recordedBySubject: 'demo',
    correctsCompletionId: options.correctsCompletionId || null,
    voidedAt: null, voidedBySubject: null, voidReason: null,
  };
  database[domain.completions].push(row);
  return row;
}

async function createCompletion(domain, body) {
  return mutateDemoDatabase((database) => {
    find(database, 'employees', body.employeeId, true);
    const item = find(database, domain.items, body[domain.key], true);
    return publicCompletion(database, appendCompletion(database, domain, body, item.validityMonths), domain);
  });
}

async function voidCompletion(domain, id, reason) {
  return mutateDemoDatabase((database) => {
    const row = find(database, domain.completions, id);
    if (row.voidedAt) throw new DemoDataError('The completion is already voided.', 'COMPLETION_ALREADY_VOIDED');
    row.voidReason = requireText(reason, 'reason', 500, 3);
    row.voidedAt = now(); row.voidedBySubject = 'demo';
    return publicCompletion(database, row, domain);
  });
}

async function correctDates(domain, id, body) {
  return mutateDemoDatabase((database) => {
    const source = find(database, domain.completions, id);
    if (source.voidedAt) throw new DemoDataError('The completion is already voided.', 'COMPLETION_ALREADY_VOIDED');
    const completedOn = requireDate(body.completedOn, 'completedOn');
    const expiresOn = requireDate(body.expiresOn, 'expiresOn');
    const reason = requireText(body.reason, 'reason', 500, 3);
    if (expiresOn < completedOn) invalidField('expiresOn', 'Expiry date must be on or after the completion date.');
    if (completedOn === source.completedOn && expiresOn === source.expiresOn) {
      throw new DemoDataError('At least one completion date must change.', 'COMPLETION_DATES_UNCHANGED', {
        completedOn: ['Enter a different completion or expiry date.'],
        expiresOn: ['Enter a different completion or expiry date.'],
      });
    }
    const row = appendCompletion(database, domain, { ...source, completedOn }, source.validityMonthsApplied,
      { expiresOn, correctsCompletionId: id, excludedId: id });
    Object.assign(source, { voidedAt: now(), voidedBySubject: 'demo', voidReason: reason });
    return publicCompletion(database, row, domain);
  });
}

async function createPending(domain, body) {
  return mutateDemoDatabase((database) => {
    find(database, 'employees', body.employeeId, true);
    const item = find(database, domain.items, body[domain.key], true);
    if (database[domain.pending].some((row) => row.employeeId === body.employeeId
      && row[domain.key] === item.id && row.status === 'pending')) {
      invalidField(domain.key, 'Add a date to or cancel the existing pending completion first.',
        domain === medical ? 'MEDICAL_PENDING_COMPLETION_EXISTS' : 'PENDING_COMPLETION_EXISTS');
    }
    const row = { id: newId(), employeeId: body.employeeId, [domain.key]: item.id,
      validityMonthsSnapshot: item.validityMonths, comment: optionalComment(body.comment),
      createdAt: now(), createdBySubject: 'demo', status: 'pending', resolvedAt: null,
      resolvedBySubject: null, cancellationReason: null, completionId: null };
    database[domain.pending].push(row);
    return publicPending(database, row, domain);
  });
}

async function resolvePending(domain, id, completedOn, reason) {
  return mutateDemoDatabase((database) => {
    const row = find(database, domain.pending, id);
    if (row.status !== 'pending') throw new DemoDataError('The pending completion has already been resolved.', 'PENDING_COMPLETION_ALREADY_RESOLVED');
    if (completedOn !== undefined) {
      const completion = appendCompletion(database, domain, { ...row, completedOn }, row.validityMonthsSnapshot);
      row.completionId = completion.id; row.status = 'finalized';
    } else {
      row.cancellationReason = requireText(reason, 'reason', 500, 3); row.status = 'cancelled';
    }
    row.resolvedAt = now(); row.resolvedBySubject = 'demo';
    return publicPending(database, row, domain);
  });
}

export const adminRepository = {
  async listEmployees(options = {}) {
    const database = readDemoDatabase();
    return paginate(database.employees.filter((row) => (enabled(options.includeArchived) || !row.archivedAt)
      && matches(row, options.search, [(item) => item.displayName, (item) => item.email]))
      .sort(byName).map((row) => employeeRecord(database, row)), options);
  },
  async listEmployeeOptions() { return readDemoDatabase().employees.filter((row) => !row.archivedAt).sort(byName).map(publicEmployee); },
  async getEmployee(id) { const database = readDemoDatabase(); return employeeRecord(database, find(database, 'employees', id), true); },
  async createEmployee(body) {
    return mutateDemoDatabase((database) => {
      const row = newRecord(employeeInput(database, body)); database.employees.push(row);
      return publicEmployee(row);
    });
  },
  async updateEmployee(id, body) {
    return mutateDemoDatabase((database) => {
      const row = find(database, 'employees', id);
      Object.assign(row, employeeInput(database, body, row), { updatedAt: now() }); return publicEmployee(row);
    });
  },
  setEmployeeArchived: (id, archived) => setArchived('employees', id, archived),
  async listSites(options = {}) {
    const database = readDemoDatabase();
    return paginate(database.sites.filter((row) => (enabled(options.includeArchived) || !row.archivedAt)
      && matches(row, options.search, [(item) => item.name])).sort(byName).map((row) => siteRecord(database, row)), options);
  },
  async listSiteOptions() { return readDemoDatabase().sites.sort(byName); },
  async getSite(id) { const database = readDemoDatabase(); return siteRecord(database, find(database, 'sites', id)); },
  async createSite(body) {
    return mutateDemoDatabase((database) => {
      const row = newRecord({ name: requireText(body.name, 'name', 160), timeZone: requireTimeZone(body.timeZone) });
      database.sites.push(row); return row;
    });
  },
  async updateSite(id, body) {
    return mutateDemoDatabase((database) => {
      const row = find(database, 'sites', id);
      Object.assign(row, { name: requireText(body.name ?? row.name, 'name', 160),
        timeZone: requireTimeZone(body.timeZone ?? row.timeZone), updatedAt: now() }); return row;
    });
  },
  setSiteArchived: (id, archived) => setArchived('sites', id, archived),
};

// Both domains share the same rules for history, archiving, and date changes.
for (const [domain, singular, plural, completionPrefix] of [
  [training, 'Course', 'Courses', ''], [medical, 'Medical', 'Medicals', 'Medical'],
]) {
  Object.assign(adminRepository, {
    [`list${plural}`]: (options) => listCatalog(domain, options),
    [`list${singular}Options`]: async () => {
      const database = readDemoDatabase();
      return database[domain.items].filter((row) => !row.archivedAt).sort(byName).map((row) => catalogRecord(database, row, domain));
    },
    [`get${singular}`]: async (id) => { const database = readDemoDatabase(); return catalogRecord(database, find(database, domain.items, id), domain, true); },
    [`create${singular}`]: (body) => saveCatalog(domain, null, body),
    [`update${singular}`]: (id, body) => saveCatalog(domain, id, body),
    [`set${singular}Archived`]: (id, archived) => setArchived(domain.items, id, archived),
    [`list${completionPrefix}Completions`]: (options) => listRecords(domain, options),
    [`get${completionPrefix}Completion`]: async (id) => { const database = readDemoDatabase(); return publicCompletion(database, find(database, domain.completions, id), domain); },
    [`create${completionPrefix}Completion`]: (body) => createCompletion(domain, body),
    [`void${completionPrefix}Completion`]: (id, reason) => voidCompletion(domain, id, reason),
    [`correct${completionPrefix}CompletionDates`]: (id, body) => correctDates(domain, id, body),
    [`list${completionPrefix}PendingCompletions`]: (options) => listRecords(domain, options, true),
    [`get${completionPrefix}PendingCompletion`]: async (id) => { const database = readDemoDatabase(); return publicPending(database, find(database, domain.pending, id), domain); },
    [`create${completionPrefix}PendingCompletion`]: (body) => createPending(domain, body),
    [`finalize${completionPrefix}PendingCompletion`]: (id, completedOn) => resolvePending(domain, id, completedOn),
    [`cancel${completionPrefix}PendingCompletion`]: (id, reason) => resolvePending(domain, id, undefined, reason),
  });
}
