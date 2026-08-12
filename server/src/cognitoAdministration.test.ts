import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  createCognitoAdministration,
  type AccountInvitation,
} from './cognitoAdministration.js';
import { AppError } from './errors.js';

function cognitoUser(invitation: AccountInvitation) {
  return {
    Username: 'generated-username',
    UserStatus: 'FORCE_CHANGE_PASSWORD' as const,
    Enabled: true,
    Attributes: [
      { Name: 'sub', Value: '20000000-0000-4000-8000-000000000050' },
      { Name: 'email', Value: invitation.email },
      { Name: 'name', Value: invitation.displayName },
    ],
  };
}

test('employee provisioning creates, groups, persists, and then sends', async () => {
  const events: string[] = [];
  const invitation = {
    email: 'employee@example.com',
    displayName: 'Test Employee',
  };
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      if (command instanceof AdminCreateUserCommand) {
        if (command.input.MessageAction === 'SUPPRESS') {
          events.push('create');
          return { User: cognitoUser(invitation) };
        }
        events.push('send');
        assert.equal(command.input.Username, invitation.email);
        return {};
      }
      if (command instanceof AdminAddUserToGroupCommand) {
        events.push('group');
        assert.equal(command.input.GroupName, 'employee');
        return {};
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    },
  });

  const subject = await administration.provisionEmployeeAccount(
    invitation,
    async (account, sendInvitation) => {
      events.push('database');
      await sendInvitation();
      return account.subject;
    },
  );

  assert.equal(subject, '20000000-0000-4000-8000-000000000050');
  assert.deepEqual(events, ['create', 'group', 'database', 'send']);
});

test('employee invitation delivery failure deletes the Cognito user', async () => {
  const events: string[] = [];
  const invitation = { email: 'delivery@example.com', displayName: 'Delivery' };
  const deliveryError = Object.assign(new Error('delivery failed'), {
    name: 'CodeDeliveryFailureException',
  });
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      if (command instanceof AdminCreateUserCommand) {
        if (command.input.MessageAction === 'SUPPRESS') {
          events.push('create');
          return { User: cognitoUser(invitation) };
        }
        events.push('send');
        throw deliveryError;
      }
      if (command instanceof AdminAddUserToGroupCommand) {
        events.push('group');
        return {};
      }
      if (command instanceof AdminDeleteUserCommand) {
        events.push('delete');
        return {};
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    },
  });

  await assert.rejects(
    administration.provisionEmployeeAccount(
      invitation,
      async (_account, sendInvitation) => sendInvitation(),
    ),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === 'EMPLOYEE_INVITATION_DELIVERY_FAILED' &&
      error.cause === deliveryError,
  );
  assert.deepEqual(events, ['create', 'group', 'send', 'delete']);
});

test('invitation email quota errors remain actionable with SES delivery', async () => {
  const events: string[] = [];
  const invitation = { email: 'quota@example.com', displayName: 'Quota' };
  const quotaError = Object.assign(new Error('Daily email limit exceeded'), {
    name: 'LimitExceededException',
  });
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      if (command instanceof AdminCreateUserCommand) {
        if (command.input.MessageAction === 'SUPPRESS') {
          events.push('create');
          return { User: cognitoUser(invitation) };
        }
        events.push('send');
        throw quotaError;
      }
      if (command instanceof AdminAddUserToGroupCommand) {
        events.push('group');
        return {};
      }
      if (command instanceof AdminDeleteUserCommand) {
        events.push('delete');
        return {};
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    },
  });

  await assert.rejects(
    administration.provisionEmployeeAccount(
      invitation,
      async (_account, sendInvitation) => sendInvitation(),
    ),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 503 &&
      error.code === 'EMPLOYEE_INVITATION_EMAIL_QUOTA_EXCEEDED' &&
      error.message.includes('Try again later') &&
      error.cause === quotaError,
  );
  assert.deepEqual(events, ['create', 'group', 'send', 'delete']);
});

