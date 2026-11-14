// In-app confirmation dialogs. These REPLACE window.confirm(), which in the desktop app (Electron) can leave text boxes
// unusable after it closes, and which looks different on every phone. Use it like this:
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title: 'Cancel it?', message: '...', confirmText: 'Cancel it', danger: true }))) return;
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmCtx = createContext(null);

export function useConfirm() {
  const ask = useContext(ConfirmCtx);
  if (!ask) throw new Error('useConfirm needs <ConfirmProvider>');
  return ask;
}

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null); // { title, message, confirmText, cancelText, danger }
  const resolver = useRef(null);
  const confirmBtn = useRef(null);

  const finish = useCallback((answer) => {
    if (resolver.current) resolver.current(answer);
    resolver.current = null;
    setDialog(null);
  }, []);

  const ask = useCallback((options) => new Promise((resolve) => {
    if (resolver.current) resolver.current(false); // a newer question replaces an unanswered one
    resolver.current = resolve;
    setDialog({ title: 'Are you sure?', confirmText: 'Yes', cancelText: 'No', danger: false, ...(typeof options === 'string' ? { message: options } : options) });
  }), []);

  useEffect(() => {
    if (!dialog) return undefined;
    confirmBtn.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') finish(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, finish]);

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {dialog && (
        <div className="modal modal-open" role="dialog" aria-modal="true" style={{ zIndex: 2000 }}>
          <div className="modal-box max-w-sm space-y-3">
            <h3 className="font-bold text-lg">{dialog.title}</h3>
            {dialog.message && <p className="text-sm">{dialog.message}</p>}
            <div className="modal-action">
              <button className="btn" onClick={() => finish(false)}>{dialog.cancelText}</button>
              <button ref={confirmBtn} className={`btn ${dialog.danger ? 'btn-error' : 'btn-primary'}`} onClick={() => finish(true)}>{dialog.confirmText}</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => finish(false)} />
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
