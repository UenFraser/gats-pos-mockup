// Take an order: pick a token, see its open tab, add items, send.
// Used by the waiter phone (/waiter) and the cashier counter (/desktop/order).
// The client sends ONLY token id, item ids and quantities. Prices and staff come from the server.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { php, timeLocal } from '../lib/format';
import { connectSocket } from '../lib/socket';
import { newRequestId } from '../lib/requestId';
import { useSessionView } from '../lib/useSessionView';
import Changes from './Changes';
import CustomerBanner from './CustomerBanner';
import NotifDots from './NotifDots';
import SessionTab from './SessionTab';
import SwapDialog from './SwapDialog';
import VoidDialog from './VoidDialog';
import { useAuth } from '../auth/AuthContext';

const ZONES = ['RESTAURANT', 'BAR', 'TAKEOUT'];
const ZONE_LABEL = { RESTAURANT: 'Restaurant', BAR: 'Bar', TAKEOUT: 'Takeout' };
const STATUS_CLASS = { FREE: 'btn-outline', OPEN: 'btn-warning', RESERVED: 'btn-info' };
const TOKEN_REFRESH = ['token:changed', 'session:updated', 'session:bill-requested', 'session:bill-cleared', 'session:closed', 'connect'];
const MAX_QTY = 99;

