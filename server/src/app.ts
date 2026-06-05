import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';
import { registerErrorHandler } from './errors.js';
import { registerRoutes } from './routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: true,
    requestIdHeader: 'x-request-id',
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'production' ? false : true,
  });

  registerErrorHandler(app);
  await registerRoutes(app);

  return app;
}
