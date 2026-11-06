// Cashier home: every open tab as a card, with colored change counts, BILL requests, and sounds.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import NotifDots from '../components/NotifDots';
import QrCard from '../components/QrCard';
import SessionDetail from '../components/SessionDetail';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { play } from '../lib/sounds';
import { php } from '../lib/format';
import { timeAgo } from '../lib/timeAgo';
import { useSoundUnlock } from '../lib/useSoundUnlock';

const SOUND_FOR = { ADD: 'newOrder', VOID: 'voidsfx', SWAP: 'swap' };
const REFRESH = ['session:updated', 'token:changed', 'session:bill-cleared', 'session:closed', 'connect'];

export default function Desktop() {
  const [sessions, setSessions] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);
  const needTap = useSoundUnlock();

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

  return (
    <Shell title="Desktop" wide>
      <div className="flex gap-2 mb-4">
        <Link to="/desktop/order" className="btn btn-primary btn-sm">New order</Link>
        <button className="btn btn-sm" onClick={() => setShowQr((v) => !v)}>{showQr ? 'Hide' : 'Connect phones'}</button>
      </div>
      {showQr && <div className="mb-4"><QrCard /></div>}
      {needTap && <div className="alert alert-warning mb-4 font-semibold">Tap anywhere on this screen to turn the sound on.</div>}
      {error && <div className="alert alert-error mb-4 text-sm">{error}</div>}

      {sessions && sessions.length === 0 && <p className="text-center text-xl font-bold opacity-50 py-24">No open tabs</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {(sessions || []).map((s) => {
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
