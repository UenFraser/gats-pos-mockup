import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Where each role lands after login.
export const homeFor = (role) =>
  ({ MANAGER: '/desktop', CASHIER: '/desktop', WAITER: '/waiter', KDS: '/kitchen' }[role] || '/login');

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const clear = useCallback(() => { setToken(null); disconnectSocket(); setUser(null); }, []);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const { user: me } = await api.get('/api/auth/me');
          setUser(me);
          connectSocket();
        } catch (e) {
          if (e.status === 401) setToken(null);   // only forget the token if the server rejected it
        }
      }
      setReady(true);
    })();
    window.addEventListener('gats:unauthorized', clear);
    return () => window.removeEventListener('gats:unauthorized', clear);
  }, [clear]);

  const login = async (creds) => {
    const { token, user: me } = await api.post('/api/auth/login', { ...creds, device: navigator.userAgent.slice(0, 80) });
    setToken(token);
    setUser(me);
    connectSocket();
    return me;
  };

  const logout = async () => {
    try { if (getToken()) await api.post('/api/auth/logout'); } catch { /* already invalid */ }
    clear();
  };

  return <AuthCtx.Provider value={{ user, ready, login, logout }}>{children}</AuthCtx.Provider>;
}
