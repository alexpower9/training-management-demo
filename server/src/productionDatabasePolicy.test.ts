import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignmentTables,
  businessTables,
  catalogueTables,
  completionTables,
  quoteIdentifier,
  runtimeTablePolicy,
  voidColumns,
} from './productionDatabasePolicy.js';

test('production database policy covers exactly eight independent business tables', () => {
  assert.equal(businessTables.length, 8);
  assert.equal(new Set(businessTables).size, 8);
  assert.deepEqual([...catalogueTables].sort(), [
    'course',
    'employee',
    'medical',
    'site',
  ]);
  assert.deepEqual([...assignmentTables].sort(), [
    'site_course_requirement',
    'site_medical_requirement',
  ]);
  assert.deepEqual([...completionTables].sort(), [
    'course_completion',
    'medical_completion',
  ]);
});

test('runtime policy restricts assignment deletion and completion updates', () => {
  assert.deepEqual(runtimeTablePolicy.assignment, {
    tables: assignmentTables,
    select: true,
    insert: true,
    update: false,
    delete: true,
  });
  assert.equal(runtimeTablePolicy.catalogue.delete, false);
  assert.equal(runtimeTablePolicy.completion.delete, false);
  assert.equal(runtimeTablePolicy.completion.update, false);
  assert.deepEqual(runtimeTablePolicy.completion.updateColumns, voidColumns);
  assert.deepEqual([...voidColumns], [
    'voided_at',
    'voided_by_subject',
    'void_reason',
  ]);
});

test('database role identifiers are quoted safely', () => {
  assert.equal(quoteIdentifier('runtime role'), '"runtime role"');
  assert.equal(quoteIdentifier('role"name'), '"role""name"');
  assert.throws(() => quoteIdentifier(''), /valid username/);
  assert.throws(() => quoteIdentifier('role\0name'), /valid username/);
});
