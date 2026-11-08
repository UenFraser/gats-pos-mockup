// Apply or remove a discount. Like a void, a manager or the Lead Cashier must type their approval PIN.
// The server calculates the discount (and the VAT effect for Senior/PWD); this screen only sends the choice.
import { useState } from 'react';
import { api } from '../lib/api';

const KINDS = [
  { id: 'SENIOR', label: 'Senior 20%' }, { id: 'PWD', label: 'PWD 20%' },
  { id: 'PERCENT', label: 'Percent' }, { id: 'AMOUNT', label: 'Fixed amount' },
];

export default function DiscountDialog({ session, mode, onClose, onDone }) {
  const [kind, setKind] = useState('SENIOR');
  const [name, setName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [percent, setPercent] = useState('');
  const [pesos, setPesos] = useState('');
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const statutory = kind === 'SENIOR' || kind === 'PWD';
  const body = statutory
    ? { kind, customerName: name, idNumber }
    : kind === 'PERCENT' ? { kind, percent: Number(percent), reason } : { kind, amountCents: Math.round(Number(pesos) * 100), reason };
  const filled = mode === 'remove' ? true
    : statutory ? name.trim() && idNumber.trim()
      : kind === 'PERCENT' ? Number(percent) > 0 && reason.trim() : Number(pesos) > 0 && reason.trim();
  const ready = !!filled && /^\d{6}$/.test(pin) && !busy;

  async function submit() {
    setBusy(true); setError('');
    try {
      if (mode === 'remove') await api.post(`/api/sessions/${session.id}/discount/remove`, { approvalPin: pin });
      else await api.post(`/api/sessions/${session.id}/discount`, { ...body, approvalPin: pin });
      onDone();
    } catch (e) {
      setError(e.message); setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm space-y-3">
        <h3 className="font-bold text-lg">{mode === 'remove' ? `Remove the discount on ${session.tokenNumber}` : `Discount for ${session.tokenNumber}`}</h3>
        {error && <div className="alert alert-error text-sm">{error}</div>}

        {mode === 'apply' && (
          <>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => <button key={k.id} className={`btn btn-xs ${kind === k.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setKind(k.id)}>{k.label}</button>)}
            </div>
            {statutory && (
              <>
                <p className="text-xs opacity-70">Applies to the whole tab. For a group, move the senior or PWD's own items to a separate table first (Swap), then discount that table.</p>
                <input className="input input-bordered input-sm w-full" placeholder="Customer name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
                <input className="input input-bordered input-sm w-full" placeholder="Senior / PWD ID number" maxLength={40} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
              </>
            )}
            {kind === 'PERCENT' && (
              <input className="input input-bordered input-sm w-full" inputMode="decimal" placeholder="Percent (for example 10)" value={percent}
                onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ''))} />
            )}
            {kind === 'AMOUNT' && (
              <input className="input input-bordered input-sm w-full" inputMode="decimal" placeholder="Amount in pesos" value={pesos}
                onChange={(e) => setPesos(e.target.value.replace(/[^\d.]/g, ''))} />
            )}
            {!statutory && <input className="input input-bordered input-sm w-full" placeholder="Reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </>
        )}
        {mode === 'remove' && session.discount && <p className="text-sm">{session.discount.label}: {session.discount.reason}</p>}

        <div>
          <p className="text-xs opacity-70 mb-1">A manager or the Lead Cashier types their approval PIN:</p>
          <input className="input input-bordered w-full text-center tracking-widest text-xl" type="password" inputMode="numeric" autoComplete="off"
            maxLength={6} placeholder="------" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' && ready) submit(); }} />
        </div>

        <div className="modal-action">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!ready} onClick={submit}>{busy ? 'Checking...' : mode === 'remove' ? 'Remove discount' : 'Apply discount'}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
