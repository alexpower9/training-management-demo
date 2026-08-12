import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDatabaseUrl,
  validateDatabaseConfiguration,
  validateProductionDatabaseUrl,
} from './config.js';

test('database secret URLs require strict RDS certificate validation', () => {
  const value = buildDatabaseUrl(
    {
      username: 'app user',
      password: 'p@ss:/word',
      host: 'database.example.ca-central-1.rds.amazonaws.com',
      port: 5432,
      dbname: 'nme_training',
    },
    '/etc/pki/rds/rds-ca-rsa2048-g1.pem',
  );
  const url = new URL(value);

  assert.equal(url.username, 'app%20user');
  assert.equal(url.password, 'p%40ss%3A%2Fword');
  assert.equal(url.hostname, 'database.example.ca-central-1.rds.amazonaws.com');
  assert.equal(url.pathname, '/nme_training');
  assert.equal(url.searchParams.get('schema'), 'public');
  assert.equal(url.searchParams.get('sslmode'), 'require');
  assert.equal(url.searchParams.get('sslaccept'), 'strict');
  assert.equal(
    url.searchParams.get('sslcert'),
    '/etc/pki/rds/rds-ca-rsa2048-g1.pem',
  );
});

test('database secret URLs reject missing certificate paths', () => {
  assert.throws(
    () =>
      buildDatabaseUrl(
        {
          username: 'app',
          password: 'secret',
          host: 'database.example',
          dbname: 'nme_training',
        },
        '',
      ),
    /RDS_CA_CERT_PATH/,
  );
});

test('database URL location can come from protected environment metadata', () => {
  const value = buildDatabaseUrl(
    {
      username: 'app',
      password: 'secret',
    },
    '/etc/pki/rds/ca.pem',
    {
      host: 'database.example',
      port: '5432',
      database: 'nme_training',
    },
  );
  const url = new URL(value);

  assert.equal(url.hostname, 'database.example');
  assert.equal(url.pathname, '/nme_training');
});

test('production database URLs reject encryption without verification', () => {
  assert.throws(
    () =>
      validateProductionDatabaseUrl(
        'postgresql://app:secret@database.example/nme_training?sslmode=require',
      ),
    /sslaccept=strict/,
  );
});

test('production database URLs accept strict certificate verification', () => {
  assert.doesNotThrow(() =>
    validateProductionDatabaseUrl(
      'postgresql://app:secret@database.example/nme_training' +
        '?sslmode=require&sslaccept=strict&sslcert=%2Fetc%2Fpki%2Frds%2Fca.pem',
    ),
  );
});

test('production rejects ambiguous direct and secret database credentials', () => {
  assert.throws(
    () =>
      validateDatabaseConfiguration({
        nodeEnv: 'production',
        databaseUrl:
          'postgresql://app:secret@database.example/nme_training' +
          '?sslmode=require&sslaccept=strict&sslcert=%2Fetc%2Fpki%2Frds%2Fca.pem',
        databaseSecretArn: 'arn:aws:secretsmanager:region:account:secret:runtime',
      }),
    /without DATABASE_URL/,
  );
});

test('production still accepts a strict direct URL when no secret is configured', () => {
  assert.doesNotThrow(() =>
    validateDatabaseConfiguration({
      nodeEnv: 'production',
      databaseUrl:
        'postgresql://app:secret@database.example/nme_training' +
        '?sslmode=require&sslaccept=strict&sslcert=%2Fetc%2Fpki%2Frds%2Fca.pem',
    }),
  );
});
