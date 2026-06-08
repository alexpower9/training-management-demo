import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageCompletions from '@/views/manage/ManageCompletions.vue';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  createCompletion: vi.fn(),
  listCompletions: vi.fn(),
  listEmployees: vi.fn(),
  listCourses: vi.fn(),
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
    voidCompletion: vi.fn(),
  },
}));

describe('ManageCompletions', () => {
  beforeEach(() => {
    mocks.listEmployees.mockResolvedValue({
      items: [{ id: 'employee-1', displayName: 'Alex Power', jobTitle: 'Technician' }],
      total: 1,
    });
    mocks.listCourses.mockResolvedValue({
      items: [
        {
          id: 'course-1',
          code: 'FIRST-AID',
          name: 'First Aid',
          defaultValidityMonths: 1,
        },
      ],
      total: 1,
    });
    mocks.listCompletions.mockResolvedValue({ items: [], total: 0 });
    mocks.createCompletion.mockResolvedValue({ id: 'completion-1' });
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
      expirySource: 'CALCULATED',
    });
  });
});
