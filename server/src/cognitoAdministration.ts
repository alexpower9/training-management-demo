import { randomUUID } from 'node:crypto';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  type AdminCreateUserCommandOutput,
  type ListUsersInGroupCommandOutput,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { config } from './config.js';
import { AppError } from './errors.js';

const adminGroupName = 'admin';
const employeeGroupName = 'employee';

type AccountKind = 'administrator' | 'employee';
type CognitoCommand =
  | AdminAddUserToGroupCommand
  | AdminCreateUserCommand
  | AdminDeleteUserCommand
  | ListUsersInGroupCommand;
type CognitoSend = (command: CognitoCommand) => Promise<unknown>;

export type AdminAccount = {
  username: string;
  email: string;
  displayName: string | null;
  status: string | null;
  enabled: boolean;
  createdAt: string | null;
};

export type ProvisionedAccount = AdminAccount & {
  subject: string;
};

export type AccountInvitation = {
  email: string;
  displayName?: string;
};

type DevelopmentAccount = ProvisionedAccount & {
  groups: Set<string>;
};

type RollbackFailureHandler = (
  rollbackError: unknown,
  originalError: unknown,
) => void;

type AdministrationOptions = {
  send?: CognitoSend | null;
  poolId?: string;
  developmentAccounts?: Map<string, DevelopmentAccount>;
};

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

function errorName(error: unknown) {
  return typeof error === 'object' && error && 'name' in error
    ? String(error.name)
    : '';
}

function accountExistsError(kind: AccountKind) {
  const prefix = kind === 'administrator' ? 'ADMIN' : 'EMPLOYEE';
  return new AppError(
    409,
    `${prefix}_ACCOUNT_EXISTS`,
    'A Cognito account already uses that email address.',
    { email: ['Use an email address that is not already registered.'] },
  );
}

function cognitoError(
  error: unknown,
  kind: AccountKind,
  phase: 'provisioning' | 'delivery',
) {
  if (error instanceof AppError) return error;

  const name = errorName(error);
  const prefix = kind === 'administrator' ? 'ADMIN' : 'EMPLOYEE';
  const label = kind === 'administrator' ? 'administrator' : 'employee';

  if (name === 'UsernameExistsException' || name === 'AliasExistsException') {
    return accountExistsError(kind);
  }
  if (name === 'CodeDeliveryFailureException') {
    return new AppError(
      502,
      `${prefix}_INVITATION_DELIVERY_FAILED`,
      `Cognito could not deliver the ${label} invitation.`,
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
      `${prefix}_ACCOUNT_PROVISIONING_NOT_AUTHORIZED`,
      'The API is not permitted to administer Cognito users.',
    );
  }
  if (name === 'InvalidParameterException' || name === 'InvalidPasswordException') {
    return new AppError(
      400,
      `${prefix}_ACCOUNT_PROVISIONING_INVALID`,
      `Cognito rejected the ${label} invitation.`,
    );
  }
  if (phase === 'delivery') {
    return new AppError(
      502,
      `${prefix}_INVITATION_DELIVERY_FAILED`,
      `Cognito could not deliver the ${label} invitation.`,
    );
  }
  return new AppError(
    502,
    `${prefix}_ACCOUNT_PROVISIONING_FAILED`,
    `Cognito could not provision the ${label} account.`,
  );
}

function rollbackError(kind: AccountKind) {
  const prefix = kind === 'administrator' ? 'ADMIN' : 'EMPLOYEE';
  return new AppError(
    502,
    `${prefix}_ACCOUNT_ROLLBACK_FAILED`,
    'Account provisioning failed and the Cognito user could not be removed. Manual cleanup is required.',
  );
}

