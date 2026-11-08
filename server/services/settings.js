// Receipt and printer settings, stored in the settings table (keys start with "print.").
const { HttpError } = require('./errors');

const DEFAULTS = {
  name: 'GATS BAR', header: 'and Restaurant', tin: '', footer: 'Thank you! Please come again.',
  transport: 'none', host: '', port: 9100, printer: '', width: 48, drawer: false,
};

function getPrintSettings(db) {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'print.%'").all();
  const raw = Object.fromEntries(rows.map((r) => [r.key.slice(6), r.value]));
  return {
    name: raw.business_name ?? DEFAULTS.name,
    header: raw.header ?? DEFAULTS.header,
    tin: raw.tin ?? DEFAULTS.tin,
    footer: raw.footer ?? DEFAULTS.footer,
    transport: raw.transport ?? DEFAULTS.transport,
    host: raw.host ?? DEFAULTS.host,
    port: raw.port ? Number(raw.port) : DEFAULTS.port,
    printer: raw.printer ?? DEFAULTS.printer,
    width: raw.width ? Number(raw.width) : DEFAULTS.width,
    drawer: raw.drawer === '1',
  };
}

function setPrintSettings(db, b) {
  if (!b || typeof b !== 'object') throw new HttpError(400, 'Nothing to save');
  const str = (v, max, label) => {
    if (typeof v !== 'string' || v.length > max) throw new HttpError(400, `${label} must be text up to ${max} characters`);
    return v.trim();
  };
  const name = str(b.name, 40, 'Business name');
  const header = str(b.header ?? '', 200, 'Header');
  const footer = str(b.footer ?? '', 200, 'Footer');
  const tin = str(b.tin ?? '', 40, 'TIN');
  if (!['none', 'tcp', 'spooler', 'file'].includes(b.transport)) throw new HttpError(400, 'Printer type must be none, tcp, spooler or file');
  const host = str(b.host ?? '', 100, 'Printer address');
  const printer = str(b.printer ?? '', 200, 'Printer name');
  const port = Number(b.port ?? 9100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(400, 'Port must be 1 to 65535');
  const width = Number(b.width ?? 48);
  if (![32, 42, 48].includes(width)) throw new HttpError(400, 'Paper width must be 32, 42 or 48 characters');
  if (b.transport === 'tcp' && !host) throw new HttpError(400, 'Enter the printer address (for example 192.168.1.50)');
  if (b.transport === 'spooler' && !printer) throw new HttpError(400, 'Choose the Windows printer');

  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    up.run('print.business_name', name); up.run('print.header', header); up.run('print.footer', footer); up.run('print.tin', tin);
    up.run('print.transport', b.transport); up.run('print.host', host); up.run('print.port', String(port));
    up.run('print.printer', printer); up.run('print.width', String(width)); up.run('print.drawer', b.drawer ? '1' : '0');
  })();
  return getPrintSettings(db);
}

// ---- Billing: reservation fee and VAT ----
//  feeMode 'ADD'    = the fee is charged on the final bill at checkout (nothing was paid in advance).
//  feeMode 'DEDUCT' = the fee was paid in advance (for example online); it is credited against the bill.
//  vatMode 'NONE'      = no VAT lines on the receipt.
//  vatMode 'INCLUSIVE' = menu prices already include VAT; the receipt shows the breakdown (and Senior/PWD VAT exemption).
const BILLING_DEFAULTS = { feeCents: 5000, feeMode: 'ADD', vatMode: 'NONE', vatRateBps: 1200 };

function getBillingSettings(db) {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'billing.%'").all();
  const raw = Object.fromEntries(rows.map((r) => [r.key.slice(8), r.value]));
  return {
    feeCents: raw.fee_cents !== undefined ? Number(raw.fee_cents) : BILLING_DEFAULTS.feeCents,
    feeMode: raw.fee_mode ?? BILLING_DEFAULTS.feeMode,
    vatMode: raw.vat_mode ?? BILLING_DEFAULTS.vatMode,
    vatRateBps: raw.vat_rate_bps !== undefined ? Number(raw.vat_rate_bps) : BILLING_DEFAULTS.vatRateBps,
  };
}

function setBillingSettings(db, b) {
  if (!b || typeof b !== 'object') throw new HttpError(400, 'Nothing to save');
  if (!Number.isInteger(b.feeCents) || b.feeCents < 0 || b.feeCents > 10000000) throw new HttpError(400, 'Reservation fee must be between 0 and 100,000 pesos');
  if (!['ADD', 'DEDUCT'].includes(b.feeMode)) throw new HttpError(400, 'Fee mode must be ADD or DEDUCT');
  if (!['NONE', 'INCLUSIVE'].includes(b.vatMode)) throw new HttpError(400, 'VAT mode must be NONE or INCLUSIVE');
  if (!Number.isInteger(b.vatRateBps) || b.vatRateBps < 0 || b.vatRateBps > 3000) throw new HttpError(400, 'VAT rate must be between 0% and 30%');
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    up.run('billing.fee_cents', String(b.feeCents)); up.run('billing.fee_mode', b.feeMode);
    up.run('billing.vat_mode', b.vatMode); up.run('billing.vat_rate_bps', String(b.vatRateBps));
  })();
  return getBillingSettings(db);
}

module.exports = { getPrintSettings, setPrintSettings, getBillingSettings, setBillingSettings, DEFAULTS, BILLING_DEFAULTS };
