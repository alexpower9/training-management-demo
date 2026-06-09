import { randomUUID } from 'node:crypto';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { config } from './config.js';
import { AppError } from './errors.js';

const adminGroupName = 'admin';
const client =
  config.authMode === 'cognito'
    ? new CognitoIdentityProviderClient({ region: config.awsRegion })
    : null;
const developmentAdmins = new Map<string, AdminAccount>();

export type AdminAccount = {
  username: string;
  email: string;
  displayName: string | null;
  status: string | null;
  enabled: boolean;
  createdAt: string | null;
};

type AdminInvitation = {
  email: string;
  displayName?: string;
};

function userPoolId() {
  if (!config.cognitoUserPoolId) {
    throw new AppError(
      503,
      'COGNITO_ADMINISTRATION_UNAVAILABLE',
      'Cognito administration is not configured.',
    );
  }
  return config.cognitoUserPoolId;
}

function attribute(user: UserType, name: string) {
  return user.Attributes?.find((item) => item.Name === name)?.Value;
}

function serializeUser(user: UserType): AdminAccount {
  return {
    username: user.Username || '',
    email: attribute(user, 'email') || '',
    displayName: attribute(user, 'name') || null,
    status: user.UserStatus || null,
    enabled: user.Enabled !== false,
    createdAt: user.UserCreateDate?.toISOString() || null,
  };
}

function cognitoError(error: unknown): AppError {
  const name =
    typeof error === 'object' && error && 'name' in error
      ? String(error.name)
      : '';

  if (name === 'UsernameExistsException' || name === 'AliasExistsException') {
    return new AppError(
      409,
      'ADMIN_ACCOUNT_EXISTS',
      'A Cognito account already uses that email address.',
      { email: ['Use an email address that is not already registered.'] },
    );
  }
  if (name === 'CodeDeliveryFailureException') {
    return new AppError(
      502,
      'ADMIN_INVITATION_DELIVERY_FAILED',
      'Cognito could not deliver the administrator invitation.',
    );
  }
  if (name === 'TooManyRequestsException') {
    return new AppError(
      503,
      'COGNITO_RATE_LIMITED',
      'Cognito is temporarily rate limited. Try again shortly.',
    );
  }
  if (name === 'NotAuthorizedException' || name === 'AccessDeniedException') {
    return new AppError(
      502,
      'COGNITO_ADMINISTRATION_NOT_AUTHORIZED',
      'The API is not permitted to administer Cognito users.',
    );
  }
  if (name === 'InvalidParameterException' || name === 'InvalidPasswordException') {
    return new AppError(
      400,
      'ADMIN_INVITATION_INVALID',
      'Cognito rejected the administrator invitation.',
    );
  }
  return new AppError(
    502,
    'COGNITO_ADMINISTRATION_FAILED',
    'Cognito could not complete the administrator operation.',
  );
}

export async function listAdminAccounts(): Promise<AdminAccount[]> {
  if (!client) {
    return Array.from(developmentAdmins.values()).sort((a, b) =>
      a.email.localeCompare(b.email),
    );
  }

  try {
    const users: UserType[] = [];
    let nextToken: string | undefined;
    do {
      const response = await client.send(
        new ListUsersInGroupCommand({
          UserPoolId: userPoolId(),
          GroupName: adminGroupName,
          NextToken: nextToken,
        }),
      );
      users.push(...(response.Users || []));
      nextToken = response.NextToken;
    } while (nextToken);

    return users
      .map(serializeUser)
      .sort((a, b) =>
        (a.displayName || a.email).localeCompare(b.displayName || b.email),
      );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw cognitoError(error);
  }
}

export async function inviteAdminAccount(
  invitation: AdminInvitation,
): Promise<AdminAccount> {
  const email = invitation.email.toLowerCase();
  if (!client) {
    if (developmentAdmins.has(email)) {
      throw new AppError(
        409,
        'ADMIN_ACCOUNT_EXISTS',
        'A Cognito account already uses that email address.',
        { email: ['Use an email address that is not already registered.'] },
      );
    }
    const account: AdminAccount = {
      username: randomUUID(),
      email,
      displayName: invitation.displayName || null,
      status: 'FORCE_CHANGE_PASSWORD',
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    developmentAdmins.set(email, account);
    return account;
  }

  const poolId = userPoolId();
  let username: string | undefined;
  try {
    const response = await client.send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: email,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email },
          ...(invitation.displayName
            ? [{ Name: 'name', Value: invitation.displayName }]
            : []),
        ],
      }),
    );
    const createdUser = response.User;
    if (!createdUser?.Username) {
      throw new AppError(
        502,
        'COGNITO_ADMINISTRATION_FAILED',
        'Cognito created the user without returning an account identifier.',
      );
    }
    username = createdUser.Username;

    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: poolId,
        Username: username,
        GroupName: adminGroupName,
      }),
    );
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: username,
        MessageAction: 'RESEND',
        DesiredDeliveryMediums: ['EMAIL'],
      }),
    );

    return serializeUser(createdUser);
  } catch (error) {
    if (username) {
      await client
        .send(
          new AdminDeleteUserCommand({
            UserPoolId: poolId,
            Username: username,
          }),
        )
        .catch(() => undefined);
    }
    if (error instanceof AppError) throw error;
    throw cognitoError(error);
  }
}
