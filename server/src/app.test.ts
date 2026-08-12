import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './app.js';
import { resolveRole } from './auth.js';

test('health endpoint is public', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
  await app.close();
});

test('Cognito groups resolve with owner and admin precedence', () => {
  assert.equal(resolveRole(['employee']), 'employee');
  assert.equal(resolveRole(['employee', 'admin']), 'admin');
  assert.equal(resolveRole(['employee', 'admin', 'owner']), 'owner');
  assert.equal(resolveRole(['unrelated-group']), null);
});

test('employee mutations are rejected before database access', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/employees',
    headers: {
      'content-type': 'application/json',
      'x-demo-user-role': 'employee',
    },
    payload: {
      displayName: 'Test Employee',
      email: 'test.employee@example.com',
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'FORBIDDEN');
  await app.close();
});

test('employees cannot resend another employee invitation', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/employees/20000000-0000-4000-8000-000000000001/resend-invitation',
    headers: {
      'x-demo-user-role': 'employee',
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'FORBIDDEN');
  await app.close();
});

test('unrecognized development roles are rejected', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/sites',
    headers: {
      'x-demo-user-role': 'contractor',
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'ACCOUNT_NOT_AUTHORIZED');
  await app.close();
});

test('manual employee account-link endpoints are not available', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'PUT',
    url: '/api/v1/admin/employees/20000000-0000-4000-8000-000000000001/account',
    headers: {
      'content-type': 'application/json',
      'x-demo-user-role': 'admin',
    },
    payload: {
      subject: '20000000-0000-4000-8000-000000000002',
    },
  });

  assert.equal(response.statusCode, 404);
  await app.close();
});

test('admins cannot invite other administrators', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/admins',
    headers: {
      'content-type': 'application/json',
      'x-demo-user-role': 'admin',
    },
    payload: {
      email: 'new-admin@example.com',
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'OWNER_ACCESS_REQUIRED');
  await app.close();
});

test('owners can invite and list administrators in development mode', async () => {
  const app = await buildApp();
  const email = `owner-test-${Date.now()}@example.com`;
  const headers = {
    'content-type': 'application/json',
    'x-demo-user-role': 'owner',
    'x-demo-user-subject': 'test-owner',
  };
  const invitation = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/admins',
    headers,
    payload: {
      email,
      displayName: 'Test Administrator',
    },
  });

  assert.equal(invitation.statusCode, 201);
  assert.equal(invitation.json().email, email);
  assert.equal(invitation.json().status, 'FORCE_CHANGE_PASSWORD');

  const list = await app.inject({
    method: 'GET',
    url: '/api/v1/owner/admins',
    headers,
  });
  assert.equal(list.statusCode, 200);
  assert.equal(
    list.json().items.some((account: { email: string }) => account.email === email),
    true,
  );

  const duplicate = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/admins',
    headers,
    payload: { email },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().code, 'ADMIN_ACCOUNT_EXISTS');
  await app.close();
});

test('admin payload validation uses the structured error contract', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/employees',
    headers: {
      'content-type': 'application/json',
      'x-demo-user-role': 'admin',
    },
    payload: {
      displayName: '',
      email: 'test.employee@example.com',
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'VALIDATION_ERROR');
  assert.ok(response.json().requestId);
  await app.close();
});

test('owner inherits administrator access', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/employees',
    headers: {
      'content-type': 'application/json',
      'x-demo-user-role': 'owner',
    },
    payload: {
      displayName: '',
      email: 'owner.employee@example.com',
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'VALIDATION_ERROR');
  await app.close();
});

test('site payload validation happens before database access', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/sites',
    headers: {
      'content-type': 'application/json',
      'x-demo-user-role': 'admin',
    },
    payload: {
      name: '',
      timeZone: 'invalid',
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'VALIDATION_ERROR');
  await app.close();
});
