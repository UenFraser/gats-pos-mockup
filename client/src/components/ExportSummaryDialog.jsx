// Export daily summaries to a file. A manager's approval PIN is required (a Lead Cashier's PIN is not enough).
import { useState } from 'react';
import { api } from '../lib/api';
import { downloadText } from '../lib/download';
import { php } from '../lib/format';

export default function ExportSummaryDialog({ summaries, initialDate, onClose }) {
  const [picked, setPicked] = useState(() => new Set([initialDate]));
  const [format, setFormat] = useState('csv');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const ready = picked.size > 0 && /^\d{6}$/.test(pin) && !busy;

  const toggle = (d) => setPicked((s) => { const c = new Set(s); if (c.has(d)) c.delete(d); else c.add(d); return c; });

  async function submit() {
    setBusy(true); setError(''); setDone('');
    try {
      const r = await api.post('/api/summaries/export', { dates: [...picked], format, approvalPin: pin });
      downloadText(r.filename, r.content, r.contentType);
      setDone(`Saved ${r.filename}`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); setPin(''); }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md space-y-3">
        <h3 className="font-bold text-lg">Export daily summaries</h3>
        {error && <div className="alert alert-error text-sm">{error}</div>}
        {done && <div className="alert alert-success text-sm break-all">{done}</div>}
        <div className="space-y-1">
          {summaries.map((s) => (
            <label key={s.date} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="checkbox checkbox-sm" checked={picked.has(s.date)} onChange={() => toggle(s.date)} />
              <span className="flex-1">{s.date}{s.isToday ? ' (today, not final)' : ''}</span>
              <span className="opacity-70">{php(s.totalCents)}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 items-center text-sm">
          <span>Format</span>
          <button className={`btn btn-xs ${format === 'csv' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFormat('csv')}>CSV (Excel)</button>
          <button className={`btn btn-xs ${format === 'json' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFormat('json')}>JSON</button>
        </div>
        <div>
          <p className="text-xs opacity-70 mb-1">A manager types their approval PIN:</p>
          <input className="input input-bordered w-full text-center tracking-widest text-xl" type="password" inputMode="numeric" autoComplete="off" maxLength={6}
            placeholder="------" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' && ready) submit(); }} />
        </div>
        <div className="modal-action">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={!ready} onClick={submit}>{busy ? 'Checking...' : 'Export'}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
