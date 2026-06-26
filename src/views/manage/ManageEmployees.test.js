import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageEmployees from '@/views/manage/ManageEmployees.vue';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  listEmployees: vi.fn(),
  getEmployee: vi.fn(),
  createEmployee: vi.fn(),
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
  },
}));

describe('ManageEmployees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const employee = {
      id: 'employee-1',
      displayName: 'Alex Power',
      email: 'alex@example.com',
      archivedAt: null,
      latestCompletionOn: null,
    };
    mocks.listEmployees.mockResolvedValue({ items: [employee], total: 1 });
    mocks.getEmployee.mockResolvedValue({
      ...employee,
      completions: [],
    });
    mocks.createEmployee.mockResolvedValue({
      id: 'employee-2',
      displayName: 'New Employee',
      email: 'new.employee@example.com',
      archivedAt: null,
    });
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

  it('displays employee email without exposing manual account controls', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('tbody').text()).toContain('alex@example.com');
    await wrapper.get('tbody tr').trigger('click');
    await flushPromises();

    expect(wrapper.get('[aria-label="Employee account"]').text()).toContain(
      'alex@example.com',
    );
    expect(wrapper.text()).not.toContain('Link account');
    expect(wrapper.text()).not.toContain('Cognito subject');
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
