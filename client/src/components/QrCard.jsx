// QR code for phones. Refreshes by itself (on focus and every minute), so it never shows a stale
// address after the PC switches networks.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function QrCard() {
  const [info, setInfo] = useState(null);
  const load = useCallback(() => { api.get('/api/info').then(setInfo).catch(() => {}); }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('focus', load);
    return () => { clearInterval(t); window.removeEventListener('focus', load); };
  }, [load]);
  if (!info) return null;
  return (
    <div className="card bg-base-200 p-4 items-center text-center w-fit">
      <img src={info.qr} width="200" height="200" alt="QR code to open the POS on a phone" />
      <p className="text-sm break-all mt-2">{info.url}</p>
    </div>
  );
}
