// Watches the two things that make phones lose the POS "by themselves", and writes them to main.log:
//   1. the PC's LAN address changing (the router handed out a new one): phones using the old address stop working;
//   2. the internet going away: many phones then leave a Wi-Fi network that has no internet and use mobile data, which cannot reach the POS.
const net = require('net');
const { lanAddresses } = require('./network');
const log = require('../log');

function tcpReachable(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

// Options exist so the logic can be tested without a network.
function startNetworkWatch({ getAddresses = () => lanAddresses().map((a) => a.address), checkInternet = () => tcpReachable('1.1.1.1', 443), intervalMs = 60000, onAddressChange } = {}) {
  const state = { addresses: [], addressChangedAt: null, internet: null, internetChangedAt: null };
  let prevKey = null;

  async function tick() {
    const now = new Date().toISOString();
    const addrs = getAddresses();
    const key = addrs.join(',');
    if (prevKey !== null && key !== prevKey) {
      log.warn(`LAN address changed: ${prevKey || 'none'} -> ${key || 'none'} (phones must use the new address; fix it for good with a DHCP reservation in the router)`);
      state.addressChangedAt = now;
      if (onAddressChange) onAddressChange(addrs);
    }
    prevKey = key;
    state.addresses = addrs;

    const ok = await checkInternet();
    if (state.internet !== ok) {
      if (state.internet !== null) log.warn(ok ? 'internet is back' : 'internet is NOT reachable (phones may leave this Wi-Fi for mobile data until it is back)');
      state.internet = ok;
      state.internetChangedAt = now;
    }
  }

  tick();
  const timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  return { tick, stop: () => clearInterval(timer), status: () => ({ ...state }) };
}

module.exports = { startNetworkWatch, tcpReachable };
