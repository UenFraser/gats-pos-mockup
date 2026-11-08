// Front of house (waiters and the cashier counter): ask for ice, see where each request is, mark it delivered.
//   Kitchen preparing -> READY at the counter -> delivered to the table.
// sound = play the ice sound when something becomes ready (the cashier desktop uses this).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { play } from '../lib/sounds';
import { timeAgo } from '../lib/timeAgo';
import IceRequestDialog from './IceRequestDialog';

export default function IceBoard({ sound = false }) {
  const [requests, setRequests] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState('');
  const [nudged, setNudged] = useState(null); // request id, for 3 s after a follow-up
  const [, setTick] = useState(0);

  const load = useCallback(() => { api.get('/api/ice').then((d) => setRequests(d.requests)).catch(() => {}); }, []);

  useEffect(() => {
    load();
    const s = connectSocket();
    const onReady = () => { if (sound) play('iceOrder'); };
    s.on('ice:changed', load); s.on('connect', load); s.on('ice:ready', onReady);
    const clock = setInterval(() => setTick((t) => t + 1), 30000);
    return () => { s.off('ice:changed', load); s.off('connect', load); s.off('ice:ready', onReady); clearInterval(clock); };
  }, [load, sound]);

  // Buttons pass the full path (so tools/check-api.js can verify every route), and the id to flash on a follow-up.
  async function act(path, flashId) {
    setError('');
    try {
      await api.post(path);
      if (flashId) { setNudged(flashId); setTimeout(() => setNudged(null), 3000); }
      load();
    } catch (e) { setError(e.message); }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Ice</h2>
        <button className="btn btn-xs btn-info" onClick={() => setDialog(true)}>Request ice</button>
      </div>
      {error && <div className="alert alert-error text-sm">{error}</div>}
      {requests.map((r) => (
        <div key={r.id} className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm ${r.state === 'READY' ? 'border-success bg-success/10 animate-pulse' : 'border-base-300 bg-base-200'}`}>
          <div className="flex-1">
            <p className="font-bold">{r.tokenNumber} · {r.trays} tray{r.trays > 1 ? 's' : ''}</p>
            <p className="text-xs opacity-70">
              {r.state === 'READY' ? `Ready at the counter. Take it to ${r.tokenNumber}.` : `Kitchen is preparing · ${timeAgo(r.createdAt)} · ${r.requestedBy}`}
            </p>
          </div>
          {r.state === 'READY' ? (
            <button className="btn btn-xs btn-success" onClick={() => act(`/api/ice/${r.id}/delivered`)}>Delivered</button>
          ) : (
            <>
              <button className="btn btn-xs btn-outline" disabled={nudged === r.id} onClick={() => act(`/api/ice/${r.id}/follow-up`, r.id)}>{nudged === r.id ? 'Kitchen nudged' : 'Follow up'}</button>
              <button className="btn btn-xs btn-ghost" onClick={() => act(`/api/ice/${r.id}/cancel`)}>Cancel</button>
            </>
          )}
        </div>
      ))}
      {dialog && <IceRequestDialog onClose={() => setDialog(false)} onDone={() => { setDialog(false); load(); }} />}
    </section>
  );
}
