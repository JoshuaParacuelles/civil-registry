import { createContext, useEffect, useState } from 'react'
import { isOnline, onChange } from '../offline/connectivity'

export const ConnectivityContext = createContext({ online: true })

export function ConnectivityProvider({ children }) {
  const [online, setOnline] = useState(isOnline())
  useEffect(() => onChange(setOnline), [])
  return (
    <ConnectivityContext.Provider value={{ online }}>
      {children}
    </ConnectivityContext.Provider>
  )
}