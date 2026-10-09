import { mount, RouterLinkStub } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NavBar from '@/components/NavBar.vue';

describe('NavBar', () => {
  it('opens Training, Medical, and Manage for every demo visitor', () => {
    const wrapper = mount(NavBar, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
    const links = wrapper
      .get('nav[aria-label="Primary navigation"]')
      .findAllComponents(RouterLinkStub);

    expect(links.map((link) => link.text())).toEqual(['Training', 'Medical', 'Manage']);
    expect(links.map((link) => link.props('to'))).toEqual(['/training', '/medical', '/manage']);
    expect(wrapper.text()).not.toContain('Sign out');
  });
});
