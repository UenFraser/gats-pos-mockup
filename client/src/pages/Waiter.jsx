import Shell from '../components/Shell';
import IceBoard from '../components/IceBoard';
import OrderScreen from '../components/OrderScreen';

export default function Waiter() {
  return (
    <Shell title="Waiter">
      <div className="space-y-4">
        <IceBoard />
        <OrderScreen />
      </div>
    </Shell>
  );
}
