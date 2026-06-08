import assert from 'node:assert/strict';
import test from 'node:test';
import { addCalendarMonths, daysBetween, formatDateOnly, parseDateOnly } from './dates.js';

test('calendar-month expiry clamps to the target month end', () => {
  assert.equal(addCalendarMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addCalendarMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addCalendarMonths('2026-03-31', 1), '2026-04-30');
});

test('calendar-month expiry preserves ordinary day-of-month values', () => {
  assert.equal(addCalendarMonths('2026-06-05', 12), '2027-06-05');
  assert.equal(addCalendarMonths('2026-11-30', 3), '2027-02-28');
});

test('date-only conversion remains stable in UTC', () => {
  const value = parseDateOnly('2026-06-05');
  assert.equal(formatDateOnly(value), '2026-06-05');
  assert.equal(daysBetween('2026-06-05', '2026-06-20'), 15);
});
