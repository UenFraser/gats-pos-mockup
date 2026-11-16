import DesktopShell from '../components/DesktopShell';
import OrderScreen from '../components/OrderScreen';

export default function DesktopOrder() {
  return (
    <DesktopShell title="New order">
      <div className="max-w-3xl mx-auto"><OrderScreen /></div>
    </DesktopShell>
  );
}
