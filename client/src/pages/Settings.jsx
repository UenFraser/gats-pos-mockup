// Manager only: receipt text and the receipt printer.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import SystemPanel from '../components/SystemPanel';
import { api } from '../lib/api';

export default function Settings() {
  const [s, setS] = useState(null);
  const [printers, setPrinters] = useState(null); // Windows printers (only readable on the PC running the app)
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bill, setBill] = useState(null); // reservation fee + VAT

  useEffect(() => {
    api.get('/api/settings/print').then((d) => setS(d.settings)).catch((e) => setError(e.message));
    api.get('/api/settings/billing').then((d) => setBill(d.settings)).catch((e) => setError(e.message));
    api.get('/api/printers').then((p) => setPrinters(Array.isArray(p) ? p : null)).catch(() => setPrinters(null));
  }, []);

  const set = (patch) => { setS((v) => ({ ...v, ...patch })); setMsg(''); };

  async function save() {
    const d = await api.patch('/api/settings/print', s);
    setS(d.settings);
  }
  async function onSave() {
    setBusy(true); setError(''); setMsg('');
    try { await save(); setMsg('Saved'); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function onSaveBilling() {
    setBusy(true); setError(''); setMsg('');
    try {
      const d = await api.patch('/api/settings/billing', {
        feeCents: Math.round(Number(bill.feeText ?? bill.feeCents / 100) * 100),
        feeMode: bill.feeMode,
        vatMode: bill.vatMode,
        vatRateBps: Math.round(Number(bill.rateText ?? bill.vatRateBps / 100) * 100),
      });
      setBill(d.settings); setMsg('Billing saved');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function onTest() {
    setBusy(true); setError(''); setMsg('');
    try {
      await save();
      const r = await api.post('/api/settings/print/test');
      if (r.printed) setMsg(r.savedTo ? `Test receipt saved: ${r.savedTo}` : 'Test page sent to the printer'); else setError(`Test print failed: ${r.error}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Shell title="Settings">
      <Link to="/desktop" className="btn btn-ghost btn-sm mb-2">&larr; Desktop</Link>
      {!s ? <p>Loading...</p> : (
        <div className="space-y-4 max-w-xl">
          {error && <div className="alert alert-error text-sm">{error}</div>}
          {msg && <div className="alert alert-success text-sm">{msg}</div>}

          <h2 className="font-semibold">Receipt</h2>
          <label className="form-control">
            <span className="label-text text-sm">Business name</span>
            <input className="input input-bordered input-sm" maxLength={40} value={s.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="form-control">
            <span className="label-text text-sm">Header lines (address, contact; one per line)</span>
            <textarea className="textarea textarea-bordered" rows={3} maxLength={200} value={s.header} onChange={(e) => set({ header: e.target.value })} />
          </label>
          <label className="form-control">
            <span className="label-text text-sm">Footer</span>
            <input className="input input-bordered input-sm" maxLength={200} value={s.footer} onChange={(e) => set({ footer: e.target.value })} />
          </label>

          <label className="form-control">
            <span className="label-text text-sm">TIN (printed under the header, optional)</span>
            <input className="input input-bordered input-sm" maxLength={40} value={s.tin} onChange={(e) => set({ tin: e.target.value })} />
          </label>

          <h2 className="font-semibold pt-2">Printer</h2>
          <label className="form-control">
            <span className="label-text text-sm">Connection</span>
            <select className="select select-bordered select-sm" value={s.transport} onChange={(e) => set({ transport: e.target.value })}>
              <option value="none">No printer yet</option>
              <option value="file">No printer: save receipts as text files (testing)</option>
              <option value="tcp">Network printer (Ethernet / Wi-Fi)</option>
              <option value="spooler">USB printer installed in Windows</option>
            </select>
          </label>
          {s.transport === 'tcp' && (
            <div className="flex gap-2">
              <label className="form-control flex-1">
                <span className="label-text text-sm">Printer address</span>
                <input className="input input-bordered input-sm" placeholder="192.168.1.50" value={s.host} onChange={(e) => set({ host: e.target.value })} />
              </label>
              <label className="form-control w-28">
                <span className="label-text text-sm">Port</span>
                <input className="input input-bordered input-sm" inputMode="numeric" value={s.port} onChange={(e) => set({ port: Number(e.target.value.replace(/\D/g, '')) || '' })} />
              </label>
            </div>
          )}
          {s.transport === 'spooler' && (
            <label className="form-control">
              <span className="label-text text-sm">Windows printer</span>
              {printers && printers.length ? (
                <select className="select select-bordered select-sm" value={s.printer} onChange={(e) => set({ printer: e.target.value })}>
                  <option value="">Choose...</option>
                  {printers.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input className="input input-bordered input-sm" placeholder="Exact printer name in Windows" value={s.printer} onChange={(e) => set({ printer: e.target.value })} />
              )}
            </label>
          )}
          <label className="form-control w-48">
            <span className="label-text text-sm">Paper width (characters)</span>
            <select className="select select-bordered select-sm" value={s.width} onChange={(e) => set({ width: Number(e.target.value) })}>
              <option value={48}>48 (80 mm, usual)</option>
              <option value={42}>42</option>
              <option value={32}>32 (58 mm)</option>
            </select>
          </label>
          <label className="label cursor-pointer justify-start gap-3">
            <input type="checkbox" className="checkbox checkbox-sm" checked={s.drawer} onChange={(e) => set({ drawer: e.target.checked })} />
            <span className="label-text">Open the cash drawer when a payment includes cash</span>
          </label>

          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={onSave}>Save</button>
            <button className="btn btn-sm" disabled={busy || s.transport === 'none'} onClick={onTest}>Save and test print</button>
          </div>

          {bill && (
            <>
              <h2 className="font-semibold pt-4">Billing</h2>
              <div className="flex gap-2">
                <label className="form-control w-40">
                  <span className="label-text text-sm">Reservation fee (PHP)</span>
                  <input className="input input-bordered input-sm" inputMode="decimal" value={bill.feeText ?? (bill.feeCents / 100).toFixed(2)}
                    onChange={(e) => setBill({ ...bill, feeText: e.target.value.replace(/[^\d.]/g, '') })} />
                </label>
                <label className="form-control flex-1">
                  <span className="label-text text-sm">How the fee is charged</span>
                  <select className="select select-bordered select-sm" value={bill.feeMode} onChange={(e) => setBill({ ...bill, feeMode: e.target.value })}>
                    <option value="ADD">Added to the final bill at checkout</option>
                    <option value="DEDUCT">Paid in advance, deducted from the bill</option>
                  </select>
                </label>
              </div>
              <div className="flex gap-2">
                <label className="form-control flex-1">
                  <span className="label-text text-sm">VAT</span>
                  <select className="select select-bordered select-sm" value={bill.vatMode} onChange={(e) => setBill({ ...bill, vatMode: e.target.value })}>
                    <option value="NONE">Not shown on receipts</option>
                    <option value="INCLUSIVE">Menu prices include VAT (show the breakdown)</option>
                  </select>
                </label>
                {bill.vatMode === 'INCLUSIVE' && (
                  <label className="form-control w-28">
                    <span className="label-text text-sm">VAT rate %</span>
                    <input className="input input-bordered input-sm" inputMode="decimal" value={bill.rateText ?? String(bill.vatRateBps / 100)}
                      onChange={(e) => setBill({ ...bill, rateText: e.target.value.replace(/[^\d.]/g, '') })} />
                  </label>
                )}
              </div>
              <p className="text-xs opacity-60">Senior and PWD discounts remove the VAT first (when VAT is on) and then take 20%. Discounts always need a manager or Lead Cashier PIN.</p>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={onSaveBilling}>Save billing</button>
            </>
          )}
        </div>
      )}
      <div className="max-w-xl mt-8"><SystemPanel /></div>
    </Shell>
  );
}
