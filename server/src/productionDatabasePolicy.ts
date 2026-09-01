import type { PrismaClient } from '@prisma/client';

export const catalogueTables = ['employee', 'site', 'course', 'medical'] as const;
export const assignmentTables = [
  'site_course_requirement',
  'site_medical_requirement',
] as const;
export const completionTables = [
  'course_completion',
  'medical_completion',
] as const;
export const pendingCompletionTables = [
  'course_pending_completion',
  'medical_pending_completion',
] as const;
export const businessTables = [
  ...catalogueTables,
  ...assignmentTables,
  ...completionTables,
  ...pendingCompletionTables,
] as const;
export const voidColumns = [
  'voided_at',
  'voided_by_subject',
  'void_reason',
] as const;
export const pendingResolutionColumns = [
  'resolution',
  'resolved_at',
  'resolved_by_subject',
  'cancellation_reason',
  'completion_id',
] as const;

export const runtimeTablePolicy = Object.freeze({
  catalogue: Object.freeze({
    tables: catalogueTables,
    select: true,
    insert: true,
    update: true,
    delete: false,
  }),
  assignment: Object.freeze({
    tables: assignmentTables,
    select: true,
    insert: true,
    update: false,
    delete: true,
  }),
  completion: Object.freeze({
    tables: completionTables,
    select: true,
    insert: true,
    update: false,
    delete: false,
    updateColumns: voidColumns,
  }),
  pendingCompletion: Object.freeze({
    tables: pendingCompletionTables,
    select: true,
    insert: true,
    update: false,
    delete: false,
    updateColumns: pendingResolutionColumns,
  }),
});

const assignmentTableSet = new Set<string>(assignmentTables);
const completionTableSet = new Set<string>(completionTables);
const pendingCompletionTableSet = new Set<string>(pendingCompletionTables);

export function quoteIdentifier(value: string) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error('Database secrets must contain a valid username.');
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteStringLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function qualifiedTable(name: string) {
  return quoteStringLiteral(`public.${name}`);
}

function privilegeCheck(
  tableName: string,
  privilege: string,
  grantOption = false,
) {
  const suffix = grantOption ? ' WITH GRANT OPTION' : '';
  return `has_table_privilege(current_user, ${qualifiedTable(tableName)}, ` +
    `${quoteStringLiteral(`${privilege}${suffix}`)})`;
}

export async function applyRuntimePrivileges(
  ownerClient: PrismaClient,
  ownerUsername: string,
  runtimeUsername: string,
) {
  const runtimeRole = quoteIdentifier(runtimeUsername);
  const ownerRole = quoteIdentifier(ownerUsername);
  const databaseNameValue = String(
    (
      await ownerClient.$queryRawUnsafe<Array<{ databaseName: string }>>(
        'SELECT current_database() AS "databaseName"',
      )
    )[0]?.databaseName || '',
  );
  const databaseName = quoteIdentifier(databaseNameValue);
  const tables = (names: readonly string[]) =>
    names.map((name) => `public.${quoteIdentifier(name)}`).join(', ');
  const completionList = tables(completionTables);
  const voidColumnList = voidColumns.map(quoteIdentifier).join(', ');
  const pendingCompletionList = tables(pendingCompletionTables);
  const pendingResolutionColumnList = pendingResolutionColumns
    .map(quoteIdentifier)
    .join(', ');

  await ownerClient.$transaction([
    ownerClient.$executeRawUnsafe(
      `REVOKE CONNECT, CREATE, TEMP ON DATABASE ${databaseName} FROM PUBLIC`,
    ),
    ownerClient.$executeRawUnsafe(
      `REVOKE ALL PRIVILEGES ON DATABASE ${databaseName} FROM ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE ${databaseName} TO ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC',
    ),
    ownerClient.$executeRawUnsafe(
      `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC',
    ),
    ownerClient.$executeRawUnsafe(
      `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC',
    ),
    ownerClient.$executeRawUnsafe(
      `REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC'),
    ownerClient.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE ${tables(catalogueTables)} TO ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `GRANT SELECT, INSERT, DELETE ON TABLE ${tables(assignmentTables)} TO ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `GRANT SELECT, INSERT ON TABLE ${completionList} TO ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `GRANT UPDATE (${voidColumnList}) ON TABLE ${completionList} TO ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `GRANT SELECT, INSERT ON TABLE ${pendingCompletionList} TO ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `GRANT UPDATE (${pendingResolutionColumnList}) ON TABLE ` +
        `${pendingCompletionList} TO ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public ` +
        `REVOKE ALL PRIVILEGES ON TABLES FROM ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} ` +
        `REVOKE ALL PRIVILEGES ON TABLES FROM ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} ` +
        'REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC',
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public ` +
        'REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC',
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public ` +
        `REVOKE ALL PRIVILEGES ON SEQUENCES FROM ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} ` +
        `REVOKE ALL PRIVILEGES ON SEQUENCES FROM ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} ` +
        'REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC',
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public ` +
        'REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC',
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public ` +
        `REVOKE ALL PRIVILEGES ON FUNCTIONS FROM ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} ` +
        `REVOKE ALL PRIVILEGES ON FUNCTIONS FROM ${runtimeRole}`,
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} ` +
        'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
    ),
    ownerClient.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public ` +
        'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
    ),
  ]);
}