test('an existing Cognito email returns the employee account conflict', async () => {
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      if (command instanceof AdminCreateUserCommand) {
        throw Object.assign(new Error('account exists'), {
          name: 'UsernameExistsException',
        });
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    },
  });

  await assert.rejects(
    administration.provisionEmployeeAccount(
      { email: 'existing@example.com', displayName: 'Existing' },
      async () => undefined,
    ),
    (error: unknown) =>
      error instanceof AppError && error.code === 'EMPLOYEE_ACCOUNT_EXISTS',
  );
});

test('employee persistence failure is preserved after Cognito cleanup', async () => {
  const events: string[] = [];
  const invitation = { email: 'database@example.com', displayName: 'Database' };
  const persistenceError = new AppError(
    409,
    'EMPLOYEE_EMAIL_EXISTS',
    'Employee exists.',
  );
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      if (command instanceof AdminCreateUserCommand) {
        events.push('create');
        return { User: cognitoUser(invitation) };
      }
      if (command instanceof AdminAddUserToGroupCommand) {
        events.push('group');
        return {};
      }
      if (command instanceof AdminDeleteUserCommand) {
        events.push('delete');
        return {};
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    },
  });

  await assert.rejects(
    administration.provisionEmployeeAccount(invitation, async () => {
      events.push('database');
      throw persistenceError;
    }),
    (error: unknown) => error === persistenceError,
  );
  assert.deepEqual(events, ['create', 'group', 'database', 'delete']);
});

test('Cognito cleanup failure returns the dedicated rollback error', async () => {
  const invitation = { email: 'cleanup@example.com', displayName: 'Cleanup' };
  let rollbackLogged = false;
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      if (command instanceof AdminCreateUserCommand) {
        return { User: cognitoUser(invitation) };
      }
      if (command instanceof AdminAddUserToGroupCommand) return {};
      if (command instanceof AdminDeleteUserCommand) {
        throw new Error('cleanup failed');
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    },
  });

  await assert.rejects(
    administration.provisionEmployeeAccount(
      invitation,
      async () => {
        throw new Error('database failed');
      },
      () => {
        rollbackLogged = true;
      },
    ),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === 'EMPLOYEE_ACCOUNT_ROLLBACK_FAILED',
  );
  assert.equal(rollbackLogged, true);
});

test('employee account listing paginates the employee group and preserves subjects internally', async () => {
  const invitation = { email: 'pending@example.com', displayName: 'Pending' };
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      assert.ok(command instanceof ListUsersInGroupCommand);
      assert.equal(command.input.GroupName, 'employee');
      if (!command.input.NextToken) {
        return {
          Users: [cognitoUser(invitation)],
          NextToken: 'next-page',
        };
      }
      return {
        Users: [
          {
            ...cognitoUser({
              email: 'confirmed@example.com',
              displayName: 'Confirmed',
            }),
            Username: 'confirmed-username',
            UserStatus: 'CONFIRMED',
            Attributes: [
              {
                Name: 'sub',
                Value: '20000000-0000-4000-8000-000000000051',
              },
              { Name: 'email', Value: 'confirmed@example.com' },
              { Name: 'name', Value: 'Confirmed' },
            ],
          },
        ],
      };
    },
  });

  const accounts = await administration.listEmployeeAccounts();

  assert.deepEqual(
    accounts.map(({ subject, email, status }) => ({ subject, email, status })),
    [
      {
        subject: '20000000-0000-4000-8000-000000000050',
        email: invitation.email,
        status: 'FORCE_CHANGE_PASSWORD',
      },
      {
        subject: '20000000-0000-4000-8000-000000000051',
        email: 'confirmed@example.com',
        status: 'CONFIRMED',
      },
    ],
  );
});

