import { timeLocal } from '../lib/format';
import { TYPE_STYLE } from './NotifDots';

// "What changed" on a tab since you last looked: one colored line per notification.
export default function Changes({ changes, onDismiss }) {
  if (!changes.length) return null;
  return (
    <section className="space-y-1">
      {changes.map((c) => (
        <div key={c.id} className={`border-l-4 ${TYPE_STYLE[c.type].border} bg-base-200 rounded px-3 py-1 text-sm`}>
          <span className="font-semibold">{TYPE_STYLE[c.type].word}</span> by {c.by} at {timeLocal(c.createdAt)}: {c.summary}
        </div>
      ))}
      <button className="btn btn-xs btn-ghost" onClick={onDismiss}>Got it</button>
    </section>
  );
}
