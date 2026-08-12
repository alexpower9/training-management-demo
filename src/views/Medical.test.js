import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Medical from '@/views/Medical.vue';

const mocks = vi.hoisted(() => ({
  authState: { role: 'admin' },
  getMyReadiness: vi.fn(),
  listEmployees: vi.fn(),
  listSites: vi.fn(),
  listSiteRequirements: vi.fn(),
  getSiteReadiness: vi.fn(),
}));

vi.mock('@/auth/auth', () => ({ auth: { state: mocks.authState } }));
vi.mock('@/services/medicalRepository', () => ({ medicalRepository: mocks }));

function medicalSummary(employee, site, options = {}) {
  return {
    id: `${employee.id}-${site.id}`,
    employee,
    site,
    medicals: [],
    requiredCount: 0,
    completedCount: 0,
    expiringCount: 0,
    status: 'noRequirements',
    eligible: false,
    combinedAccess: {
      status: 'compliant',
      eligible: true,
      requiredCount: 1,
      completedCount: 1,
      expiringCount: 0,
      blockingDomains: [],
    },
    ...options,
  };
}

describe('Medical', () => {
  const employee = { id: 'employee-1', name: 'Alex Power', active: true };
  const site = {
    id: 'site-1',
    name: 'North Ridge',
    timeZone: 'America/St_Johns',
    active: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authState.role = 'admin';
    mocks.listEmployees.mockResolvedValue([employee]);
    mocks.listSites.mockResolvedValue([site]);
    mocks.listSiteRequirements.mockResolvedValue([]);
    mocks.getSiteReadiness.mockResolvedValue([medicalSummary(employee, site)]);
  });

  it('shows an empty Medical domain without losing combined site access', async () => {
    const wrapper = mount(Medical);
    await flushPromises();

    await wrapper.get('select[aria-label="Site"]').setValue(site.id);
    await flushPromises();

    expect(wrapper.get('thead').text()).toContain('Medical status');
    expect(wrapper.get('tbody').text()).toContain('No Requirements');
    expect(wrapper.get('tbody').text()).toContain('Eligible');
    expect(wrapper.get('tbody').text()).toContain('Ready for site access');
  });

  it('keeps combined access authoritative when a Medical filter narrows status', async () => {
    const medical = { id: 'medical-1', name: 'Fitness to Work', validityMonths: 12 };
    const hiddenMedical = {
      id: 'medical-2',
      name: 'Respirator Clearance',
      validityMonths: 12,
    };
    mocks.listSiteRequirements.mockResolvedValue([medical, hiddenMedical]);
    mocks.getSiteReadiness.mockResolvedValue([
      medicalSummary(employee, site, {
        medicals: [
          {
            employeeId: employee.id,
            siteId: site.id,
            medicalId: medical.id,
            medical,
            completion: {
              completedOn: '2026-01-01',
              expiresOn: '2027-01-01',
            },
            status: 'compliant',
            daysUntilExpiry: 210,
          },
          {
            employeeId: employee.id,
            siteId: site.id,
            medicalId: hiddenMedical.id,
            medical: hiddenMedical,
            completion: null,
            status: 'incomplete',
            daysUntilExpiry: null,
          },
        ],
        requiredCount: 2,
        completedCount: 1,
        status: 'incomplete',
        combinedAccess: {
          status: 'incomplete',
          eligible: false,
          requiredCount: 3,
          completedCount: 2,
          expiringCount: 0,
          blockingDomains: ['medical'],
        },
      }),
    ]);
    const wrapper = mount(Medical);
    await flushPromises();

    await wrapper.get('select[aria-label="Site"]').setValue(site.id);
    await flushPromises();
    await wrapper.get('select[aria-label="Medical"]').setValue(medical.id);

    expect(wrapper.get('tbody').text()).toContain('Compliant');
    expect(wrapper.get('tbody').text()).toContain('1 / 1');
    expect(wrapper.get('tbody').text()).toContain('Not eligible');
    expect(wrapper.get('tbody').text()).toContain('Resolve medical requirements');
    expect(wrapper.get('tbody').text()).not.toContain('Respirator Clearance');
    await wrapper.get('tbody tr').trigger('click');
    expect(wrapper.get('.detail-panel').text()).toContain(
      'Blocked by medical requirements.',
    );
  });

  it('shows employee accounts only their own Medical readiness', async () => {
    mocks.authState.role = 'employee';
    mocks.getMyReadiness.mockResolvedValue([medicalSummary(employee, site)]);
    const wrapper = mount(Medical);
    await flushPromises();

    expect(mocks.listEmployees).not.toHaveBeenCalled();
    expect(mocks.getMyReadiness).toHaveBeenCalledOnce();
    expect(wrapper.find('select[aria-label="Employee"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Alex Power');
  });

  it('shows a cross-domain expiring warning when Medical has no requirements', async () => {
    mocks.getSiteReadiness.mockResolvedValue([
      medicalSummary(employee, site, {
        combinedAccess: {
          status: 'expiring',
          eligible: true,
          requiredCount: 1,
          completedCount: 1,
          expiringCount: 1,
          blockingDomains: [],
        },
      }),
    ]);
    const wrapper = mount(Medical);
    await flushPromises();
    await wrapper.get('select[aria-label="Site"]').setValue(site.id);
    await flushPromises();

    expect(wrapper.get('tbody').text()).toContain('Expiring Soon');
    expect(wrapper.get('tbody').text()).toContain('requirement expires soon');
  });
});
