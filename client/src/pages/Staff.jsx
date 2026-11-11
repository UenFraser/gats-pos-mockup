// Manager only: add staff, change names/roles, reset PINs and passwords, switch people off, and manage approval PINs.
// (This replaces tools/add-staff.ps1 and tools/set-approval-pin.ps1.)
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import { AddStaffDialog, ApprovalPinDialog, EditStaffDialog, ROLE_LABEL } from '../components/StaffDialogs';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

export default function Staff() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [approvers, setApprovers] = useState([]);
  const [dialog, setDialog] = useState(null); // { type: 'add' } | { type: 'edit' | 'pin', user }
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([api.get('/api/users'), api.get('/api/approvers')])
      .then(([u, a]) => { setUsers(u); setApprovers(a.approvers.map((x) => x.id)); setError(''); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const done = () => { setDialog(null); load(); };
  const rows = users ? [...users].sort((a, b) => b.active - a.active || a.displayName.localeCompare(b.displayName)) : [];

  return (
    <Shell title="Staff">
      <div className="flex gap-2 mb-3">
        <Link to="/desktop" className="btn btn-ghost btn-sm">&larr; Desktop</Link>
        <button className="btn btn-primary btn-sm ml-auto" onClick={() => setDialog({ type: 'add' })}>Add staff</button>
      </div>
      {error && <div className="alert alert-error mb-3 text-sm">{error}</div>}
      <p className="text-xs opacity-60 mb-3">
        Waiters, cashiers and kitchen staff log in by tapping their name and typing a 6-digit PIN. Managers log in with a password.
        Approval PINs are separate: give one to each manager and to the designated Lead Cashier only.
      </p>
      <div className="space-y-2">
        {rows.map((u) => {
          const canApprove = approvers.includes(u.id);
          const canHold = u.active && (u.role === 'MANAGER' || u.role === 'CASHIER');
          return (
            <div key={u.id} className={`flex items-center gap-2 flex-wrap rounded-lg border-2 px-3 py-2 ${u.active ? 'border-base-300 bg-base-100' : 'border-base-300 bg-base-200 opacity-60'}`}>
              <div className="flex-1 min-w-[10rem]">
                <p className="font-semibold">{u.displayName}{u.id === me.id ? ' (you)' : ''}</p>
                <p className="text-xs opacity-60">{u.username}</p>
              </div>
              <span className="badge badge-outline">{ROLE_LABEL[u.role]}</span>
              {!u.active && <span className="badge badge-ghost">Inactive</span>}
              {u.active && u.role === 'CASHIER' && canApprove && <span className="badge badge-success">Lead Cashier</span>}
              {u.active && u.role === 'MANAGER' && (canApprove ? <span className="badge badge-success">Approval PIN set</span> : <span className="badge badge-warning">No approval PIN</span>)}
              {canHold && <button className="btn btn-xs btn-outline" onClick={() => setDialog({ type: 'pin', user: u })}>{canApprove ? 'Approval PIN' : u.role === 'CASHIER' ? 'Make Lead Cashier' : 'Set approval PIN'}</button>}
              <button className="btn btn-xs" onClick={() => setDialog({ type: 'edit', user: u })}>Edit</button>
            </div>
          );
        })}
      </div>
      {dialog && dialog.type === 'add' && <AddStaffDialog onClose={() => setDialog(null)} onDone={done} />}
      {dialog && dialog.type === 'edit' && <EditStaffDialog user={dialog.user} isMe={dialog.user.id === me.id} onClose={() => setDialog(null)} onDone={done} />}
      {dialog && dialog.type === 'pin' && <ApprovalPinDialog user={dialog.user} hasPin={approvers.includes(dialog.user.id)} onClose={() => setDialog(null)} onDone={done} />}
    </Shell>
  );
}
