import assert from 'node:assert/strict';
import test from 'node:test';
import demoData from '../../src/data/trainingDemoData.json' with { type: 'json' };

test('canonical demo data preserves the approved launch dataset', () => {
  assert.equal(demoData.referenceDate, '2026-06-05');
  assert.equal(demoData.employees.length, 8);
  assert.equal(
    new Set(demoData.employees.map((employee) => employee.email.toLowerCase())).size,
    demoData.employees.length,
  );
  assert.equal(demoData.sites.length, 4);
  assert.equal(demoData.courses.length, 12);
  assert.equal(demoData.siteCourseRequirements.length, 12);

  const omittedCompletions = Object.values(demoData.completionExceptions).filter(
    (value) => value === null,
  ).length;
  const completionCount =
    demoData.employees.length * demoData.courses.length - omittedCompletions;
  assert.equal(completionCount, 83);
});
