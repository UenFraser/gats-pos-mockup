// Move an item to another table: the waiter picked the wrong table. This is NOT a void (nothing is wasted).
// The server keeps the quoted price, tells the kitchen if the food is still being made, and notifies both tabs.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const ZONES = ['RESTAURANT', 'BAR', 'TAKEOUT'];
const ZONE_LABEL = { RESTAURANT: 'Restaurant', BAR: 'Bar', TAKEOUT: 'Takeout' };
const STATUS_CLASS = { FREE: 'btn-outline', OPEN: 'btn-warning', RESERVED: 'btn-info' };

export default function SwapDialog({ session, item, onClose, onDone }) {
  const left = item.netQuantity;
  const [tokens, setTokens] = useState([]);
  const [qty, setQty] = useState(1);
  const [toId, setToId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/api/tokens').then((d) => setTokens(d.tokens)).catch((e) => setError(e.message)); }, []);

  // Alcohol can only go to another bar token (the server enforces this too).
  const choices = tokens.filter((t) => t.id !== session.tokenId && (!item.barOnly || t.zone === 'BAR'));
  const dest = tokens.find((t) => t.id === toId);

  async function submit() {
    setBusy(true); setError('');
    try {
      await api.post(`/api/sessions/${session.id}/swaps`, { orderItemId: item.id, quantity: qty, toTokenId: toId });
      onDone(dest.number);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md space-y-3">
        <h3 className="font-bold text-lg">Swap {item.name}</h3>
        <p className="text-xs opacity-70">Moves it from {session.tokenNumber} to another table. Nothing is voided or wasted.</p>
        {error && <div className="alert alert-error text-sm">{error}</div>}

        <div className="flex items-center gap-3">
          <span className="text-sm">How many?</span>
          <button className="btn btn-sm" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>-</button>
          <span className="w-8 text-center font-bold">{qty}</span>
          <button className="btn btn-sm" disabled={qty >= left} onClick={() => setQty(qty + 1)}>+</button>
          <span className="text-xs opacity-60">of {left}</span>
        </div>

        <div>
          <p className="text-sm mb-1">Move to:</p>
          {ZONES.map((z) => {
            const list = choices.filter((t) => t.zone === z);
            if (!list.length) return null;
            return (
              <div key={z} className="mb-2">
                <p className="text-xs opacity-70 mb-1">{ZONE_LABEL[z]}</p>
                <div className="flex flex-wrap gap-2">
                  {list.map((t) => (
                    <button key={t.id} onClick={() => setToId(t.id)}
                      className={`btn btn-sm w-14 ${STATUS_CLASS[t.status]} ${t.id === toId ? 'ring ring-primary' : ''}`}>
                      {t.number}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-xs opacity-60">Outlined = free, orange = open tab, blue = reserved.</p>
        </div>

        <div className="modal-action">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-info" disabled={!toId || busy} onClick={submit}>
            {busy ? 'Moving...' : dest ? `Move ${qty}x to ${dest.number}` : 'Choose a table'}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
