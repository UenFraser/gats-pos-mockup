// A phone that loses the POS for more than 10 seconds gets a plain explanation. The most common reason is that the phone has
// quietly switched from the restaurant Wi-Fi to mobile data (it does this when the Wi-Fi has no internet).
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { connectSocket } from '../lib/socket';

export default function OfflineHint() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const since = useRef(null);

  useEffect(() => {
    if (!user) return undefined;
    const s = connectSocket();
    const down = () => { if (since.current === null) since.current = Date.now(); };
    const up = () => { since.current = null; setShow(false); setDismissed(false); };
    if (!s.connected) down();
    s.on('disconnect', down); s.on('connect_error', down); s.on('connect', up);
    const timer = setInterval(() => setShow(since.current !== null && Date.now() - since.current > 10000), 2000);
    return () => { s.off('disconnect', down); s.off('connect_error', down); s.off('connect', up); clearInterval(timer); };
  }, [user]);

  if (!user || !show || dismissed) return null;
  return (
    <div role="alert" onClick={() => setDismissed(true)} title="Click to hide"
      className="alert alert-warning fixed bottom-3 left-3 right-3 z-50 max-w-xl mx-auto cursor-pointer shadow-lg text-sm">
      <span>
        <b>Cannot reach the POS.</b> Check that this phone is on the restaurant Wi-Fi and has not switched to mobile data (turn off
        "switch to mobile data automatically" or Wi-Fi Assist). It reconnects by itself when the Wi-Fi is back.
      </span>
    </div>
  );
}
