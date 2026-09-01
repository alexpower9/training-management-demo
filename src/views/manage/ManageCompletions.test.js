import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageCompletions from '@/views/manage/ManageCompletions.vue';

const mocks = vi.hoisted(() => ({
  route: { query: { action: 'create', employeeId: 'employee-1' } },
  replace: vi.fn(),
  createCompletion: vi.fn(),
  createMedicalCompletion: vi.fn(),
  correctCompletionDates: vi.fn(),
  correctMedicalCompletionDates: vi.fn(),
  createPendingCompletion: vi.fn(),
  createMedicalPendingCompletion: vi.fn(),
  listCompletions: vi.fn(),
  listMedicalCompletions: vi.fn(),
  listPendingCompletions: vi.fn(),
  listMedicalPendingCompletions: vi.fn(),
  getCompletion: vi.fn(),
  getMedicalCompletion: vi.fn(),
  getPendingCompletion: vi.fn(),
  getMedicalPendingCompletion: vi.fn(),
  finalizePendingCompletion: vi.fn(),
  finalizeMedicalPendingCompletion: vi.fn(),
  cancelPendingCompletion: vi.fn(),
  cancelMedicalPendingCompletion: vi.fn(),
  listEmployees: vi.fn(),
  listCourses: vi.fn(),
  listMedicals: vi.fn(),
  listEmployeeOptions: vi.fn(),
  listCourseOptions: vi.fn(),
  listMedicalOptions: vi.fn(),
  listSiteOptions: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/services/adminRepository', () => ({
  adminRepository: {
    createCompletion: mocks.createCompletion,
    createMedicalCompletion: mocks.createMedicalCompletion,
    correctCompletionDates: mocks.correctCompletionDates,
    correctMedicalCompletionDates: mocks.correctMedicalCompletionDates,
    createPendingCompletion: mocks.createPendingCompletion,
    createMedicalPendingCompletion: mocks.createMedicalPendingCompletion,
    listCompletions: mocks.listCompletions,
    listMedicalCompletions: mocks.listMedicalCompletions,
    listPendingCompletions: mocks.listPendingCompletions,
    listMedicalPendingCompletions: mocks.listMedicalPendingCompletions,
    getCompletion: mocks.getCompletion,
    getMedicalCompletion: mocks.getMedicalCompletion,
    getPendingCompletion: mocks.getPendingCompletion,
    getMedicalPendingCompletion: mocks.getMedicalPendingCompletion,
    finalizePendingCompletion: mocks.finalizePendingCompletion,
    finalizeMedicalPendingCompletion: mocks.finalizeMedicalPendingCompletion,
    cancelPendingCompletion: mocks.cancelPendingCompletion,
    cancelMedicalPendingCompletion: mocks.cancelMedicalPendingCompletion,
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
    vi.clearAllMocks();
    mocks.route.query = { action: 'create', employeeId: 'employee-1' };
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
    mocks.listPendingCompletions.mockResolvedValue({ items: [], total: 0 });
    mocks.listMedicalPendingCompletions.mockResolvedValue({ items: [], total: 0 });
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
    mocks.createPendingCompletion.mockResolvedValue({ id: 'pending-1' });
    mocks.createMedicalPendingCompletion.mockResolvedValue({ id: 'medical-pending-1' });
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

  it('starts with a blank date and creates a pending record without affecting history', async () => {
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
    expect(wrapper.get('.form-drawer input[type="date"]').element.value).toBe('');
    expect(wrapper.get('.form-drawer').text()).toContain(
      'It will not count toward readiness until finalized.',
    );
    await selects[1].setValue('course-1');
    await wrapper.get('.form-drawer textarea').setValue('Waiting for the tech.');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(mocks.createPendingCompletion).toHaveBeenCalledWith({
      employeeId: 'employee-1',
      courseId: 'course-1',
      comment: 'Waiting for the tech.',
    });
    expect(mocks.createCompletion).not.toHaveBeenCalled();
    expect(mocks.listPendingCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        filters: { includeResolved: 'false' },
      }),
    );
    expect(mocks.replace).toHaveBeenLastCalledWith({
      query: {
        type: 'training',
        view: 'pending',
        id: 'pending-1',
      },
    });
  });

  it('opens renewals with a blank completion date', async () => {
    mocks.route.query = {};
    mocks.listCompletions.mockResolvedValue({
      items: [
        {
          id: 'completion-renew',
          employeeId: 'employee-1',
          courseId: 'course-1',
          employee: { displayName: 'Alex Power' },
          course: { name: 'First Aid' },
          completedOn: '2025-01-31',
          expiresOn: '2026-01-31',
          voidedAt: null,
        },
      ],
      total: 1,
    });
    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await wrapper
      .findAll('.detail-panel button')
      .find((button) => button.text() === 'Renew')
      .trigger('click');

    const selects = wrapper.findAll('.form-drawer select');
    expect(selects[0].element.value).toBe('employee-1');
    expect(selects[1].element.value).toBe('course-1');
    expect(wrapper.get('.form-drawer input[type="date"]').element.value).toBe('');
  });

  it('keeps a separate pending queue and can include resolved records', async () => {
    mocks.route.query = {};
    mocks.listPendingCompletions.mockResolvedValue({
      items: [
        {
          id: 'pending-1',
          employeeId: 'employee-1',
          courseId: 'course-1',
          employee: { displayName: 'Alex Power' },
          course: { name: 'First Aid' },
          validityMonthsSnapshot: 12,
          createdAt: '2026-08-20T14:00:00.000Z',
          createdBySubject: 'admin-subject',
          status: 'pending',
          comment: null,
        },
      ],
      total: 1,
    });
    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    await wrapper
      .get('[aria-label="Completion view"] button:last-child')
      .trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Training pending dates');
    expect(wrapper.get('tbody').text()).toContain('Pending date');
    expect(wrapper.text()).not.toContain('Show voided');
    expect(mocks.listPendingCompletions).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: { includeResolved: 'false' } }),
    );

    await wrapper.get('.checkbox-field input').setValue(true);
    await flushPromises();
    expect(mocks.listPendingCompletions).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: { includeResolved: 'true' } }),
    );
    expect(mocks.replace).toHaveBeenLastCalledWith({
      query: {
        type: 'training',
        view: 'pending',
        resolved: 'true',
      },
    });
  });

  it('loads an exact pending id and finalizes it using the saved validity', async () => {
    mocks.route.query = {
      type: 'training',
      view: 'pending',
      id: 'pending-off-page',
      action: 'finalize',
    };
    const pending = {
      id: 'pending-off-page',
      employeeId: 'employee-1',
      courseId: 'course-1',
      employee: { displayName: 'Alex Power' },
      course: { name: 'First Aid' },
      validityMonthsSnapshot: 1,
      createdAt: '2026-08-20T14:00:00.000Z',
      createdBySubject: 'admin-subject',
      status: 'pending',
      comment: 'Confirm with technician.',
    };
    mocks.getPendingCompletion.mockResolvedValue(pending);
    mocks.finalizePendingCompletion.mockResolvedValue({
      ...pending,
      status: 'finalized',
      completionId: 'completion-finalized',
      resolvedAt: '2026-08-21T14:00:00.000Z',
    });

    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    expect(mocks.getPendingCompletion).toHaveBeenCalledWith('pending-off-page');
    expect(wrapper.get('.form-drawer').text()).toContain('Confirm with technician.');
    await wrapper.get('.form-drawer input[type="date"]').setValue('2026-01-31');
    expect(wrapper.get('.calculation-preview').text()).toContain('Feb 28, 2026');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(mocks.finalizePendingCompletion).toHaveBeenCalledWith(
      'pending-off-page',
      '2026-01-31',
    );
    expect(wrapper.text()).toContain('Finalized');
    expect(wrapper.text()).toContain('View completion');
  });

  it('requires a reason and retains cancelled pending records as read-only history', async () => {
    mocks.route.query = { type: 'training', view: 'pending', resolved: 'true' };
    const pending = {
      id: 'pending-cancel',
      employeeId: 'employee-1',
      courseId: 'course-1',
      employee: { displayName: 'Alex Power' },
      course: { name: 'First Aid' },
      validityMonthsSnapshot: 12,
      createdAt: '2026-08-20T14:00:00.000Z',
      createdBySubject: 'admin-subject',
      status: 'pending',
      comment: null,
    };
    mocks.listPendingCompletions.mockResolvedValue({ items: [pending], total: 1 });
    mocks.cancelPendingCompletion.mockResolvedValue({
      ...pending,
      status: 'cancelled',
      resolvedAt: '2026-08-22T14:00:00.000Z',
      resolvedBySubject: 'admin-subject',
      cancellationReason: 'Entered for the wrong employee.',
    });
    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await wrapper
      .findAll('.detail-panel button')
      .find((button) => button.text() === 'Cancel')
      .trigger('click');
    const dialog = wrapper.get('.confirm-dialog');
    const submit = dialog.get('button[type="submit"]');
    expect(submit.attributes('disabled')).toBeDefined();
    await dialog.get('textarea').setValue('Entered for the wrong employee.');
    await dialog.trigger('submit');
    await flushPromises();

    expect(mocks.cancelPendingCompletion).toHaveBeenCalledWith(
      'pending-cancel',
      'Entered for the wrong employee.',
    );
    expect(wrapper.text()).toContain('Cancelled');
    expect(wrapper.text()).toContain('Entered for the wrong employee.');
    expect(
      wrapper
        .findAll('.detail-panel button')
        .some((button) => button.text() === 'Add completion date'),
    ).toBe(false);
  });

  it('loads a completion by exact id when it is outside the current history page', async () => {
    mocks.route.query = { type: 'training', view: 'history', id: 'completion-off-page' };
    mocks.getCompletion.mockResolvedValue({
      id: 'completion-off-page',
      employeeId: 'employee-1',
      courseId: 'course-1',
      employee: { displayName: 'Alex Power' },
      course: { name: 'First Aid' },
      completedOn: '2026-01-31',
      expiresOn: '2027-01-31',
      recordedBySubject: 'admin-subject',
      voidedAt: null,
    });

    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    expect(mocks.getCompletion).toHaveBeenCalledWith('completion-off-page');
    expect(wrapper.text()).toContain('Alex Power');
    expect(wrapper.text()).toContain('First Aid');
    expect(wrapper.text()).toContain('Jan 31, 2026');
  });

  it('prefills audited course date correction and selects the replacement', async () => {
    mocks.route.query = {};
    const original = {
      id: 'completion-original',
      employeeId: 'employee-1',
      courseId: 'course-1',
      employee: { displayName: 'Alex Power' },
      course: { name: 'First Aid' },
      completedOn: '2026-01-31',
      expiresOn: '2027-01-31',
      validityMonthsApplied: 12,
      recordedBySubject: 'admin-subject',
      voidedAt: null,
    };
    const replacement = {
      ...original,
      id: 'completion-replacement',
      completedOn: '2026-02-01',
      expiresOn: '2027-02-15',
      correctsCompletionId: original.id,
      expiryManuallySet: true,
    };
    mocks.listCompletions
      .mockResolvedValueOnce({ items: [original], total: 1 })
      .mockResolvedValueOnce({ items: [replacement], total: 1 });
    mocks.correctCompletionDates.mockResolvedValue(replacement);
    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await wrapper
      .findAll('.detail-panel button')
      .find((button) => button.text() === 'Edit dates')
      .trigger('click');

    const drawer = wrapper.get('[role="dialog"][aria-label="Edit course completion dates"]');
    const dates = drawer.findAll('input[type="date"]');
    expect(dates[0].element.value).toBe('2026-01-31');
    expect(dates[1].element.value).toBe('2027-01-31');
    expect(drawer.text()).toContain('keeps it in completion history');

    await dates[0].setValue('2026-02-01');
    await dates[1].setValue('2027-02-15');
    await drawer.get('textarea').setValue('Certificate dates were transposed.');
    await drawer.get('form').trigger('submit');
    await flushPromises();

    expect(mocks.correctCompletionDates).toHaveBeenCalledWith(
      'completion-original',
      {
        completedOn: '2026-02-01',
        expiresOn: '2027-02-15',
        reason: 'Certificate dates were transposed.',
      },
    );
    expect(mocks.replace).toHaveBeenLastCalledWith({
      query: {
        type: 'training',
        view: 'history',
        id: 'completion-replacement',
      },
    });
    expect(wrapper.get('.detail-panel').text()).toContain(
      'Corrected dates · expiry manually set',
    );
    expect(wrapper.get('.detail-panel').text()).toContain(
      'Corrected replacement of an earlier completion',
    );
  });

  it('validates correction fields and shows structured API errors', async () => {
    mocks.route.query = {};
    const original = {
      id: 'completion-validation',
      employeeId: 'employee-1',
      courseId: 'course-1',
      employee: { displayName: 'Alex Power' },
      course: { name: 'First Aid' },
      completedOn: '2026-01-31',
      expiresOn: '2027-01-31',
      recordedBySubject: 'admin-subject',
      voidedAt: null,
    };
    mocks.listCompletions.mockResolvedValue({ items: [original], total: 1 });
    mocks.correctCompletionDates.mockRejectedValue({
      message: 'Invalid corrected dates.',
      fieldErrors: {
        completedOn: ['A completion already exists for that corrected date.'],
      },
    });
    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await wrapper
      .findAll('.detail-panel button')
      .find((button) => button.text() === 'Edit dates')
      .trigger('click');
    const drawer = wrapper.get('[aria-label="Edit course completion dates"]');
    const dates = drawer.findAll('input[type="date"]');
    await drawer.get('textarea').setValue('Dates checked against certificate.');
    expect(drawer.get('form').element.checkValidity()).toBe(true);
    await drawer.get('form').trigger('submit');
    await wrapper.vm.$nextTick();

    expect(mocks.correctCompletionDates).not.toHaveBeenCalled();
    expect(wrapper.get('[aria-label="Edit course completion dates"]').text()).toContain(
      'Enter a different completion or expiry date.',
    );

    await dates[0].setValue('');
    await dates[1].setValue('');
    await drawer.get('textarea').setValue('x');
    await drawer.get('form').trigger('submit');

    expect(mocks.correctCompletionDates).not.toHaveBeenCalled();
    expect(dates[0].attributes('required')).toBeDefined();
    expect(dates[1].attributes('required')).toBeDefined();
    expect(drawer.get('textarea').attributes('required')).toBeDefined();
    expect(drawer.get('textarea').attributes('minlength')).toBe('3');
    expect(drawer.get('textarea').attributes('maxlength')).toBe('500');

    await dates[0].setValue('2026-02-02');
    await dates[1].setValue('2026-02-01');
    await drawer.get('textarea').setValue('Dates confirmed against certificate.');
    await drawer.get('form').trigger('submit');
    await wrapper.vm.$nextTick();

    expect(mocks.correctCompletionDates).not.toHaveBeenCalled();
    expect(wrapper.get('[aria-label="Edit course completion dates"]').text()).toContain(
      'Expiry date must be on or after the completion date.',
    );

    await dates[1].setValue('2027-02-02');
    await drawer.get('form').trigger('submit');
    await flushPromises();

    expect(mocks.correctCompletionDates).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[aria-label="Edit course completion dates"]').text()).toContain(
      'A completion already exists for that corrected date.',
    );
  });

  it('dispatches audited Medical date corrections to the Medical endpoint', async () => {
    mocks.route.query = { type: 'medical', view: 'history' };
    const original = {
      id: 'medical-completion-original',
      employeeId: 'employee-1',
      medicalId: 'medical-1',
      employee: { displayName: 'Alex Power' },
      medical: { name: 'Fitness to Work' },
      completedOn: '2026-03-01',
      expiresOn: '2027-03-01',
      recordedBySubject: 'admin-subject',
      voidedAt: null,
    };
    const replacement = {
      ...original,
      id: 'medical-completion-replacement',
      completedOn: '2026-03-02',
      expiresOn: '2027-03-15',
      correctsCompletionId: original.id,
      expiryManuallySet: true,
    };
    mocks.listMedicalCompletions
      .mockResolvedValueOnce({ items: [original], total: 1 })
      .mockResolvedValueOnce({ items: [replacement], total: 1 });
    mocks.correctMedicalCompletionDates.mockResolvedValue(replacement);
    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await wrapper
      .findAll('.detail-panel button')
      .find((button) => button.text() === 'Edit dates')
      .trigger('click');
    const drawer = wrapper.get('[aria-label="Edit medical completion dates"]');
    await drawer.findAll('input[type="date"]')[0].setValue('2026-03-02');
    await drawer.findAll('input[type="date"]')[1].setValue('2027-03-15');
    await drawer.get('textarea').setValue('Clinic confirmed the corrected dates.');
    await drawer.get('form').trigger('submit');
    await flushPromises();

    expect(mocks.correctMedicalCompletionDates).toHaveBeenCalledWith(
      'medical-completion-original',
      {
        completedOn: '2026-03-02',
        expiresOn: '2027-03-15',
        reason: 'Clinic confirmed the corrected dates.',
      },
    );
    expect(mocks.correctCompletionDates).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenLastCalledWith({
      query: {
        type: 'medical',
        view: 'history',
        id: 'medical-completion-replacement',
      },
    });
  });

  it('does not inject a late correction replacement into a changed domain', async () => {
    mocks.route.query = {};
    const original = {
      id: 'completion-stale-success',
      employeeId: 'employee-1',
      courseId: 'course-1',
      employee: { displayName: 'Alex Power' },
      course: { name: 'First Aid' },
      completedOn: '2026-01-31',
      expiresOn: '2027-01-31',
      recordedBySubject: 'admin-subject',
      voidedAt: null,
    };
    let finishCorrection;
    mocks.listCompletions.mockResolvedValue({ items: [original], total: 1 });
    mocks.correctCompletionDates.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCorrection = resolve;
        }),
    );
    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await wrapper
      .findAll('.detail-panel button')
      .find((button) => button.text() === 'Edit dates')
      .trigger('click');
    const drawer = wrapper.get('[aria-label="Edit course completion dates"]');
    await drawer.findAll('input[type="date"]')[0].setValue('2026-02-01');
    await drawer.findAll('input[type="date"]')[1].setValue('2027-02-01');
    await drawer.get('textarea').setValue('Certificate dates were corrected.');
    await drawer.get('form').trigger('submit');
    await wrapper.vm.$nextTick();

    await wrapper
      .findAll('[aria-label="Completion type"] button')
      .find((button) => button.text() === 'Medical')
      .trigger('click');
    await flushPromises();
    finishCorrection({
      ...original,
      id: 'late-course-replacement',
      completedOn: '2026-02-01',
      expiresOn: '2027-02-01',
      correctsCompletionId: original.id,
      expiryManuallySet: true,
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Medical completions');
    expect(wrapper.text()).not.toContain('Corrected dates · expiry manually set');
    expect(mocks.replace).toHaveBeenLastCalledWith({
      query: { type: 'medical', view: 'history' },
    });
  });

  it('does not render late correction field errors in a changed context', async () => {
    mocks.route.query = {};
    const original = {
      id: 'completion-stale-error',
      employeeId: 'employee-1',
      courseId: 'course-1',
      employee: { displayName: 'Alex Power' },
      course: { name: 'First Aid' },
      completedOn: '2026-01-31',
      expiresOn: '2027-01-31',
      recordedBySubject: 'admin-subject',
      voidedAt: null,
    };
    let failCorrection;
    mocks.listCompletions.mockResolvedValue({ items: [original], total: 1 });
    mocks.correctCompletionDates.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          failCorrection = reject;
        }),
    );
    const wrapper = mount(ManageCompletions, {
      global: { stubs: { Teleport: true, RouterLink: true } },
    });
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await wrapper
      .findAll('.detail-panel button')
      .find((button) => button.text() === 'Edit dates')
      .trigger('click');
    const drawer = wrapper.get('[aria-label="Edit course completion dates"]');
    await drawer.findAll('input[type="date"]')[0].setValue('2026-02-01');
    await drawer.findAll('input[type="date"]')[1].setValue('2027-02-01');
    await drawer.get('textarea').setValue('Certificate dates were corrected.');
    await drawer.get('form').trigger('submit');
    await wrapper.vm.$nextTick();

    await wrapper
      .findAll('[aria-label="Completion type"] button')
      .find((button) => button.text() === 'Medical')
      .trigger('click');
    await flushPromises();
    failCorrection({
      message: 'The corrected completion conflicts with another record.',
      fieldErrors: {
        completedOn: ['A completion already exists for that corrected date.'],
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Medical completions');
    expect(wrapper.text()).not.toContain(
      'A completion already exists for that corrected date.',
    );
    expect(wrapper.find('[aria-label="Edit course completion dates"]').exists()).toBe(
      false,
    );
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

  it('dispatches a blank Medical entry to the Medical pending endpoint', async () => {
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
      .findAll('[aria-label="Completion type"] button')
      .find((button) => button.text() === 'Medical')
      .trigger('click');
    await flushPromises();
    await wrapper.get('button.primary-action').trigger('click');
    const selects = wrapper.findAll('.form-drawer select');
    await selects[0].setValue('employee-1');
    await selects[1].setValue('medical-1');
    expect(wrapper.get('.form-drawer input[type="date"]').element.value).toBe('');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(mocks.createMedicalPendingCompletion).toHaveBeenCalledWith({
      employeeId: 'employee-1',
      medicalId: 'medical-1',
      comment: null,
    });
    expect(mocks.createMedicalCompletion).not.toHaveBeenCalled();
    expect(mocks.createPendingCompletion).not.toHaveBeenCalled();
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
