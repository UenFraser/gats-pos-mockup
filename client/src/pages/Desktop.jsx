// Cashier home: ice, today's reservations, takeouts (their own section), and tables.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import IceBoard from '../components/IceBoard';
import NotifDots from '../components/NotifDots';
import QrCard from '../components/QrCard';
import ReservationsBoard from '../components/ReservationsBoard';
import SessionDetail from '../components/SessionDetail';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { play } from '../lib/sounds';
import { php, timeLocal } from '../lib/format';
import { timeAgo } from '../lib/timeAgo';
import { useSoundUnlock } from '../lib/useSoundUnlock';
import { useAuth } from '../auth/AuthContext';

const SOUND_FOR = { ADD: 'newOrder', VOID: 'voidsfx', SWAP: 'swap' };
const REFRESH = ['session:updated', 'token:changed', 'session:bill-cleared', 'session:closed', 'kitchen:order-done', 'kitchen:order-recalled', 'takeout:ready', 'connect'];

export default function Desktop() {
  const [sessions, setSessions] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);
  const needTap = useSoundUnlock();
  const { user } = useAuth();

  const load = useCallback(() => {
    api.get('/api/sessions').then((d) => { setSessions(d.sessions); setError(''); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const s = connectSocket();
    const onNotif = (n) => { if (n.audience === 'CASHIER') { play(SOUND_FOR[n.type]); load(); } };
    const onBill = () => { play('bill'); load(); };
    REFRESH.forEach((e) => s.on(e, load));
    s.on('notification:new', onNotif);
    s.on('session:bill-requested', onBill);
    const clock = setInterval(() => setTick((t) => t + 1), 30000);
    return () => {
      REFRESH.forEach((e) => s.off(e, load));
      s.off('notification:new', onNotif);
      s.off('session:bill-requested', onBill);
      clearInterval(clock);
    };
  }, [load]);

  const takeouts = (sessions || []).filter((s) => s.zone === 'TAKEOUT');
  const tables = (sessions || []).filter((s) => s.zone !== 'TAKEOUT');

  return (
    <Shell title="Desktop" wide>
      <div className="flex gap-2 mb-4">
        <Link to="/desktop/order" className="btn btn-primary btn-sm">New order</Link>
        <button className="btn btn-sm" onClick={() => setShowQr((v) => !v)}>{showQr ? 'Hide' : 'Connect phones'}</button>
        <Link to="/desktop/summary" className="btn btn-sm">Daily summary</Link>
        {user.role === 'MANAGER' && <Link to="/desktop/staff" className="btn btn-sm">Staff</Link>}
        {user.role === 'MANAGER' && <Link to="/desktop/settings" className="btn btn-sm">Settings</Link>}
      </div>
      {showQr && <div className="mb-4"><QrCard /></div>}
      {needTap && <div className="alert alert-warning mb-4 font-semibold">Tap anywhere on this screen to turn the sound on.</div>}
      {error && <div className="alert alert-error mb-4 text-sm">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <IceBoard sound />
        <ReservationsBoard />
      </div>

      <h2 className="font-semibold text-sm mb-2">Takeouts</h2>
      {sessions && takeouts.length === 0 && <p className="text-xs opacity-60 mb-4">No takeout orders waiting.</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
        {takeouts.map((s) => (
          <button key={s.id} onClick={() => setOpenId(s.id)}
            className={`card bg-base-100 border-2 p-3 text-left gap-1 ${s.ready ? 'border-success' : 'border-base-300'}`}>
            <div className="flex justify-between items-center">
              <span className="text-xl font-black">{s.tokenNumber}</span>
              <span className={`badge badge-sm ${s.orderSource === 'ONLINE' ? 'badge-secondary' : 'badge-accent'}`}>{s.orderSource === 'ONLINE' ? 'Online' : 'Local'}</span>
            </div>
            <span className="font-semibold truncate">{s.customerName}</span>
            <span className="text-lg font-semibold">{php(s.totalCents)}</span>
            <span className="text-xs opacity-60">{timeAgo(s.openedAt)}{s.pickupAt ? ` · pickup ${timeLocal(s.pickupAt)}` : ''}</span>
            <span className={`badge badge-sm ${s.ready ? 'badge-success animate-pulse' : 'badge-warning'}`}>{s.ready ? 'READY for pickup' : 'Preparing'}</span>
            <NotifDots unread={s.unread} billRequested={!!s.billRequestedAt} />
          </button>
        ))}
      </div>

      <h2 className="font-semibold text-sm mb-2">Tables</h2>
      {sessions && tables.length === 0 && <p className="text-xs opacity-60">No open tabs.</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {tables.map((s) => {
          const hot = s.billRequestedAt || Object.values(s.unread).some((n) => n > 0);
          return (
            <button key={s.id} onClick={() => setOpenId(s.id)}
              className={`card bg-base-100 border-2 p-3 text-left gap-1 ${s.billRequestedAt ? 'border-warning' : hot ? 'border-primary' : 'border-base-300'}`}>
              <div className="flex justify-between items-center">
                <span className="text-xl font-black">{s.tokenNumber}</span>
                <span className="text-xs opacity-60">{s.zone.toLowerCase()}</span>
              </div>
              <span className="text-lg font-semibold">{php(s.totalCents)}</span>
              <span className="text-xs opacity-60">{s.itemCount} items · {timeAgo(s.openedAt)} · {s.openedBy}</span>
              <NotifDots unread={s.unread} billRequested={!!s.billRequestedAt} />
            </button>
          );
        })}
      </div>

      {openId && <SessionDetail sessionId={openId} onClose={() => { setOpenId(null); load(); }} />}
    </Shell>
  );
}