export function createCognitoAdministration(options: AdministrationOptions = {}) {
  const send = options.send || null;
  const developmentAccounts =
    options.developmentAccounts || new Map<string, DevelopmentAccount>();

  function userPoolId() {
    if (!options.poolId) {
      throw new AppError(
        503,
        'COGNITO_ADMINISTRATION_UNAVAILABLE',
        'Cognito administration is not configured.',
      );
    }
    return options.poolId;
  }

  async function deleteUser(username: string, email: string) {
    if (!send) {
      const account = developmentAccounts.get(email);
      if (account?.username === username) developmentAccounts.delete(email);
      return;
    }

    await send(
      new AdminDeleteUserCommand({
        UserPoolId: userPoolId(),
        Username: username,
      }),
    );
  }

  async function createSuppressedAccount(
    invitation: AccountInvitation,
    kind: AccountKind,
  ): Promise<ProvisionedAccount> {
    const email = invitation.email.toLowerCase();
    if (!send) {
      if (developmentAccounts.has(email)) throw accountExistsError(kind);

      const account: DevelopmentAccount = {
        username: randomUUID(),
        subject: randomUUID(),
        email,
        displayName: invitation.displayName || null,
        status: 'FORCE_CHANGE_PASSWORD',
        enabled: true,
        createdAt: new Date().toISOString(),
        groups: new Set(),
      };
      developmentAccounts.set(email, account);
      return account;
    }

    const response = (await send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId(),
        Username: email,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email },
          ...(invitation.displayName
            ? [{ Name: 'name', Value: invitation.displayName }]
            : []),
        ],
      }),
    )) as AdminCreateUserCommandOutput;
    const createdUser = response.User;
    if (!createdUser?.Username) {
      throw new AppError(
        502,
        `${kind === 'administrator' ? 'ADMIN' : 'EMPLOYEE'}_ACCOUNT_PROVISIONING_FAILED`,
        'Cognito created the user without returning an account identifier.',
      );
    }

    const subject = attribute(createdUser, 'sub');
    if (!subject) {
      const error = new AppError(
        502,
        `${kind === 'administrator' ? 'ADMIN' : 'EMPLOYEE'}_ACCOUNT_PROVISIONING_FAILED`,
        'Cognito created the user without returning its immutable subject.',
      );
      Object.assign(error, { createdUsername: createdUser.Username });
      throw error;
    }

    return {
      ...serializeUser(createdUser),
      username: createdUser.Username,
      email,
      displayName: invitation.displayName || null,
      subject,
    };
  }

  async function addAccountToGroup(account: ProvisionedAccount, groupName: string) {
    if (!send) {
      developmentAccounts.get(account.email)?.groups.add(groupName);
      return;
    }

    await send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId(),
        Username: account.username,
        GroupName: groupName,
      }),
    );
  }

  async function resendInvitation(
    account: ProvisionedAccount,
    kind: AccountKind,
  ) {
    if (!send) return;

    try {
      await send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId(),
          Username: account.email,
          MessageAction: 'RESEND',
          DesiredDeliveryMediums: ['EMAIL'],
        }),
      );
    } catch (error) {
      throw cognitoError(error, kind, 'delivery');
    }
  }

  async function provisionAccount<T>(
    invitation: AccountInvitation,
    kind: AccountKind,
    groupName: string,
    finalize: (
      account: ProvisionedAccount,
      sendInvitation: () => Promise<void>,
    ) => Promise<T>,
    onRollbackFailure?: RollbackFailureHandler,
  ): Promise<T> {
    const email = invitation.email.toLowerCase();
    let account: ProvisionedAccount | null = null;

    const cleanupAndThrow = async (originalError: unknown): Promise<never> => {
      if (account) {
        try {
          await deleteUser(account.username, account.email);
        } catch (cleanupError) {
          onRollbackFailure?.(cleanupError, originalError);
          throw rollbackError(kind);
        }
      }
      throw originalError;
    };

    try {
      account = await createSuppressedAccount({ ...invitation, email }, kind);
      await addAccountToGroup(account, groupName);
    } catch (error) {
      const createdUsername =
        typeof error === 'object' &&
        error &&
        'createdUsername' in error &&
        typeof error.createdUsername === 'string'
          ? error.createdUsername
          : null;
      if (!account && createdUsername) {
        account = {
          username: createdUsername,
          subject: '',
          email,
          displayName: invitation.displayName || null,
          status: null,
          enabled: true,
          createdAt: null,
        };
      }
      return cleanupAndThrow(cognitoError(error, kind, 'provisioning'));
    }

    try {
      return await finalize(account, () => resendInvitation(account!, kind));
    } catch (error) {
      return cleanupAndThrow(error);
    }
  }

  return {
    async listAdminAccounts(): Promise<AdminAccount[]> {
      if (!send) {
        return Array.from(developmentAccounts.values())
          .filter((account) => account.groups.has(adminGroupName))
          .map(({ groups: _groups, subject: _subject, ...account }) => account)
          .sort((a, b) => a.email.localeCompare(b.email));
      }

      try {
        const users: UserType[] = [];
        let nextToken: string | undefined;
        do {
          const response = (await send(
            new ListUsersInGroupCommand({
              UserPoolId: userPoolId(),
              GroupName: adminGroupName,
              NextToken: nextToken,
            }),
          )) as ListUsersInGroupCommandOutput;
          users.push(...(response.Users || []));
          nextToken = response.NextToken;
        } while (nextToken);

        return users
          .map(serializeUser)
          .sort((a, b) =>
            (a.displayName || a.email).localeCompare(b.displayName || b.email),
          );
      } catch (error) {
        throw cognitoError(error, 'administrator', 'provisioning');
      }
    },

    inviteAdminAccount(
      invitation: AccountInvitation,
      onRollbackFailure?: RollbackFailureHandler,
    ) {
      return provisionAccount(
        invitation,
        'administrator',
        adminGroupName,
        async (account, sendInvitation) => {
          await sendInvitation();
          const { subject: _subject, ...publicAccount } = account;
          return publicAccount;
        },
        onRollbackFailure,
      );
    },

    provisionEmployeeAccount<T>(
      invitation: AccountInvitation,
      finalize: (
        account: ProvisionedAccount,
        sendInvitation: () => Promise<void>,
      ) => Promise<T>,
      onRollbackFailure?: RollbackFailureHandler,
    ) {
      return provisionAccount(
        invitation,
        'employee',
        employeeGroupName,
        finalize,
        onRollbackFailure,
      );
    },
  };
}

const client =
  config.authMode === 'cognito'
    ? new CognitoIdentityProviderClient({ region: config.awsRegion })
    : null;
const administration = createCognitoAdministration({
  send: client
    ? (command) => client.send(command as Parameters<typeof client.send>[0])
    : null,
  poolId: config.cognitoUserPoolId,
});

export const listAdminAccounts = administration.listAdminAccounts;
export const inviteAdminAccount = administration.inviteAdminAccount;
export const provisionEmployeeAccount =
  administration.provisionEmployeeAccount;
