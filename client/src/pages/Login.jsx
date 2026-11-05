import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, homeFor } from '../auth/AuthContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function Login() {
  const { user, login } = useAuth();
  const [mode, setMode] = useState('loading');      // loading | setup | staff | pin | manager
  const [staff, setStaff] = useState([]);
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState('');
  const [form, setForm] = useState({ username: '', displayName: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try {
      const { needsSetup } = await api.get('/api/setup/status');
      if (needsSetup) return setMode('setup');
      setStaff(await api.get('/api/auth/staff'));
      setMode('staff');
    } catch {
      setError('Cannot reach the POS server. Check the Wi-Fi and the address.');
      setMode('staff');
    }
  };
  useEffect(() => { load(); }, []);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const attempt = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); setPin(''); } finally { setBusy(false); }
  };
  const press = (k) => {
    if (busy || !k) return;
    if (k === '⌫') return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 6);
    setPin(next);
    if (next.length === 6) attempt(() => login({ userId: picked.id, secret: next }));
  };
  const setup = (e) => {
    e.preventDefault();
    attempt(async () => {
      await api.post('/api/setup', form);
      await login({ username: form.username, secret: form.password });
    });
  };
  const managerLogin = (e) => {
    e.preventDefault();
    attempt(() => login({ username: form.username, secret: form.password }));
  };
  const field = (name, label, type = 'text') => (
    <label className="form-control w-full">
      <span className="label-text">{label}</span>
      <input className="input input-bordered" type={type} value={form[name]} required
        onChange={(e) => setForm({ ...form, [name]: e.target.value })} />
    </label>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card bg-base-200 w-full max-w-sm shadow">
        <div className="card-body gap-3">
          <h1 className="card-title justify-center text-2xl">Gats Bar and Restaurant</h1>
          {error && <div className="alert alert-error text-sm">{error}</div>}
          {mode === 'loading' && <div className="text-center"><span className="loading loading-spinner" /></div>}

          {mode === 'setup' && (
            <form onSubmit={setup} className="space-y-3">
              <p className="text-sm">First-time setup: create the manager account. Do this on the main terminal.</p>
              {field('displayName', 'Your name')}
              {field('username', 'Username')}
              {field('password', 'Password (8+ characters)', 'password')}
              <button className="btn btn-primary w-full" disabled={busy}>Create manager</button>
            </form>
          )}

          {mode === 'staff' && (
            <>
              <p className="text-center text-sm">Tap your name</p>
              <div className="grid grid-cols-2 gap-2">
                {staff.map((s) => (
                  <button key={s.id} className="btn btn-outline h-auto py-3 flex-col gap-0"
                    onClick={() => { setPicked(s); setPin(''); setError(''); setMode('pin'); }}>
                    {s.displayName}<span className="text-xs opacity-60 font-normal">{s.role}</span>
                  </button>
                ))}
              </div>
              {staff.length === 0 && !error && <p className="text-center text-sm opacity-70">No staff accounts yet. A manager can add them.</p>}
              <button className="btn btn-link btn-sm" onClick={() => { setMode('manager'); setError(''); }}>Manager login</button>
              <button className="btn btn-ghost btn-xs" onClick={load}>Refresh</button>
            </>
          )}

          {mode === 'pin' && (
            <>
              <p className="text-center font-semibold">{picked.displayName}</p>
              <div className="flex justify-center gap-2 my-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className={`w-3 h-3 rounded-full ${i < pin.length ? 'bg-primary' : 'bg-base-300'}`} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {KEYS.map((k, i) => (
                  <button key={i} className={`btn btn-lg ${k ? '' : 'invisible'}`} disabled={busy} onClick={() => press(k)}>{k}</button>
                ))}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setMode('staff'); setPin(''); setError(''); }}>Back</button>
            </>
          )}

          {mode === 'manager' && (
            <form onSubmit={managerLogin} className="space-y-3">
              {field('username', 'Username')}
              {field('password', 'Password', 'password')}
              <button className="btn btn-primary w-full" disabled={busy}>Log in</button>
              <button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => { setMode('staff'); setError(''); }}>Back</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
