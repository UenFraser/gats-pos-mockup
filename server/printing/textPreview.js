// Turns the ESC/POS bytes into readable text, so receipts can be checked without a physical printer.
const ESC = 0x1b;
const GS = 0x1d;
const ESC_ARGS = { 0x40: 0, 0x61: 1, 0x45: 1, 0x64: 1, 0x70: 3 }; // init, align, bold, feed, drawer kick
const GS_ARGS = { 0x21: 1, 0x56: 2 };                              // text size, cut

function escposToText(buf, width = 48) {
  const lines = [];
  let cur = '';
  let align = 0;
  const flush = () => {
    const pad = align === 1 ? Math.max(0, Math.floor((width - cur.length) / 2)) : 0;
    lines.push(' '.repeat(pad) + cur);
    cur = '';
  };
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === ESC) {
      const code = buf[i + 1];
      if (code === 0x61) align = buf[i + 2];
      if (code === 0x70) lines.push('[cash drawer opens]');
      i += 1 + (ESC_ARGS[code] ?? 0);
    } else if (b === GS) {
      const code = buf[i + 1];
      if (code === 0x56) { if (cur) flush(); lines.push('-'.repeat(width), '  (paper is cut here)'); }
      i += 1 + (GS_ARGS[code] ?? 0);
    } else if (b === 0x0a) {
      flush();
    } else {
      cur += Buffer.from([b]).toString('latin1');
    }
  }
  if (cur) flush();
  return lines.join('\n') + '\n';
}

module.exports = { escposToText };
