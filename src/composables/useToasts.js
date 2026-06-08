import { reactive } from 'vue';

const toasts = reactive([]);
let nextId = 1;

export function addToast(message, tone = 'success') {
  const id = nextId++;
  toasts.push({ id, message, tone });
  window.setTimeout(() => removeToast(id), 4500);
}

export function removeToast(id) {
  const index = toasts.findIndex((toast) => toast.id === id);
  if (index >= 0) toasts.splice(index, 1);
}

export function useToasts() {
  return { toasts, addToast, removeToast };
}
