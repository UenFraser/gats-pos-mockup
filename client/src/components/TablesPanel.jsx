// Settings > Tables: how many table tokens each zone has (managers). Removing only switches the highest number off.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import Icon from './Icon';
import Notice from './Notice';
import { useConfirm } from './ConfirmProvider';

const LABEL = { RESTAURANT: 'Restaurant tables', BAR: 'Bar seats', TAKEOUT: 'Takeout slots' };

export default function TablesPanel() {
  const confirm = useConfirm();
  const [zones, setZones] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { api.get('/api/settings/tokens').then((d) => setZones(d.zones)).catch((e) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  async function change(z, delta) {
    if (delta < 0) {
      const last = z.numbers[z.numbers.length - 1];
      const yes = await confirm({
        title: `Remove ${last}?`, message: `${last} will disappear from the order screens. Past sales keep their number, and you can bring it back with the plus button.`,
        confirmText: `Remove ${last}`, danger: true,
      });
      if (!yes) return;
    }
    setBusy(true); setError(''); setMsg('');
    try {
      const d = await api.patch('/api/settings/tokens', { zone: z.zone, count: z.count + delta });
      setZones(d.zones);
      const nz = d.zones.find((x) => x.zone === z.zone);
      setMsg(`${LABEL[z.zone]}: ${nz.count} (${nz.numbers[0]} to ${nz.numbers[nz.numbers.length - 1]})`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!zones) return error ? <Notice kind="error" onDismiss={() => setError('')}>{error}</Notice> : null;
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Tables</h2>
      {error && <Notice kind="error" onDismiss={() => setError('')}>{error}</Notice>}
      {msg && <Notice kind="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <p className="text-xs opacity-70">How many tokens each zone has. Removing switches off the highest number, and only when it is free (no open tab, reservation or ice request).</p>
      {zones.map((z) => (
        <div key={z.zone} className="flex items-center gap-3 border border-base-300 rounded-lg px-3 py-2">
          <div className="flex-1">
            <p className="font-semibold">{LABEL[z.zone]}</p>
            <p className="text-xs opacity-70">{z.numbers[0]} to {z.numbers[z.numbers.length - 1]}{z.inUse.length ? ` · in use now: ${z.inUse.join(', ')}` : ''}</p>
          </div>
          <button className="btn btn-sm btn-square" aria-label={`One fewer in ${LABEL[z.zone]}`} title="Remove one" disabled={busy || z.count <= z.min} onClick={() => change(z, -1)}><Icon name="minus" size={18} /></button>
          <span className="w-8 text-center font-bold tabular-nums">{z.count}</span>
          <button className="btn btn-sm btn-square" aria-label={`One more in ${LABEL[z.zone]}`} title="Add one" disabled={busy || z.count >= z.max} onClick={() => change(z, 1)}><Icon name="plus" size={18} /></button>
        </div>
      ))}
    </section>
  );
}
