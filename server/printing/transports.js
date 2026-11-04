const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

// LAN printers: raw bytes over TCP port 9100 (works with any ESC/POS network printer).
function sendTcp({ host, port = 9100 }, bytes, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new Error('host is required'));
    const sock = net.createConnection({ host, port });
    sock.setTimeout(timeoutMs, () => { sock.destroy(); reject(new Error(`Printer ${host}:${port} timed out`)); });
    sock.on('error', reject);
    sock.on('connect', () => sock.end(bytes, () => resolve()));
  });
}

// USB printers: send RAW bytes through the Windows print spooler to a printer installed in Windows.
// Uses PowerShell (no native Node module) and passes the script inline, so no script file has to
// survive packaging into app.asar.
const CS = `
using System; using System.IO; using System.Runtime.InteropServices;
public class Raw {
  [StructLayout(LayoutKind.Sequential)]
  struct DOC { [MarshalAs(UnmanagedType.LPStr)] public string name; [MarshalAs(UnmanagedType.LPStr)] public string file; [MarshalAs(UnmanagedType.LPStr)] public string type; }
  [DllImport("winspool.drv", CharSet=CharSet.Ansi, SetLastError=true)] static extern bool OpenPrinterA(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern int StartDocPrinterA(IntPtr h, int l, ref DOC d);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
  public static void Send(string printer, string path) {
    byte[] b = File.ReadAllBytes(path); IntPtr h; int w;
    if (!OpenPrinterA(printer, out h, IntPtr.Zero)) throw new Exception("Cannot open printer '" + printer + "' (error " + Marshal.GetLastWin32Error() + ")");
    try {
      DOC d = new DOC(); d.name = "POS receipt"; d.type = "RAW";
      if (StartDocPrinterA(h, 1, ref d) == 0) throw new Exception("StartDoc failed (error " + Marshal.GetLastWin32Error() + ")");
      StartPagePrinter(h);
      if (!WritePrinter(h, b, b.Length, out w)) throw new Exception("WritePrinter failed (error " + Marshal.GetLastWin32Error() + ")");
      EndPagePrinter(h); EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}`;

function sendSpooler({ printer }, bytes) {
  return new Promise((resolve, reject) => {
    if (!printer) return reject(new Error('printer name is required'));
    const file = path.join(os.tmpdir(), `pos-print-${Date.now()}.bin`);
    fs.writeFileSync(file, bytes);
    const q = (s) => String(s).replace(/'/g, "''");
    const script = `Add-Type -TypeDefinition @'\n${CS}\n'@\n[Raw]::Send('${q(printer)}','${q(file)}')`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true });
    let err = '';
    ps.stderr.on('data', (d) => (err += d));
    ps.on('error', (e) => { fs.unlink(file, () => {}); reject(e); });
    ps.on('close', (code) => {
      fs.unlink(file, () => {});
      code === 0 ? resolve() : reject(new Error(err.trim().split('\n')[0] || `PowerShell exited with ${code}`));
    });
  });
}

function listPrinters() {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
      { windowsHide: true }, (e, out) => (e ? reject(e) : resolve(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))));
  });
}

module.exports = { sendTcp, sendSpooler, listPrinters };
