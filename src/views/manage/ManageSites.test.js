import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageSites from '@/views/manage/ManageSites.vue';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  listSites: vi.fn(),
  getSite: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, params: {} }),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/services/adminRepository', () => ({
  adminRepository: {
    listSites: mocks.listSites,
    getSite: mocks.getSite,
    createSite: vi.fn(),
    updateSite: vi.fn(),
    setSiteArchived: vi.fn(),
  },
}));

describe('ManageSites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const site = {
      id: 'site-1',
      name: 'North Ridge',
      timeZone: 'America/St_Johns',
      archivedAt: null,
      _count: { requirements: 1 },
    };
    mocks.listSites.mockResolvedValue({ items: [site], total: 1 });
    mocks.getSite.mockResolvedValue({
      ...site,
      requirements: [
        {
          siteId: 'site-1',
          courseId: 'course-1',
          course: {
            id: 'course-1',
            name: 'First Aid',
            validityMonths: 12,
            archivedAt: null,
          },
        },
      ],
    });
  });

  it('preserves route selection and presents course assignments as read-only', async () => {
    const wrapper = mount(ManageSites, {
      global: {
        stubs: {
          RouterLink: true,
          Teleport: true,
        },
      },
    });
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();

    expect(mocks.replace).toHaveBeenLastCalledWith({
      name: 'manage-sites',
      query: { id: 'site-1' },
    });
    expect(wrapper.text()).toContain('First Aid');
    expect(wrapper.text()).not.toContain('Assign course');
    expect(wrapper.text()).not.toContain('Remove');
  });
});
