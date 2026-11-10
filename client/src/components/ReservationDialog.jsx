// Take or edit a reservation. Reservations are for today; the table is held until the guests are seated or it is cancelled.
// The 50-peso fee is added to the final bill (or deducted, depending on Billing settings).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toIso = (hm) => { const [h, m] = hm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };

export default function ReservationDialog({ existing, onClose, onDone }) {
  const soon = new Date(Date.now() + 30 * 60000);
  const [tokens, setTokens] = useState([]);
  const [tokenId, setTokenId] = useState(existing ? existing.tokenId : null);
  const [name, setName] = useState(existing ? existing.name : '');
  const [phone, setPhone] = useState(existing ? existing.phone || '' : '');
  const [party, setParty] = useState(existing && existing.partySize ? String(existing.partySize) : '');
  const [time, setTime] = useState(existing ? hhmm(new Date(existing.time)) : hhmm(soon));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!existing) api.get('/api/tokens').then((d) => setTokens(d.tokens)).catch((e) => setError(e.message)); }, [existing]);
  const free = tokens.filter((t) => t.status === 'FREE' && t.zone !== 'TAKEOUT');

  async function submit() {
    setBusy(true); setError('');
    const body = { name, phone, partySize: party ? Number(party) : null, time: toIso(time) };
    try {
      if (existing) await api.patch(`/api/reservations/${existing.id}`, body);
      else await api.post('/api/reservations', { ...body, tokenId });
      onDone();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md space-y-3">
        <h3 className="font-bold text-lg">{existing ? `Edit reservation for ${existing.tokenNumber}` : 'New reservation'}</h3>
        {error && <div className="alert alert-error text-sm">{error}</div>}
        {!existing && (
          <div>
            <p className="text-sm mb-1">Table (free ones only)</p>
            <div className="flex flex-wrap gap-2">
              {free.map((t) => (
                <button key={t.id} onClick={() => setTokenId(t.id)} className={`btn btn-sm w-14 btn-outline ${t.id === tokenId ? 'btn-primary' : ''}`}>{t.number}</button>
              ))}
              {tokens.length > 0 && free.length === 0 && <p className="text-sm opacity-70">No free tables right now.</p>}
            </div>
          </div>
        )}
        <input className="input input-bordered input-sm w-full" placeholder="Guest name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input input-bordered input-sm w-full" placeholder="Phone (optional)" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="flex gap-3">
          <label className="form-control flex-1">
            <span className="label-text text-xs">Time (today)</span>
            <input className="input input-bordered input-sm" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="form-control w-28">
            <span className="label-text text-xs">Guests</span>
            <input className="input input-bordered input-sm" inputMode="numeric" value={party} onChange={(e) => setParty(e.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
        <div className="modal-action">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || !time || (!existing && !tokenId)} onClick={submit}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
