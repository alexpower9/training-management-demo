import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Training from '@/views/Training.vue';

const mocks = vi.hoisted(() => ({
  listEmployees: vi.fn(),
  listSites: vi.fn(),
  listSiteCourses: vi.fn(),
  getSiteReadiness: vi.fn(),
}));

vi.mock('@/services/trainingRepository', () => ({
  trainingRepository: mocks,
}));

function summary(employee, site, status = 'compliant') {
  return {
    id: `${employee.id}-${site.id}`,
    employee,
    site,
    courses: [],
    requiredCount: 1,
    completedCount: status === 'compliant' ? 1 : 0,
    expiringCount: 0,
    status,
    eligible: status === 'compliant',
  };
}

describe('Training', () => {
  const employees = [
    { id: 'employee-1', name: 'Alex Power', active: true },
    { id: 'employee-2', name: 'Sam Lee', active: true },
  ];
  const sites = [
    {
      id: 'site-1',
      name: 'North Ridge',
      timeZone: 'America/St_Johns',
      active: true,
    },
    {
      id: 'site-2',
      name: 'East Pit',
      timeZone: 'America/Edmonton',
      active: true,
    },
  ];

  beforeEach(() => {
    mocks.listEmployees.mockResolvedValue(employees);
    mocks.listSites.mockResolvedValue(sites);
    mocks.listSiteCourses.mockResolvedValue([]);
    mocks.getSiteReadiness.mockImplementation(async (siteId) => {
      const site = sites.find((item) => item.id === siteId);
      return [
        summary(employees[0], site),
        summary(employees[1], site, 'incomplete'),
      ];
    });
  });

  it('shows the selected employee eligibility for every site', async () => {
    const wrapper = mount(Training);
    await flushPromises();

    await wrapper.findAll('select')[1].setValue('employee-1');
    await flushPromises();

    expect(mocks.getSiteReadiness).toHaveBeenCalledTimes(2);
    expect(mocks.getSiteReadiness).toHaveBeenCalledWith('site-1');
    expect(mocks.getSiteReadiness).toHaveBeenCalledWith('site-2');

    const rows = wrapper.findAll('tbody tr');
    const tableText = wrapper.get('tbody').text();
    expect(rows).toHaveLength(2);
    expect(tableText).toContain('North Ridge');
    expect(tableText).toContain('East Pit');
    expect(tableText).toContain('Alex Power');
    expect(tableText).not.toContain('Sam Lee');
  });
});
