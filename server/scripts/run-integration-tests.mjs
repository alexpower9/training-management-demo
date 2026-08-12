import {
  getTestEnvironment,
  resetTestDatabase,
  run,
} from './test-database.mjs';

try {
  const environment = getTestEnvironment();
  environment.RUN_PRODUCTION_POLICY_INTEGRATION = 'true';
  resetTestDatabase(environment);
  run('npm', ['exec', 'tsx', '--', '--test', 'src/integration.test.ts'], environment);
  run(
    'npm',
    ['exec', 'tsx', '--', '--test', 'src/productionDatabasePolicy.integration.test.ts'],
    environment,
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
