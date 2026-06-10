import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { buildDatabaseUrl } from '../dist/config.js';

if (process.env.NODE_ENV !== 'production') {
  throw new Error('NODE_ENV=production is required.');
}

const secretArn = process.env.DATABASE_SECRET_ARN;
const caCertPath = process.env.RDS_CA_CERT_PATH;
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

if (!secretArn || !caCertPath || !region) {
  throw new Error(
    'DATABASE_SECRET_ARN, RDS_CA_CERT_PATH, and AWS_REGION are required.',
  );
}

const response = await new SecretsManagerClient({ region }).send(
  new GetSecretValueCommand({ SecretId: secretArn }),
);

if (!response.SecretString) {
  throw new Error('The configured database secret does not contain SecretString.');
}

const databaseUrl = buildDatabaseUrl(
  JSON.parse(response.SecretString),
  caCertPath,
  {
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    database: process.env.DATABASE_NAME,
  },
);
const serverDirectory = fileURLToPath(new URL('..', import.meta.url));
const result = spawnSync('npm', ['run', 'prisma:migrate'], {
  cwd: serverDirectory,
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
  },
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
