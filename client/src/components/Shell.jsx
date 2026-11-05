import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { connectSocket } from '../lib/socket';

// Common page frame: title, who is logged in, live-connection badge, logout.
// wide = full-width content (the kitchen grid).
export default function Shell({ title, children, wide = false }) {
  const { user, logout } = useAuth();
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

  return (
    <div className="min-h-screen">
      <div className="navbar bg-base-200 px-4 gap-2">
        <h1 className="flex-1 text-xl font-bold">{title}</h1>
        <span className={`badge ${online ? 'badge-success' : 'badge-error'}`}>{online ? 'live' : 'offline'}</span>
        <span className="text-sm hidden sm:inline">{user.displayName} ({user.role})</span>
        <button className="btn btn-sm" onClick={logout}>Log out</button>
      </div>
      <main className={`p-4 mx-auto ${wide ? '' : 'max-w-3xl'}`}>{children}</main>
    </div>
  );
}
