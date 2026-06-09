import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageAdministrators from '@/views/manage/ManageAdministrators.vue';

const mocks = vi.hoisted(() => ({
  listAdministrators: vi.fn(),
  inviteAdministrator: vi.fn(),
}));

vi.mock('@/services/adminRepository', () => ({
  adminRepository: {
    listAdministrators: mocks.listAdministrators,
    inviteAdministrator: mocks.inviteAdministrator,
  },
}));

describe('ManageAdministrators', () => {
  beforeEach(() => {
    mocks.listAdministrators.mockResolvedValue({
      items: [
        {
          username: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Existing Admin',
          status: 'CONFIRMED',
          enabled: true,
        },
      ],
    });
    mocks.inviteAdministrator.mockResolvedValue({
      username: 'admin-2',
      email: 'new-admin@example.com',
      displayName: 'New Admin',
      status: 'FORCE_CHANGE_PASSWORD',
      enabled: true,
    });
  });

  it('lists administrators and sends an invitation', async () => {
    const wrapper = mount(ManageAdministrators, {
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Existing Admin');
    await wrapper.get('button.primary-action').trigger('click');
    await wrapper.get('input[autocomplete="name"]').setValue('New Admin');
    await wrapper.get('input[type="email"]').setValue('new-admin@example.com');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mocks.inviteAdministrator).toHaveBeenCalledWith({
      displayName: 'New Admin',
      email: 'new-admin@example.com',
    });
  });
});
