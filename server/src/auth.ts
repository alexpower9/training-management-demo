import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { getPrisma } from './database.js';
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

export function resolveRole(groups: string[]) {
  if (groups.includes('owner')) return 'owner';
  if (groups.includes('admin')) return 'admin';
  if (groups.includes('employee')) return 'employee';
  return null;
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  if (config.authMode === 'development') {
    const roleHeader = request.headers['x-demo-user-role'];
    const role =
      roleHeader === undefined
        ? 'admin'
        : roleHeader === 'owner' ||
            roleHeader === 'admin' ||
            roleHeader === 'employee'
          ? roleHeader
          : null;
    const subjectHeader = request.headers['x-demo-user-subject'];

    if (!role) {
      throw new AppError(
        403,
        'ACCOUNT_NOT_AUTHORIZED',
        'This account is not authorized to use NME Training.',
      );
    }

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

  let payload;
  try {
    payload = await verifier.verify(token);
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'The access token is invalid or expired.');
  }

  const groups = Array.isArray(payload['cognito:groups']) ? payload['cognito:groups'] : [];
  const role = resolveRole(groups);
  if (!role) {
    throw new AppError(
      403,
      'ACCOUNT_NOT_AUTHORIZED',
      'This account is not authorized to use NME Training.',
    );
  }

  request.auth = {
    subject: payload.sub,
    role,
    userName:
      typeof payload.username === 'string' ? payload.username : undefined,
  };
}

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (request.auth.role !== 'owner' && request.auth.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Administrator access is required.');
  }
}

export async function requireOwner(request: FastifyRequest, _reply: FastifyReply) {
  if (request.auth.role !== 'owner') {
    throw new AppError(403, 'OWNER_ACCESS_REQUIRED', 'Owner access is required.');
  }
}

export async function resolveEmployeeAccount(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  if (
    request.auth.role === 'owner' ||
    request.auth.role === 'admin' ||
    request.auth.employee
  ) {
    return;
  }

  const employee = await (await getPrisma()).employee.findUnique({
    where: { cognitoSubject: request.auth.subject },
    select: {
      id: true,
      displayName: true,
      archivedAt: true,
    },
  });

  if (!employee) {
    throw new AppError(
      403,
      'EMPLOYEE_ACCOUNT_NOT_LINKED',
      'Your account is not linked to an employee record.',
    );
  }

  if (employee.archivedAt) {
    throw new AppError(
      403,
      'EMPLOYEE_ACCOUNT_INACTIVE',
      'Your employee record is inactive.',
    );
  }

  request.auth.employee = {
    id: employee.id,
    displayName: employee.displayName,
  };
}

export async function requireEmployeeAccount(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (request.auth.role !== 'employee') {
    throw new AppError(
      403,
      'EMPLOYEE_ACCESS_REQUIRED',
      'Employee access is required.',
    );
  }

  await resolveEmployeeAccount(request, reply);
}
