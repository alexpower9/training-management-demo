import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageCourses from '@/views/manage/ManageCourses.vue';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  listCourses: vi.fn(),
  listSiteOptions: vi.fn(),
  createCourse: vi.fn(),
  getCourse: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/services/adminRepository', () => ({
  adminRepository: {
    listCourses: mocks.listCourses,
    listSiteOptions: mocks.listSiteOptions,
    createCourse: mocks.createCourse,
    getCourse: mocks.getCourse,
    updateCourse: vi.fn(),
    setCourseArchived: vi.fn(),
  },
}));

describe('ManageCourses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCourses.mockResolvedValue({ items: [], total: 0 });
    mocks.listSiteOptions.mockResolvedValue([
      { id: 'site-1', name: 'North Ridge', archivedAt: null },
      { id: 'site-2', name: 'East Pit', archivedAt: null },
      { id: 'site-3', name: 'Old Site', archivedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    mocks.createCourse.mockResolvedValue({ id: 'course-1' });
    mocks.getCourse.mockResolvedValue({
      id: 'course-1',
      name: 'East Pit Orientation',
      validityMonths: 12,
      archivedAt: null,
      requirements: [
        {
          siteId: 'site-2',
          courseId: 'course-1',
          site: { id: 'site-2', name: 'East Pit', archivedAt: null },
        },
      ],
      completions: [],
    });
  });

  it('creates a course with all currently active sites', async () => {
    const wrapper = mount(ManageCourses, {
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });
    await flushPromises();

    await wrapper.get('button.primary-action').trigger('click');
    await wrapper.get('.form-drawer input:not([type])').setValue('CPR');
    await wrapper
      .get('label.site-select-all:not(.no-site-requirement) input')
      .setValue(true);
    await wrapper.get('input[type="number"]').setValue('24');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(mocks.createCourse).toHaveBeenCalledWith({
      name: 'CPR',
      validityMonths: 24,
      siteIds: ['site-1', 'site-2'],
    });
  });

  it('submits and displays a course assigned to one site', async () => {
    mocks.listCourses.mockResolvedValue({
      items: [
        {
          id: 'course-1',
          name: 'East Pit Orientation',
          validityMonths: 12,
          archivedAt: null,
          requirements: [
            {
              siteId: 'site-2',
              courseId: 'course-1',
              site: { id: 'site-2', name: 'East Pit', archivedAt: null },
            },
          ],
        },
      ],
      total: 1,
    });

    const wrapper = mount(ManageCourses, {
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.get('tbody').text()).toContain('East Pit');

    await wrapper.get('button.primary-action').trigger('click');
    await wrapper.get('.form-drawer input:not([type])').setValue('Site Induction');
    await wrapper.get('input[value="site-2"]').setValue(true);
    await wrapper.get('input[type="number"]').setValue('12');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(mocks.createCourse).toHaveBeenCalledWith({
      name: 'Site Induction',
      validityMonths: 12,
      siteIds: ['site-2'],
    });
  });

  it('creates and displays a course with no site requirement', async () => {
    mocks.listCourses.mockResolvedValue({
      items: [
        {
          id: 'course-general',
          name: 'General Safety Awareness',
          validityMonths: 12,
          archivedAt: null,
          requirements: [],
        },
      ],
      total: 1,
    });
    mocks.getCourse.mockResolvedValue({
      id: 'course-general',
      name: 'General Safety Awareness',
      validityMonths: 12,
      archivedAt: null,
      requirements: [],
      completions: [],
    });

    const wrapper = mount(ManageCourses, {
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.get('tbody').text()).toContain('No Site Requirement');
    expect(wrapper.get('tbody').text()).toContain('Does not affect readiness');

    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('No site requirement');
    expect(wrapper.text()).toContain('does not count toward site readiness');

    const editButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Edit');
    await editButton.trigger('click');
    expect(wrapper.get('.no-site-requirement input').element.checked).toBe(true);

    await wrapper.get('button.primary-action').trigger('click');
    await wrapper.get('.form-drawer input:not([type])').setValue('General Orientation');
    await wrapper.get('input[value="site-2"]').setValue(true);
    expect(wrapper.get('.no-site-requirement input').element.checked).toBe(false);
    await wrapper.get('.no-site-requirement input').setValue(true);
    expect(wrapper.get('input[value="site-2"]').element.checked).toBe(false);
    await wrapper.get('input[type="number"]').setValue('12');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(mocks.createCourse).toHaveBeenCalledWith({
      name: 'General Orientation',
      validityMonths: 12,
      siteIds: [],
    });
  });

  it('opens completion comments from course history without showing them inline', async () => {
    mocks.listCourses.mockResolvedValue({
      items: [
        {
          id: 'course-1',
          name: 'East Pit Orientation',
          validityMonths: 12,
          archivedAt: null,
          requirements: [
            {
              siteId: 'site-2',
              courseId: 'course-1',
              site: { id: 'site-2', name: 'East Pit', archivedAt: null },
            },
          ],
        },
      ],
      total: 1,
    });
    mocks.getCourse.mockResolvedValue({
      id: 'course-1',
      name: 'East Pit Orientation',
      validityMonths: 12,
      archivedAt: null,
      requirements: [
        {
          siteId: 'site-2',
          courseId: 'course-1',
          site: { id: 'site-2', name: 'East Pit', archivedAt: null },
        },
      ],
      completions: [
        {
          id: 'completion-1',
          employee: { id: 'employee-1', displayName: 'Alex Power' },
          completedOn: '2026-01-31',
          expiresOn: '2027-01-31',
          comment: 'Certificate verified by site supervisor.',
        },
      ],
    });

    const wrapper = mount(ManageCourses, {
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();

    const rowText = wrapper
      .findAll('.requirement-row')
      .map((row) => row.text())
      .find((text) => text.includes('Alex Power'));
    expect(rowText).toContain('Alex Power');
    expect(rowText).not.toContain('Certificate verified by site supervisor.');

    await wrapper
      .get('button[aria-label="View completion comment for Alex Power"]')
      .trigger('click');

    expect(wrapper.get('.comment-dialog').text()).toContain(
      'Certificate verified by site supervisor.',
    );
  });
});
