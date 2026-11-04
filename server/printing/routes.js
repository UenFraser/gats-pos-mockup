const { sampleReceipt } = require('./escpos');
const { sendTcp, sendSpooler, listPrinters } = require('./transports');

// SPIKE ONLY: remove before real use. Restricted to the machine running the app.
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

function registerPrintRoutes(app) {
  app.get('/api/printers', async (req, res) => {
    if (!isLocal(req)) return res.status(403).json({ error: 'local only' });
    try { res.json(await listPrinters()); } catch (e) { res.status(500).json({ error: String(e.message) }); }
  });

  app.post('/api/print-test', async (req, res) => {
    if (!isLocal(req)) return res.status(403).json({ error: 'local only' });
    const { transport, host, port, printer } = req.query;
    try {
      const bytes = sampleReceipt();
      if (transport === 'tcp') await sendTcp({ host, port: Number(port) || 9100 }, bytes);
      else if (transport === 'spooler') await sendSpooler({ printer }, bytes);
      else return res.status(400).json({ error: 'transport must be tcp or spooler' });
      res.json({ ok: true, bytes: bytes.length });
    } catch (e) { res.status(500).json({ ok: false, error: String(e.message) }); }
  });
}

module.exports = { registerPrintRoutes };
