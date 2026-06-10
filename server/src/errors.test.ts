import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { registerErrorHandler } from './errors.js';

test('Zod-compatible validation errors use the structured error contract', async () => {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.get('/validation-error', async () => {
    throw {
      name: 'ZodError',
      issues: [],
      flatten: () => ({
        fieldErrors: {
          displayName: ['Enter a display name.'],
        },
      }),
    };
  });

  const response = await app.inject({
    method: 'GET',
    url: '/validation-error',
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'VALIDATION_ERROR');
  assert.deepEqual(response.json().fieldErrors, {
    displayName: ['Enter a display name.'],
  });
  await app.close();
});
