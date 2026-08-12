import 'dotenv/config';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

type DatabaseSecret = {
  username?: string;
  password?: string;
  host?: string;
  port?: number | string;
  dbname?: string;
  database?: string;
};

type DatabaseLocation = {
  host?: string;
  port?: number | string;
  database?: string;
};

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  authMode: process.env.AUTH_MODE || (process.env.NODE_ENV === 'production' ? 'cognito' : 'development'),
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
  cognitoClientId: process.env.COGNITO_CLIENT_ID,
  databaseSecretArn: process.env.DATABASE_SECRET_ARN,
  databaseHost: process.env.DATABASE_HOST,
  databasePort: process.env.DATABASE_PORT,
  databaseName: process.env.DATABASE_NAME,
  rdsCaCertPath: process.env.RDS_CA_CERT_PATH,
  awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
};

export function buildDatabaseUrl(
  secret: DatabaseSecret,
  caCertPath: string,
  location: DatabaseLocation = {},
) {
  const host = secret.host || location.host;
  const port = secret.port || location.port || 5432;
  const database = secret.dbname || secret.database || location.database;

  if (!secret.username || !secret.password || !host || !database) {
    throw new Error('Database secret must contain username, password, host, and dbname.');
  }

  if (!caCertPath) {
    throw new Error('RDS_CA_CERT_PATH must point to the trusted RDS root CA certificate.');
  }

  const url = new URL('postgresql://placeholder');
  url.username = secret.username;
  url.password = secret.password;
  url.hostname = host;
  url.port = String(port);
  url.pathname = database;
  url.searchParams.set('schema', 'public');
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'strict');
  url.searchParams.set('sslcert', caCertPath);

  return url.toString();
}

export function validateProductionDatabaseUrl(value: string) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }

  if (
    url.searchParams.get('sslmode') !== 'require' ||
    url.searchParams.get('sslaccept') !== 'strict' ||
    !url.searchParams.get('sslcert')
  ) {
    throw new Error(
      'Production DATABASE_URL must set sslmode=require, sslaccept=strict, and sslcert.',
    );
  }
}

export function validateDatabaseConfiguration({
  nodeEnv,
  databaseUrl,
  databaseSecretArn,
}: {
  nodeEnv: string;
  databaseUrl?: string;
  databaseSecretArn?: string;
}) {
  if (nodeEnv !== 'production') return;

  if (databaseSecretArn && databaseUrl) {
    throw new Error(
      'Production must configure DATABASE_SECRET_ARN without DATABASE_URL.',
    );
  }

  if (databaseUrl) validateProductionDatabaseUrl(databaseUrl);
}

export async function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return;
  }

  if (!config.databaseSecretArn) {
    throw new Error('DATABASE_URL or DATABASE_SECRET_ARN must be configured.');
  }

  const client = new SecretsManagerClient({ region: config.awsRegion });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: config.databaseSecretArn }),
  );

  if (!response.SecretString) {
    throw new Error('The configured database secret does not contain SecretString.');
  }

  const secret = JSON.parse(response.SecretString) as DatabaseSecret;
  process.env.DATABASE_URL = buildDatabaseUrl(
    secret,
    config.rdsCaCertPath || '',
    {
      host: config.databaseHost,
      port: config.databasePort,
      database: config.databaseName,
    },
  );
}

export function validateProductionConfig() {
  if (config.authMode === 'development' && config.nodeEnv === 'production') {
    throw new Error('Development authentication cannot be used in production.');
  }

  validateDatabaseConfiguration({
    nodeEnv: config.nodeEnv,
    databaseUrl: process.env.DATABASE_URL,
    databaseSecretArn: config.databaseSecretArn,
  });

  if (
    config.authMode === 'cognito' &&
    (!config.cognitoUserPoolId || !config.cognitoClientId)
  ) {
    throw new Error('COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are required.');
  }

  if (
    config.nodeEnv === 'production' &&
    config.databaseSecretArn &&
    !config.rdsCaCertPath
  ) {
    throw new Error(
      'RDS_CA_CERT_PATH is required with DATABASE_SECRET_ARN in production.',
    );
  }

  if (
    config.nodeEnv === 'production' &&
    config.databaseSecretArn &&
    (!config.databaseHost || !config.databaseName)
  ) {
    throw new Error(
      'DATABASE_HOST and DATABASE_NAME are required with DATABASE_SECRET_ARN in production.',
    );
  }

}
