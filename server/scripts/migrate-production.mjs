import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { buildDatabaseUrl } from '../dist/config.js';
import {
  applyRuntimePrivileges,
  verifyRuntimePrivileges,
} from '../dist/productionDatabasePolicy.js';

function parseSecret(response) {
  if (!response.SecretString) {
    throw new Error('A configured database secret does not contain SecretString.');
  }

  let secret;
  try {
    secret = JSON.parse(response.SecretString);
  } catch {
    throw new Error('A configured database secret does not contain valid JSON.');
  }

  if (!secret || typeof secret !== 'object' || Array.isArray(secret)) {
    throw new Error('A configured database secret must contain a JSON object.');
  }

  return secret;
}

function createDatabaseClient(databaseUrl) {
  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
}

function resolveDatabaseTarget(secret, fallback) {
  return {
    host: String(secret.host || fallback.host || '').toLowerCase(),
    port: String(secret.port || fallback.port || 5432),
    database: String(secret.dbname || secret.database || fallback.database || ''),
  };
}

async function preflightMigrationOwner(ownerClient, ownerUsername) {
  const [identity] = await ownerClient.$queryRawUnsafe(`
    SELECT current_user AS "currentUser",
      current_setting('server_version_num')::integer AS "serverVersion",
      pg_catalog.pg_get_userbyid(database.datdba) AS "databaseOwner",
      pg_catalog.pg_get_userbyid(namespace.nspowner) AS "schemaOwner"
    FROM pg_catalog.pg_database database
    CROSS JOIN pg_catalog.pg_namespace namespace
    WHERE database.datname = current_database()
      AND namespace.nspname = 'public'
  `);
  if (
    !identity ||
    identity.currentUser !== ownerUsername ||
    identity.serverVersion < 170000 ||
    identity.databaseOwner !== ownerUsername ||
    identity.schemaOwner !== ownerUsername
  ) {
    throw new Error(
      'Migration preflight requires PostgreSQL 17 and a migration role that owns the database and public schema.',
    );
  }


  const unexpectedOwners = await ownerClient.$queryRawUnsafe(`
    SELECT object_name AS "objectName"
    FROM (
      SELECT relation.relname AS object_name,
        pg_catalog.pg_get_userbyid(relation.relowner) AS object_owner
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
      UNION ALL
      SELECT routine.proname AS object_name,
        pg_catalog.pg_get_userbyid(routine.proowner) AS object_owner
      FROM pg_catalog.pg_proc routine
      JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname = 'public'
    ) objects
    WHERE object_owner <> current_user
    LIMIT 1
  `);
  if (unexpectedOwners.length) {
    throw new Error(
      'The migration role must own every existing table, sequence, view, and function in public.',
    );
  }
}

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('NODE_ENV=production is required.');
  }

  const migrationSecretArn = process.env.MIGRATION_DATABASE_SECRET_ARN;
  const runtimeSecretArn = process.env.DATABASE_SECRET_ARN;
  const caCertPath = process.env.RDS_CA_CERT_PATH;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

  if (!migrationSecretArn || !runtimeSecretArn || !caCertPath || !region) {
    throw new Error(
      'MIGRATION_DATABASE_SECRET_ARN, DATABASE_SECRET_ARN, RDS_CA_CERT_PATH, and AWS_REGION are required.',
    );
  }

  if (process.env.DATABASE_URL) {
    throw new Error(
      'Production migration configuration must not contain DATABASE_URL.',
    );
  }

  if (migrationSecretArn === runtimeSecretArn) {
    throw new Error('Migration and runtime database secrets must be distinct.');
  }

  const secretsClient = new SecretsManagerClient({ region });
  let migrationResponse;
  let runtimeResponse;
  try {
    [migrationResponse, runtimeResponse] = await Promise.all([
      secretsClient.send(
        new GetSecretValueCommand({ SecretId: migrationSecretArn }),
      ),
      secretsClient.send(
        new GetSecretValueCommand({ SecretId: runtimeSecretArn }),
      ),
    ]);
  } catch {
    throw new Error('Unable to retrieve the migration and runtime database secrets.');
  } finally {
    secretsClient.destroy();
  }

  if (
    migrationResponse.ARN &&
    runtimeResponse.ARN &&
    migrationResponse.ARN === runtimeResponse.ARN
  ) {
    throw new Error('Migration and runtime database secrets must be distinct.');
  }

  const migrationSecret = parseSecret(migrationResponse);
  const runtimeSecret = parseSecret(runtimeResponse);
  if (
    typeof migrationSecret.username !== 'string' ||
    typeof runtimeSecret.username !== 'string' ||
    migrationSecret.username === runtimeSecret.username
  ) {
    throw new Error('Migration and runtime database secrets must use distinct database roles.');
  }

  const databaseLocation = {
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    database: process.env.DATABASE_NAME,
  };
  const migrationTarget = resolveDatabaseTarget(
    migrationSecret,
    databaseLocation,
  );
  const runtimeTarget = resolveDatabaseTarget(runtimeSecret, databaseLocation);
  if (
    !migrationTarget.host ||
    !migrationTarget.database ||
    migrationTarget.host !== runtimeTarget.host ||
    migrationTarget.port !== runtimeTarget.port ||
    migrationTarget.database !== runtimeTarget.database
  ) {
    throw new Error('Migration and runtime database secrets must target the same database.');
  }

  const migrationDatabaseUrl = buildDatabaseUrl(
    migrationSecret,
    caCertPath,
    databaseLocation,
  );
  const runtimeDatabaseUrl = buildDatabaseUrl(
    runtimeSecret,
    caCertPath,
    databaseLocation,
  );
  const preflightClient = createDatabaseClient(migrationDatabaseUrl);
  try {
    await preflightMigrationOwner(preflightClient, migrationSecret.username);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown database error';
    throw new Error(`Migration database preflight failed: ${reason}`);
  } finally {
    await preflightClient.$disconnect();
  }
  const serverDirectory = fileURLToPath(new URL('..', import.meta.url));
  const migrationEnvironment = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE,
    NODE_ENV: 'production',
    DATABASE_URL: migrationDatabaseUrl,
  };

  const result = spawnSync('npm', ['run', 'prisma:migrate'], {
    cwd: serverDirectory,
    env: migrationEnvironment,
    stdio: 'inherit',
  });

  if (result.error || result.status !== 0) {
    throw new Error('Prisma migration deployment failed.');
  }

  const ownerClient = createDatabaseClient(migrationDatabaseUrl);
  try {
    await applyRuntimePrivileges(
      ownerClient,
      migrationSecret.username,
      runtimeSecret.username,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown database error';
    throw new Error(`Unable to apply the runtime database privilege policy: ${reason}`);
  } finally {
    await ownerClient.$disconnect();
  }

  const runtimeClient = createDatabaseClient(runtimeDatabaseUrl);
  try {
    await verifyRuntimePrivileges(runtimeClient, runtimeSecret.username);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown database error';
    throw new Error(`Runtime database credential or privilege verification failed: ${reason}`);
  } finally {
    await runtimeClient.$disconnect();
  }

  console.log('Production migrations and runtime database privilege checks completed.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Production migration failed.';
  console.error(`[migration] ERROR: ${message}`);
  process.exitCode = 1;
});
