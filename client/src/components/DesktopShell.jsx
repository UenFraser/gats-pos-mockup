// The cashier PC frame: a thin icon column on the left (every desktop page), then the usual header and the page.
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import Shell from './Shell';
import Icon from './Icon';
import QrModal from './QrModal';
import { useAuth } from '../auth/AuthContext';

const itemClass = (isActive) => `btn btn-ghost btn-square ${isActive ? 'btn-active' : ''}`;

function RailLink({ to, icon, label, end = false }) {
  return (
    <NavLink to={to} end={end} aria-label={label} title={label} className={({ isActive }) => itemClass(isActive)}>
      <Icon name={icon} />
    </NavLink>
  );
}

export default function DesktopShell({ title, children, wide = true }) {
  const { user } = useAuth();
  const [qrOpen, setQrOpen] = useState(false);

  const rail = (
    <nav aria-label="Main menu" className="w-14 shrink-0 bg-base-200 border-r border-base-300 flex flex-col items-center gap-2 py-3 sticky top-0 h-screen">
      <RailLink to="/desktop" end icon="home" label="Home" />
      <RailLink to="/desktop/order" icon="plus" label="New order" />
      <RailLink to="/desktop/reservations" icon="calendar" label="Reservations" />
      <RailLink to="/desktop/summary" icon="chart" label="Daily summary" />
      <button className="btn btn-ghost btn-square" aria-label="Connect phones" title="Connect phones" onClick={() => setQrOpen(true)}>
        <Icon name="phone" />
      </button>
      {user.role === 'MANAGER' && (
        <div className="mt-auto flex flex-col gap-2">
          <RailLink to="/desktop/staff" icon="users" label="Staff" />
          <RailLink to="/desktop/settings" icon="settings" label="Settings" />
        </div>
      )}
    </nav>
  );

  return (
    <>
      <Shell title={title} wide={wide} rail={rail}>{children}</Shell>
      {qrOpen && <QrModal onClose={() => setQrOpen(false)} />}
    </>
  );
}
