import { useEffect, useState } from 'react';
import { isDbAvailable, subscribeConnectivity, subscribeDb } from '../offline/connectivityService';

// true only when the server AND the database are reachable.
// Pages that call Supabase or the data API should use this.
export default function useOnlineStatus() {
  const [online, setOnline] = useState(isDbAvailable());

  useEffect(() => {
    const sync = () => setOnline(isDbAvailable());
    const unsubConnectivity = subscribeConnectivity(sync);
    const unsubDb = subscribeDb(sync);
    sync();
    return () => {
      unsubConnectivity();
      unsubDb();
    };
  }, []);

  return online;
}