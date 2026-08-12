import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './app.js';

const adminHeaders = {
  'content-type': 'application/json',
  'x-demo-user-role': 'admin',
};

test('medical catalogue payload validation happens before database access', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/medicals',
    headers: adminHeaders,
    payload: {
      name: 'Annual Fitness Assessment',
      validityMonths: 0,
      siteIds: [],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'VALIDATION_ERROR');
  assert.deepEqual(response.json().fieldErrors.validityMonths, [
    'Number must be greater than or equal to 1',
  ]);
  await app.close();
});

test('medical catalogue rejects duplicate site selections before database access', async () => {
  const app = await buildApp();
  const siteId = '20000000-0000-4000-8000-000000000001';
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/medicals',
    headers: adminHeaders,
    payload: {
      name: 'Annual Fitness Assessment',
      validityMonths: 12,
      siteIds: [siteId, siteId],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'VALIDATION_ERROR');
  assert.deepEqual(response.json().fieldErrors.siteIds, [
    'Each site may only be selected once.',
  ]);
  await app.close();
});

test('medical completion payload validation happens before database access', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/medical-completions',
    headers: adminHeaders,
    payload: {
      employeeId: 'not-an-id',
      medicalId: 'also-not-an-id',
      completedOn: '2026-02-30',
      comment: 'x'.repeat(501),
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'VALIDATION_ERROR');
  assert.ok(response.json().fieldErrors.employeeId);
  assert.ok(response.json().fieldErrors.medicalId);
  assert.ok(response.json().fieldErrors.completedOn);
  assert.ok(response.json().fieldErrors.comment);
  await app.close();
});

test('employees cannot access medical administration or option endpoints', async () => {
  const app = await buildApp();
  const headers = { 'x-demo-user-role': 'employee' };

  for (const url of [
    '/api/v1/admin/medicals',
    '/api/v1/admin/medical-options',
    '/api/v1/admin/medical-completions',
    '/api/v1/admin/employee-options',
    '/api/v1/admin/course-options',
  ]) {
    const response = await app.inject({ method: 'GET', url, headers });
    assert.equal(response.statusCode, 403, url);
    assert.equal(response.json().code, 'FORBIDDEN', url);
  }

  await app.close();
});
