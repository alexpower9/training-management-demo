import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './app.js';

const adminHeaders = {
  'content-type': 'application/json',
  'x-demo-user-role': 'admin',
};

test('pending completion create payloads validate before database access', async () => {
  const app = await buildApp();

  const training = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/pending-completions',
    headers: adminHeaders,
    payload: {
      employeeId: 'not-an-id',
      courseId: 'also-not-an-id',
      comment: 'x'.repeat(501),
    },
  });
  assert.equal(training.statusCode, 400);
  assert.equal(training.json().code, 'VALIDATION_ERROR');
  assert.ok(training.json().fieldErrors.employeeId);
  assert.ok(training.json().fieldErrors.courseId);
  assert.ok(training.json().fieldErrors.comment);

  const medical = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/medical-pending-completions',
    headers: adminHeaders,
    payload: {
      employeeId: 'not-an-id',
      medicalId: 'also-not-an-id',
      comment: 'x'.repeat(501),
    },
  });
  assert.equal(medical.statusCode, 400);
  assert.equal(medical.json().code, 'VALIDATION_ERROR');
  assert.ok(medical.json().fieldErrors.employeeId);
  assert.ok(medical.json().fieldErrors.medicalId);
  assert.ok(medical.json().fieldErrors.comment);

  await app.close();
});

test('pending resolution inputs validate before database access', async () => {
  const app = await buildApp();
  const pendingId = '20000000-0000-4000-8000-000000000001';

  for (const prefix of ['pending-completions', 'medical-pending-completions']) {
    const invalidDate = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/${prefix}/${pendingId}/finalize`,
      headers: adminHeaders,
      payload: { completedOn: '2026-02-30' },
    });
    assert.equal(invalidDate.statusCode, 400, prefix);
    assert.equal(invalidDate.json().code, 'VALIDATION_ERROR', prefix);
    assert.ok(invalidDate.json().fieldErrors.completedOn, prefix);

    const shortReason = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/${prefix}/${pendingId}/cancel`,
      headers: adminHeaders,
      payload: { reason: 'no' },
    });
    assert.equal(shortReason.statusCode, 400, prefix);
    assert.equal(shortReason.json().code, 'VALIDATION_ERROR', prefix);
    assert.ok(shortReason.json().fieldErrors.reason, prefix);
  }

  await app.close();
});

test('pending completion endpoints are restricted to administrators and owners', async () => {
  const app = await buildApp();
  const employeeHeaders = { 'x-demo-user-role': 'employee' };
  const pendingId = '20000000-0000-4000-8000-000000000001';

  for (const { method, url } of [
    { method: 'GET', url: '/api/v1/admin/pending-completions' },
    { method: 'POST', url: '/api/v1/admin/pending-completions' },
    { method: 'GET', url: `/api/v1/admin/pending-completions/${pendingId}` },
    {
      method: 'POST',
      url: `/api/v1/admin/pending-completions/${pendingId}/finalize`,
    },
    {
      method: 'POST',
      url: `/api/v1/admin/pending-completions/${pendingId}/cancel`,
    },
    { method: 'GET', url: '/api/v1/admin/medical-pending-completions' },
    { method: 'POST', url: '/api/v1/admin/medical-pending-completions' },
    {
      method: 'GET',
      url: `/api/v1/admin/medical-pending-completions/${pendingId}`,
    },
    {
      method: 'POST',
      url: `/api/v1/admin/medical-pending-completions/${pendingId}/finalize`,
    },
    {
      method: 'POST',
      url: `/api/v1/admin/medical-pending-completions/${pendingId}/cancel`,
    },
    { method: 'GET', url: `/api/v1/admin/completions/${pendingId}` },
    {
      method: 'GET',
      url: `/api/v1/admin/medical-completions/${pendingId}`,
    },
  ] as const) {
    const response = await app.inject({
      method,
      url,
      headers: employeeHeaders,
    });
    assert.equal(response.statusCode, 403, url);
    assert.equal(response.json().code, 'FORBIDDEN', url);
  }

  await app.close();
});

test('pending list filters reject invalid identifiers before database access', async () => {
  const app = await buildApp();

  for (const url of [
    '/api/v1/admin/pending-completions?employeeId=invalid&includeResolved=true',
    '/api/v1/admin/pending-completions?courseId=invalid',
    '/api/v1/admin/medical-pending-completions?employeeId=invalid',
    '/api/v1/admin/medical-pending-completions?medicalId=invalid&includeResolved=true',
  ]) {
    const response = await app.inject({ method: 'GET', url, headers: adminHeaders });
    assert.equal(response.statusCode, 400, url);
    assert.equal(response.json().code, 'VALIDATION_ERROR', url);
  }

  await app.close();
});