type BooleanRecord = Record<string, boolean | string | number | null>;

function assertFalse(value: unknown, message: string) {
  if (value !== false) throw new Error(message);
}

export async function verifyRuntimePrivileges(
  runtimeClient: PrismaClient,
  runtimeUsername: string,
) {
  const [server] = await runtimeClient.$queryRawUnsafe<Array<{ version: number }>>(
    `SELECT current_setting('server_version_num')::integer AS version`,
  );
  if (!server || server.version < 170000) {
    throw new Error('Production requires PostgreSQL 17 or newer.');
  }

  const [role] = await runtimeClient.$queryRawUnsafe<Array<BooleanRecord>>(`
    SELECT current_user AS "currentUser", session_user AS "sessionUser",
      rolcanlogin AS "canLogin", rolsuper AS "isSuperuser",
      rolcreatedb AS "canCreateDatabase", rolcreaterole AS "canCreateRole",
      rolreplication AS "canReplicate", rolbypassrls AS "canBypassRls",
      rolinherit AS "inheritsPrivileges"
    FROM pg_catalog.pg_roles WHERE rolname = current_user
  `);
  if (
    !role ||
    role.currentUser !== runtimeUsername ||
    role.sessionUser !== runtimeUsername ||
    role.canLogin !== true ||
    role.isSuperuser !== false ||
    role.canCreateDatabase !== false ||
    role.canCreateRole !== false ||
    role.canReplicate !== false ||
    role.canBypassRls !== false ||
    role.inheritsPrivileges !== false
  ) {
    throw new Error('Runtime database role attributes do not match policy.');
  }

  const memberships = await runtimeClient.$queryRawUnsafe<Array<{ roleName: string }>>(`
    SELECT granted.rolname AS "roleName"
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
    WHERE member.rolname = current_user
  `);
  if (memberships.length) {
    throw new Error('Runtime database role must not belong to another role.');
  }

  const settableRoles = await runtimeClient.$queryRawUnsafe<Array<{ roleName: string }>>(`
    SELECT role.rolname AS "roleName"
    FROM pg_catalog.pg_roles role
    WHERE role.rolname <> current_user
      AND pg_catalog.pg_has_role(current_user, role.oid, 'SET')
    LIMIT 1
  `);
  if (settableRoles.length) {
    throw new Error('Runtime database role must not be able to SET another role.');
  }

  const [database] = await runtimeClient.$queryRawUnsafe<Array<BooleanRecord>>(`
    SELECT
      has_database_privilege(current_user, current_database(), 'CONNECT') AS "canConnect",
      has_database_privilege(current_user, current_database(), 'CREATE') AS "canCreate",
      has_database_privilege(current_user, current_database(), 'TEMP') AS "canTemp",
      pg_catalog.pg_get_userbyid(database.datdba) = current_user AS "ownsDatabase"
    FROM pg_catalog.pg_database database
    WHERE database.datname = current_database()
  `);
  if (
    !database ||
    database.canConnect !== true ||
    database.canCreate !== false ||
    database.canTemp !== false ||
    database.ownsDatabase !== false
  ) {
    throw new Error('Runtime database privileges do not match policy.');
  }

  const roleSettings = await runtimeClient.$queryRawUnsafe<Array<BooleanRecord>>(`
    SELECT 1 AS present
    FROM pg_catalog.pg_db_role_setting setting
    JOIN pg_catalog.pg_roles role ON role.oid = setting.setrole
    WHERE role.rolname = current_user
    LIMIT 1
  `);
  if (roleSettings.length) {
    throw new Error('Runtime database role must not override database settings.');
  }

  const [schema] = await runtimeClient.$queryRawUnsafe<Array<BooleanRecord>>(`
    SELECT has_schema_privilege(current_user, 'public', 'USAGE') AS "canUse",
      has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreate",
      pg_catalog.pg_get_userbyid(namespace.nspowner) = current_user AS "ownsSchema"
    FROM pg_catalog.pg_namespace namespace
    WHERE namespace.nspname = 'public'
  `);
  if (
    !schema ||
    schema.canUse !== true ||
    schema.canCreate !== false ||
    schema.ownsSchema !== false
  ) {
    throw new Error('Runtime database schema privileges do not match policy.');
  }

  const [dangerousParameters] = await runtimeClient.$queryRawUnsafe<
    Array<{
      canDisableTriggers: boolean;
      canAlterTriggerSetting: boolean;
      replicationRole: string;
    }>
  >(`
    SELECT has_parameter_privilege(
      current_user,
      'session_replication_role',
      'SET'
    ) AS "canDisableTriggers",
    has_parameter_privilege(
      current_user,
      'session_replication_role',
      'ALTER SYSTEM'
    ) AS "canAlterTriggerSetting",
    current_setting('session_replication_role') AS "replicationRole"
  `);
  if (
    !dangerousParameters ||
    dangerousParameters.canDisableTriggers !== false ||
    dangerousParameters.canAlterTriggerSetting !== false ||
    dangerousParameters.replicationRole !== 'origin'
  ) {
    throw new Error('Runtime database role must not disable database triggers.');
  }

  const ownedObjects = await runtimeClient.$queryRawUnsafe<Array<BooleanRecord>>(`
    SELECT 1 AS present
    FROM (
      SELECT tableowner AS owner FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
      UNION ALL
      SELECT sequenceowner AS owner FROM pg_catalog.pg_sequences
        WHERE schemaname = 'public'
      UNION ALL
      SELECT function_owner.rolname AS owner
        FROM pg_catalog.pg_proc routine
        JOIN pg_catalog.pg_namespace namespace
          ON namespace.oid = routine.pronamespace
        JOIN pg_catalog.pg_roles function_owner
          ON function_owner.oid = routine.proowner
        WHERE namespace.nspname = 'public'
    ) objects
    WHERE objects.owner = current_user
    LIMIT 1
  `);
  if (ownedObjects.length) {
    throw new Error('Runtime database role must not own application objects.');
  }

  const executableFunctions = await runtimeClient.$queryRawUnsafe<Array<BooleanRecord>>(`
    SELECT routine.oid AS "functionId"
    FROM pg_catalog.pg_proc routine
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND has_function_privilege(current_user, routine.oid, 'EXECUTE')
    LIMIT 1
  `);
  if (executableFunctions.length) {
    throw new Error('Runtime database role must not execute application functions.');
  }

  const tableValues = businessTables
    .map((name) => `(${quoteStringLiteral(name)})`)
    .join(',\n      ');
  const tablePrivileges = await runtimeClient.$queryRawUnsafe<Array<BooleanRecord>>(`
    SELECT table_name AS "tableName",
      has_table_privilege(current_user, format('%I.%I', 'public', table_name), 'SELECT') AS "canSelect",
      has_table_privilege(current_user, format('%I.%I', 'public', table_name), 'INSERT') AS "canInsert",
      has_table_privilege(current_user, format('%I.%I', 'public', table_name), 'UPDATE') AS "canUpdate",
      has_table_privilege(current_user, format('%I.%I', 'public', table_name), 'DELETE') AS "canDelete",
      has_table_privilege(current_user, format('%I.%I', 'public', table_name), 'TRUNCATE') AS "canTruncate",
      has_table_privilege(current_user, format('%I.%I', 'public', table_name), 'REFERENCES') AS "canReference",
      has_table_privilege(current_user, format('%I.%I', 'public', table_name), 'TRIGGER') AS "canTrigger",
      has_table_privilege(current_user, format('%I.%I', 'public', table_name), 'MAINTAIN') AS "canMaintain"
    FROM (VALUES ${tableValues}) AS policy(table_name)
    ORDER BY table_name
  `);
  if (tablePrivileges.length !== businessTables.length) {
    throw new Error('Runtime database table privilege verification was incomplete.');
  }
  for (const privileges of tablePrivileges) {
    const tableName = String(privileges.tableName);
    const expectedUpdate =
      !assignmentTableSet.has(tableName) &&
      !completionTableSet.has(tableName) &&
      !pendingCompletionTableSet.has(tableName);
    const expectedDelete = assignmentTableSet.has(tableName);
    if (
      privileges.canSelect !== true ||
      privileges.canInsert !== true ||
      privileges.canUpdate !== expectedUpdate ||
      privileges.canDelete !== expectedDelete
    ) {
      throw new Error(`Runtime CRUD privileges do not match policy for ${tableName}.`);
    }
    for (const [key, value] of Object.entries(privileges)) {
      if (['canTruncate', 'canReference', 'canTrigger', 'canMaintain'].includes(key)) {
        assertFalse(value, `Runtime elevated privilege ${key} exists on ${tableName}.`);
      }
    }
  }

  for (const tableName of businessTables) {
    const columns = await runtimeClient.$queryRawUnsafe<Array<BooleanRecord>>(`
      SELECT column_name AS "columnName",
        has_column_privilege(current_user, ${qualifiedTable(tableName)}, column_name, 'SELECT') AS "canSelect",
        has_column_privilege(current_user, ${qualifiedTable(tableName)}, column_name, 'INSERT') AS "canInsert",
        has_column_privilege(current_user, ${qualifiedTable(tableName)}, column_name, 'UPDATE') AS "canUpdate",
        has_column_privilege(current_user, ${qualifiedTable(tableName)}, column_name, 'REFERENCES') AS "canReference"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${quoteStringLiteral(tableName)}
    `);
    if (!columns.length) throw new Error(`Business table ${tableName} was not found.`);
    for (const column of columns) {
      const expectedUpdate = catalogueTables.includes(tableName as never) ||
        (completionTables.includes(tableName as never) &&
          voidColumns.includes(String(column.columnName) as never)) ||
        (pendingCompletionTables.includes(tableName as never) &&
          pendingResolutionColumns.includes(String(column.columnName) as never));
      if (
        column.canSelect !== true ||
        column.canInsert !== true ||
        column.canUpdate !== expectedUpdate ||
        column.canReference !== false
      ) {
        throw new Error(`Runtime column policy failed for ${tableName}.${column.columnName}.`);
      }
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
        const [grantable] = await runtimeClient.$queryRawUnsafe<
          Array<{ canGrant: boolean }>
        >(`
          SELECT has_column_privilege(
            current_user,
            ${qualifiedTable(tableName)},
            ${quoteStringLiteral(String(column.columnName))},
            ${quoteStringLiteral(`${privilege} WITH GRANT OPTION`)}
          ) AS "canGrant"
        `);
        if (!grantable || grantable.canGrant !== false) {
          throw new Error(
            `Runtime role holds a column grant option on ${tableName}.${column.columnName}.`,
          );
        }
      }
    }
  }

  for (const tableName of businessTables) {
    const [grantable] = await runtimeClient.$queryRawUnsafe<Array<BooleanRecord>>(`
      SELECT
        ${privilegeCheck(tableName, 'SELECT', true)} AS "selectGrant",
        ${privilegeCheck(tableName, 'INSERT', true)} AS "insertGrant",
        ${privilegeCheck(tableName, 'UPDATE', true)} AS "updateGrant",
        ${privilegeCheck(tableName, 'DELETE', true)} AS "deleteGrant"
    `);
    if (
      !grantable ||
      grantable.selectGrant !== false ||
      grantable.insertGrant !== false ||
      grantable.updateGrant !== false ||
      grantable.deleteGrant !== false
    ) {
      throw new Error(`Runtime role holds a table grant option on ${tableName}.`);
    }
  }

  const allowed = businessTables.map(quoteStringLiteral).join(', ');
  const unexpectedRelations = await runtimeClient.$queryRawUnsafe<Array<BooleanRecord>>(`
    SELECT relation.relname AS "relationName"
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname NOT IN (${allowed})
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND (
        CASE WHEN relation.relkind = 'S' THEN
          has_sequence_privilege(current_user, relation.oid, 'USAGE')
          OR has_sequence_privilege(current_user, relation.oid, 'SELECT')
          OR has_sequence_privilege(current_user, relation.oid, 'UPDATE')
        ELSE
          has_any_column_privilege(current_user, relation.oid, 'SELECT')
          OR has_any_column_privilege(current_user, relation.oid, 'INSERT')
          OR has_any_column_privilege(current_user, relation.oid, 'UPDATE')
          OR has_any_column_privilege(current_user, relation.oid, 'REFERENCES')
          OR has_table_privilege(current_user, relation.oid, 'DELETE')
          OR has_table_privilege(current_user, relation.oid, 'TRUNCATE')
          OR has_table_privilege(current_user, relation.oid, 'TRIGGER')
          OR has_table_privilege(current_user, relation.oid, 'MAINTAIN')
        END
      )
    LIMIT 1
  `);
  if (unexpectedRelations.length) {
    throw new Error('Runtime database role can access a relation outside its allowlist.');
  }
}
