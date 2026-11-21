import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { connectSocket } from '../lib/socket';
import { useConfirm } from './ConfirmProvider';
import { useTheme } from './ThemeProvider';
import Icon from './Icon';

// Common page frame: logo, title, who is logged in, live-connection badge, theme toggle, logout (always asks first).
// wide = full-width content (the kitchen grid). rail = an optional column on the left (the cashier PC's icon menu).
export default function Shell({ title, children, wide = false, rail = null }) {
  const { user, logout } = useAuth();
  const { mode, toggle } = useTheme();
  const confirm = useConfirm();
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const s = connectSocket();
    setOnline(s.connected);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    s.on('connect', up);
    s.on('disconnect', down);
    s.on('connect_error', down);
    return () => { s.off('connect', up); s.off('disconnect', down); s.off('connect_error', down); };
  }, []);

  async function onLogout() {
    const yes = await confirm({
      title: 'Log out?', message: `${user.displayName} will be logged out of this screen.`, confirmText: 'Log out', cancelText: 'Stay logged in',
    });
    if (yes) logout();
  }

  return (
    <div className="min-h-screen flex">
      {rail}
      <div className="flex-1 min-w-0">
        <div className="navbar bg-neutral text-neutral-content px-4 gap-4">
          {/* The path starts with "/" so it works on every page. "./images/..." breaks on /desktop/order, /desktop/reservations... */}
          <img src="/images/logo.png" alt="Gat's Bar" className="h-12 w-auto" />
          <h1 className="flex-1 text-xl font-bold">{title}</h1>
          <span className={`badge ${online ? 'badge-success' : 'badge-error'}`}>{online ? 'live' : 'offline'}</span>
          <span className="text-sm hidden sm:inline">{user.displayName} ({user.role})</span>
          <button className="btn btn-ghost btn-sm btn-square" onClick={toggle}
            aria-label={mode === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
            title={mode === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}>
            <Icon name={mode === 'dark' ? 'sun' : 'moon'} size={20} />
          </button>
          <button className="btn btn-sm" onClick={onLogout}>Log out</button>
        </div>
        <main className={`p-4 mx-auto ${wide ? '' : 'max-w-3xl'}`}>{children}</main>
      </div>
    </div>
  );
}
