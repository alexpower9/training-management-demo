import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageEmployees from '@/views/manage/ManageEmployees.vue';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  listEmployees: vi.fn(),
  getEmployee: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
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
    updateEmployee: mocks.updateEmployee,
    setEmployeeArchived: vi.fn(),
  },
}));

vi.mock('@/composables/useToasts', () => ({
  addToast: mocks.addToast,
}));

function employeeFixture(overrides = {}) {
  return {
    id: 'employee-1',
    displayName: 'Alex Power',
    email: 'alex@example.com',
    archivedAt: null,
    latestCompletionOn: null,
    latestMedicalCompletionOn: null,
    ...overrides,
  };
}

function mockEmployee(employee) {
  mocks.listEmployees.mockResolvedValue({ items: [employee], total: 1 });
  mocks.getEmployee.mockResolvedValue({
    ...employee,
    completions: employee.completions || [],
    medicalCompletions: employee.medicalCompletions || [],
    pendingCompletions: employee.pendingCompletions || [],
    pendingMedicalCompletions: employee.pendingMedicalCompletions || [],
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
    mocks.updateEmployee.mockResolvedValue({ id: 'employee-1' });
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

  it('creates a local employee record with a contact email', async () => {
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

  it('shows contact information without requiring an employee account', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('tbody').text()).toContain('alex@example.com');
    expect(wrapper.get('thead').text()).not.toContain('Account');
    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();
    expect(wrapper.get('.profile-strip').text()).toContain('alex@example.com');
    expect(wrapper.text()).not.toContain('invitation');
  });

  it('edits the employee name and contact email', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Edit').trigger('click');
    await wrapper.get('input:not([type])').setValue('Updated Employee');
    await wrapper.get('input[type="email"]').setValue('updated@example.com');
    await wrapper.get('.drawer-form').trigger('submit');
    await flushPromises();
    expect(mocks.updateEmployee).toHaveBeenCalledWith('employee-1', {
      displayName: 'Updated Employee',
      email: 'updated@example.com',
    });
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

  it('renders separate training and medical completion sections', async () => {
    mocks.getEmployee.mockResolvedValue({
      ...employeeFixture({
        latestCompletionOn: '2026-01-01',
        latestMedicalCompletionOn: '2026-02-01',
      }),
      completions: [],
      medicalCompletions: [
        {
          id: 'medical-completion-1',
          medical: { id: 'medical-1', name: 'Fitness to Work' },
          completedOn: '2026-02-01',
          expiresOn: '2027-02-01',
          voidedAt: null,
        },
      ],
    });
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('thead').text()).toContain('Latest training');
    expect(wrapper.get('thead').text()).toContain('Latest medical');
    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Training completion history');
    expect(wrapper.text()).toContain('Medical completion history');
    expect(wrapper.text()).toContain('Fitness to Work');
  });

  it('renders separate pending-date sections with direct add-date links', async () => {
    mocks.getEmployee.mockResolvedValue({
      ...employeeFixture(),
      completions: [],
      medicalCompletions: [],
      pendingCompletions: [
        {
          id: 'pending-training-1',
          course: { id: 'course-1', name: 'Fall Arrest' },
          createdAt: '2026-08-20T12:00:00.000Z',
          status: 'pending',
        },
      ],
      pendingMedicalCompletions: [
        {
          id: 'pending-medical-1',
          medical: { id: 'medical-1', name: 'Fitness to Work' },
          createdAt: '2026-08-21T12:00:00.000Z',
          status: 'pending',
        },
      ],
    });
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Training pending dates');
    expect(wrapper.text()).toContain('Medical pending dates');
    expect(wrapper.text()).toContain('Fall Arrest');
    expect(wrapper.text()).toContain('Fitness to Work');
    expect(wrapper.findAll('.status-badge').map((badge) => badge.text())).toContain(
      'Pending date',
    );

    const addDateLinks = wrapper.findAll('.secondary-action--compact');
    expect(addDateLinks).toHaveLength(2);
  });
});
