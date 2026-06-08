import { spawnSync } from 'node:child_process';

export function getTestEnvironment() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests.');
  }

  const parsed = new URL(testDatabaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '');

  if (databaseName !== 'nme_training_test') {
    throw new Error(
      `Refusing destructive test setup for database "${databaseName}". ` +
        'TEST_DATABASE_URL must target nme_training_test.',
    );
  }

  return {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    NODE_ENV: 'test',
    AUTH_MODE: 'development',
  };
}

export function run(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: new URL('..', import.meta.url),
    env: environment,
    stdio: 'inherit',
  });

  if (result.status !== 0) process.exit(result.status || 1);
}

export function resetTestDatabase(environment) {
  run(
    'npm',
    ['exec', 'prisma', 'migrate', 'reset', '--', '--force', '--skip-seed'],
    environment,
  );
}
