// Cashier's view of one tab (opens from a card on the desktop screen).
// Look, read what changed, add items, void with approval, clear the bill request, follow up with the kitchen.
// 6c adds swap; 6d adds checkout.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSessionView } from '../lib/useSessionView';
import { php, timeLocal } from '../lib/format';
import Changes from './Changes';
import SessionTab from './SessionTab';
import VoidDialog from './VoidDialog';

export default function SessionDetail({ sessionId, onClose }) {
  const navigate = useNavigate();
  const { session, changes, dismissChanges, reload } = useSessionView(sessionId);
  const [voids, setVoids] = useState([]);
  const [voidItem, setVoidItem] = useState(null);
  const [error, setError] = useState('');

  const total = session?.totalCents;
  useEffect(() => {
    api.get(`/api/sessions/${sessionId}/voids`).then((d) => setVoids(d.voids)).catch(() => setVoids([]));
  }, [sessionId, total]);

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
            <SessionTab session={session} onError={setError} onVoid={setVoidItem} />
            <div>
              <button className="btn btn-sm btn-primary" onClick={() => navigate(`/desktop/order?token=${session.tokenId}`)}>Add items</button>
            </div>
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
      {voidItem && (
        <VoidDialog sessionId={sessionId} item={voidItem} onClose={() => setVoidItem(null)}
          onDone={() => { setVoidItem(null); reload(); }} />
      )}
    </div>
  );
}
