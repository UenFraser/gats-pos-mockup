// Settings > System (managers): where the data lives, backups (and a second location), start with Windows, restore.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { dateTimeLocal } from '../lib/format';
import RestoreDialog from './RestoreDialog';
import { SCREENS_BUILD } from '../lib/build';

const KIND = { backup: 'Backup', 'before-update': 'Before an update', 'before-restore': 'Before a restore', damaged: 'Damaged file' };
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function SystemPanel() {
  const [info, setInfo] = useState(null);
  const [extraDir, setExtraDir] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoreFor, setRestoreFor] = useState(null);

  const load = useCallback(() => {
    api.get('/api/system').then((d) => { setInfo(d.system); setExtraDir(d.system.extraBackupDir); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(fn, okText) {
    setBusy(true); setError(''); setMsg('');
    try { const r = await fn(); setMsg(typeof okText === 'function' ? okText(r) : okText); load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!info) return error ? <div className="alert alert-error text-sm">{error}</div> : null;
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">System and backups</h2>
      {error && <div className="alert alert-error text-sm">{error}</div>}
      {msg && <div className="alert alert-success text-sm break-all">{msg}</div>}

      <div className="card bg-base-200 p-3 text-xs space-y-1 break-all">
        <p>Version {info.appVersion || '-'} · database v{info.schemaVersion} · {size(info.dbSizeBytes)} · running {Math.round(info.uptimeSeconds / 3600)} h</p>
        <p>Build: program {info.builds.main} · server {info.builds.server} · screens {SCREENS_BUILD}</p>
        <p>Data folder: {info.dataDir}</p>
        <p>Phones open: {info.addresses.length ? info.addresses.map((a) => `http://${a.split(' ')[0]}:${info.port}/`).join('  or  ') : 'no network found'}</p>
      </div>

      {(info.builds.main !== info.builds.server || info.builds.server !== SCREENS_BUILD) && (
        <div className="alert alert-error text-xs">
          Some update files were not copied: program {info.builds.main}, server {info.builds.server}, screens {SCREENS_BUILD}. Copy the newest update files again (all three must show the same build), then run npm run dist.
        </div>
      )}

      {info.firewall && (
        <div className="card bg-base-200 p-3 space-y-2">
          <p className="text-sm font-semibold">Phones and the Windows Firewall</p>
          {info.firewall.rule === true
            ? <p className="text-xs text-success">Phones on your private network are allowed through the firewall.</p>
            : (
              <>
                <div className="alert alert-warning text-xs">{info.firewall.rule === null ? 'The firewall could not be checked.' : 'The firewall rule for phones is missing.'} Tap the button, then click <b>Yes</b> when Windows asks for permission on this computer.</div>
                <button className="btn btn-sm btn-primary w-fit" disabled={busy}
                  onClick={() => run(() => api.post('/api/system/firewall'), 'Windows is asking for permission on the POS computer. Click Yes there.').then(() => setTimeout(load, 8000))}>
                  Allow phones through the firewall
                </button>
              </>
            )}
          {info.firewall.publicNetworks.length > 0 && (
            <div className="alert alert-warning text-xs">
              This computer is on a network Windows calls Public ({info.firewall.publicNetworks.join(', ')}). Public networks block phones. In Windows: Settings, Network and internet, Wi-Fi (or Ethernet), your network, then choose Private.
            </div>
          )}
        </div>
      )}

      {info.autoStartAvailable && (
        <label className="label cursor-pointer justify-start gap-3">
          <input type="checkbox" className="checkbox checkbox-sm" checked={info.autoStart} disabled={busy}
            onChange={(e) => run(() => api.patch('/api/system', { autoStart: e.target.checked }), e.target.checked ? 'The POS will start when Windows starts' : 'The POS will not start by itself')} />
          <span className="label-text">Start the POS automatically when Windows starts</span>
        </label>
      )}

      <div>
        <p className="text-sm font-semibold mb-1">Backups</p>
        <p className="text-xs opacity-70 mb-2">
          The POS backs up when it starts and every few hours, and keeps the newest 30. Last backup: {info.lastBackupAt ? dateTimeLocal(info.lastBackupAt) : 'never'}.
        </p>
        {!info.extraBackupDir && (
          <div className="alert alert-warning text-xs mb-2">
            Backups are only on this computer. If the disk fails they are lost too. Set a second location below (a USB drive or a cloud-synced folder such as OneDrive or Google Drive).
          </div>
        )}
        <div className="flex gap-2 mb-2">
          <input className="input input-bordered input-sm flex-1" placeholder="Second backup folder, for example E:\GatsBackups" value={extraDir} onChange={(e) => setExtraDir(e.target.value)} />
          <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.patch('/api/system', { backupDir: extraDir }), 'Second backup folder saved')}>Save</button>
        </div>
        {info.extraBackupDir && info.extraBackupOk === false && <div className="alert alert-error text-xs mb-2">The second backup folder cannot be written to right now. Is the drive connected?</div>}
        <button className="btn btn-sm btn-primary mb-3" disabled={busy}
          onClick={() => run(() => api.post('/api/system/backup'), (r) => `Backup saved${r.copiedToExtra ? ' and copied to the second location' : ''}${r.extraError ? ` (second location failed: ${r.extraError})` : ''}`)}>Back up now</button>

        <div className="space-y-1">
          {info.backups.map((b) => (
            <div key={b.name} className="flex items-center gap-2 text-xs border-b border-base-300 py-1">
              <span className="flex-1 break-all">{dateTimeLocal(b.at)} · {KIND[b.kind]} · {size(b.sizeBytes)}</span>
              {b.kind !== 'damaged' && <button className="btn btn-xs btn-outline" onClick={() => setRestoreFor(b)}>Restore</button>}
            </div>
          ))}
          {info.backups.length === 0 && <p className="text-xs opacity-60">No backups yet.</p>}
        </div>
      </div>
      {restoreFor && <RestoreDialog backup={restoreFor} onClose={() => setRestoreFor(null)} />}
    </section>
  );
}
