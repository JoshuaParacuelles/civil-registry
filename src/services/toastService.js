let toasts = [];
let nextId = 1;
const listeners = new Set();
const timers = new Map();
const removalTimers = new Map();

const DEFAULT_DURATION = 5000;
const HIDE_ANIMATION_MS = 300;
// An identical toast pushed again within this window is treated as a duplicate
// (e.g. React StrictMode double-running a mount effect) and ignored.
const DUPLICATE_WINDOW_MS = 1500;

const emit = () => listeners.forEach((listener) => listener());

export function pushToast(toast) {
  const now = Date.now();

  // Duplicate guard: same title + message, still visible, created just now.
  const duplicate = toasts.find(
    (t) =>
      !t.hiding &&
      t.title === toast.title &&
      t.message === toast.message &&
      now - t.createdAt < DUPLICATE_WINDOW_MS
  );
  if (duplicate) return duplicate.id;

  const id = nextId++;
  const duration = toast.duration ?? DEFAULT_DURATION;
  toasts = [...toasts, { ...toast, id, duration, createdAt: now, hiding: false }];
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