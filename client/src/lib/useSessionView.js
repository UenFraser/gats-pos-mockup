// Loads one tab (session) and keeps it fresh from live events.
// Viewing it clears its notifications on the server, but the screen keeps showing what changed
// (`changes`) until the user dismisses it, so nothing disappears before it is read.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { connectSocket } from './socket';

const LIVE = ['session:updated', 'session:bill-requested', 'session:bill-cleared',
  'kitchen:order-done', 'kitchen:order-recalled', 'connect'];

export function useSessionView(sessionId) {
  const [session, setSession] = useState(null);
  const [changes, setChanges] = useState([]);
  const seen = useRef(new Set());

  const load = useCallback(async () => {
    if (!sessionId) { setSession(null); return; }
    try {
      const { session: s } = await api.get(`/api/sessions/${sessionId}`);
      setSession(s);
      const fresh = s.notifications.filter((n) => !seen.current.has(n.id));
      if (fresh.length) {
        fresh.forEach((n) => seen.current.add(n.id));
        setChanges((c) => [...c, ...fresh]);
        api.post(`/api/sessions/${sessionId}/notifications/read`).catch(() => {});
      }
    } catch {
      setSession(null);
    }
  }, [sessionId]);

  useEffect(() => { seen.current = new Set(); setChanges([]); load(); }, [load]);

  useEffect(() => {
    if (!sessionId) return undefined;
    const s = connectSocket();
    LIVE.forEach((e) => s.on(e, load));
    return () => LIVE.forEach((e) => s.off(e, load));
  }, [sessionId, load]);

  const dismissChanges = useCallback(() => setChanges([]), []);
  return { session, changes, dismissChanges, reload: load };
}
