// Nobody collected the takeout. A manager or the Lead Cashier approves with their PIN; the food is recorded as voided.
import { useState } from 'react';
import { api } from '../lib/api';

export default function CancelTakeoutDialog({ session, onClose, onDone }) {
  const [reason, setReason] = useState('Customer never came');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = reason.trim() && /^\d{6}$/.test(pin) && !busy;

  async function submit() {
    setBusy(true); setError('');
    try { await api.post(`/api/sessions/${session.id}/cancel`, { reason, approvalPin: pin }); onDone(); }
    catch (e) { setError(e.message); setPin(''); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm space-y-3">
        <h3 className="font-bold text-lg">Cancel the takeout for {session.customerName}</h3>
        <p className="text-xs opacity-70">Everything still on the order is recorded as voided (waste) and the table is freed.</p>
        {error && <div className="alert alert-error text-sm">{error}</div>}
        <input className="input input-bordered input-sm w-full" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        <div>
          <p className="text-xs opacity-70 mb-1">A manager or the Lead Cashier types their approval PIN:</p>
          <input className="input input-bordered w-full text-center tracking-widest text-xl" type="password" inputMode="numeric" autoComplete="off" maxLength={6}
            placeholder="------" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' && ready) submit(); }} />
        </div>
        <div className="modal-action">
          <button className="btn" onClick={onClose}>Keep it</button>
          <button className="btn btn-error" disabled={!ready} onClick={submit}>{busy ? 'Checking...' : 'Cancel the takeout'}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
