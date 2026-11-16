// "Connect phones": the QR code in a window instead of taking space on the screen.
import { useEffect } from 'react';
import QrCard from './QrCard';

export default function QrModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal modal-open" role="dialog" aria-modal="true">
      <div className="modal-box max-w-xs text-center space-y-3">
        <h3 className="font-bold text-lg">Connect phones</h3>
        <p className="text-xs opacity-70">Scan this with the camera of a phone that is on the restaurant Wi-Fi.</p>
        <div className="flex justify-center"><QrCard /></div>
        <div className="modal-action justify-center"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
