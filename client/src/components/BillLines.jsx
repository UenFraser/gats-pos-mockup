import { php } from '../lib/format';

// True when the bill has anything beyond the plain items total (discount, VAT exemption, reservation fee or deposit).
export const hasExtras = (b) => b.vatRemovedCents > 0 || b.discountCents > 0 || b.feeChargeCents > 0 || b.creditCents > 0;

// The bill step by step, exactly as the server calculated it.
export default function BillLines({ bill }) {
  if (!hasExtras(bill)) return null;
  const row = (label, cents, minus = false, bold = false) => (
    <div className={`flex justify-between text-xs ${bold ? 'font-semibold' : ''}`}>
      <span>{label}</span><span>{minus ? '-' : ''}{php(cents)}</span>
    </div>
  );
  return (
    <div className="mt-2 space-y-0.5 text-left">
      {row('Items', bill.itemsCents)}
      {bill.vatRemovedCents > 0 && row('Less VAT (exempt)', bill.vatRemovedCents, true)}
      {bill.discountCents > 0 && row(bill.discount ? bill.discount.label : 'Discount', bill.discountCents, true)}
      {bill.feeChargeCents > 0 && row('Reservation fee', bill.feeChargeCents)}
      {bill.creditCents > 0 && row('Total', bill.totalCents, false, true)}
      {bill.creditCents > 0 && row('Less reservation deposit', bill.creditCents, true)}
    </div>
  );
}
