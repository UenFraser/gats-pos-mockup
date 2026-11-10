// Who a takeout or reservation is for. Shown on the order screen and on the cashier's tab view.
//   Takeout: name, local/online, phone, pickup time, Preparing / READY, and a "customer is here" nudge for the kitchen.
//   Reservation: name, time, party size.
import { useState } from 'react';
import { api } from '../lib/api';
import { timeLocal } from '../lib/format';

export default function CustomerBanner({ session, onError }) {
  const [nudged, setNudged] = useState(false);
  if (!session.customerName) return null;

  if (session.status === 'RESERVED') {
    return (
      <div className="rounded-xl border-2 border-info bg-info/10 p-3 text-sm">
        <span className="font-bold">Reserved for {session.customerName}</span>
        {session.reservationTime && <> at {timeLocal(session.reservationTime)}</>}
        {session.partySize ? <>, {session.partySize} guests</> : null}
        <p className="text-xs opacity-70">The guests are seated when the first order is sent.</p>
      </div>
    );
  }

  if (session.zone !== 'TAKEOUT') {
    return (
      <p className="text-xs opacity-70">Reservation: {session.customerName}{session.partySize ? `, ${session.partySize} guests` : ''}</p>
    );
  }

  async function nudge() {
    try {
      await api.post('/api/followups/takeout', { sessionId: session.id });
      setNudged(true);
      setTimeout(() => setNudged(false), 3000);
    } catch (e) { onError?.(e.message); }
  }

  return (
    <div className={`rounded-xl border-2 p-3 ${session.ready ? 'border-success bg-success/10' : 'border-base-300 bg-base-200'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold">{session.customerName}</span>
        <span className={`badge badge-sm ${session.orderSource === 'ONLINE' ? 'badge-secondary' : 'badge-accent'}`}>{session.orderSource === 'ONLINE' ? 'Online' : 'Local'}</span>
        {session.customerPhone && <span className="text-xs opacity-70">{session.customerPhone}</span>}
        {session.pickupAt && <span className="text-xs opacity-70">pickup {timeLocal(session.pickupAt)}</span>}
        <span className={`ml-auto badge ${session.ready ? 'badge-success animate-pulse' : 'badge-warning'}`}>{session.ready ? 'READY for pickup' : 'Preparing'}</span>
      </div>
      {!session.ready && session.status === 'OPEN' && (
        <button className="btn btn-xs btn-outline mt-2" disabled={nudged} onClick={nudge}>{nudged ? 'Kitchen nudged' : 'Customer is here: hurry the kitchen'}</button>
      )}
    </div>
  );
}
