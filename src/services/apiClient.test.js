import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth/auth', () => ({
  auth: {
    isDevelopmentAuth: true,
    state: { role: 'admin', subject: 'local-development-admin' },
  },
  getAccessToken: vi.fn(async () => null),
}));

import { ApiError, apiRequest } from '@/services/apiClient';

describe('apiRequest', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('preserves structured field errors, conflict codes, and request IDs', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        code: 'CONFLICT',
        message: 'A record already exists.',
        fieldErrors: { name: ['Use another name.'] },
        requestId: 'request-123',
      }),
    });

    await expect(apiRequest('/admin/employees/1')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'CONFLICT',
      status: 409,
      fieldErrors: { name: ['Use another name.'] },
      requestId: 'request-123',
    });
  });

  it('returns actionable API setup messaging on network failure', async () => {
    fetch.mockRejectedValue(new TypeError('network unavailable'));

    await expect(apiRequest('/admin/employees')).rejects.toEqual(
      expect.objectContaining({
        constructor: ApiError,
        code: 'API_UNAVAILABLE',
        message: expect.stringContaining('Start the API and PostgreSQL database'),
      }),
    );
  });
});
