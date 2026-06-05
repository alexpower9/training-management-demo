import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { AppError } from './errors.js';

const verifier =
  config.authMode === 'cognito' && config.cognitoUserPoolId && config.cognitoClientId
    ? CognitoJwtVerifier.create({
        userPoolId: config.cognitoUserPoolId,
        tokenUse: 'access',
        clientId: config.cognitoClientId,
      })
    : null;

function bearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice('Bearer '.length);
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  if (config.authMode === 'development') {
    const role = request.headers['x-demo-user-role'] === 'viewer' ? 'viewer' : 'admin';
    const subjectHeader = request.headers['x-demo-user-subject'];

    request.auth = {
      subject: typeof subjectHeader === 'string' ? subjectHeader : 'local-development',
      role,
      userName: `Development ${role}`,
    };
    return;
  }

  const token = bearerToken(request);
  if (!token || !verifier) {
    throw new AppError(401, 'UNAUTHENTICATED', 'A valid access token is required.');
  }

  try {
    const payload = await verifier.verify(token);
    const groups = Array.isArray(payload['cognito:groups']) ? payload['cognito:groups'] : [];

    request.auth = {
      subject: payload.sub,
      role: groups.includes('admin') ? 'admin' : 'viewer',
      userName:
        typeof payload.username === 'string' ? payload.username : undefined,
    };
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'The access token is invalid or expired.');
  }
}

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (request.auth.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Administrator access is required.');
  }
}
