// The kitchen's ice strip: new requests (with the ice sound), follow-ups, and a Ready button.
// Once the kitchen taps Ready the request leaves this strip and waits at the counter for front of house.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { play } from '../lib/sounds';
import { timeAgo } from '../lib/timeAgo';

const FOLLOWUP_MS = 90 * 1000;
const SLOW_MS = 5 * 60 * 1000; // turns red after 5 minutes

export default function KitchenIce() {
  const [requests, setRequests] = useState([]);
  const [marked, setMarked] = useState({});
  const [error, setError] = useState('');
  const [, setTick] = useState(0);
  const timers = useRef([]);

  const load = useCallback(() => { api.get('/api/ice').then((d) => setRequests(d.requests)).catch(() => {}); }, []);

  useEffect(() => {
    load();
    const s = connectSocket();
    const onNew = () => { play('iceOrder'); load(); };
    const onFollow = ({ id }) => {
      play('follow-upFood');
      setMarked((m) => ({ ...m, [id]: true }));
      timers.current.push(setTimeout(() => setMarked((m) => { const c = { ...m }; delete c[id]; return c; }), FOLLOWUP_MS));
    };
    s.on('ice:requested', onNew); s.on('ice:follow-up', onFollow); s.on('ice:changed', load); s.on('connect', load);
    const clock = setInterval(() => setTick((t) => t + 1), 30000);
    return () => {
      s.off('ice:requested', onNew); s.off('ice:follow-up', onFollow); s.off('ice:changed', load); s.off('connect', load);
      clearInterval(clock); timers.current.forEach(clearTimeout);
    };
  }, [load]);

  async function ready(id) {
    setError('');
    try { await api.post(`/api/ice/${id}/ready`); load(); } catch (e) { setError(e.message); }
  }

  const waiting = requests.filter((r) => r.state === 'REQUESTED');
  if (!waiting.length && !error) return null;
  return (
    <div className="mb-4 space-y-2">
      {error && <div className="alert alert-error text-sm">{error}</div>}
      <div className="flex flex-wrap gap-3">
        {waiting.map((r) => {
          const slow = Date.now() - new Date(r.createdAt).getTime() > SLOW_MS;
          return (
            <div key={r.id} className={`rounded-2xl border-2 px-4 py-3 flex items-center gap-4 ${marked[r.id] ? 'border-warning bg-warning/30 animate-pulse' : slow ? 'border-error bg-error/10' : 'border-info bg-info/10'}`}>
              <div>
                <p className="font-black text-lg tracking-wider">ICE x {r.trays} → {r.tokenNumber}</p>
                <p className="text-xs font-bold opacity-70">{timeAgo(r.createdAt)} · {r.requestedBy}{marked[r.id] ? ' · Follow-up!' : ''}</p>
              </div>
              <button className="btn btn-sm btn-primary font-bold" onClick={() => ready(r.id)}>Ready</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
