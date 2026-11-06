// Colored counts: green = added, red = voided/decreased, blue = swapped, pulsing BILL = bill requested.
export const TYPE_STYLE = {
  ADD: { badge: 'badge-success', border: 'border-success', word: 'Added' },
  VOID: { badge: 'badge-error', border: 'border-error', word: 'Removed' },
  SWAP: { badge: 'badge-info', border: 'border-info', word: 'Swapped' },
};

export default function NotifDots({ unread = {}, billRequested = false }) {
  const types = Object.keys(TYPE_STYLE).filter((t) => unread[t] > 0);
  if (!types.length && !billRequested) return null;
  return (
    <span className="flex gap-1 justify-center flex-wrap">
      {types.map((t) => <span key={t} className={`badge badge-xs ${TYPE_STYLE[t].badge}`}>{unread[t]}</span>)}
      {billRequested && <span className="badge badge-xs badge-warning font-bold animate-pulse">BILL</span>}
    </span>
  );
}
