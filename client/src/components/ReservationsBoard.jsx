// Today's reservations on the cashier desktop: seat, edit, cancel, or take a new one.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { timeLocal } from '../lib/format';
import { useConfirm } from './ConfirmProvider';
import ReservationDialog from './ReservationDialog';

const LATE_MS = 15 * 60 * 1000;
const LIVE = ['reservation:changed', 'token:changed', 'connect'];

export default function ReservationsBoard() {
  const confirm = useConfirm();
  const [list, setList] = useState([]);
  const [dialog, setDialog] = useState(null); // null | 'new' | a reservation being edited
  const [error, setError] = useState('');
  const [, setTick] = useState(0);

  const load = useCallback(() => { api.get('/api/reservations').then((d) => setList(d.reservations)).catch(() => {}); }, []);
  useEffect(() => {
    load();
    const s = connectSocket();
    LIVE.forEach((e) => s.on(e, load));
    const clock = setInterval(() => setTick((t) => t + 1), 30000);
    return () => { LIVE.forEach((e) => s.off(e, load)); clearInterval(clock); };
  }, [load]);

  async function seat(r) {
    setError('');
    try { await api.post(`/api/reservations/${r.id}/seat`); load(); } catch (e) { setError(e.message); }
  }
  async function cancel(r) {
    if (!(await confirm({ title: 'Cancel the reservation?', message: `${r.name} at ${r.tokenNumber}. The table will be free again.`, confirmText: 'Cancel the reservation', cancelText: 'Keep it', danger: true }))) return;
    setError('');
    try { await api.del(`/api/reservations/${r.id}`); load(); } catch (e) { setError(e.message); }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Reservations today</h2>
        <button className="btn btn-xs btn-primary" onClick={() => setDialog('new')}>New reservation</button>
      </div>
      {error && <div className="alert alert-error text-sm">{error}</div>}
      {list.length === 0 && <p className="text-xs opacity-60">No reservations waiting.</p>}
      {list.map((r) => {
        const late = Date.now() - new Date(r.time).getTime() > LATE_MS;
        return (
          <div key={r.id} className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm flex-wrap ${late ? 'border-error bg-error/10' : 'border-info bg-info/10'}`}>
            <span className="font-black text-lg w-12">{r.tokenNumber}</span>
            <div className="flex-1 min-w-[10rem]">
              <p className="font-semibold">{r.name}{r.partySize ? ` · ${r.partySize} guests` : ''}</p>
              <p className="text-xs opacity-70">{timeLocal(r.time)}{late ? ' · LATE' : ''}{r.phone ? ` · ${r.phone}` : ''}</p>
            </div>
            <button className="btn btn-xs btn-success" onClick={() => seat(r)}>Seat</button>
            <button className="btn btn-xs btn-outline" onClick={() => setDialog(r)}>Edit</button>
            <button className="btn btn-xs btn-ghost" onClick={() => cancel(r)}>Cancel</button>
          </div>
        );
      })}
      {dialog && (
        <ReservationDialog existing={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} onDone={() => { setDialog(null); load(); }} />
      )}
    </section>
  );
}
