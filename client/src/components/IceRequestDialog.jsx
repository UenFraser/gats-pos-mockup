// Ask the kitchen for ice for a table. Ice is free, so there is no bill and no approval.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const ZONES = ['RESTAURANT', 'BAR', 'TAKEOUT'];
const ZONE_LABEL = { RESTAURANT: 'Restaurant', BAR: 'Bar', TAKEOUT: 'Takeout' };
const STATUS_CLASS = { FREE: 'btn-outline', OPEN: 'btn-warning', RESERVED: 'btn-info' };

export default function IceRequestDialog({ onClose, onDone }) {
  const [tokens, setTokens] = useState([]);
  const [tokenId, setTokenId] = useState(null);
  const [trays, setTrays] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/api/tokens').then((d) => setTokens(d.tokens)).catch((e) => setError(e.message)); }, []);
  const chosen = tokens.find((t) => t.id === tokenId);

  async function submit() {
    setBusy(true); setError('');
    try { await api.post('/api/ice', { tokenId, trays }); onDone(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md space-y-3">
        <h3 className="font-bold text-lg">Request ice</h3>
        {error && <div className="alert alert-error text-sm">{error}</div>}
        <div>
          <p className="text-sm mb-1">Which table?</p>
          {ZONES.map((z) => (
            <div key={z} className="mb-2">
              <p className="text-xs opacity-70 mb-1">{ZONE_LABEL[z]}</p>
              <div className="flex flex-wrap gap-2">
                {tokens.filter((t) => t.zone === z).map((t) => (
                  <button key={t.id} onClick={() => setTokenId(t.id)}
                    className={`btn btn-sm w-14 ${STATUS_CLASS[t.status]} ${t.id === tokenId ? 'ring ring-primary' : ''}`}>{t.number}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">Trays</span>
          <button className="btn btn-sm" disabled={trays <= 1} onClick={() => setTrays(trays - 1)}>-</button>
          <span className="w-8 text-center font-bold">{trays}</span>
          <button className="btn btn-sm" disabled={trays >= 9} onClick={() => setTrays(trays + 1)}>+</button>
        </div>
        <div className="modal-action">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-info" disabled={!tokenId || busy} onClick={submit}>
            {busy ? 'Sending...' : chosen ? `Request ice for ${chosen.number}` : 'Choose a table'}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
