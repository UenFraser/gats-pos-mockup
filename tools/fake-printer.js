// Dev tool (not shipped): pretends to be a LAN receipt printer on port 9100.
// Run:  node tools/fake-printer.js
const net = require('net');
const fs = require('fs');

function render(b) {
  let out = '';
  for (let i = 0; i < b.length;) {
    const x = b[i];
    if (x === 0x1b) {
      const c = b[i + 1];
      if (c === 0x40) i += 2;
      else if (c === 0x70) { out += '[CASH DRAWER KICK]\n'; i += 5; }
      else i += 3;                                   // ESC a / E / d take one parameter
    } else if (x === 0x1d) {
      if (b[i + 1] === 0x56) { out += '[--- CUT ---]\n'; i += 4; }
      else i += 3;                                   // GS ! n
    } else { out += String.fromCharCode(x); i++; }
  }
  return out;
}

net.createServer((sock) => {
  const chunks = [];
  sock.on('data', (c) => chunks.push(c));
  sock.on('end', () => {
    const b = Buffer.concat(chunks);
    fs.writeFileSync('last-receipt.bin', b);
    console.log(`\n===== received ${b.length} bytes =====\n${render(b)}===== end =====`);
  });
}).listen(9100, '127.0.0.1', () => console.log('Fake ESC/POS printer listening on 127.0.0.1:9100'));
