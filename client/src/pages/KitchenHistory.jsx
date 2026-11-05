// Finished orders for tables that are still open. Recall puts one back on the active screen.
import { useCallback, useEffect, useState } from 'react';
import Shell from '../components/Shell';
import KitchenNav from '../components/KitchenNav';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { timeLocal } from '../lib/format';

export default function KitchenHistory() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/api/kitchen/orders?status=done').then((d) => { setOrders(d.orders); setError(''); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const s = connectSocket();
    const evs = ['kitchen:order-done', 'kitchen:order-recalled', 'session:closed', 'connect'];
    evs.forEach((e) => s.on(e, load));
    return () => evs.forEach((e) => s.off(e, load));
  }, [load]);

  async function recall(id) {
    try { await api.post(`/api/kitchen/orders/${id}/recall`); load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <Shell title="Kitchen history" wide>
      <KitchenNav />
      {error && <div className="alert alert-error mb-4 text-sm">{error}</div>}
      {orders && orders.length === 0 && <p className="text-center text-xl font-bold opacity-50 py-24">Nothing finished yet</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
        {(orders || []).map((o) => (
          <div key={o.id} className="bg-base-100 rounded-2xl shadow border-2 border-base-300 overflow-hidden">
            <div className="px-5 py-3 flex justify-between items-center bg-base-300">
              <div>
                <p className="font-black text-lg">{o.tokenNumber}</p>
                <p className="text-xs opacity-70">Done {timeLocal(o.doneAt)} · {o.staff}</p>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => recall(o.id)}>Recall</button>
            </div>
            <div className="p-4 space-y-1">
              {o.items.map((i) => (
                <p key={i.id} className={`font-semibold ${i.netQuantity === 0 ? 'line-through opacity-40' : ''}`}>
                  {i.netQuantity === 0 ? i.quantity : i.netQuantity} - {i.name}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
