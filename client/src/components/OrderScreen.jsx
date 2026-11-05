// Take an order: pick a token, see its open tab, add items, send.
// Used by the waiter phone (/waiter) and the cashier counter (/desktop/order).
// The client sends ONLY token id, item ids and quantities. Prices and staff come from the server.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { php, timeLocal } from '../lib/format';
import { connectSocket } from '../lib/socket';
import { newRequestId } from '../lib/requestId';

const ZONES = ['RESTAURANT', 'BAR', 'TAKEOUT'];
const ZONE_LABEL = { RESTAURANT: 'Restaurant', BAR: 'Bar', TAKEOUT: 'Takeout' };
const STATUS_CLASS = { FREE: 'btn-outline', OPEN: 'btn-warning', RESERVED: 'btn-info' };
const MAX_QTY = 99;

export default function OrderScreen() {
  const [tokens, setTokens] = useState([]);
  const [tokenId, setTokenId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('ALL');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]); // [{ menuItemId, name, priceCents, quantity }]
  const [tab, setTab] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const [flashId, setFlashId] = useState(null);      // item row highlighted after a follow-up
  const [followBusy, setFollowBusy] = useState(null);
  const flashTimer = useRef(null);
  const requestIdRef = useRef(null); // same id on a retry of the SAME cart, so it is saved once

  const token = tokens.find((t) => t.id === tokenId) || null;
  const zone = token?.zone;
  const sessionId = token?.sessionId || null;

  const loadTokens = useCallback(() => {
    api.get('/api/tokens').then((d) => setTokens(d.tokens)).catch((e) => setError(e.message));
  }, []);

  const loadTab = useCallback(() => {
    if (!sessionId) { setTab(null); return; }
    api.get(`/api/sessions/${sessionId}`).then((d) => setTab(d.session)).catch(() => setTab(null));
  }, [sessionId]);

  useEffect(() => { loadTokens(); }, [loadTokens]);
  useEffect(() => { loadTab(); }, [loadTab]);

  // Menu for the token's zone (alcohol is only returned for bar tokens).
  useEffect(() => {
    if (!zone) return;
    api.get(`/api/menu?zone=${zone}`)
      .then((d) => { setCategories(d.categories); setCat('ALL'); })
      .catch((e) => setError(e.message));
  }, [zone]);

  // Live updates from the server; refetch after any reconnect too.
  useEffect(() => {
    const s = connectSocket();
    const refresh = () => { loadTokens(); loadTab(); };
    const events = ['token:changed', 'session:updated', 'kitchen:order-done', 'kitchen:order-recalled', 'connect'];
    events.forEach((e) => s.on(e, refresh));
    return () => events.forEach((e) => s.off(e, refresh));
  }, [loadTokens, loadTab]);

  const changeCart = (fn) => { requestIdRef.current = null; setCart(fn); }; // new content = new request id

  const addItem = (item) => changeCart((c) => {
    const found = c.find((l) => l.menuItemId === item.id);
    if (found) return c.map((l) => (l === found ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + 1) } : l));
    return [...c, { menuItemId: item.id, name: item.name, priceCents: item.priceCents, quantity: 1 }];
  });
  const bump = (id, delta) => changeCart((c) =>
    c.map((l) => (l.menuItemId === id ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + delta) } : l)).filter((l) => l.quantity > 0));

  const pickToken = (t) => {
    if (t.id === tokenId) return;
    if (cart.length && !window.confirm('Discard the order you are building?')) return;
    changeCart(() => []); setNotice(''); setError(''); setTokenId(t.id);
  };

  const cartTotal = cart.reduce((n, l) => n + l.priceCents * l.quantity, 0);
  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);

  async function send() {
    if (!token || !cart.length || sending) return;
    setSending(true); setError(''); setNotice('');
    if (!requestIdRef.current) requestIdRef.current = newRequestId();
    try {
      await api.post('/api/orders', {
        tokenId: token.id,
        requestId: requestIdRef.current,
        items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
      });
      // Only now, after the server confirmed the save, is it safe to clear the cart.
      requestIdRef.current = null;
      setCart([]);
      setNotice(`Order sent for ${token.number}`);
      loadTokens(); loadTab();
    } catch (e) {
      setError(`${e.message}. Your cart is kept; tap Send again.`);
    } finally {
      setSending(false);
    }
  }

  // Nudge the kitchen about one food item. Only the kitchen screen hears it; the row flashes here as confirmation.
  async function followUp(item) {
    setFollowBusy(item.id); setError('');
    try {
      await api.post('/api/followups/food', { orderItemId: item.id });
      setFlashId(item.id);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashId(null), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setFollowBusy(null);
    }
  }

  const q = search.trim().toLowerCase();
  const shown = useMemo(() => categories
    .filter((c) => cat === 'ALL' || c.id === cat)
    .map((c) => ({ ...c, items: c.items.filter((i) => !q || i.name.toLowerCase().includes(q)) }))
    .filter((c) => c.items.length), [categories, cat, q]);

  return (
    <div className={`space-y-4 ${cart.length ? 'pb-24' : ''}`}>
      {error && <div className="alert alert-error text-sm">{error}</div>}
      {notice && <div className="alert alert-success text-sm">{notice}</div>}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">{token ? `Token ${token.number}` : 'Choose a token'}</h2>
          <button className="btn btn-xs" onClick={loadTokens}>Refresh</button>
        </div>
        {ZONES.map((z) => (
          <div key={z} className="mb-2">
            <p className="text-xs opacity-70 mb-1">{ZONE_LABEL[z]}</p>
            <div className="flex flex-wrap gap-2">
              {tokens.filter((t) => t.zone === z).map((t) => (
                <button key={t.id} onClick={() => pickToken(t)}
                  className={`btn btn-sm w-14 ${STATUS_CLASS[t.status]} ${t.id === tokenId ? 'ring ring-primary' : ''}`}>
                  {t.number}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs opacity-60">Outlined = free, orange = open tab, blue = reserved.</p>
      </section>

      {token && tab && (
        <section className="card bg-base-200 p-3">
          <h3 className="font-semibold text-sm mb-1">Already ordered ({php(tab.totalCents)})</h3>
          {tab.batches.map((b) => {
            const hasKitchen = b.items.some((i) => i.kitchen);
            return (
              <div key={b.id} className="mb-2">
                <p className="text-xs opacity-60">
                  {timeLocal(b.createdAt)} · {b.staff}{hasKitchen ? (b.status === 'DONE' ? ' · ready' : ' · in kitchen') : ''}
                </p>
                {b.items.map((i) => {
                  const left = i.quantity - i.voidedQuantity;
                  const canFollow = b.status === 'ACTIVE' && i.kitchen && left > 0;
                  return (
                    <div key={i.id} className={`text-sm flex items-center gap-2 rounded px-1 transition-colors ${flashId === i.id ? 'bg-warning/40' : ''}`}>
                      <span className="flex-1">{left}x {i.name}{i.voidedQuantity > 0 ? ` (${i.voidedQuantity} voided)` : ''}</span>
                      <span>{php(left * i.unitPriceCents)}</span>
                      {canFollow && (
                        <button className="btn btn-xs btn-outline" disabled={followBusy === i.id} onClick={() => followUp(i)}>
                          Follow up
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>
      )}

      {token && cart.length > 0 && (
        <section className="card bg-base-200 p-3">
          <h3 className="font-semibold text-sm mb-1">New order</h3>
          {cart.map((l) => (
            <div key={l.menuItemId} className="flex items-center gap-2 text-sm py-1">
              <span className="flex-1">{l.name}</span>
              <button className="btn btn-xs" onClick={() => bump(l.menuItemId, -1)}>-</button>
              <span className="w-6 text-center">{l.quantity}</span>
              <button className="btn btn-xs" onClick={() => bump(l.menuItemId, 1)}>+</button>
              <span className="w-20 text-right">{php(l.priceCents * l.quantity)}</span>
            </div>
          ))}
          <button className="btn btn-ghost btn-xs self-start mt-1" onClick={() => changeCart(() => [])}>Clear</button>
        </section>
      )}

      {token && (
        <section>
          <input className="input input-bordered input-sm w-full mb-2" placeholder="Search the menu"
            value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <li key={i.id}>
                    <button className="w-full flex justify-between py-2 text-sm text-left active:bg-base-200" onClick={() => addItem(i)}>
                      <span>{i.name}</span><span>{php(i.priceCents)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {token && cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 p-3 bg-base-100 border-t border-base-300">
          <button className="btn btn-primary w-full" disabled={sending} onClick={send}>
            {sending ? 'Sending...' : `Send order for ${token.number}: ${cartCount} item${cartCount > 1 ? 's' : ''}, ${php(cartTotal)}`}
          </button>
        </div>
      )}
    </div>
  );
}
