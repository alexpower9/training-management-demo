import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import FormDrawer from '@/components/manage/FormDrawer.vue';

describe('FormDrawer', () => {
  it('warns before discarding a dirty form', async () => {
    window.confirm.mockReturnValueOnce(false);
    const wrapper = mount(FormDrawer, {
      props: { open: true, title: 'Edit employee', dirty: true },
      global: { stubs: { Teleport: true } },
    });

    await wrapper.get('button[aria-label="Close"]').trigger('click');

    expect(window.confirm).toHaveBeenCalledWith('Discard your unsaved changes?');
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('submits through the shared save contract', async () => {
    const wrapper = mount(FormDrawer, {
      props: { open: true, title: 'Add employee', dirty: false },
      global: { stubs: { Teleport: true } },
    });

    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('save')).toHaveLength(1);
  });

  it('cannot be closed from its header or backdrop while saving', async () => {
    const wrapper = mount(FormDrawer, {
      props: {
        open: true,
        title: 'Edit completion dates',
        dirty: true,
        saving: true,
      },
      global: { stubs: { Teleport: true } },
    });

    const headerClose = wrapper.get('button[aria-label="Close"]');
    const backdropClose = wrapper.get('button[aria-label="Close form"]');
    expect(headerClose.attributes('disabled')).toBeDefined();
    expect(backdropClose.attributes('disabled')).toBeDefined();

    await headerClose.trigger('click');
    await backdropClose.trigger('click');

    expect(window.confirm).not.toHaveBeenCalled();
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});
