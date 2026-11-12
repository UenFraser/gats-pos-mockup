// Restore a backup. Manager approval PIN required. The program restarts to apply it; the current data is kept as a safety copy.
import { useState } from 'react';
import { api } from '../lib/api';
import { dateTimeLocal } from '../lib/format';

export default function RestoreDialog({ backup, onClose }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const ready = /^\d{6}$/.test(pin) && !busy;

  async function submit() {
    setBusy(true); setError('');
    try { await api.post('/api/system/restore', { name: backup.name, approvalPin: pin }); setDone(true); }
    catch (e) { setError(e.message); setPin(''); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm space-y-3">
        <h3 className="font-bold text-lg">Restore this backup?</h3>
        <p className="text-sm break-all">{backup.name}<br /><span className="opacity-70">made {dateTimeLocal(backup.at)}</span></p>
        {!done ? (
          <>
            <div className="alert alert-warning text-sm">
              The POS will restart. Everything entered AFTER this backup was made will be missing. The current data is kept as a safety copy, so nothing is lost for good.
            </div>
            {error && <div className="alert alert-error text-sm">{error}</div>}
            <p className="text-xs opacity-70">A manager types their approval PIN:</p>
            <input className="input input-bordered w-full text-center tracking-widest text-xl" type="password" inputMode="numeric" autoComplete="off" maxLength={6}
              placeholder="------" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && ready) submit(); }} />
            <div className="modal-action">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-error" disabled={!ready} onClick={submit}>{busy ? 'Checking...' : 'Restore and restart'}</button>
            </div>
          </>
        ) : (
          <div className="alert alert-success text-sm">Restoring. The POS is restarting; this screen will reconnect in a few seconds.</div>
        )}
      </div>
    </div>
  );
}
