import { useContext } from 'react'
import { ConnectivityContext } from '../context/ConnectivityContext'

export default function useConnectivity() {
  return useContext(ConnectivityContext)
}