test('pending employee invitations can be resent by immutable subject', async () => {
  const events: string[] = [];
  const invitation = { email: 'pending@example.com', displayName: 'Pending' };
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      if (command instanceof ListUsersInGroupCommand) {
        events.push('lookup');
        return { Users: [cognitoUser(invitation)] };
      }
      if (command instanceof AdminCreateUserCommand) {
        events.push('resend');
        assert.equal(command.input.Username, invitation.email);
        assert.equal(command.input.MessageAction, 'RESEND');
        assert.deepEqual(command.input.DesiredDeliveryMediums, ['EMAIL']);
        return {};
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    },
  });

  const account = await administration.resendEmployeeInvitation(
    '20000000-0000-4000-8000-000000000050',
    invitation.email,
  );

  assert.equal(account.status, 'FORCE_CHANGE_PASSWORD');
  assert.equal(account.resendCooldownActive, true);
  assert.deepEqual(events, ['lookup', 'resend']);
});

test('concurrent employee invitation resends are coalesced and briefly rate limited', async () => {
  const events: string[] = [];
  const invitation = { email: 'pending@example.com', displayName: 'Pending' };
  let currentTime = 10_000;
  let releaseResend!: () => void;
  const resendGate = new Promise<void>((resolve) => {
    releaseResend = resolve;
  });
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    now: () => currentTime,
    resendCooldownMs: 30_000,
    send: async (command) => {
      if (command instanceof ListUsersInGroupCommand) {
        events.push('lookup');
        return { Users: [cognitoUser(invitation)] };
      }
      if (command instanceof AdminCreateUserCommand) {
        events.push('resend');
        await resendGate;
        return {};
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    },
  });

  const first = administration.resendEmployeeInvitation(
    '20000000-0000-4000-8000-000000000050',
    invitation.email,
  );
  const duplicate = administration.resendEmployeeInvitation(
    '20000000-0000-4000-8000-000000000050',
    invitation.email,
  );

  assert.equal(first, duplicate);
  releaseResend();
  await Promise.all([first, duplicate]);
  assert.deepEqual(events, ['lookup', 'resend']);

  currentTime += 1_000;
  await assert.rejects(
    administration.resendEmployeeInvitation(
      '20000000-0000-4000-8000-000000000050',
      invitation.email,
    ),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 429 &&
      error.code === 'EMPLOYEE_INVITATION_RECENTLY_ATTEMPTED',
  );
  assert.deepEqual(events, ['lookup', 'resend']);

  currentTime = 40_001;
  await administration.resendEmployeeInvitation(
    '20000000-0000-4000-8000-000000000050',
    invitation.email,
  );
  assert.deepEqual(events, ['lookup', 'resend', 'lookup', 'resend']);
});

test('an explicit resend delivery failure never deletes the existing Cognito user', async () => {
  const events: string[] = [];
  const invitation = { email: 'pending@example.com', displayName: 'Pending' };
  const deliveryError = Object.assign(new Error('delivery failed'), {
    name: 'CodeDeliveryFailureException',
  });
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    now: () => 10_000,
    send: async (command) => {
      if (command instanceof ListUsersInGroupCommand) {
        events.push('lookup');
        return { Users: [cognitoUser(invitation)] };
      }
      if (command instanceof AdminCreateUserCommand) {
        events.push('resend');
        throw deliveryError;
      }
      if (command instanceof AdminDeleteUserCommand) {
        events.push('delete');
        return {};
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    },
  });

  await assert.rejects(
    administration.resendEmployeeInvitation(
      '20000000-0000-4000-8000-000000000050',
      invitation.email,
    ),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === 'EMPLOYEE_INVITATION_DELIVERY_FAILED' &&
      error.cause === deliveryError,
  );
  assert.deepEqual(events, ['lookup', 'resend']);

  await assert.rejects(
    administration.resendEmployeeInvitation(
      '20000000-0000-4000-8000-000000000050',
      invitation.email,
    ),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === 'EMPLOYEE_INVITATION_RECENTLY_ATTEMPTED',
  );
  assert.deepEqual(events, ['lookup', 'resend']);
});

