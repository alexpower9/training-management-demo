import { describe, expect, it } from 'vitest';
import { addCalendarMonths } from '@/utils/dates';

describe('addCalendarMonths', () => {
  it('clamps month-end expiry dates', () => {
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addCalendarMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addCalendarMonths('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('preserves the day for ordinary dates', () => {
    expect(addCalendarMonths('2026-06-05', 12)).toBe('2027-06-05');
  });
});
