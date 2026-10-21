import { useRegisterSW } from 'virtual:pwa-register/react'

export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // susiha kada oras kon naay bag-ong version samtang naka-open ang app
      if (reg) setInterval(() => reg.update(), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        background: '#1a3c6e',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: 8,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      }}
    >
      <span>May bag-ong version na.</span>
      <button onClick={() => updateServiceWorker(true)}>Update</button>
      <button onClick={() => setNeedRefresh(false)}>Later</button>
    </div>
  )
}