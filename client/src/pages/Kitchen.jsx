// Kitchen display: live food orders for open tables. Done button, follow-up highlights, sounds.
// The kitchen only reads (REST) and listens (events); it never sends business events.
import { useCallback, useEffect, useRef, useState } from 'react';
import Shell from '../components/Shell';
import KitchenNav from '../components/KitchenNav';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { play } from '../lib/sounds';
import { useSoundUnlock } from '../lib/useSoundUnlock';

const FOLLOWUP_MS = 90 * 1000; // how long a followed-up item stays highlighted

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  const h = Math.floor(mins / 60);
  return h === 1 ? '1 hour ago' : `${h} hours ago`;
}

export default function Kitchen() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [marked, setMarked] = useState({}); // order item id -> true while highlighted
  const [, setTick] = useState(0);
  const needTap = useSoundUnlock();
  const timers = useRef([]);

  const load = useCallback(() => {
    api.get('/api/kitchen/orders?status=active').then((d) => { setOrders(d.orders); setError(''); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const s = connectSocket();
    const reload = () => load();
    const onNew = () => { play('newOrder'); load(); };
    const onVoided = () => { play('voidsfx'); load(); };   // emitted from Phase 6
    const onSwapped = () => { play('swap'); load(); };     // emitted from Phase 6
    const onFollowUp = ({ itemId }) => {
      play('follow-upFood');
      setMarked((m) => ({ ...m, [itemId]: true }));
      timers.current.push(setTimeout(() => setMarked((m) => { const c = { ...m }; delete c[itemId]; return c; }), FOLLOWUP_MS));
    };
    const events = {
      'kitchen:order-new': onNew, 'kitchen:order-done': reload, 'kitchen:order-recalled': reload,
      'followup:food': onFollowUp, 'order:voided': onVoided, 'order:swapped': onSwapped,
      'session:closed': reload, connect: reload,
    };
    Object.entries(events).forEach(([e, fn]) => s.on(e, fn));
    const clock = setInterval(() => setTick((t) => t + 1), 30000); // keep "x mins ago" fresh
    return () => {
      Object.entries(events).forEach(([e, fn]) => s.off(e, fn));
      clearInterval(clock);
      timers.current.forEach(clearTimeout);
    };
  }, [load]);

  async function done(id) {
    try { await api.post(`/api/kitchen/orders/${id}/done`); load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <Shell title="Kitchen" wide>
      <KitchenNav />
      {needTap && <div className="alert alert-warning mb-4 font-semibold">Tap anywhere on this screen to turn the sound on.</div>}
      {error && <div className="alert alert-error mb-4 text-sm">{error}</div>}

      {orders && orders.length === 0 && <p className="text-center text-xl font-bold opacity-50 py-24">No active orders</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
        {(orders || []).map((o) => (
          <div key={o.id} className="bg-base-100 rounded-2xl shadow-xl border-2 border-base-300 overflow-hidden flex flex-col max-h-[420px]">
            <div className="px-5 py-3 flex justify-between items-center bg-secondary text-secondary-content shrink-0">
              <div>
                <p className="font-black text-lg tracking-wider">{o.tokenNumber}</p>
                <p className="text-xs font-bold opacity-80">{timeAgo(o.createdAt)} · {o.staff}</p>
              </div>
              <button className="btn btn-sm btn-primary font-bold" onClick={() => done(o.id)}>Done</button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto">
              {o.items.map((i) => {
                const voided = i.netQuantity === 0;
                const movedAway = voided && i.voidedQuantity === 0 && i.movedQuantity > 0;
                const hot = marked[i.id] && !voided;
                return (
                  <div key={i.id}
                    className={`text-lg font-bold p-1.5 rounded-lg transition-colors ${
                      voided ? (movedAway ? 'line-through opacity-40 bg-info/10 text-info' : 'line-through opacity-40 bg-error/10 text-error')
                        : hot ? 'bg-warning/30 border border-warning animate-pulse' : ''}`}>
                    <div className="flex items-center gap-2">
                      {!voided && <span className="text-primary font-black text-xl">{i.netQuantity}</span>}
                      <span className={voided ? 'font-normal italic' : ''}>{i.name}</span>
                      {!voided && i.voidedQuantity > 0 && <span className="badge badge-error badge-sm text-white">-{i.voidedQuantity}</span>}
                      {i.movedQuantity > 0 && (
                        <span className="badge badge-info badge-sm text-white no-underline">{movedAway ? '' : `-${i.movedQuantity} `}to {i.movedTo.join(', ')}</span>
                      )}
                      {i.swappedFrom && <span className="badge badge-info badge-sm text-white">from {i.swappedFrom}</span>}
                      {hot && <span className="badge badge-warning font-black ml-auto">Follow-up!</span>}
                    </div>
                    {i.notes && !voided && <p className="text-sm font-normal italic opacity-70">{i.notes}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
