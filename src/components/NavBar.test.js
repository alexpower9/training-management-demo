import { mount, RouterLinkStub } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { auth } from '@/auth/auth';
import NavBar from '@/components/NavBar.vue';

function mountNavigation(role) {
  auth.state.isAuthenticated = true;
  auth.state.role = role;
  return mount(NavBar, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
}

afterEach(() => {
  auth.state.isAuthenticated = false;
  auth.state.role = null;
});

describe('NavBar', () => {
  it('places Medical between Training and Manage for administrators and owners', () => {
    for (const role of ['admin', 'owner']) {
      const wrapper = mountNavigation(role);
      const links = wrapper
        .find('nav[aria-label="Primary navigation"]')
        .findAllComponents(RouterLinkStub);

      expect(links.map((link) => link.text())).toEqual([
        'Training',
        'Medical',
        'Manage',
      ]);
      expect(links.map((link) => link.props('to'))).toEqual([
        '/training',
        '/medical',
        '/manage',
      ]);
      wrapper.unmount();
    }
  });

  it('keeps Medical available while hiding Manage for employees', () => {
    const wrapper = mountNavigation('employee');
    const links = wrapper
      .find('nav[aria-label="Primary navigation"]')
      .findAllComponents(RouterLinkStub);

    expect(links.map((link) => link.text())).toEqual(['Training', 'Medical']);
  });
});
