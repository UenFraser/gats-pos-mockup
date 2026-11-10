const { Receipt, php } = require('./escpos');
const { BUSINESS } = require('../config');

// UTC ISO -> local clock text ("2026-11-06 15:40") using the business time zone.
const localText = (iso) => new Date(Date.parse(iso) + BUSINESS.utcOffsetMinutes * 60000).toISOString().replace('T', ' ').slice(0, 16);
const METHOD = { CASH: 'Cash', CARD: 'Card', GCASH: 'GCash', OTHER: 'Other' };

// kind: 'BILL' (before payment) or 'RECEIPT' (after payment).
// d = { session: {tokenNumber, zone, openedBy, closedAt}, items: [{name, quantity, amountCents}], bill (see totals.js),
//       payments: [{method, amountCents, tenderedCents}], changeCents, cashier }
function buildDocument({ settings, kind, d, openDrawer }) {
  const b = d.bill;
  const r = new Receipt(settings.width);
  if (openDrawer) r.openDrawer();
  r.align('center').bold(true).big(true).text(settings.name).big(false).bold(false);
  for (const line of String(settings.header || '').split('\n')) if (line.trim()) r.text(line.trim());
  if (settings.tin) r.text(`TIN: ${settings.tin}`);
  r.text(kind === 'BILL' ? '*** BILL ***' : '*** PAYMENT RECEIPT ***').align('left').line();

  r.row(`Token: ${d.session.tokenNumber} (${d.session.zone.toLowerCase()})`, `Server: ${d.session.openedBy || '-'}`);
  if (d.session.customerName) r.row(`Customer: ${d.session.customerName}`, d.session.orderSource === 'ONLINE' ? 'Online order' : d.session.orderSource === 'LOCAL' ? 'Dine-in order' : '');
  r.row(`Date: ${localText(d.session.closedAt || new Date().toISOString())}`, kind === 'RECEIPT' ? `Cashier: ${d.cashier || '-'}` : '');
  r.line();
  for (const i of d.items) r.row(`${i.quantity} x ${i.name}`, php(i.amountCents));
  r.line();

  if (b.vatRemovedCents > 0 || b.discountCents > 0 || b.feeChargeCents > 0) r.row('Subtotal', php(b.itemsCents));
  if (b.vatRemovedCents > 0) r.row('Less VAT (exempt)', '-' + php(b.vatRemovedCents));
  if (b.discountCents > 0) r.row(b.discount ? b.discount.label : 'Discount', '-' + php(b.discountCents));
  if (b.feeChargeCents > 0) r.row('Reservation fee', php(b.feeChargeCents));
  if (b.creditCents > 0) {
    r.bold(true).row('TOTAL', php(b.totalCents)).bold(false);
    r.row('Less reservation deposit', '-' + php(b.creditCents));
  }
  r.bold(true).row(kind === 'BILL' ? 'AMOUNT DUE' : 'TOTAL PAID', php(b.dueCents)).bold(false);

  if (b.vatMode === 'INCLUSIVE') {
    r.line();
    r.row('VATable Sales', php(b.vatableSalesCents));
    r.row(`VAT (${b.vatRateBps / 100}%)`, php(b.vatCents));
    r.row('VAT-Exempt Sales', php(b.vatExemptSalesCents));
  }
  if (b.discount && b.discount.customerName) {
    r.line();
    r.text(`${b.discount.kind === 'SENIOR' ? 'Senior citizen' : 'PWD'}: ${b.discount.customerName}`);
    r.text(`ID no.: ${b.discount.idNumber}`);
  }
  if (kind === 'RECEIPT') {
    r.line();
    for (const p of d.payments) r.row(METHOD[p.method] || p.method, php(p.method === 'CASH' && p.tenderedCents ? p.tenderedCents : p.amountCents));
    if (d.changeCents > 0) r.row('Change', php(d.changeCents));
  }
  r.line();
  if (kind === 'BILL') r.align('center').text('Please pay at the cashier');
  if (settings.footer) r.align('center').text(settings.footer);
  r.feed(3).cut();
  return r.toBuffer();
}

module.exports = { buildDocument, localText };
