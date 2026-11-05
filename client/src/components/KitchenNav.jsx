import { NavLink } from 'react-router-dom';

export default function KitchenNav() {
  const cls = ({ isActive }) => `btn btn-sm ${isActive ? 'btn-primary' : ''}`;
  return (
    <div className="flex gap-2 mb-4">
      <NavLink to="/kitchen" end className={cls}>Active orders</NavLink>
      <NavLink to="/kitchen/history" className={cls}>History</NavLink>
    </div>
  );
}
