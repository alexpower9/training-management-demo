import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), '');
const requiredValues = [
  'VITE_COGNITO_AUTHORITY',
  'VITE_COGNITO_CLIENT_ID',
  'VITE_COGNITO_DOMAIN',
  'VITE_COGNITO_REDIRECT_URI',
  'VITE_COGNITO_POST_LOGOUT_REDIRECT_URI',
];
const placeholderPattern =
  /example\.com|replace-me|your-company|REPLACE_ME|POOL_ID|APP_CLIENT_ID/i;

function requireHttpsUrl(name) {
  let url;
  try {
    url = new URL(env[name]);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS.`);
  }

  return url;
}

if (env.VITE_AUTH_MODE !== 'cognito') {
  throw new Error('VITE_AUTH_MODE must be cognito for a production build.');
}

if (env.VITE_DATA_SOURCE !== 'api') {
  throw new Error('VITE_DATA_SOURCE must be api for a production build.');
}

if (env.VITE_API_BASE_URL !== '/api/v1') {
  throw new Error('VITE_API_BASE_URL must be /api/v1 for this Nginx deployment.');
}

for (const name of requiredValues) {
  if (!env[name] || placeholderPattern.test(env[name])) {
    throw new Error(`${name} must contain a real production value.`);
  }
}

const authority = requireHttpsUrl('VITE_COGNITO_AUTHORITY');
const cognitoDomain = requireHttpsUrl('VITE_COGNITO_DOMAIN');
const redirectUri = requireHttpsUrl('VITE_COGNITO_REDIRECT_URI');
const logoutUri = requireHttpsUrl('VITE_COGNITO_POST_LOGOUT_REDIRECT_URI');

const authorityMatch = authority.hostname.match(
  /^cognito-idp\.([a-z0-9-]+)\.amazonaws\.com$/,
);
if (!authorityMatch) {
  throw new Error('VITE_COGNITO_AUTHORITY must use an AWS Cognito regional endpoint.');
}

const region = authorityMatch[1];
if (!cognitoDomain.hostname.endsWith(`.auth.${region}.amazoncognito.com`)) {
  throw new Error('VITE_COGNITO_DOMAIN must use the same AWS Region as the authority.');
}

if (!authority.pathname.startsWith(`/${region}_`)) {
  throw new Error('VITE_COGNITO_AUTHORITY must contain a user pool from its AWS Region.');
}

if (redirectUri.hostname !== logoutUri.hostname) {
  throw new Error('Cognito redirect and post-logout URLs must use the same hostname.');
}

if (redirectUri.pathname !== '/auth/callback') {
  throw new Error('VITE_COGNITO_REDIRECT_URI must end with /auth/callback.');
}

if (logoutUri.pathname !== '/training') {
  throw new Error('VITE_COGNITO_POST_LOGOUT_REDIRECT_URI must end with /training.');
}

console.log(`Production frontend environment is valid for ${redirectUri.hostname}.`);
