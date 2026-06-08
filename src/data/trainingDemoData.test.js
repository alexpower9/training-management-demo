import { describe, expect, it } from 'vitest';
import {
  completions,
  employees,
  getDemoSiteReadiness,
  referenceDate,
  sites,
} from '@/data/trainingDemoData';

describe('canonical training demo data', () => {
  it('preserves launch counts and the fixed reference date', () => {
    expect(referenceDate).toBe('2026-06-05');
    expect(employees).toHaveLength(8);
    expect(sites).toHaveLength(4);
    expect(completions).toHaveLength(83);
  });

  it('preserves the approved readiness distributions', () => {
    const expected = [
      { compliant: 2, expiring: 2, incomplete: 3, overdue: 1 },
      { compliant: 2, expiring: 2, incomplete: 3, overdue: 1 },
      { compliant: 3, expiring: 1, incomplete: 3, overdue: 1 },
      { compliant: 2, expiring: 1, incomplete: 3, overdue: 2 },
    ];

    sites.forEach((site, index) => {
      const distribution = getDemoSiteReadiness(site.id, referenceDate).reduce(
        (counts, employee) => ({
          ...counts,
          [employee.status]: (counts[employee.status] || 0) + 1,
        }),
        {},
      );
      expect(distribution).toEqual(expected[index]);
    });
  });
});
