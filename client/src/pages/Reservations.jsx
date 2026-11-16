import DesktopShell from '../components/DesktopShell';
import ReservationsBoard from '../components/ReservationsBoard';

export default function Reservations() {
  return (
    <DesktopShell title="Reservations">
      <div className="max-w-3xl"><ReservationsBoard /></div>
    </DesktopShell>
  );
}
