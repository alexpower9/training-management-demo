import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageEmployees from '@/views/manage/ManageEmployees.vue';

const mocks = vi.hoisted(() => ({
  canAdministerAccounts: { value: true },
  replace: vi.fn(),
  listEmployees: vi.fn(),
  getEmployee: vi.fn(),
  linkEmployeeAccount: vi.fn(),
  unlinkEmployeeAccount: vi.fn(),
}));

vi.mock('@/auth/auth', () => ({
  auth: {
    canAdministerAccounts: mocks.canAdministerAccounts,
  },
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/services/adminRepository', () => ({
  adminRepository: {
    listEmployees: mocks.listEmployees,
    getEmployee: mocks.getEmployee,
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
    linkEmployeeAccount: mocks.linkEmployeeAccount,
    unlinkEmployeeAccount: mocks.unlinkEmployeeAccount,
    setEmployeeArchived: vi.fn(),
  },
}));

describe('ManageEmployees route state', () => {
  beforeEach(() => {
    mocks.canAdministerAccounts.value = true;
    const employee = {
      id: 'employee-1',
      displayName: 'Alex Power',
      archivedAt: null,
      latestCompletionOn: null,
      accountLinked: false,
    };
    mocks.listEmployees.mockResolvedValue({ items: [employee], total: 1 });
    mocks.getEmployee.mockResolvedValue({
      ...employee,
      cognitoSubject: null,
      completions: [],
    });
    mocks.linkEmployeeAccount.mockResolvedValue({
      ...employee,
      cognitoSubject: '20000000-0000-4000-8000-000000000001',
    });
  });

  it('preserves the selected record in route query parameters', async () => {
    const wrapper = mount(ManageEmployees, {
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
      query: { id: 'employee-1' },
    });
  });

  it('links a Cognito subject through the separate account action', async () => {
    const wrapper = mount(ManageEmployees, {
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
    const linkButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Link account');
    await linkButton.trigger('click');

    const accountInput = wrapper.find('input[placeholder="00000000-0000-0000-0000-000000000000"]');
    expect(accountInput.exists()).toBe(true);
  });

  it('does not expose account controls to regular administrators', async () => {
    mocks.canAdministerAccounts.value = false;
    const wrapper = mount(ManageEmployees, {
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

    expect(wrapper.text()).not.toContain('Link account');
    expect(wrapper.find('[aria-label="Employee account"]').exists()).toBe(false);
    expect(wrapper.find('th:nth-child(3)').text()).toBe('Status');
  });
});
