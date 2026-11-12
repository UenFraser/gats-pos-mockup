# Gats POS: Go-live guide

Everything needed to put the POS into real service and keep it safe. Tick the boxes as you go.

## 1. The POS computer (Windows)

- [ ] **Never sleeps.** Settings > System > Power & sleep: screen can turn off, but "Put the device to sleep" = Never (plugged in). The POS also asks Windows not to sleep while it runs.
- [ ] **Windows Update:** set "Active hours" to cover opening hours (10 AM to 11 PM) so it never restarts in the middle of service.
- [ ] **Automatic sign-in** to the Windows user that runs the POS (so the POS can start after a power cut with nobody there): run `netplwiz`, untick "Users must enter a user name and password". Then in the POS: Settings > System > "Start the POS automatically when Windows starts".
- [ ] **Small UPS** (battery backup) for the PC, router and receipt printer. A power cut in the middle of a sale is the biggest risk to the data. Even 10 to 15 minutes lets the PC shut down properly.
- [ ] **Firewall:** run `tools\setup-firewall.ps1` once in an administrator PowerShell (or use the installer option in section 4). The restaurant network must be marked **Private** (the script tells you).
- [ ] Keep the PC where customers cannot touch it. Anyone at the keyboard can open the POS.

## 2. Router and Wi-Fi

- [ ] **Fixed address for the POS PC:** in the router, add a "DHCP reservation" (also called "address reservation" or "static lease") for the PC. Without it the address can change and phones will not find the POS.
- [ ] **Turn OFF "AP isolation" / "client isolation"** (it can also be called "guest isolation"). With it ON, phones cannot talk to the PC. This was the reason the POS worked on the phone hotspot but not on the house router.
- [ ] Put staff phones and the PC on the **same** Wi-Fi network (not a "guest" network).
- [ ] Use a **separate Wi-Fi network for customers**, so customer phones are never on the POS network.
- [ ] Change the router's admin password and Wi-Fi password from the defaults.
- [ ] Never "port forward" port 3000 to the internet. The POS is for the building only.
- [ ] Coverage: walk the whole floor, the bar and the kitchen with a phone logged in. The "live" badge must stay green.

## 3. Receipt printer and cash drawer

What to buy: an **80 mm thermal receipt printer** that speaks **ESC/POS**, has an **automatic cutter**, and has both **USB and Ethernet (LAN)**. If you use a cash drawer, the printer needs a **drawer port (RJ11/RJ12)** and the drawer's voltage (12 V or 24 V) must match the printer. Well-known makers include Epson, Xprinter and Rongta; check what your local shops have in stock and ask them to confirm "ESC/POS, 80 mm, auto-cut, LAN + USB, drawer port".

- **Ethernet is more reliable** than USB for a POS: connect it to the router, give it a fixed address (print its self-test page, which shows the address, then reserve that address in the router).
- In the POS: **Settings > Printer > Network printer**, type the printer address, port 9100, paper width 48 (80 mm). Tap **Save and test print**.
- **USB:** install the maker's Windows driver, then choose "USB printer installed in Windows" and the printer's name. If the test page prints strange characters, install the "Generic / Text Only" driver instead and use that printer name.
- Tick "Open the cash drawer when a payment includes cash" only if a drawer is attached.
- Until the printer arrives, "No printer: save receipts as text files (testing)" saves every receipt in `receipts` inside the data folder.

## 4. Installing on the real PC (a clean PC with no Node or tools)

1. Copy the installer (or the packaged app folder) from `dist` to the PC.
2. **Optional, installer firewall rule:** if your build makes a Windows installer, add this to `package.json` under `"build"` so the installer adds the firewall rule itself (it then needs administrator permission):
   ```json
   "nsis": { "oneClick": false, "perMachine": true, "allowToChangeInstallationDirectory": true, "include": "build/installer.nsh" }
   ```
   and keep `build/installer.nsh` from this folder. If your build is a portable exe or a folder, use `tools\setup-firewall.ps1` instead. Try this on a spare PC or virtual machine first.
3. Start the POS. **First-time setup** appears: create the manager account (use a strong password).
4. In order: Staff (add everyone, give yourself an **approval PIN**, make one cashier the **Lead Cashier**) > Settings (business name, address, TIN, printer, billing/VAT, **second backup folder**, start with Windows).
5. Tap "Connect phones", scan the QR code with each staff phone, log in.
6. Do a full dry run (section 7) before the first real customer.

