// Phase 3: read-only. Pick a token, see the menu that token is allowed to sell.
// Phase 4 turns this into the real order screen.
import { useCallback, useEffect, useState } from 'react';
import Shell from '../components/Shell';
import { api } from '../lib/api';
import { php } from '../lib/format';

const ZONE_LABEL = { RESTAURANT: 'Restaurant', BAR: 'Bar', TAKEOUT: 'Takeout' };
const STATUS_CLASS = { FREE: 'btn-outline', OPEN: 'btn-warning', RESERVED: 'btn-info' };

export default function Waiter() {
  const [tokens, setTokens] = useState([]);
  const [selected, setSelected] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('ALL');
  const [error, setError] = useState('');

  const loadTokens = useCallback(() => {
    api.get('/api/tokens').then((d) => setTokens(d.tokens)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { loadTokens(); }, [loadTokens]);

  useEffect(() => {
    if (!selected) return;
    api.get(`/api/menu?zone=${selected.zone}`)
      .then((d) => { setCategories(d.categories); setCat('ALL'); })
      .catch((e) => setError(e.message));
  }, [selected]);

  const shown = cat === 'ALL' ? categories : categories.filter((c) => c.id === cat);

  return (
    <Shell title="Waiter">
      <div className="space-y-5">
        {error && <div className="alert alert-error text-sm">{error}</div>}

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Tokens</h2>
            <button className="btn btn-xs" onClick={loadTokens}>Refresh</button>
          </div>
          {['RESTAURANT', 'BAR', 'TAKEOUT'].map((zone) => (
            <div key={zone} className="mb-3">
              <p className="text-xs opacity-70 mb-1">{ZONE_LABEL[zone]}</p>
              <div className="flex flex-wrap gap-2">
                {tokens.filter((t) => t.zone === zone).map((t) => (
                  <button
                    key={t.id}
                    className={`btn btn-sm w-14 ${STATUS_CLASS[t.status]} ${selected?.id === t.id ? 'ring ring-primary' : ''}`}
                    onClick={() => setSelected(t)}
                  >
                    {t.number}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs opacity-60">Outlined = free, orange = in use, blue = reserved.</p>
        </section>

        {selected && (
          <section>
            <h2 className="font-semibold mb-2">Menu for {selected.number} ({ZONE_LABEL[selected.zone]})</h2>
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button className={`btn btn-xs ${cat === 'ALL' ? 'btn-primary' : ''}`} onClick={() => setCat('ALL')}>All</button>
              {categories.map((c) => (
                <button key={c.id} className={`btn btn-xs whitespace-nowrap ${cat === c.id ? 'btn-primary' : ''}`} onClick={() => setCat(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
            {shown.map((c) => (
              <div key={c.id} className="mb-3">
                <h3 className="text-sm font-semibold opacity-70">{c.name}</h3>
                <ul className="divide-y divide-base-300">
                  {c.items.map((i) => (
                    <li key={i.id} className="flex justify-between py-1 text-sm">
                      <span>{i.name}</span><span>{php(i.priceCents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>
    </Shell>
  );
}
