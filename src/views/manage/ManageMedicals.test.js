import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageMedicals from '@/views/manage/ManageMedicals.vue';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  listMedicals: vi.fn(),
  listSiteOptions: vi.fn(),
  createMedical: vi.fn(),
  getMedical: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/services/adminRepository', () => ({
  adminRepository: {
    listMedicals: mocks.listMedicals,
    listSiteOptions: mocks.listSiteOptions,
    createMedical: mocks.createMedical,
    getMedical: mocks.getMedical,
    updateMedical: vi.fn(),
    setMedicalArchived: vi.fn(),
  },
}));

describe('ManageMedicals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listMedicals.mockResolvedValue({ items: [], total: 0 });
    mocks.listSiteOptions.mockResolvedValue([
      { id: 'site-1', name: 'North Ridge', archivedAt: null },
    ]);
    mocks.createMedical.mockResolvedValue({ id: 'medical-1' });
    mocks.getMedical.mockResolvedValue({
      id: 'medical-1',
      name: 'Fitness to Work',
      validityMonths: 12,
      archivedAt: null,
      requirements: [],
      completions: [],
    });
  });

  it('renders Medical catalogue copy and creates a site medical', async () => {
    const wrapper = mount(ManageMedicals, {
      global: { stubs: { Teleport: true } },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Medical catalogue');
    expect(wrapper.text()).toContain('No medicals found');
    await wrapper.get('button.primary-action').trigger('click');
    await wrapper.get('.form-drawer input:not([type])').setValue('Fitness to Work');
    await wrapper.get('input[value="site-1"]').setValue(true);
    await wrapper.get('input[type="number"]').setValue('12');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(mocks.createMedical).toHaveBeenCalledWith({
      name: 'Fitness to Work',
      validityMonths: 12,
      siteIds: ['site-1'],
    });
  });
});
