// Daily summary: what to count and check when closing a business day. The system keeps the last 10 business days;
// older ones are kept at HQ. Managers can export a file (manager PIN required).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import ExportSummaryDialog from '../components/ExportSummaryDialog';
import { api } from '../lib/api';
import { php } from '../lib/format';
import { useAuth } from '../auth/AuthContext';

const METHOD = { CASH: 'Cash', GCASH: 'GCash', CARD: 'Card', OTHER: 'Other' };
const ZONE = { RESTAURANT: 'Restaurant', BAR: 'Bar', TAKEOUT: 'Takeout' };

const Row = ({ label, value, strong, warn }) => (
  <div className={`flex justify-between text-sm ${strong ? 'font-bold' : ''} ${warn ? 'text-error' : ''}`}><span>{label}</span><span>{value}</span></div>
);
const Card = ({ title, children }) => (
  <section className="card bg-base-200 p-3 space-y-1"><h3 className="font-semibold text-xs uppercase opacity-70">{title}</h3>{children}</section>
);

export default function Summary() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [today, setToday] = useState('');
  const [date, setDate] = useState('');
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get('/api/summaries').then((d) => { setList(d.summaries); setToday(d.today); setDate(d.today); }).catch((e) => setError(e.message));
  }, []);
  const load = useCallback(() => {
    if (!date) return;
    api.get(`/api/summaries/${date}`).then((d) => { setS(d.summary); setError(''); }).catch((e) => { setS(null); setError(e.message); });
  }, [date]);
  useEffect(() => { load(); }, [load]);

  async function printSlip() {
    setMsg(''); setError('');
    try {
      const r = await api.post(`/api/summaries/${date}/print`);
      if (r.printed) setMsg(r.savedTo ? `Saved: ${r.savedTo}` : 'Printed'); else setError(`Not printed: ${r.error}`);
    } catch (e) { setError(e.message); }
  }

  const dates = [...new Set([today, ...list.map((x) => x.date)])].filter(Boolean);
  const listWithToday = dates.map((d) => list.find((x) => x.date === d) || { date: d, isToday: d === today, totalCents: 0 });

  return (
    <Shell title="Daily summary" wide>
      <div className="flex gap-2 items-center flex-wrap mb-4">
        <Link to="/desktop" className="btn btn-ghost btn-sm">&larr; Desktop</Link>
        <select className="select select-bordered select-sm" value={date} onChange={(e) => setDate(e.target.value)}>
          {dates.map((d) => <option key={d} value={d}>{d}{d === today ? ' (today)' : ''}</option>)}
        </select>
        <button className="btn btn-sm" onClick={load}>Refresh</button>
        <button className="btn btn-sm" onClick={printSlip}>Print closing slip</button>
        {user.role === 'MANAGER' && <button className="btn btn-sm btn-primary" onClick={() => setExporting(true)}>Export</button>}
      </div>
      <p className="text-xs opacity-60 mb-3">This system keeps the last 10 business days. Older summaries are kept at HQ.</p>
      {error && <div className="alert alert-error mb-3 text-sm">{error}</div>}
      {msg && <div className="alert alert-success mb-3 text-sm break-all">{msg}</div>}

      {s && (
        <div className="space-y-3 max-w-5xl">
          {s.openTabs.count > 0 && <div className="alert alert-warning text-sm">Tabs still open for this day: {s.openTabs.tokens.join(', ')}. Close or cancel them before counting the day.</div>}
          {s.payments.varianceCents !== 0 && <div className="alert alert-error text-sm">Sales and payments differ by {php(s.payments.varianceCents)}. Tell the manager.</div>}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="card bg-primary text-primary-content p-4"><p className="text-xs opacity-80">Total sales</p><p className="text-3xl font-black">{php(s.sales.totalCents)}</p><p className="text-xs">{s.sales.tabs} tabs closed</p></div>
            <div className="card bg-success text-success-content p-4"><p className="text-xs opacity-80">Cash expected in the drawer</p><p className="text-3xl font-black">{php(s.payments.cash.amountCents)}</p>
              <p className="text-xs">AM {php(s.payments.cash.byShift.AM)} · PM {php(s.payments.cash.byShift.PM)}</p></div>
            <div className="card bg-base-200 p-4"><p className="text-xs opacity-70">{s.finalized ? 'Final' : 'Still in progress'}</p><p className="text-sm">Generated {new Date(s.generatedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</p></div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Card title="Sales">
              <Row label="Items" value={php(s.sales.itemsCents)} />
              {s.sales.discountsCents > 0 && <Row label="Discounts / VAT exempt" value={'-' + php(s.sales.discountsCents)} />}
              {s.sales.feesCents > 0 && <Row label="Reservation fees" value={php(s.sales.feesCents)} />}
              <Row label="Total" value={php(s.sales.totalCents)} strong />
              {Object.entries(s.sales.byZone).map(([z, b]) => <Row key={z} label={`${ZONE[z]} (${b.tabs})`} value={php(b.totalCents)} />)}
              <Row label={`AM shift (${s.sales.byShift.AM.tabs})`} value={php(s.sales.byShift.AM.totalCents)} />
              <Row label={`PM shift (${s.sales.byShift.PM.tabs})`} value={php(s.sales.byShift.PM.totalCents)} />
              <Row label={`Takeout local (${s.sales.takeouts.LOCAL.tabs})`} value={php(s.sales.takeouts.LOCAL.totalCents)} />
              <Row label={`Takeout online (${s.sales.takeouts.ONLINE.tabs})`} value={php(s.sales.takeouts.ONLINE.totalCents)} />
            </Card>
            <Card title="Payments">
              {s.payments.byMethod.map((m) => <Row key={m.method} label={`${METHOD[m.method]} (${m.count})`} value={php(m.amountCents)} />)}
              <Row label="Total received" value={php(s.payments.totalCents)} strong />
              <Row label="Cash handed over" value={php(s.payments.cash.handedCents)} />
              <Row label="Change given" value={php(s.payments.cash.changeCents)} />
            </Card>
            {(s.vat.vatCents > 0 || s.vat.vatExemptSalesCents > 0) && (
              <Card title="VAT">
                <Row label="VATable sales" value={php(s.vat.vatableSalesCents)} /><Row label="VAT" value={php(s.vat.vatCents)} /><Row label="VAT-exempt sales" value={php(s.vat.vatExemptSalesCents)} />
              </Card>
            )}
            <Card title="Voids and cancellations">
              <Row label={`Voids (${s.voids.count})`} value={php(s.voids.amountCents)} warn={s.voids.count > 0} />
              {s.voids.byReason.map((r) => <Row key={r.reason} label={`${r.reason} (${r.count})`} value={php(r.amountCents)} />)}
              <Row label={`Takeouts cancelled (${s.cancelledTakeouts.count})`} value={php(s.cancelledTakeouts.amountCents)} />
              <Row label="Reservations cancelled" value={s.cancelledReservations} />
              <Row label="Items moved between tables" value={s.swaps.quantity} />
            </Card>
            {s.discounts.length > 0 && (
              <Card title="Discounts">{s.discounts.map((d) => <Row key={d.kind} label={`${d.kind} (${d.count})`} value={php(d.amountCents)} />)}</Card>
            )}
          </div>

          <Card title={`Items sold (${s.items.length})`}>
            {s.items.length === 0 && <p className="text-sm opacity-60">Nothing sold on closed tabs yet.</p>}
            {s.items.map((i) => <Row key={i.name} label={`${i.quantity} x ${i.name}`} value={php(i.amountCents)} />)}
          </Card>
        </div>
      )}
      {exporting && <ExportSummaryDialog summaries={listWithToday} initialDate={date} onClose={() => setExporting(false)} />}
    </Shell>
  );
}
