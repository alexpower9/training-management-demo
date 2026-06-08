import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
        requestId: request.id,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'The request contains invalid values.',
        fieldErrors: error.flatten().fieldErrors,
        requestId: request.id,
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return reply.status(409).send({
          code: 'CONFLICT',
          message: 'A record with those identifying values already exists.',
          requestId: request.id,
        });
      }

      if (error.code === 'P2003') {
        return reply.status(409).send({
          code: 'DEPENDENCY_CONFLICT',
          message: 'This record is still referenced by other training data.',
          requestId: request.id,
        });
      }

    }

    request.log.error(error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed.',
      requestId: request.id,
    });
  });
}