// "HH:MM" (today, or tomorrow if that time has clearly passed) -> ISO, or undefined when left empty.
function pickupIso(hm) {
  if (!hm) return undefined;
  const [h, m] = hm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now() - 30 * 60000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export default function OrderScreen() {
  const [tokens, setTokens] = useState([]);
  const [flags, setFlags] = useState({}); // sessionId -> { unread, billRequested }
  const [tokenId, setTokenId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('ALL');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]); // [{ menuItemId, name, priceCents, quantity }]
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const requestIdRef = useRef(null); // same id on a retry of the SAME cart, so it is saved once
  const [voidItem, setVoidItem] = useState(null);
  const [swapItem, setSwapItem] = useState(null);
  const [customer, setCustomer] = useState({ name: '', phone: '', source: 'LOCAL', pickup: '' }); // new takeout only
  const { user } = useAuth();
  const canSwap = user.role !== 'WAITER'; // waiters ask the cashier to swap
  const [params] = useSearchParams();

  const token = tokens.find((t) => t.id === tokenId) || null;
  const zone = token?.zone;
  const { session: tab, changes, dismissChanges, reload: reloadTab } = useSessionView(token?.sessionId || null);

  const loadTokens = useCallback(() => {
    Promise.all([api.get('/api/tokens'), api.get('/api/sessions')])
      .then(([t, s]) => {
        setTokens(t.tokens);
        setFlags(Object.fromEntries(s.sessions.map((x) => [x.id, { unread: x.unread, billRequested: !!x.billRequestedAt }])));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => { loadTokens(); }, [loadTokens]);

  // /desktop/order?token=<id> opens straight on that token (the cashier's "Add items" button).
  const wanted = params.get('token');
  useEffect(() => {
    if (wanted && !tokenId && tokens.some((t) => t.id === wanted)) setTokenId(wanted);
  }, [wanted, tokens, tokenId]);

  useEffect(() => {
    if (!zone) return;
    api.get(`/api/menu?zone=${zone}`)
      .then((d) => { setCategories(d.categories); setCat('ALL'); })
      .catch((e) => setError(e.message));
  }, [zone]);

  useEffect(() => {
    const s = connectSocket();
    TOKEN_REFRESH.forEach((e) => s.on(e, loadTokens));
    return () => TOKEN_REFRESH.forEach((e) => s.off(e, loadTokens));
  }, [loadTokens]);

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
    changeCart(() => []); setNotice(''); setError(''); setCustomer({ name: '', phone: '', source: 'LOCAL', pickup: '' }); setTokenId(t.id);
  };

  // A free takeout token starts a new takeout: the customer's details go with the first order.
  const newTakeout = !!token && token.zone === 'TAKEOUT' && token.status === 'FREE';
  const cartTotal = cart.reduce((n, l) => n + l.priceCents * l.quantity, 0);
  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);

  async function send() {
    if (!token || !cart.length || sending || (newTakeout && !customer.name.trim())) return;
    // A blue (reserved) table: the first order seats the guests, so make sure it is the right table.
    if (token.status === 'RESERVED') {
      const who = tab && tab.customerName ? ` for ${tab.customerName}${tab.reservationTime ? ` at ${timeLocal(tab.reservationTime)}` : ''}` : '';
      if (!window.confirm(`${token.number} is reserved${who}. Seat them and send this order?`)) return;
    }
    setSending(true); setError(''); setNotice('');
    if (!requestIdRef.current) requestIdRef.current = newRequestId();
    try {
      await api.post('/api/orders', {
        tokenId: token.id,
        requestId: requestIdRef.current,
        items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
        ...(newTakeout ? { takeout: { name: customer.name, phone: customer.phone, source: customer.source, pickupAt: pickupIso(customer.pickup) } } : {}),
      });
      // Only now, after the server confirmed the save, is it safe to clear the cart.
      requestIdRef.current = null;
      setCart([]);
      setNotice(`Order sent for ${token.number}`);
      loadTokens(); reloadTab();
    } catch (e) {
      setError(`${e.message}. Your cart is kept; tap Send again.`);
    } finally {
      setSending(false);
    }
  }

  async function requestBill() {
    try { await api.post(`/api/sessions/${tab.id}/bill-request`); setNotice(`Bill requested for ${token.number}`); reloadTab(); }
    catch (e) { setError(e.message); }
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
              {tokens.filter((t) => t.zone === z).map((t) => {
                const f = flags[t.sessionId] || {};
                return (
                  <div key={t.id} className="flex flex-col items-center gap-0.5">
                    <button onClick={() => pickToken(t)}
                      className={`btn btn-sm w-14 ${STATUS_CLASS[t.status]} ${t.id === tokenId ? 'ring ring-primary' : ''}`}>
                      {t.number}
                    </button>
                    <NotifDots unread={f.unread} billRequested={f.billRequested} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <p className="text-xs opacity-60">Outlined = free, orange = open tab, blue = reserved. Green/red/blue counts = changes you have not seen.</p>
      </section>

      {token && tab && <CustomerBanner session={tab} onError={setError} />}
      {token && <Changes changes={changes} onDismiss={dismissChanges} />}

      {newTakeout && (
        <section className="card bg-base-200 p-3 space-y-2">
          <h3 className="font-semibold text-sm">Takeout customer</h3>
          <input className="input input-bordered input-sm w-full" placeholder="Customer name (required)" maxLength={60} value={customer.name}
            onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          <input className="input input-bordered input-sm w-full" placeholder="Phone (optional)" maxLength={30} value={customer.phone}
            onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
          <div className="flex gap-2 items-center flex-wrap">
            <button className={`btn btn-xs ${customer.source === 'LOCAL' ? 'btn-accent' : 'btn-outline'}`} onClick={() => setCustomer({ ...customer, source: 'LOCAL' })}>Local (dining in)</button>
            <button className={`btn btn-xs ${customer.source === 'ONLINE' ? 'btn-secondary' : 'btn-outline'}`} onClick={() => setCustomer({ ...customer, source: 'ONLINE' })}>Online (call or website)</button>
            <label className="flex items-center gap-1 text-xs ml-auto">Pickup
              <input className="input input-bordered input-xs" type="time" value={customer.pickup} onChange={(e) => setCustomer({ ...customer, pickup: e.target.value })} />
            </label>
          </div>
        </section>
      )}

      {token && tab && (
        <>
          <SessionTab session={tab} onError={setError} onVoid={setVoidItem} onSwap={canSwap ? setSwapItem : undefined} />
          {tab.status === 'OPEN' && tab.zone !== 'TAKEOUT' && (
            <button className="btn btn-sm btn-outline" disabled={!!tab.billRequestedAt} onClick={requestBill}>
              {tab.billRequestedAt ? 'Bill requested' : 'Request bill'}
            </button>
          )}
        </>
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
          <button className="btn btn-primary w-full" disabled={sending || (newTakeout && !customer.name.trim())} onClick={send}>
            {sending ? 'Sending...' : `Send order for ${token.number}: ${cartCount} item${cartCount > 1 ? 's' : ''}, ${php(cartTotal)}`}
          </button>
        </div>
      )}

      {swapItem && tab && (
        <SwapDialog session={tab} item={swapItem} onClose={() => setSwapItem(null)}
          onDone={(to) => { setSwapItem(null); setNotice(`Moved to ${to}`); loadTokens(); reloadTab(); }} />
      )}

      {voidItem && tab && (
        <VoidDialog sessionId={tab.id} item={voidItem} onClose={() => setVoidItem(null)}
          onDone={() => { setVoidItem(null); setNotice('Void approved'); loadTokens(); reloadTab(); }} />
      )}
    </div>
  );
}
