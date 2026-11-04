// Tiny ESC/POS encoder. Pure JavaScript, no dependencies, so nothing native to break when packaged.
const ESC = 0x1b, GS = 0x1d;

// Most printer code pages have no peso sign or accents, so print "PHP" and plain letters.
const clean = (s) => String(s).replace(/₱/g, 'PHP ').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');

class Receipt {
  constructor(width = 48) {            // 48 columns is typical for 80mm; some printers use 42
    this.width = width;
    this.parts = [Buffer.from([ESC, 0x40])];   // initialize printer
  }
  raw(...bytes) { this.parts.push(Buffer.from(bytes)); return this; }
  text(s = '') { this.parts.push(Buffer.from(clean(s) + '\n', 'ascii')); return this; }
  align(a) { return this.raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[a]); }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  big(on) { return this.raw(GS, 0x21, on ? 0x11 : 0x00); }  // double width + height
  line(ch = '-') { return this.text(ch.repeat(this.width)); }
  row(left, right) {                   // left text, right-aligned text on the same line
    const l = clean(left), r = clean(right), room = this.width - r.length;
    const lt = l.length >= room ? l.slice(0, Math.max(0, room - 1)) : l;
    return this.text(lt + ' '.repeat(Math.max(1, room - lt.length)) + r);
  }
  feed(n = 3) { return this.raw(ESC, 0x64, n); }
  cut() { return this.raw(GS, 0x56, 66, 3); }              // feed, then partial cut
  openDrawer() { return this.raw(ESC, 0x70, 0, 25, 250); } // cash drawer kick (pin 2)
  toBuffer() { return Buffer.concat(this.parts); }
}

const php = (cents) => 'PHP ' + (cents / 100).toFixed(2);

function sampleReceipt() {
  const r = new Receipt();
  r.align('center').bold(true).big(true).text('GATS BAR').big(false).bold(false)
    .text('and Restaurant').text('*** TEST RECEIPT ***').align('left').line();
  r.text('Token: T4        Server: Test').line();
  r.row('2 x Sizzling Sisig', php(42000));
  r.row('1 x Red Horse', php(7500));
  r.row('3 x Coke, Sprite, Royal', php(7500));
  r.line().bold(true).row('TOTAL', php(57000)).bold(false);
  r.row('Cash', php(60000)).row('Change', php(3000)).line();
  r.align('center').text('Peso sign test: ₱  Accents: Señor Peña').text('Thank you!').feed(3).cut();
  return r.toBuffer();
}

module.exports = { Receipt, sampleReceipt, php, clean };
