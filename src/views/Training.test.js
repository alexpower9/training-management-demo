import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Training from '@/views/Training.vue';

const mocks = vi.hoisted(() => ({
  authState: { role: 'admin' },
  getMyReadiness: vi.fn(),
  listEmployees: vi.fn(),
  listSites: vi.fn(),
  listSiteCourses: vi.fn(),
  getSiteReadiness: vi.fn(),
}));

vi.mock('@/auth/auth', () => ({
  auth: { state: mocks.authState },
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
    mocks.authState.role = 'admin';
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

  it('gives owners the same broad readiness controls as administrators', async () => {
    mocks.authState.role = 'owner';
    const wrapper = mount(Training);
    await flushPromises();

    expect(mocks.listEmployees).toHaveBeenCalledOnce();
    expect(mocks.listSites).toHaveBeenCalledOnce();
    expect(wrapper.get('select[aria-label="Employee"]').exists()).toBe(true);

    await wrapper.get('select[aria-label="Site"]').setValue('site-1');
    await flushPromises();
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
  });

  it('shows employee accounts only their selectable readiness rows', async () => {
    mocks.authState.role = 'employee';
    mocks.getMyReadiness.mockResolvedValue([
      summary(employees[0], sites[0]),
      summary(employees[0], sites[1], 'incomplete'),
    ]);

    const wrapper = mount(Training);
    await flushPromises();

    expect(mocks.listEmployees).not.toHaveBeenCalled();
    expect(mocks.getMyReadiness).toHaveBeenCalledOnce();
    expect(wrapper.find('select[aria-label="Employee"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Alex Power');
    expect(wrapper.text()).not.toContain('Sam Lee');
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);

    await wrapper.find('tbody tr').trigger('click');

    expect(wrapper.text()).toContain('Alex Power at North Ridge');
  });

  it('shows a dedicated message when an employee account is not linked', async () => {
    mocks.authState.role = 'employee';
    mocks.getMyReadiness.mockRejectedValue({
      code: 'EMPLOYEE_ACCOUNT_NOT_LINKED',
      message: 'Forbidden',
    });

    const wrapper = mount(Training);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'not linked to an employee record',
    );
    expect(wrapper.text()).not.toContain('Forbidden');
  });
});
