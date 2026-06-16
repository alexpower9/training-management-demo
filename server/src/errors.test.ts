import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { AppError, registerErrorHandler } from './errors.js';

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

test('operational AppErrors log their underlying cause', async () => {
  const lines: string[] = [];
  const app = Fastify({
    logger: {
      level: 'error',
      stream: {
        write(line) {
          lines.push(line);
        },
      },
    },
  });
  const cause = Object.assign(new Error('Daily email limit exceeded'), {
    name: 'LimitExceededException',
  });
  registerErrorHandler(app);
  app.get('/operational-error', async () => {
    throw new AppError(503, 'COGNITO_LIMIT_EXCEEDED', 'Try again later.', undefined, {
      cause,
    });
  });

  const response = await app.inject({
    method: 'GET',
    url: '/operational-error',
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, 'COGNITO_LIMIT_EXCEEDED');
  assert.match(lines.join(''), /LimitExceededException/);
  assert.match(lines.join(''), /Daily email limit exceeded/);
  await app.close();
});
