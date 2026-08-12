import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageCompletions from '@/views/manage/ManageCompletions.vue';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  createCompletion: vi.fn(),
  createMedicalCompletion: vi.fn(),
  listCompletions: vi.fn(),
  listMedicalCompletions: vi.fn(),
  listEmployees: vi.fn(),
  listCourses: vi.fn(),
  listMedicals: vi.fn(),
  listEmployeeOptions: vi.fn(),
  listCourseOptions: vi.fn(),
  listMedicalOptions: vi.fn(),
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
    createMedicalCompletion: mocks.createMedicalCompletion,
    listCompletions: mocks.listCompletions,
    listMedicalCompletions: mocks.listMedicalCompletions,
    listEmployees: mocks.listEmployees,
    listCourses: mocks.listCourses,
    listMedicals: mocks.listMedicals,
    listEmployeeOptions: mocks.listEmployeeOptions,
    listCourseOptions: mocks.listCourseOptions,
    listMedicalOptions: mocks.listMedicalOptions,
    listSiteOptions: mocks.listSiteOptions,
    voidCompletion: vi.fn(),
    voidMedicalCompletion: vi.fn(),
  },
}));

describe('ManageCompletions', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
    const sites = [
      { id: 'site-1', name: 'East Pit', archivedAt: null },
      { id: 'site-2', name: 'North Ridge', archivedAt: null },
      { id: 'site-3', name: 'New Site', archivedAt: null },
    ];
    mocks.listEmployees.mockResolvedValue({
      items: [{ id: 'employee-1', displayName: 'Alex Power' }],
      total: 1,
    });
    mocks.listEmployeeOptions.mockResolvedValue([
      { id: 'employee-1', displayName: 'Alex Power' },
    ]);
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
    mocks.listCourseOptions.mockResolvedValue([
      {
        id: 'course-1',
        name: 'First Aid',
        validityMonths: 1,
        requirements: sites.slice(0, 2).map((site) => ({ siteId: site.id })),
      },
    ]);
    mocks.listSiteOptions.mockResolvedValue(sites);
    mocks.listCompletions.mockResolvedValue({ items: [], total: 0 });
    mocks.listMedicalCompletions.mockResolvedValue({ items: [], total: 0 });
    mocks.listMedicals.mockResolvedValue({
      items: [
        {
          id: 'medical-1',
          name: 'Fitness to Work',
          validityMonths: 12,
          requirements: [{ siteId: 'site-1', site: sites[0] }],
        },
      ],
      total: 1,
    });
    mocks.listMedicalOptions.mockResolvedValue([
      {
        id: 'medical-1',
        name: 'Fitness to Work',
        validityMonths: 12,
        requirements: [{ siteId: 'site-1' }],
      },
    ]);
    mocks.createCompletion.mockResolvedValue({ id: 'completion-1' });
    mocks.createMedicalCompletion.mockResolvedValue({ id: 'medical-completion-1' });
  });

  it('groups general and site-specific courses in the native course select', async () => {
    const sites = await mocks.listSiteOptions();
    mocks.listCourseOptions.mockResolvedValue([
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
        id: 'course-no-site',
        name: 'General Safety Awareness',
        validityMonths: 12,
        requirements: [],
      },
      {
        id: 'course-north',
        name: 'North Ridge Orientation',
        validityMonths: 12,
        requirements: [{ siteId: 'site-2', site: sites[1] }],
      },
    ]);

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
      'No Site Requirement',
      'East Pit',
      'North Ridge',
    ]);
    expect(groups[0].text()).toContain('First Aid');
    expect(groups[1].text()).toContain('General Safety Awareness');
    expect(groups[2].text()).toContain('East Pit Orientation');
    expect(groups[3].text()).toContain('North Ridge Orientation');
    expect(groups[2].text()).not.toContain('First Aid');
    expect(groups[3].text()).not.toContain('First Aid');
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
    await wrapper.get('.form-drawer textarea').setValue('Manager note');

    expect(wrapper.get('.calculation-preview').text()).toContain('Feb 28, 2026');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(mocks.createCompletion).toHaveBeenCalledWith({
      employeeId: 'employee-1',
      courseId: 'course-1',
      completedOn: '2026-01-31',
      comment: 'Manager note',
    });
  });

  it('shows saved comments in the completion detail panel', async () => {
    mocks.listCompletions.mockResolvedValue({
      items: [
        {
          id: 'completion-commented',
          employeeId: 'employee-1',
          courseId: 'course-1',
          employee: { displayName: 'Alex Power' },
          course: { name: 'First Aid' },
          completedOn: '2026-01-31',
          expiresOn: '2026-02-28',
          comment: 'Certificate uploaded to shared drive.',
          voidedAt: null,
        },
      ],
      total: 1,
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

    await wrapper.get('tbody tr').trigger('click');

    expect(wrapper.get('[aria-label="Completion comment"]').text()).toContain(
      'Certificate uploaded to shared drive.',
    );
  });

  it('marks expired non-voided completions as overdue instead of current', async () => {
    mocks.listCompletions.mockResolvedValue({
      items: [
        {
          id: 'completion-overdue',
          employeeId: 'employee-1',
          courseId: 'course-1',
          employee: { displayName: 'Alex Power' },
          course: { name: 'First Aid' },
          completedOn: '2019-01-01',
          expiresOn: '2020-01-01',
          voidedAt: null,
        },
      ],
      total: 1,
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

    const rowText = wrapper.get('tbody tr').text();
    expect(rowText).toContain('First Aid');
    expect(rowText).toContain('Overdue');
    expect(rowText).not.toContain('Current');
  });

  it('consumes uncapped option endpoints and can select the 101st record', async () => {
    mocks.listEmployeeOptions.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({
        id: `employee-${index}`,
        displayName: `Option Employee ${String(index).padStart(3, '0')}`,
      })),
    );
    mocks.listCourseOptions.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({
        id: `course-${index}`,
        name: `Option Course ${String(index).padStart(3, '0')}`,
        validityMonths: 12,
        requirements: [],
      })),
    );

    const wrapper = mount(ManageCompletions, {
      global: {
        stubs: {
          Teleport: true,
          RouterLink: true,
        },
      },
    });
    await flushPromises();

    expect(mocks.listEmployeeOptions).toHaveBeenCalledTimes(1);
    expect(mocks.listCourseOptions).toHaveBeenCalledTimes(1);
    expect(mocks.listEmployees).not.toHaveBeenCalled();
    expect(mocks.listCourses).not.toHaveBeenCalled();

    const selects = wrapper.findAll('.form-drawer select');
    expect(selects[0].text()).toContain('Option Employee 100');
    expect(selects[1].text()).toContain('Option Course 100');
    await selects[0].setValue('employee-100');
    await selects[1].setValue('course-100');
    expect(selects[0].element.value).toBe('employee-100');
    expect(selects[1].element.value).toBe('course-100');
  });

  it('switches to Medical history and dispatches Medical completion entry', async () => {
    const wrapper = mount(ManageCompletions, {
      global: {
        stubs: {
          Teleport: true,
          RouterLink: true,
        },
      },
    });
    await flushPromises();

    await wrapper
      .findAll('.completion-type-switch button')
      .find((button) => button.text() === 'Medical')
      .trigger('click');
    await flushPromises();

    expect(mocks.listMedicalCompletions).toHaveBeenCalled();
    expect(mocks.listMedicalOptions).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Medical completions');
    await wrapper.get('button.primary-action').trigger('click');
    const selects = wrapper.findAll('.form-drawer select');
    await selects[0].setValue('employee-1');
    await selects[1].setValue('medical-1');
    await wrapper.get('.form-drawer input[type="date"]').setValue('2026-02-15');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(mocks.createMedicalCompletion).toHaveBeenCalledWith({
      employeeId: 'employee-1',
      medicalId: 'medical-1',
      completedOn: '2026-02-15',
      comment: null,
    });
    expect(mocks.createCompletion).not.toHaveBeenCalled();
  });

  it('ignores stale Medical responses after switching back to Training', async () => {
    let resolveMedicalOptions;
    let resolveMedicalList;
    mocks.listMedicalOptions.mockImplementation(
      () => new Promise((resolve) => { resolveMedicalOptions = resolve; }),
    );
    mocks.listMedicalCompletions.mockImplementation(
      () => new Promise((resolve) => { resolveMedicalList = resolve; }),
    );
    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    const typeButtons = wrapper.findAll('.completion-type-switch button');
    await typeButtons.find((button) => button.text() === 'Medical').trigger('click');
    await typeButtons.find((button) => button.text() === 'Training').trigger('click');
    await flushPromises();

    resolveMedicalOptions([
      { id: 'stale-medical', name: 'Stale Medical', validityMonths: 12, requirements: [] },
    ]);
    resolveMedicalList({
      items: [
        {
          id: 'stale-completion',
          employee: { displayName: 'Alex Power' },
          medical: { name: 'Stale Medical' },
          completedOn: '2026-01-01',
          expiresOn: '2027-01-01',
        },
      ],
      total: 1,
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Training completions');
    expect(wrapper.text()).not.toContain('Stale Medical');
    await wrapper.get('button.primary-action').trigger('click');
    expect(wrapper.findAll('.form-drawer select')[1].text()).toContain('First Aid');
  });

  it('keeps option-loading errors visible when the completion list succeeds', async () => {
    mocks.listCourseOptions.mockRejectedValue(new Error('Course options unavailable.'));
    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    expect(wrapper.get('.error-banner[role="alert"]').text()).toContain(
      'Course options unavailable.',
    );
    expect(mocks.listCompletions).toHaveBeenCalled();
  });
});
