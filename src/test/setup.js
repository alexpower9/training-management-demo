import { afterEach, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';

enableAutoUnmount(afterEach);

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

window.confirm = vi.fn(() => true);
