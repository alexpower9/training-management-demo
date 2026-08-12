import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageEmployees from '@/views/manage/ManageEmployees.vue';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  listEmployees: vi.fn(),
  getEmployee: vi.fn(),
  createEmployee: vi.fn(),
  resendEmployeeInvitation: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/services/adminRepository', () => ({
  adminRepository: {
    listEmployees: mocks.listEmployees,
    getEmployee: mocks.getEmployee,
    createEmployee: mocks.createEmployee,
    updateEmployee: vi.fn(),
    setEmployeeArchived: vi.fn(),
    resendEmployeeInvitation: mocks.resendEmployeeInvitation,
  },
}));

vi.mock('@/composables/useToasts', () => ({
  addToast: mocks.addToast,
}));

function employeeFixture(overrides = {}) {
  const account = {
    status: 'confirmed',
    canResendInvitation: false,
    ...overrides.account,
  };

  return {
    id: 'employee-1',
    displayName: 'Alex Power',
    email: 'alex@example.com',
    archivedAt: null,
    latestCompletionOn: null,
    ...overrides,
    account,
  };
}

function mockEmployee(employee) {
  mocks.listEmployees.mockResolvedValue({ items: [employee], total: 1 });
  mocks.getEmployee.mockResolvedValue({
    ...employee,
    completions: employee.completions || [],
  });
}