test('confirmed employee accounts cannot receive another invitation', async () => {
  let resendAttempted = false;
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      if (command instanceof ListUsersInGroupCommand) {
        return {
          Users: [
            {
              ...cognitoUser({
                email: 'confirmed@example.com',
                displayName: 'Confirmed',
              }),
              UserStatus: 'CONFIRMED',
            },
          ],
        };
      }
      resendAttempted = true;
      return {};
    },
  });

  await assert.rejects(
    administration.resendEmployeeInvitation(
      '20000000-0000-4000-8000-000000000050',
      'confirmed@example.com',
    ),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 409 &&
      error.code === 'EMPLOYEE_INVITATION_NOT_PENDING',
  );
  assert.equal(resendAttempted, false);
});

test('a Cognito state change during resend returns a pending-invitation conflict', async () => {
  const invitation = { email: 'race@example.com', displayName: 'Race' };
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      if (command instanceof ListUsersInGroupCommand) {
        return { Users: [cognitoUser(invitation)] };
      }
      if (command instanceof AdminCreateUserCommand) {
        throw Object.assign(new Error('state changed'), {
          name: 'UnsupportedUserStateException',
        });
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    },
  });

  await assert.rejects(
    administration.resendEmployeeInvitation(
      '20000000-0000-4000-8000-000000000050',
      invitation.email,
    ),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 409 &&
      error.code === 'EMPLOYEE_INVITATION_NOT_PENDING',
  );
});

test('resend rejects email drift between the employee record and Cognito account', async () => {
  const invitation = { email: 'cognito@example.com', displayName: 'Drifted' };
  let resendAttempted = false;
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      if (command instanceof ListUsersInGroupCommand) {
        return { Users: [cognitoUser(invitation)] };
      }
      resendAttempted = true;
      return {};
    },
  });

  await assert.rejects(
    administration.resendEmployeeInvitation(
      '20000000-0000-4000-8000-000000000050',
      'database@example.com',
    ),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 409 &&
      error.code === 'EMPLOYEE_ACCOUNT_EMAIL_MISMATCH',
  );
  assert.equal(resendAttempted, false);
});

test('missing and disabled employee accounts fail closed during resend', async () => {
  const missingAdministration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      assert.ok(command instanceof ListUsersInGroupCommand);
      return { Users: [] };
    },
  });
  await assert.rejects(
    missingAdministration.resendEmployeeInvitation(
      '20000000-0000-4000-8000-000000000099',
      'missing@example.com',
    ),
    (error: unknown) =>
      error instanceof AppError && error.code === 'EMPLOYEE_ACCOUNT_MISSING',
  );

  const disabledAdministration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async (command) => {
      assert.ok(command instanceof ListUsersInGroupCommand);
      return {
        Users: [
          {
            ...cognitoUser({
              email: 'disabled@example.com',
              displayName: 'Disabled',
            }),
            Enabled: false,
          },
        ],
      };
    },
  });
  await assert.rejects(
    disabledAdministration.resendEmployeeInvitation(
      '20000000-0000-4000-8000-000000000050',
      'disabled@example.com',
    ),
    (error: unknown) =>
      error instanceof AppError && error.code === 'EMPLOYEE_ACCOUNT_DISABLED',
  );
});

test('employee account lookup permission failures have a dedicated error', async () => {
  const accessDenied = Object.assign(new Error('denied'), {
    name: 'AccessDeniedException',
  });
  const administration = createCognitoAdministration({
    poolId: 'pool-1',
    send: async () => {
      throw accessDenied;
    },
  });

  await assert.rejects(
    administration.listEmployeeAccounts(),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 502 &&
      error.code === 'EMPLOYEE_ACCOUNT_LOOKUP_NOT_AUTHORIZED' &&
      error.cause === accessDenied,
  );
});
