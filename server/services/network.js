// Pick the address phones should use. The old code took the FIRST non-internal IPv4,
// which can be a Hyper-V / WSL / VPN adapter instead of the real Wi-Fi or Ethernet.
const os = require('os');

const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Loopback|Bluetooth|Tailscale|ZeroTier|Docker|TAP|TUN|VPN|Npcap/i;

function rank(name, address) {
  if (address.startsWith('169.254.')) return -1;            // no DHCP, useless
  let score = VIRTUAL.test(name) ? 0 : 10;                   // real adapters first
  if (address.startsWith('192.168.')) score += 3;
  else if (address.startsWith('10.')) score += 2;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score += 1;
  return score;
}

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const i of list || [])
      if ((i.family === 'IPv4' || i.family === 4) && !i.internal) out.push({ name, address: i.address, score: rank(name, i.address) });
  return out.filter((a) => a.score >= 0).sort((a, b) => b.score - a.score);
}

const lanIp = () => (lanAddresses()[0] || {}).address || 'localhost';

module.exports = { lanIp, lanAddresses };
