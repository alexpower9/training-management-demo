import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignmentTables,
  businessTables,
  catalogueTables,
  completionTables,
  pendingCompletionTables,
  pendingResolutionColumns,
  quoteIdentifier,
  runtimeTablePolicy,
  voidColumns,
} from './productionDatabasePolicy.js';

test('production database policy covers exactly ten independent business tables', () => {
  assert.equal(businessTables.length, 10);
  assert.equal(new Set(businessTables).size, 10);
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
  assert.deepEqual([...pendingCompletionTables].sort(), [
    'course_pending_completion',
    'medical_pending_completion',
  ]);
});

test('runtime policy restricts assignment deletion and history updates', () => {
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
  assert.equal(runtimeTablePolicy.pendingCompletion.delete, false);
  assert.equal(runtimeTablePolicy.pendingCompletion.update, false);
  assert.deepEqual(
    runtimeTablePolicy.pendingCompletion.updateColumns,
    pendingResolutionColumns,
  );
  assert.deepEqual([...pendingResolutionColumns], [
    'resolution',
    'resolved_at',
    'resolved_by_subject',
    'cancellation_reason',
    'completion_id',
  ]);
});

test('database role identifiers are quoted safely', () => {
  assert.equal(quoteIdentifier('runtime role'), '"runtime role"');
  assert.equal(quoteIdentifier('role"name'), '"role""name"');
  assert.throws(() => quoteIdentifier(''), /valid username/);
  assert.throws(() => quoteIdentifier('role\0name'), /valid username/);
});
