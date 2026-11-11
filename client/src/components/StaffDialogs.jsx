// Add / edit staff and manage approval PINs. Rules are enforced by the server (for example, the last manager cannot be removed).
import { useState } from 'react';
import { api } from '../lib/api';

export const ROLE_LABEL = { WAITER: 'Waiter', CASHIER: 'Cashier', KDS: 'Kitchen', MANAGER: 'Manager' };
const ROLES = ['WAITER', 'CASHIER', 'KDS', 'MANAGER'];
const isPinRole = (role) => role !== 'MANAGER'; // waiters, cashiers and kitchen log in with a 6-digit PIN; managers use a password

function SecretFields({ role, secret, setSecret, repeat, setRepeat, optional }) {
  const pin = isPinRole(role);
  return (
    <>
      <input className="input input-bordered input-sm w-full" type="password" autoComplete="new-password" inputMode={pin ? 'numeric' : 'text'}
        maxLength={pin ? 6 : 60} placeholder={`${optional ? 'New ' : ''}${pin ? '6-digit login PIN' : 'Password (8+ characters)'}${optional ? ' (leave empty to keep)' : ''}`}
        value={secret} onChange={(e) => setSecret(pin ? e.target.value.replace(/\D/g, '') : e.target.value)} />
      {(secret || !optional) && (
        <input className="input input-bordered input-sm w-full" type="password" autoComplete="new-password" inputMode={pin ? 'numeric' : 'text'}
          maxLength={pin ? 6 : 60} placeholder="Repeat it" value={repeat} onChange={(e) => setRepeat(pin ? e.target.value.replace(/\D/g, '') : e.target.value)} />
      )}
    </>
  );
}

const secretOk = (role, secret, repeat) => (isPinRole(role) ? /^\d{6}$/.test(secret) : secret.length >= 8) && secret === repeat;

export function AddStaffDialog({ onClose, onDone }) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [touched, setTouched] = useState(false);
  const [role, setRole] = useState('WAITER');
  const [secret, setSecret] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = displayName.trim() && username.trim() && secretOk(role, secret, repeat) && !busy;

  async function submit() {
    setBusy(true); setError('');
    try { await api.post('/api/users', { username, displayName, role, secret }); onDone(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm space-y-3">
        <h3 className="font-bold text-lg">Add staff</h3>
        {error && <div className="alert alert-error text-sm">{error}</div>}
        <input className="input input-bordered input-sm w-full" placeholder="Name shown on the screen" maxLength={40} value={displayName}
          onChange={(e) => { setDisplayName(e.target.value); if (!touched) setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '')); }} />
        <input className="input input-bordered input-sm w-full" placeholder="Username (unique)" maxLength={30} value={username}
          onChange={(e) => { setTouched(true); setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '')); }} />
        <select className="select select-bordered select-sm w-full" value={role} onChange={(e) => { setRole(e.target.value); setSecret(''); setRepeat(''); }}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <SecretFields role={role} secret={secret} setSecret={setSecret} repeat={repeat} setRepeat={setRepeat} />
        <div className="modal-action">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!ready} onClick={submit}>{busy ? 'Saving...' : 'Add'}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}

export function EditStaffDialog({ user, isMe, onClose, onDone }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(!!user.active);
  const [secret, setSecret] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const kindChanged = isPinRole(role) !== isPinRole(user.role);
  const secretGiven = secret.length > 0;
  const ready = displayName.trim() && (!kindChanged || secretGiven) && (!secretGiven || secretOk(role, secret, repeat)) && !busy;

  async function submit() {
    if (isMe && (!active || role !== user.role) && !window.confirm('You are changing your own account. Continue?')) return;
    setBusy(true); setError('');
    try {
      await api.patch(`/api/users/${user.id}`, { displayName, role, active, ...(secretGiven ? { secret } : {}) });
      onDone();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm space-y-3">
        <h3 className="font-bold text-lg">Edit {user.displayName}</h3>
        <p className="text-xs opacity-60">Username: {user.username}</p>
        {error && <div className="alert alert-error text-sm">{error}</div>}
        <input className="input input-bordered input-sm w-full" maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <select className="select select-bordered select-sm w-full" value={role} onChange={(e) => { setRole(e.target.value); setSecret(''); setRepeat(''); }}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        {kindChanged && <p className="text-xs text-warning">Switching between PIN and password roles needs a new {isPinRole(role) ? 'PIN' : 'password'}.</p>}
        <SecretFields role={role} secret={secret} setSecret={setSecret} repeat={repeat} setRepeat={setRepeat} optional={!kindChanged} />
        <label className="label cursor-pointer justify-start gap-3">
          <input type="checkbox" className="checkbox checkbox-sm" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span className="label-text">Active (untick when someone leaves; their history stays)</span>
        </label>
        <div className="modal-action">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!ready} onClick={submit}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}

// Approval PIN: lets a manager (and the designated Lead Cashier) approve voids, discounts and cancelled takeouts.
// A manager's own approval PIN is also what unlocks exporting daily summaries.
export function ApprovalPinDialog({ user, hasPin, onClose, onDone }) {
  const [pin, setPin] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = /^\d{6}$/.test(pin) && pin === repeat && !busy;

  async function save() {
    setBusy(true); setError('');
    try { await api.patch(`/api/users/${user.id}/approval-pin`, { pin }); onDone(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`${user.displayName} will no longer be able to approve anything. Remove the PIN?`)) return;
    setBusy(true); setError('');
    try { await api.del(`/api/users/${user.id}/approval-pin`); onDone(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm space-y-3">
        <h3 className="font-bold text-lg">Approval PIN for {user.displayName}</h3>
        <p className="text-xs opacity-70">{user.role === 'CASHIER'
          ? 'Only the designated Lead Cashier should have one. It is separate from their login PIN.'
          : 'Managers use it to approve voids and discounts, and to export daily summaries. It is separate from the login password.'}</p>
        {error && <div className="alert alert-error text-sm">{error}</div>}
        <input className="input input-bordered input-sm w-full text-center tracking-widest" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6}
          placeholder="New 6-digit approval PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        <input className="input input-bordered input-sm w-full text-center tracking-widest" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6}
          placeholder="Repeat it" value={repeat} onChange={(e) => setRepeat(e.target.value.replace(/\D/g, ''))} />
        <div className="modal-action">
          {hasPin && <button className="btn btn-ghost btn-error mr-auto" disabled={busy} onClick={remove}>Remove PIN</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!ready} onClick={save}>{busy ? 'Saving...' : hasPin ? 'Change PIN' : 'Set PIN'}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
