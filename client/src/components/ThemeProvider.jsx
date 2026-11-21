// Applies the logged-in user's theme and offers a toggle: const { mode, toggle } = useTheme();
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { applyTheme, readDeviceTheme, readUserTheme, saveTheme } from '../lib/theme';

const ThemeCtx = createContext({ mode: 'light', toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }) {
  const { user } = useAuth();
  const [mode, setMode] = useState(readDeviceTheme);
  const userId = user ? user.id : null;

  useEffect(() => { // when someone logs in, switch to THEIR theme; logged out, use the device's last choice
    const m = (userId && readUserTheme(userId)) || readDeviceTheme();
    setMode(m);
    applyTheme(m);
  }, [userId]);

  const toggle = useCallback(() => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    applyTheme(next);
    saveTheme(userId, next);
  }, [mode, userId]);

  return <ThemeCtx.Provider value={{ mode, toggle }}>{children}</ThemeCtx.Provider>;
}
