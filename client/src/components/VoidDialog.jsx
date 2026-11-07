// Void part of an item. A manager or the Lead Cashier must type their approval PIN. The price and the
// approver are decided by the server; this screen only sends what to void, why, and the PIN typed.
import { useState } from 'react';
import { api } from '../lib/api';
import { php } from '../lib/format';

const REASONS = ['Customer cancelled', 'Wrong order', 'Kitchen error', 'Out of stock', 'Other'];

export default function VoidDialog({ sessionId, item, onClose, onDone }) {
  const left = item.netQuantity;
  const [qty, setQty] = useState(1);
  const [preset, setPreset] = useState(REASONS[0]);
  const [custom, setCustom] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reason = preset === 'Other' ? custom.trim() : preset;
  const ready = !!reason && /^\d{6}$/.test(pin) && !busy;

  async function submit() {
    setBusy(true); setError('');
    try {
      await api.post(`/api/sessions/${sessionId}/voids`, { orderItemId: item.id, quantity: qty, reason, approvalPin: pin });
      onDone();
    } catch (e) {
      setError(e.message);
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm space-y-3">
        <h3 className="font-bold text-lg">Void {item.name}</h3>
        {error && <div className="alert alert-error text-sm">{error}</div>}

        <div className="flex items-center gap-3">
          <span className="text-sm">How many?</span>
          <button className="btn btn-sm" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>-</button>
          <span className="w-8 text-center font-bold">{qty}</span>
          <button className="btn btn-sm" disabled={qty >= left} onClick={() => setQty(qty + 1)}>+</button>
          <span className="text-xs opacity-60">of {left}</span>
          <span className="ml-auto font-semibold text-error">-{php(qty * item.unitPriceCents)}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button key={r} className={`btn btn-xs ${preset === r ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPreset(r)}>{r}</button>
          ))}
        </div>
        {preset === 'Other' && (
          <input className="input input-bordered input-sm w-full" placeholder="Reason" maxLength={200}
            value={custom} onChange={(e) => setCustom(e.target.value)} />
        )}

        <div>
          <p className="text-xs opacity-70 mb-1">A manager or the Lead Cashier types their approval PIN:</p>
          <input className="input input-bordered w-full text-center tracking-widest text-xl" type="password" inputMode="numeric"
            autoComplete="off" maxLength={6} placeholder="------" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' && ready) submit(); }} />
        </div>

        <div className="modal-action">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-error" disabled={!ready} onClick={submit}>{busy ? 'Checking...' : 'Void'}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
