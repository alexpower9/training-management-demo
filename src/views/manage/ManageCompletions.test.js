import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageCompletions from '@/views/manage/ManageCompletions.vue';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  createCompletion: vi.fn(),
  listCompletions: vi.fn(),
  listEmployees: vi.fn(),
  listCourses: vi.fn(),
  listSiteOptions: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: { action: 'create', employeeId: 'employee-1' },
  }),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/services/adminRepository', () => ({
  adminRepository: {
    createCompletion: mocks.createCompletion,
    listCompletions: mocks.listCompletions,
    listEmployees: mocks.listEmployees,
    listCourses: mocks.listCourses,
    listSiteOptions: mocks.listSiteOptions,
    voidCompletion: vi.fn(),
  },
}));

describe('ManageCompletions', () => {
  beforeEach(() => {
    const sites = [
      { id: 'site-1', name: 'East Pit', archivedAt: null },
      { id: 'site-2', name: 'North Ridge', archivedAt: null },
      { id: 'site-3', name: 'New Site', archivedAt: null },
    ];
    mocks.listEmployees.mockResolvedValue({
      items: [{ id: 'employee-1', displayName: 'Alex Power' }],
      total: 1,
    });
    mocks.listCourses.mockResolvedValue({
      items: [
        {
          id: 'course-1',
          name: 'First Aid',
          validityMonths: 1,
          requirements: sites.slice(0, 2).map((site) => ({
            siteId: site.id,
            site,
          })),
        },
      ],
      total: 1,
    });
    mocks.listSiteOptions.mockResolvedValue(sites);
    mocks.listCompletions.mockResolvedValue({ items: [], total: 0 });
    mocks.createCompletion.mockResolvedValue({ id: 'completion-1' });
  });

  it('groups general and site-specific courses in the native course select', async () => {
    const sites = await mocks.listSiteOptions();
    mocks.listCourses.mockResolvedValue({
      items: [
        {
          id: 'course-general',
          name: 'First Aid',
          validityMonths: 12,
          requirements: sites
            .slice(0, 2)
            .map((site) => ({ siteId: site.id, site })),
        },
        {
          id: 'course-east',
          name: 'East Pit Orientation',
          validityMonths: 12,
          requirements: [{ siteId: 'site-1', site: sites[0] }],
        },
        {
          id: 'course-north',
          name: 'North Ridge Orientation',
          validityMonths: 12,
          requirements: [{ siteId: 'site-2', site: sites[1] }],
        },
      ],
      total: 3,
    });

    const wrapper = mount(ManageCompletions, {
      global: {
        stubs: {
          Teleport: true,
          RouterLink: true,
        },
      },
    });
    await flushPromises();

    const groups = wrapper.findAll('.form-drawer select')[1].findAll('optgroup');
    expect(groups.map((group) => group.attributes('label'))).toEqual([
      'General courses',
      'East Pit',
      'North Ridge',
    ]);
    expect(groups[0].text()).toContain('First Aid');
    expect(groups[1].text()).toContain('East Pit Orientation');
    expect(groups[2].text()).toContain('North Ridge Orientation');
    expect(groups[1].text()).not.toContain('First Aid');
    expect(groups[2].text()).not.toContain('First Aid');
    expect(
      wrapper
        .findAll('.form-drawer select')[1]
        .findAll('option')
        .filter((option) => option.text() === 'First Aid'),
    ).toHaveLength(1);
  });

  it('pre-fills quick entry and previews clamped calculated expiry', async () => {
    const wrapper = mount(ManageCompletions, {
      global: {
        stubs: {
          Teleport: true,
          RouterLink: true,
        },
      },
    });
    await flushPromises();

    const selects = wrapper.findAll('.form-drawer select');
    expect(selects[0].element.value).toBe('employee-1');
    await selects[1].setValue('course-1');
    await wrapper.get('.form-drawer input[type="date"]').setValue('2026-01-31');

    expect(wrapper.get('.calculation-preview').text()).toContain('Feb 28, 2026');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(mocks.createCompletion).toHaveBeenCalledWith({
      employeeId: 'employee-1',
      courseId: 'course-1',
      completedOn: '2026-01-31',
    });
  });
});
