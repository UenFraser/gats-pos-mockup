// A notice banner (saved, sent, error...). Click it and it goes away.
// kind: 'success' | 'error' | 'warning' | 'info'. The text sits in ONE child, so inline elements inside never break the layout.
const KIND = { error: 'alert-error', success: 'alert-success', warning: 'alert-warning', info: 'alert-info' };

export default function Notice({ kind = 'info', onDismiss, className = '', children }) {
  return (
    <div role="status" title="Click to dismiss" onClick={onDismiss} className={`alert ${KIND[kind] || KIND.info} text-sm cursor-pointer ${className}`}>
      <span className="flex-1 break-words">{children}</span>
    </div>
  );
}
