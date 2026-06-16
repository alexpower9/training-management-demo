import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

type ZodCompatibleError = {
  name: string;
  issues: unknown[];
  flatten: () => {
    fieldErrors: Record<string, string[] | undefined>;
  };
};

function isZodError(error: unknown): error is ZodCompatibleError {
  if (error instanceof ZodError) return true;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as Partial<ZodCompatibleError>;
  return (
    candidate.name === 'ZodError' &&
    Array.isArray(candidate.issues) &&
    typeof candidate.flatten === 'function'
  );
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[]>,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error(
          { err: error, appErrorCode: error.code },
          'Request failed with an operational error.',
        );
      }
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
        requestId: request.id,
      });
    }

    if (isZodError(error)) {
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
