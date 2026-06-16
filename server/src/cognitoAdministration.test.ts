import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
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

test('Cognito daily email quota has a specific actionable error', async () => {
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
      error.message.includes('09:00 UTC') &&
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
