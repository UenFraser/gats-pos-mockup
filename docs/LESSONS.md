# Lessons learned (add every new problem here)

| Problem | Cause | Fix |
|---|---|---|
| Blank window after export | Window loaded a file or dev URL; server not ready | Load http://localhost:PORT/desktop after the server is listening; show an error dialog on failure |
| "Electron failed to install correctly" | Electron binary download did not finish | Delete node_modules\electron, reinstall, run `node node_modules\electron\install.js` to see the error |
| "Cannot create symbolic link" in npm run dist | Windows blocks symlinks for normal users | Turn on Developer Mode; clear %LOCALAPPDATA%\electron-builder\Cache\winCodeSign |
| better-sqlite3 build fails (ClangCL) on npm install | Node 24 had no prebuilt binary for the v11 line | Use better-sqlite3 12 or newer (or Node 22) |
| Chromium "Unable to move the cache" messages | A second copy running, or data folder created by an admin window | Close all copies; delete %APPDATA% app folder; single-instance lock |
| Database schema not found after export | .sql file not packaged, path guessed | Schema as code, numbered migrations |
| Phones cannot open the system | Wrong port, localhost in the QR, firewall, server on 127.0.0.1 | Listen on 0.0.0.0, QR uses LAN IP and real port, relative URLs |
| Native module errors after packaging | Built for Node, not Electron | electron-builder install-app-deps in postinstall, asarUnpack better-sqlite3, do not bundle the server |
| Project in Downloads/OneDrive misbehaves | Antivirus and sync lock files | Keep the project in a short path such as C:\dev |
| Express 5 vs 4 | Old server used Express 5 (wildcard route syntax changed) | Stay on Express 4 |
| Phone cannot open the app on home Wi-Fi but works on the phone's hotspot | Router AP/client isolation (or guest network), Windows network profile set to Public, no firewall rule, or the QR used a virtual adapter's address | Turn off AP isolation; set the network to Private; allow inbound TCP 3000 (Private); lanIp() now prefers real 192.168/10/172.16 adapters; startup log lists all addresses |
| tools/auth-smoke.ps1 "Already set up" / "Invalid credentials" | Script assumed a fresh database and a hardcoded manager | Use tools/add-staff.ps1 (asks for your manager login) |
| Unknown /api/... returned the React page (HTTP 200) | The catch-all page route sat in front of unknown API paths | JSON 404 for /api before the page fallback |
| Socket stayed connected after logout | Token revoked in the database but the open socket was never closed | Logout route calls rt.disconnectToken() |

