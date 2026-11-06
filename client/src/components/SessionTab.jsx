// The items on one open tab, with a Follow up button on food still in the kitchen.
// Shared by the waiter order screen and the cashier's tab view.
import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { php, timeLocal } from '../lib/format';

// onVoid(item) is optional: when given, every item with something left shows a Void button.
export default function SessionTab({ session, onError, onVoid }) {
  const [flashId, setFlashId] = useState(null); // row highlighted for 3 s after a follow-up (confirmation)
  const [busy, setBusy] = useState(null);
  const timer = useRef(null);

  async function followUp(item) {
    setBusy(item.id);
    try {
      await api.post('/api/followups/food', { orderItemId: item.id });
      setFlashId(item.id);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlashId(null), 3000);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card bg-base-200 p-3">
      <h3 className="font-semibold text-sm mb-1">Ordered so far ({php(session.totalCents)})</h3>
      {session.batches.map((b) => {
        const hasKitchen = b.items.some((i) => i.kitchen);
        return (
          <div key={b.id} className="mb-2">
            <p className="text-xs opacity-60">
              {timeLocal(b.createdAt)} · {b.staff}{hasKitchen ? (b.status === 'DONE' ? ' · ready' : ' · in kitchen') : ''}
            </p>
            {b.items.map((i) => {
              const left = i.quantity - i.voidedQuantity;
              const canFollow = b.status === 'ACTIVE' && i.kitchen && left > 0;
              return (
                <div key={i.id} className={`text-sm flex items-center gap-2 rounded px-1 transition-colors ${flashId === i.id ? 'bg-warning/40' : ''}`}>
                  <span className={`flex-1 ${left === 0 ? 'line-through opacity-50' : ''}`}>
                    {left === 0 ? i.quantity : left}x {i.name}{i.voidedQuantity > 0 && left > 0 ? ` (${i.voidedQuantity} voided)` : ''}
                  </span>
                  <span>{php(left * i.unitPriceCents)}</span>
                  {canFollow && (
                    <button className="btn btn-xs btn-outline" disabled={busy === i.id} onClick={() => followUp(i)}>Follow up</button>
                  )}
                  {onVoid && left > 0 && (
                    <button className="btn btn-xs btn-outline btn-error" onClick={() => onVoid(i)}>Void</button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
