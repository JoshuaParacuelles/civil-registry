let toasts = [];
let nextId = 1;
const listeners = new Set();
const timers = new Map();
const removalTimers = new Map();

const DEFAULT_DURATION = 5000;
const HIDE_ANIMATION_MS = 300;

const emit = () => listeners.forEach((listener) => listener());

export function pushToast(toast) {
  const id = nextId++;
  const duration = toast.duration ?? DEFAULT_DURATION;
  toasts = [...toasts, { ...toast, id, duration, createdAt: Date.now(), hiding: false }];
  emit();
  timers.set(id, setTimeout(() => hideToast(id), duration));
  return id;
}

export function hideToast(id) {
  const toast = toasts.find((item) => item.id === id);
  if (!toast || toast.hiding) return;

  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts = toasts.map((item) => item.id === id ? { ...item, hiding: true } : item);
  emit();
  removalTimers.set(id, setTimeout(() => removeToast(id), HIDE_ANIMATION_MS));
}

export function removeToast(id) {
  clearTimeout(timers.get(id));
  clearTimeout(removalTimers.get(id));
  timers.delete(id);
  removalTimers.delete(id);
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