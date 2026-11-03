# Gats POS architecture mockup

Run in dev:      npm install && npm start
Build the exe:   npm run dist     (installer appears in /dist)

Test checklist (do it from the INSTALLED exe, on a second PC if you can):
1. App opens, shows "Desktop" and a QR code.
2. Scan QR on a phone (same Wi-Fi) -> "Waiter" page opens.
3. Add/tick/delete a task on either one -> the other updates instantly.
4. Quit and reopen the app -> tasks are still there (SQLite file in userData).
5. Windows Firewall prompt appears on first run: click Allow on private networks.
