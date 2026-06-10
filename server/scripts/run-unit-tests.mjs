import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const serverDirectory = fileURLToPath(new URL('..', import.meta.url));
const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url));
const testFiles = readdirSync(sourceDirectory)
  .filter((file) => file.endsWith('.test.ts'))
  .sort()
  .map((file) => `src/${file}`);
const environment = {
  ...process.env,
  NODE_ENV: 'test',
  AUTH_MODE: 'development',
  DOTENV_CONFIG_PATH: fileURLToPath(
    new URL('../.env.unit-tests-disabled', import.meta.url),
  ),
};

for (const name of [
  'DATABASE_URL',
  'DATABASE_SECRET_ARN',
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'RDS_CA_CERT_PATH',
  'TEST_DATABASE_URL',
]) {
  delete environment[name];
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...testFiles],
  {
    cwd: serverDirectory,
    env: environment,
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);

