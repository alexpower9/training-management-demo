import { auth, getAccessToken } from '@/auth/auth';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code || 'REQUEST_FAILED';
    this.status = options.status || 0;
    this.fieldErrors = options.fieldErrors || {};
    this.requestId = options.requestId || null;
  }
}

function buildUrl(path, query) {
  const url = new URL(`${apiBaseUrl}${path}`, window.location.origin);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return `${url.pathname}${url.search}`;
}

export async function apiRequest(path, options = {}) {
  const token = await getAccessToken();
  const headers = { Accept: 'application/json' };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (auth.isDevelopmentAuth) {
    headers['x-demo-user-role'] = auth.state.role || 'viewer';
    headers['x-demo-user-subject'] = 'local-development';
  }

  let response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(
      'The management API is unavailable. Start the API and PostgreSQL database, then try again.',
      { code: 'API_UNAVAILABLE' },
    );
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(payload?.message || `Request failed with status ${response.status}`, {
      code: payload?.code,
      status: response.status,
      fieldErrors: payload?.fieldErrors,
      requestId: payload?.requestId,
    });
  }

  return payload;
}