describe('ManageEmployees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmployee(employeeFixture());
    mocks.createEmployee.mockResolvedValue({
      id: 'employee-2',
      displayName: 'New Employee',
      email: 'new.employee@example.com',
      archivedAt: null,
    });
    mocks.resendEmployeeInvitation.mockResolvedValue({});
  });

  function mountView() {
    return mount(ManageEmployees, {
      global: {
        stubs: {
          RouterLink: true,
          Teleport: true,
        },
      },
    });
  }

  it('preserves the selected record in route query parameters', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();

    expect(mocks.replace).toHaveBeenLastCalledWith({
      query: { id: 'employee-1' },
    });
  });

  it('creates an employee with the required invitation email', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('button.primary-action').trigger('click');
    await wrapper.get('input:not([type])').setValue('New Employee');
    await wrapper.get('input[type="email"]').setValue('new.employee@example.com');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(mocks.createEmployee).toHaveBeenCalledWith({
      displayName: 'New Employee',
      email: 'new.employee@example.com',
    });
  });

  it('shows confirmed account state without exposing Cognito identifiers', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('tbody').text()).toContain('alex@example.com');
    expect(wrapper.get('tbody').text()).toContain('Account confirmed');
    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();

    const accountPanel = wrapper.get('[aria-label="Employee account"]');
    expect(accountPanel.text()).toContain('alex@example.com');
    expect(accountPanel.text()).toContain('Account confirmed');
    expect(accountPanel.text()).toContain('completed account setup');
    expect(accountPanel.find('button').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Link account');
    expect(wrapper.text()).not.toContain('Cognito subject');
  });

  it('shows every normalized account state in the employee list', async () => {
    const statuses = [
      ['invitationPending', 'Invitation pending'],
      ['confirmed', 'Account confirmed'],
      ['passwordResetRequired', 'Password reset required'],
      ['disabled', 'Account disabled'],
      ['misconfigured', 'Account mismatch'],
      ['missing', 'Account missing'],
      ['unknown', 'Status unavailable'],
    ];
    mocks.listEmployees.mockResolvedValue({
      items: statuses.map(([status], index) =>
        employeeFixture({
          id: `employee-${index}`,
          displayName: `Employee ${index}`,
          email: `employee-${index}@example.com`,
          account: { status },
        }),
      ),
      total: statuses.length,
    });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('thead').text()).toContain('Account');
    expect(wrapper.get('thead').text()).toContain('Record status');
    for (const [, label] of statuses) {
      expect(wrapper.get('tbody').text()).toContain(label);
    }
  });

  it('confirms and resends a pending invitation once, then updates eligibility', async () => {
    const pendingEmployee = employeeFixture({
      account: { status: 'invitationPending', canResendInvitation: true },
    });
    mockEmployee(pendingEmployee);
    let finishResend;
    mocks.resendEmployeeInvitation.mockImplementationOnce(
      () => new Promise((resolve) => {
        finishResend = resolve;
      }),
    );
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('tbody').text()).toContain('Invitation pending');
    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();
    const accountPanel = wrapper.get('[aria-label="Employee account"]');
    expect(accountPanel.text()).toContain('has not completed account setup');
    await accountPanel.get('button').trigger('click');

    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.text()).toContain('alex@example.com');
    const confirmButton = dialog.get('button.primary-action');
    await confirmButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(mocks.resendEmployeeInvitation).toHaveBeenCalledTimes(1);
    expect(mocks.resendEmployeeInvitation).toHaveBeenCalledWith('employee-1');
    const busyConfirmButton = wrapper.get(
      '[role="alertdialog"] button.primary-action',
    );
    expect(busyConfirmButton.attributes('disabled')).toBeDefined();
    await busyConfirmButton.trigger('click');
    expect(mocks.resendEmployeeInvitation).toHaveBeenCalledTimes(1);

    finishResend({
      ...pendingEmployee,
      account: {
        ...pendingEmployee.account,
        canResendInvitation: false,
      },
    });
    await flushPromises();

    expect(mocks.addToast).toHaveBeenCalledWith('Employee invitation resent.');
    expect(mocks.listEmployees).toHaveBeenCalledTimes(1);
    expect(mocks.getEmployee).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Employee account"]').find('button').exists()).toBe(
      false,
    );
  });

  it('keeps resend unavailable for archived employees with pending invitations', async () => {
    mockEmployee(
      employeeFixture({
        archivedAt: '2026-08-11T12:00:00.000Z',
        account: { status: 'invitationPending', canResendInvitation: true },
      }),
    );
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();

    expect(wrapper.get('[aria-label="Employee account"]').text()).toContain(
      'Invitation pending',
    );
    expect(wrapper.get('[aria-label="Employee account"]').find('button').exists()).toBe(
      false,
    );
  });

  it('shows invitation delivery failures and refreshes resend eligibility', async () => {
    const pendingEmployee = employeeFixture({
      account: { status: 'invitationPending', canResendInvitation: true },
    });
    mockEmployee(pendingEmployee);
    mocks.getEmployee
      .mockResolvedValueOnce({ ...pendingEmployee, completions: [] })
      .mockResolvedValueOnce({
        ...pendingEmployee,
        account: {
          ...pendingEmployee.account,
          canResendInvitation: false,
        },
        completions: [],
      });
    mocks.resendEmployeeInvitation.mockRejectedValueOnce(
      new Error('The invitation could not be delivered.'),
    );
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="Employee account"] button').trigger('click');
    const dialog = wrapper.get('[role="alertdialog"]');
    await dialog.get('button.primary-action').trigger('click');
    await flushPromises();

    expect(mocks.addToast).toHaveBeenCalledWith(
      'The invitation could not be delivered.',
      'danger',
    );
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(mocks.getEmployee).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[aria-label="Employee account"]').find('button').exists()).toBe(
      false,
    );
  });

  it('marks expired completion history as overdue instead of active', async () => {
    mocks.getEmployee.mockResolvedValue({
      id: 'employee-1',
      displayName: 'Alex Power',
      email: 'alex@example.com',
      archivedAt: null,
      latestCompletionOn: '2019-01-01',
      completions: [
        {
          id: 'completion-1',
          course: { id: 'course-1', name: 'Fall Arrest' },
          completedOn: '2019-01-01',
          expiresOn: '2020-01-01',
          voidedAt: null,
        },
      ],
    });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();

    const completionRowText = wrapper.get('.requirement-row').text();
    expect(completionRowText).toContain('Fall Arrest');
    expect(completionRowText).toContain('Overdue');
    expect(completionRowText).toContain('Expired');
    expect(completionRowText).not.toContain('Active');
  });

  it('opens completion comments from employee history without showing them inline', async () => {
    mocks.getEmployee.mockResolvedValue({
      id: 'employee-1',
      displayName: 'Alex Power',
      email: 'alex@example.com',
      archivedAt: null,
      latestCompletionOn: '2026-01-31',
      completions: [
        {
          id: 'completion-1',
          course: { id: 'course-1', name: 'Fall Arrest' },
          completedOn: '2026-01-31',
          expiresOn: '2027-01-31',
          comment: 'Certificate verified by site supervisor.',
          voidedAt: null,
        },
      ],
    });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();

    const rowText = wrapper.get('.requirement-row').text();
    expect(rowText).toContain('Fall Arrest');
    expect(rowText).not.toContain('Certificate verified by site supervisor.');

    await wrapper
      .get('button[aria-label="View completion comment for Fall Arrest"]')
      .trigger('click');

    expect(wrapper.get('.comment-dialog').text()).toContain(
      'Certificate verified by site supervisor.',
    );
  });

  it('shows structured email validation errors', async () => {
    mocks.createEmployee.mockRejectedValue({
      message: 'Invalid employee',
      fieldErrors: { email: ['Enter a valid email address.'] },
    });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('button.primary-action').trigger('click');
    await wrapper.get('input:not([type])').setValue('New Employee');
    await wrapper.get('input[type="email"]').setValue('bad@example.com');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Enter a valid email address.');
  });
});
