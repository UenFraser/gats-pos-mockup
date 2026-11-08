// Take payment and close the tab. Split payments are several lines (for example GCash + cash).
// The server re-checks everything: it decides the amount due, the change, and what each line pays.
import { useState } from 'react';
import { api } from '../lib/api';
import { php } from '../lib/format';
import BillLines from './BillLines';

const METHODS = [
  { id: 'CASH', label: 'Cash' }, { id: 'GCASH', label: 'GCash' }, { id: 'CARD', label: 'Card' }, { id: 'OTHER', label: 'Other' },
];
const toCents = (text) => {
  const n = Math.round(parseFloat(text) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fixed = (cents) => (cents / 100).toFixed(2);

export default function CheckoutDialog({ session, onDone, onCancel }) {
  const bill = session.bill;
  const due = bill.dueCents;
  const [lines, setLines] = useState(() => (due > 0 ? [{ key: 1, method: 'CASH', text: '' }] : []));
  const [nextKey, setNextKey] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const parsed = lines.map((l) => ({ ...l, cents: toCents(l.text) }));
  const nonCash = parsed.filter((l) => l.method !== 'CASH').reduce((n, l) => n + l.cents, 0);
  const cash = parsed.filter((l) => l.method === 'CASH').reduce((n, l) => n + l.cents, 0);
  const cashNeeded = Math.max(0, due - nonCash);
  const short = Math.max(0, cashNeeded - cash);
  const change = Math.max(0, cash - cashNeeded);
  const valid = due === 0
    ? lines.length === 0
    : lines.length > 0 && parsed.every((l) => l.cents > 0) && nonCash <= due && (cashNeeded === 0 ? cash === 0 : cash >= cashNeeded);

  const update = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remainingFor = (key) => {
    const others = parsed.filter((l) => l.key !== key).reduce((n, l) => n + l.cents, 0);
    return Math.max(0, due - others);
  };
  function addLine(method) {
    const remaining = Math.max(0, due - parsed.reduce((n, l) => n + l.cents, 0));
    setLines((ls) => [...ls, { key: nextKey, method, text: remaining > 0 ? fixed(remaining) : '' }]);
    setNextKey(nextKey + 1);
  }

  async function submit() {
    setBusy(true); setError('');
    try {
      const r = await api.post(`/api/sessions/${session.id}/close`, {
        payments: parsed.map((l) => ({ method: l.method, amountCents: l.cents })),
      });
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function printAgain() {
    try { setResult(await api.post(`/api/sessions/${session.id}/print-receipt`).then((p) => ({ ...result, ...p }))); }
    catch (e) { setError(e.message); }
  }

  if (result) {
    return (
      <div className="modal modal-open">
        <div className="modal-box max-w-sm space-y-3 text-center">
          <h3 className="font-bold text-xl">{session.tokenNumber} closed</h3>
          {result.changeCents > 0 && (
            <div className="rounded-xl bg-success/20 py-4">
              <p className="text-sm">Change</p>
              <p className="text-4xl font-black">{php(result.changeCents)}</p>
            </div>
          )}
          {result.skipped && <p className="text-sm opacity-70">No receipt: nothing was sold on this tab.</p>}
          {!result.skipped && (result.printed
            ? <p className="text-sm text-success break-all">{result.savedTo ? `Receipt saved: ${result.savedTo}` : 'Receipt printed'}</p>
            : <div className="alert alert-warning text-sm text-left">Receipt not printed: {result.error || 'unknown problem'}</div>)}
          {error && <div className="alert alert-error text-sm">{error}</div>}
          <div className="modal-action justify-center">
            {!result.skipped && <button className="btn btn-outline" onClick={printAgain}>Print receipt again</button>}
            <button className="btn btn-primary" onClick={onDone}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md space-y-3">
        <h3 className="font-bold text-lg">Checkout {session.tokenNumber}</h3>
        <div className="rounded-xl bg-base-200 p-3 text-center">
          <p className="text-sm opacity-70">Amount due</p>
          <p className="text-4xl font-black">{php(due)}</p>
          <BillLines bill={bill} />
        </div>
        {error && <div className="alert alert-error text-sm">{error}</div>}
        {due === 0 && <p className="text-sm">Nothing is due on this tab. Close it to free the table.</p>}

        {parsed.map((l) => (
          <div key={l.key} className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="join">
                {METHODS.map((m) => (
                  <button key={m.id} className={`btn btn-xs join-item ${l.method === m.id ? 'btn-primary' : ''}`} onClick={() => update(l.key, { method: m.id })}>{m.label}</button>
                ))}
              </div>
              <button className="btn btn-xs btn-ghost ml-auto" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Remove</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">PHP</span>
              <input className="input input-bordered input-sm flex-1" inputMode="decimal" placeholder="0.00" value={l.text}
                onChange={(e) => update(l.key, { text: e.target.value.replace(/[^\d.]/g, '') })} />
              <button className="btn btn-xs" onClick={() => update(l.key, { text: fixed(remainingFor(l.key)) })}>Exact</button>
            </div>
            {l.method === 'CASH' && (
              <div className="flex gap-1 flex-wrap">
                {[100, 200, 500, 1000].map((v) => (
                  <button key={v} className="btn btn-xs btn-outline" onClick={() => update(l.key, { text: fixed(v * 100) })}>{v}</button>
                ))}
              </div>
            )}
          </div>
        ))}

        {due > 0 && (
          <div className="flex gap-1 flex-wrap items-center">
            <span className="text-xs opacity-70">Add payment:</span>
            {METHODS.map((m) => <button key={m.id} className="btn btn-xs btn-outline" onClick={() => addLine(m.id)}>{m.label}</button>)}
          </div>
        )}

        {due > 0 && (
          <div className="text-center">
            {short > 0 && <p className="text-error font-semibold">Short by {php(short)}</p>}
            {short === 0 && change > 0 && <p className="text-success font-bold text-2xl">Change {php(change)}</p>}
            {nonCash > due && <p className="text-error text-sm">Card, GCash and other payments are more than the bill</p>}
            {cashNeeded === 0 && cash > 0 && nonCash <= due && <p className="text-error text-sm">The bill is already covered, remove the cash line</p>}
          </div>
        )}

        <div className="modal-action">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-success" disabled={!valid || busy} onClick={submit}>{busy ? 'Closing...' : 'Close tab'}</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onCancel} />
    </div>
  );
}
