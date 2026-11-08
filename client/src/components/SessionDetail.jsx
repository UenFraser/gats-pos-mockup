// Cashier's view of one tab (opens from a card on the desktop screen).
// Look, read what changed, add items, void with approval, clear the bill request, follow up with the kitchen.
// Swap moves an item to another table (not a void). Print bill and Checkout close the tab.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSessionView } from '../lib/useSessionView';
import { php, timeLocal } from '../lib/format';
import Changes from './Changes';
import SessionTab from './SessionTab';
import BillLines, { hasExtras } from './BillLines';
import CheckoutDialog from './CheckoutDialog';
import DiscountDialog from './DiscountDialog';
import SwapDialog from './SwapDialog';
import VoidDialog from './VoidDialog';

export default function SessionDetail({ sessionId, onClose }) {
  const navigate = useNavigate();
  const { session, changes, dismissChanges, reload } = useSessionView(sessionId);
  const [voids, setVoids] = useState([]);
  const [voidItem, setVoidItem] = useState(null);
  const [swapItem, setSwapItem] = useState(null);
  const [notice, setNotice] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [discountMode, setDiscountMode] = useState(null); // 'apply' | 'remove' | null
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  const total = session?.totalCents;
  useEffect(() => {
    api.get(`/api/sessions/${sessionId}/voids`).then((d) => setVoids(d.voids)).catch(() => setVoids([]));
  }, [sessionId, total]);

  async function printBill() {
    setPrinting(true); setError(''); setNotice('');
    try {
      const r = await api.post(`/api/sessions/${sessionId}/print-bill`);
      if (r.printed) { setNotice('Bill printed'); reload(); } else setError(`Bill not printed: ${r.error}`);
    } catch (e) { setError(e.message); }
    finally { setPrinting(false); }
  }

  async function clearBill() {
    try { await api.del(`/api/sessions/${sessionId}/bill-request`); reload(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">{session ? `${session.tokenNumber} · ${session.zone}` : 'Loading...'}</h2>
          <button className="btn btn-sm btn-circle" onClick={onClose}>x</button>
        </div>
        {error && <div className="alert alert-error text-sm">{error}</div>}
        {notice && <div className="alert alert-success text-sm">{notice}</div>}
        {!session && <p className="opacity-60">Loading...</p>}
        {session && (
          <>
            {session.billRequestedAt && (
              <div className="alert alert-warning flex justify-between">
                <span>Bill requested by {session.billRequestedBy} at {timeLocal(session.billRequestedAt)}</span>
                <button className="btn btn-sm" onClick={clearBill}>Mark handled</button>
              </div>
            )}
            <Changes changes={changes} onDismiss={dismissChanges} />
            {session.status !== 'OPEN' && <div className="alert alert-info text-sm">This tab is closed.</div>}
            <SessionTab session={session} onError={setError}
              onVoid={session.status === 'OPEN' ? setVoidItem : undefined} onSwap={session.status === 'OPEN' ? setSwapItem : undefined} />
            {hasExtras(session.bill) && (
              <section className="card bg-base-200 p-3">
                <div className="flex justify-between font-semibold text-sm"><span>Amount due</span><span>{php(session.bill.dueCents)}</span></div>
                <BillLines bill={session.bill} />
                {session.discount && session.discount.customerName && (
                  <p className="text-xs opacity-70 mt-1">{session.discount.customerName}, ID {session.discount.idNumber}</p>
                )}
              </section>
            )}
            {session.status === 'OPEN' && (
              <div className="flex gap-2 flex-wrap">
                <button className="btn btn-sm btn-primary" onClick={() => navigate(`/desktop/order?token=${session.tokenId}`)}>Add items</button>
                <button className="btn btn-sm" disabled={printing} onClick={printBill}>{printing ? 'Printing...' : 'Print bill'}</button>
                <button className="btn btn-sm" onClick={() => setDiscountMode(session.discount ? 'remove' : 'apply')}>
                  {session.discount ? 'Remove discount' : 'Discount'}
                </button>
                <button className="btn btn-sm btn-success ml-auto" onClick={() => setCheckout(true)}>Checkout</button>
              </div>
            )}
            {voids.length > 0 && (
              <section className="card bg-base-200 p-3">
                <h3 className="font-semibold text-sm mb-1">Voids on this tab</h3>
                {voids.map((v) => (
                  <p key={v.id} className="text-xs">
                    {timeLocal(v.at)} · {v.quantity}x {v.item} ({php(v.amountCents)}) · {v.reason} · asked by {v.voidedBy}, approved by {v.approvedBy}
                  </p>
                ))}
              </section>
            )}
          </>
        )}
      </div>
      <div className="modal-backdrop" onClick={onClose} />
      {discountMode && session && (
        <DiscountDialog session={session} mode={discountMode} onClose={() => setDiscountMode(null)}
          onDone={() => { setDiscountMode(null); reload(); }} />
      )}
      {checkout && session && (
        <CheckoutDialog session={session} onCancel={() => setCheckout(false)} onDone={() => { setCheckout(false); onClose(); }} />
      )}
      {swapItem && session && (
        <SwapDialog session={session} item={swapItem} onClose={() => setSwapItem(null)}
          onDone={(to) => { setSwapItem(null); setNotice(`Moved to ${to}`); reload(); }} />
      )}
      {voidItem && (
        <VoidDialog sessionId={sessionId} item={voidItem} onClose={() => setVoidItem(null)}
          onDone={() => { setVoidItem(null); reload(); }} />
      )}
    </div>
  );
}
