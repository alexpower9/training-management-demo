import 'dotenv/config';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  authMode: process.env.AUTH_MODE || (process.env.NODE_ENV === 'production' ? 'cognito' : 'development'),
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
  cognitoClientId: process.env.COGNITO_CLIENT_ID,
  databaseSecretArn: process.env.DATABASE_SECRET_ARN,
  awsRegion: process.env.AWS_REGION || 'ca-central-1',
};

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

  const secret = JSON.parse(response.SecretString);
  const database = secret.dbname || secret.database;

  if (!secret.username || !secret.password || !secret.host || !database) {
    throw new Error('Database secret must contain username, password, host, and dbname.');
  }

  const username = encodeURIComponent(secret.username);
  const password = encodeURIComponent(secret.password);
  const port = secret.port || 5432;

  process.env.DATABASE_URL =
    `postgresql://${username}:${password}@${secret.host}:${port}/${database}` +
    '?schema=public&sslmode=require';
}

export function validateProductionConfig() {
  if (config.authMode === 'development' && config.nodeEnv === 'production') {
    throw new Error('Development authentication cannot be used in production.');
  }

  if (
    config.authMode === 'cognito' &&
    (!config.cognitoUserPoolId || !config.cognitoClientId)
  ) {
    throw new Error('COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are required.');
  }
}
