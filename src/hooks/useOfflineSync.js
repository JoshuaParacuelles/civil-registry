import { useOffline } from '../context/OfflineContext';


// { online, sync: {syncing, done, total, lastError}, counts, syncNow }
export default function useOfflineSync() {
  return useOffline();
}