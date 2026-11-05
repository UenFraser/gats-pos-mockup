// Placeholder screens. Each phase replaces one of these with the real pages.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import { api } from '../lib/api';

export function Desktop() {
  const [info, setInfo] = useState(null);
  useEffect(() => { api.get('/api/info').then(setInfo).catch(() => {}); }, []);
  return (
    <Shell title="Desktop">
      <div className="space-y-4">
        <Link to="/desktop/order" className="btn btn-primary">New order</Link>
        <p>Cashier screens arrive in Phase 6. Phones can scan this code to open the POS.</p>
        {info && (
          <div className="card bg-base-200 p-4 items-center text-center">
            <img src={info.qr} width="240" height="240" alt="QR code to open the POS on a phone" />
            <p className="text-sm break-all mt-2">{info.url}</p>
          </div>
        )}
      </div>
    </Shell>
  );
}
