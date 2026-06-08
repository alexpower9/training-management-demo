import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageEmployees from '@/views/manage/ManageEmployees.vue';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  listEmployees: vi.fn(),
  getEmployee: vi.fn(),
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
    setEmployeeArchived: vi.fn(),
  },
}));

describe('ManageEmployees route state', () => {
  beforeEach(() => {
    const employee = {
      id: 'employee-1',
      displayName: 'Alex Power',
      jobTitle: 'Technician',
      crew: 'Field',
      homeBase: 'Labrador City',
      archivedAt: null,
      latestCompletionOn: null,
      version: 1,
    };
    mocks.listEmployees.mockResolvedValue({ items: [employee], total: 1 });
    mocks.getEmployee.mockResolvedValue({ ...employee, completions: [] });
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
});
