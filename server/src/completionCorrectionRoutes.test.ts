import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './app.js';
import { ensureCompletionDatesChanged } from './completionCorrection.js';
import { AppError } from './errors.js';

const completionId = '20000000-0000-4000-8000-000000000001';
const adminHeaders = {
  'content-type': 'application/json',
  'x-demo-user-role': 'admin',
};

const correctionUrls = [
  `/api/v1/admin/completions/${completionId}/correct-dates`,
  `/api/v1/admin/medical-completions/${completionId}/correct-dates`,
];

test('date correction requires real dates and a meaningful reason', async () => {
  const app = await buildApp();

  for (const url of correctionUrls) {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: adminHeaders,
      payload: {
        completedOn: '2026-02-30',
        expiresOn: 'also-not-a-date',
        reason: 'no',
      },
    });
    assert.equal(response.statusCode, 400, url);
    assert.equal(response.json().code, 'VALIDATION_ERROR', url);
    assert.ok(response.json().fieldErrors.completedOn, url);
    assert.ok(response.json().fieldErrors.expiresOn, url);
    assert.ok(response.json().fieldErrors.reason, url);
  }

  await app.close();
});

test('date correction rejects expiry before completion before database access', async () => {
  const app = await buildApp();

  for (const url of correctionUrls) {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: adminHeaders,
      payload: {
        completedOn: '2026-05-01',
        expiresOn: '2026-04-30',
        reason: 'Correcting certificate dates.',
      },
    });
    assert.equal(response.statusCode, 400, url);
    assert.deepEqual(response.json().fieldErrors.expiresOn, [
      'Expiry date must be on or after the completion date.',
    ]);
  }

  await app.close();
});

test('date correction bodies are strict', async () => {
  const app = await buildApp();

  for (const url of correctionUrls) {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: adminHeaders,
      payload: {
        completedOn: '2026-05-01',
        expiresOn: '2027-05-01',
        reason: 'Correcting certificate dates.',
        comment: 'Attempted replacement comment',
      },
    });
    assert.equal(response.statusCode, 400, url);
    assert.equal(response.json().code, 'VALIDATION_ERROR', url);
  }

  await app.close();
});

test('employees cannot correct completion dates', async () => {
  const app = await buildApp();

  for (const url of correctionUrls) {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: {
        'content-type': 'application/json',
        'x-demo-user-role': 'employee',
      },
      payload: {
        completedOn: '2026-05-01',
        expiresOn: '2027-05-01',
        reason: 'Correcting certificate dates.',
      },
    });
    assert.equal(response.statusCode, 403, url);
    assert.equal(response.json().code, 'FORBIDDEN', url);
  }

  await app.close();
});

test('date correction rejects a no-op replacement', () => {
  assert.throws(
    () =>
      ensureCompletionDatesChanged(
        {
          completedOn: new Date('2026-05-01T00:00:00.000Z'),
          expiresOn: new Date('2027-05-01T00:00:00.000Z'),
        },
        { completedOn: '2026-05-01', expiresOn: '2027-05-01' },
      ),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 400 &&
      error.code === 'COMPLETION_DATES_UNCHANGED',
  );
});
