const API = import.meta.env.VITE_API_BASE_URL || ''

let online = typeof navigator !== 'undefined' ? navigator.onLine : true
const listeners = new Set()

function set(v) {
  if (v !== online) {
    online = v
    listeners.forEach((f) => f(v))
  }
}

export async function check() {
  try {
    const r = await fetch(`${API}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    set(r.ok)
  } catch {
    set(false)
  }
}

window.addEventListener('online', check)
window.addEventListener('offline', () => set(false))
setInterval(check, 15000)
check()

export const onChange = (f) => {
  listeners.add(f)
  return () => listeners.delete(f)
}
export const isOnline = () => online