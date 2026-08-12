import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import {
  applyRuntimePrivileges,
  businessTables,
  verifyRuntimePrivileges,
} from './productionDatabasePolicy.js';

const testDatabaseUrl =
  process.env.RUN_PRODUCTION_POLICY_INTEGRATION === 'true'
    ? process.env.TEST_DATABASE_URL
    : undefined;
const shouldRun = Boolean(testDatabaseUrl);

test(
  'production runtime grants enforce the Medical and Training privilege policy',
  {
    skip: shouldRun
      ? false
      : 'Use npm run test:integration to run the production grant policy.',
  },
  async () => {
    const ownerUrl = new URL(testDatabaseUrl!);
    assert.equal(ownerUrl.pathname.replace(/^\//, ''), 'nme_training_test');

    const owner = new PrismaClient({
      datasources: { db: { url: ownerUrl.toString() } },
    });
    const suffix = `${process.pid}_${Date.now()}`;
    const migrationRole = `nme_migration_${suffix}`;
    const runtimeRole = `nme_policy_${suffix}`;
    const migrationPassword = `Migration-${suffix}-secret`;
    const runtimePassword = `Policy-${suffix}-secret`;
    const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
    let originalOwnerRole: string | undefined;
    let staleProbeTables: string[] = [];
    let migration: PrismaClient | undefined;
    let runtime: PrismaClient | undefined;

    try {
      const [ownerIdentity] = await owner.$queryRawUnsafe<Array<{ ownerRole: string }>>(
        'SELECT current_user AS "ownerRole"',
      );
      assert.ok(ownerIdentity);
      originalOwnerRole = ownerIdentity.ownerRole;
      const staleProbeRows = await owner.$queryRawUnsafe<
        Array<{ tableName: string }>
      >(`
        SELECT tablename AS "tableName"
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'policy_future_%'
      `);
      staleProbeTables = staleProbeRows.map((row) => row.tableName);
      for (const tableName of staleProbeTables) {
        await owner.$executeRawUnsafe(
          `DROP TABLE public.${quoteIdentifier(tableName)}`,
        );
      }
      await owner.$executeRawUnsafe(
        `CREATE ROLE ${quoteIdentifier(migrationRole)} LOGIN NOINHERIT ` +
          `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS ` +
          `PASSWORD ${quoteLiteral(migrationPassword)}`,
      );
      await owner.$executeRawUnsafe(
        `CREATE ROLE ${quoteIdentifier(runtimeRole)} LOGIN NOINHERIT ` +
          `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS ` +
          `PASSWORD ${quoteLiteral(runtimePassword)}`,
      );
      await owner.$executeRawUnsafe(
        `ALTER DATABASE ${quoteIdentifier('nme_training_test')} OWNER TO ` +
          quoteIdentifier(migrationRole),
      );
      await owner.$executeRawUnsafe(
        `ALTER SCHEMA public OWNER TO ${quoteIdentifier(migrationRole)}`,
      );
      for (const tableName of [...businessTables, '_prisma_migrations']) {
        await owner.$executeRawUnsafe(
          `ALTER TABLE public.${quoteIdentifier(tableName)} OWNER TO ` +
            quoteIdentifier(migrationRole),
        );
      }
      await owner.$executeRawUnsafe(
        `ALTER FUNCTION public.enforce_completion_void_only() OWNER TO ` +
          quoteIdentifier(migrationRole),
      );

      const migrationUrl = new URL(ownerUrl);
      migrationUrl.username = migrationRole;
      migrationUrl.password = migrationPassword;
      migration = new PrismaClient({
        datasources: { db: { url: migrationUrl.toString() } },
      });
      await migration.$executeRawUnsafe(
        `ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO ` +
          quoteIdentifier(runtimeRole),
      );
      await migration.$executeRawUnsafe(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC',
      );
      await migration.$executeRawUnsafe(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO PUBLIC',
      );
      await migration.$executeRawUnsafe(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC',
      );
      await applyRuntimePrivileges(migration, migrationRole, runtimeRole);
      await migration.$executeRawUnsafe(
        `CREATE TABLE public.${quoteIdentifier(`policy_future_${suffix}`)} ` +
          '(id integer PRIMARY KEY)',
      );
      await migration.$executeRawUnsafe(
        `CREATE SEQUENCE public.${quoteIdentifier(`policy_sequence_${suffix}`)}`,
      );
      await migration.$executeRawUnsafe(
        `CREATE FUNCTION public.${quoteIdentifier(`policy_function_${suffix}`)}() ` +
          'RETURNS integer LANGUAGE sql AS \'SELECT 1\'',
      );
      await migration.$executeRawUnsafe(
        `DROP TABLE public.${quoteIdentifier(`policy_future_${suffix}`)}`,
      );
      await migration.$executeRawUnsafe(
        `DROP SEQUENCE public.${quoteIdentifier(`policy_sequence_${suffix}`)}`,
      );
      await migration.$executeRawUnsafe(
        `DROP FUNCTION public.${quoteIdentifier(`policy_function_${suffix}`)}()`,
      );

      const runtimeUrl = new URL(ownerUrl);
      runtimeUrl.username = runtimeRole;
      runtimeUrl.password = runtimePassword;
      runtime = new PrismaClient({
        datasources: { db: { url: runtimeUrl.toString() } },
      });
      await verifyRuntimePrivileges(runtime, runtimeRole);

      const employeeId = crypto.randomUUID();
      await runtime.employee.create({
        data: {
          id: employeeId,
          displayName: 'Policy Employee',
          email: `policy.${suffix}@example.com`,
          cognitoSubject: crypto.randomUUID(),
        },
      });
      const medical = await runtime.medical.create({
        data: { name: `Policy Medical ${suffix}`, validityMonths: 12 },
      });
      const completion = await runtime.medicalCompletion.create({
        data: {
          employeeId,
          medicalId: medical.id,
          completedOn: new Date('2026-01-01T00:00:00.000Z'),
          expiresOn: new Date('2027-01-01T00:00:00.000Z'),
          validityMonthsApplied: 12,
          recordedBySubject: 'policy-test',
        },
      });
      await assert.rejects(
        runtime.medicalCompletion.update({
          where: { id: completion.id },
          data: { comment: 'History rewrite' },
        }),
      );
      await runtime.medicalCompletion.update({
        where: { id: completion.id },
        data: {
          voidedAt: new Date(),
          voidedBySubject: 'policy-test',
          voidReason: 'Policy void check',
        },
      });
      await assert.rejects(
        runtime.medicalCompletion.delete({ where: { id: completion.id } }),
      );

      const site = await runtime.site.create({
        data: {
          name: `Policy Site ${suffix}`,
          timeZone: 'America/St_Johns',
        },
      });
      await runtime.siteMedicalRequirement.create({
        data: { siteId: site.id, medicalId: medical.id },
      });
      await assert.rejects(
        runtime.siteMedicalRequirement.update({
          where: {
            siteId_medicalId: { siteId: site.id, medicalId: medical.id },
          },
          data: { medicalId: medical.id },
        }),
      );
      await runtime.siteMedicalRequirement.delete({
        where: {
          siteId_medicalId: { siteId: site.id, medicalId: medical.id },
        },
      });
    } finally {
      if (runtime) await runtime.$disconnect();
      if (migration) {
        await migration.medicalCompletion.deleteMany({
          where: { recordedBySubject: 'policy-test' },
        }).catch(() => undefined);
        await migration.siteMedicalRequirement.deleteMany({
          where: { site: { name: `Policy Site ${suffix}` } },
        }).catch(() => undefined);
        await migration.site.deleteMany({
          where: { name: `Policy Site ${suffix}` },
        }).catch(() => undefined);
        await migration.medical.deleteMany({
          where: { name: `Policy Medical ${suffix}` },
        }).catch(() => undefined);
        await migration.employee.deleteMany({
          where: { email: `policy.${suffix}@example.com` },
        }).catch(() => undefined);
        await migration.$executeRawUnsafe(
          `DROP TABLE IF EXISTS public.${quoteIdentifier(`policy_future_${suffix}`)}`,
        ).catch(() => undefined);
        await migration.$executeRawUnsafe(
          `DROP SEQUENCE IF EXISTS public.${quoteIdentifier(`policy_sequence_${suffix}`)}`,
        ).catch(() => undefined);
        await migration.$executeRawUnsafe(
          `DROP FUNCTION IF EXISTS public.${quoteIdentifier(`policy_function_${suffix}`)}()`,
        ).catch(() => undefined);
        await migration.$disconnect();
      }
      await owner.$executeRawUnsafe(
        `DROP OWNED BY ${quoteIdentifier(runtimeRole)}`,
      ).catch(() => undefined);
      await owner.$executeRawUnsafe(
        `DROP ROLE IF EXISTS ${quoteIdentifier(runtimeRole)}`,
      ).catch(() => undefined);
      if (originalOwnerRole) {
        await owner.$executeRawUnsafe(
          `REASSIGN OWNED BY ${quoteIdentifier(migrationRole)} TO ` +
            quoteIdentifier(originalOwnerRole),
        ).catch(() => undefined);
        await owner.$executeRawUnsafe(
          `DROP OWNED BY ${quoteIdentifier(migrationRole)}`,
        ).catch(() => undefined);
        await owner.$executeRawUnsafe(
          `DROP ROLE IF EXISTS ${quoteIdentifier(migrationRole)}`,
        ).catch(() => undefined);
      }
      await owner.$disconnect();
    }
  },
);