## 5. Every day

**Opening:** PC on, POS running, phones show "live", printer has paper, kitchen screen shows its sound banner (tap it once).
**During service:** nothing to do. Backups happen by themselves.
**Closing:**
1. Every tab closed or cancelled (the daily summary warns about open tabs).
2. Open **Daily summary**: check "Cash expected in the drawer" against the real cash; print the closing slip.
3. Glance at voids and discounts. Anything unusual: look at who approved it.
4. Weekly: check the second backup folder has recent files. Monthly: a manager exports the summaries (Export, manager PIN) for the accountant.

## 6. Backups and the restore drill

Backups happen when the POS starts and every 6 hours; the newest 30 are kept, and each one is also copied to the **second location** if you set one. Before any update that changes the database, a "before an update" copy is made too.

**Restore drill: do this once before going live, and again every few months.**
1. Make a harmless change (for example add a test staff member in Staff).
2. Settings > System > pick a backup made *before* the change > Restore > manager approval PIN. The POS restarts.
3. Check the test staff member is gone. The newer data is in the list as "Before a restore": restore that one to get the test staff back.
4. **On a different PC:** install the POS, start it, create a temporary manager. Copy a backup file (from the USB drive or cloud folder) into the new PC's `backups` folder (Settings > System shows the data folder path). Restore it from Settings > System. After the restart, log in with the *old* accounts.

If the POS ever says **"The database is damaged"** at start: choose **Restore the newest backup**. The broken file is kept as `damaged-...` in the backups folder.

## 7. Service-night dry run (use the real PC, 3 to 4 phones, the kitchen screen, the printer)

Run it as if the restaurant were open. Tick each line:
- [ ] Take two reservations; seat one from the desktop and one by ordering on the table (the phone asks to confirm).
- [ ] 3 waiters open tables at the same time (restaurant and bar). Orders reach the kitchen with sound.
- [ ] A local takeout and an online takeout: kitchen marks done, the card turns READY, pay and hand over.
- [ ] Ice request: kitchen Ready, counter Delivered.
- [ ] Follow-up on a food item and on a whole takeout.
- [ ] One void (Lead Cashier PIN), one swap to the wrong table fixed, one Senior discount, one bill request and printed bill.
- [ ] Split payment (GCash + cash with change). Check the receipt and the drawer.
- [ ] A fully voided tab closes with no receipt. A takeout nobody collected is cancelled with a PIN.
- [ ] **Break things on purpose:** switch a phone's Wi-Fi off and on (it reconnects, the "live" badge returns); lock a phone's screen for a minute; turn the printer off and take a payment (the sale still closes, "not printed" appears); restart the PC in the middle of service (the POS starts again by itself, open tabs are still there).
- [ ] Closing: Daily summary matches your own paper tally to the centavo; cash counted equals "cash expected".
- [ ] Settings > System shows a recent backup, and the second location has a copy.

## 8. When something goes wrong

| Problem | What to do |
|---|---|
| A phone cannot open the POS | Same Wi-Fi as the PC? Is AP isolation off? Is the PC's address the same as the QR (Desktop > Connect phones)? Run `tools\setup-firewall.ps1`. |
| "Too many requests" / "Too many login attempts" | Wait the number of seconds shown. Five wrong PINs lock one account for a minute. |
| Receipt does not print | Settings > Test print. Network printer: is it on and on the same network? USB: is the Windows printer name exactly right? The sale is never lost. |
| Cash drawer does not open | Tick the drawer option in Settings; check the drawer cable is in the printer's drawer port and the voltage matches. |
| Sound does not play | Tap anywhere on the page once (browsers need a tap). |
| The POS will not start | Look at `logs\main.log` in the data folder. "Database is damaged" > restore the newest backup. |
| The PC died | Install the POS on any PC, restore the newest backup from the second location (section 6, step 4). Phones scan the new QR. |
| Everything looks broken after an update | Settings > System > Restore the "Before an update" copy, and send me the log. |

## 9. Before the very first real day

- [ ] Bump the version in `package.json` to `1.0.0` and build a fresh installer.
- [ ] Delete all test data: start with an empty data folder on the real PC (do not copy the test database over).
- [ ] Print this page. Keep the manager password and approval PINs somewhere safe (not on the PC).
