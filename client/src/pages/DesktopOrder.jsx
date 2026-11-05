import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import OrderScreen from '../components/OrderScreen';

export default function DesktopOrder() {
  return (
    <Shell title="New order">
      <Link to="/desktop" className="btn btn-ghost btn-sm mb-2">&larr; Desktop</Link>
      <OrderScreen />
    </Shell>
  );
}
