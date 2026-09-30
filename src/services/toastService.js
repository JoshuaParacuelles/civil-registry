let toasts = [];
let nextId = 1;
const listeners = new Set();

const emit = () => listeners.forEach((listener) => listener());

export function pushToast(toast) {
  const id = nextId++;
  toasts = [...toasts, { ...toast, id }];
  emit();
  return id;
}

export function removeToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts() {
  return toasts;
}