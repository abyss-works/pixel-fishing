import { useEffect, useState } from 'react';
import { readAdminAccess } from './queries';
import type { AdminAuth } from './accessContext';

export function useAdminAccess(): AdminAuth {
  const [auth, setAuth] = useState<AdminAuth>({ access: 'checking', uid: null });

  useEffect(() => {
    let alive = true;
    readAdminAccess()
      .then(result => {
        if (alive) setAuth({ access: result.kind === 'granted' ? 'granted' : result.kind, uid: result.uid });
      })
      .catch(() => {
        if (alive) setAuth({ access: 'denied', uid: null });
      });
    return () => { alive = false; };
  }, []);

  return auth;
}
