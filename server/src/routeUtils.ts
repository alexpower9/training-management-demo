import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from './errors.js';

export const identifier = z.string().uuid();
export const expectedVersion = z.number().int().positive();
export const dateOnlyString = z.string().date();

export function parseId(request: FastifyRequest) {
  return identifier.parse((request.params as { id: string }).id);
}

export function paginationQuery(request: FastifyRequest) {
  return z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
      search: z.string().trim().max(160).optional(),
      includeArchived: z.enum(['true', 'false']).default('false'),
    })
    .parse(request.query);
}

export function pageResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return { items, page, pageSize, total };
}

export function jsonSnapshot(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export function ensureFound<T>(
  value: T | null | undefined,
  code: string,
  message: string,
): asserts value is T {
  if (!value) {
    throw new AppError(404, code, message);
  }
}

export function editConflict() {
  return new AppError(
    409,
    'EDIT_CONFLICT',
    'This record changed after you opened it. Refresh and review the latest values.',
  );
}
