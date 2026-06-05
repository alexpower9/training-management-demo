import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './app.js';

test('health endpoint is public', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
  await app.close();
});

test('development identity exposes viewer role', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/me',
    headers: {
      'x-demo-user-role': 'viewer',
      'x-demo-user-subject': 'viewer-test',
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().role, 'viewer');
  assert.equal(response.json().subject, 'viewer-test');
  await app.close();
});

test('viewer mutations are rejected before database access', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/employees',
    headers: {
      'content-type': 'application/json',
      'x-demo-user-role': 'viewer',
    },
    payload: {
      name: 'Test Employee',
      position: 'Technician',
      crew: 'Field Service',
      homeBase: 'Labrador City',
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'FORBIDDEN');
  await app.close();
});

test('admin payload validation uses the structured error contract', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/employees',
    headers: {
      'content-type': 'application/json',
      'x-demo-user-role': 'admin',
    },
    payload: {
      name: '',
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'VALIDATION_ERROR');
  assert.ok(response.json().requestId);
  await app.close();
});
