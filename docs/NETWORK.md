# Phones cannot reach the POS: how to find out why, and how to make it reliable

## What your symptoms prove

- The POS opens in the PC's own browser, so the program is running and listening.
- The **old, already-tested build failed too**, so a code change is not the cause.
- It started working again **by itself**, with nothing changed on the PC.
- Over the phone's hotspot it always works, because then the phone IS the router.

The program listens on every network address of the PC, all the time. When a phone cannot reach it, something **between the phone and the PC** is stopping it. That is outside the program: the phone, the router, or Windows on the PC. The list below is ordered from most to least likely for "worked yesterday, broke overnight, fixed itself".

## The suspects

1. **The phone quietly left the Wi-Fi for mobile data.** When the home internet goes down (ISP trouble, router restarting overnight), many phones decide the Wi-Fi is useless and send everything through mobile data. A mobile-data connection cannot reach `192.168.x.x`. The Wi-Fi icon still looks connected. It "fixes itself" when the internet returns. *Confirm:* the next time it fails, turn **mobile data OFF** on the phone and reload. If it works, this was it.
2. **The PC's address changed.** The router hands out addresses for a limited time; after a restart or a lease renewal the PC can get a new one. Phones that use the old address fail (a QR code scanned earlier, a bookmark). *Confirm:* the new Network card in Settings > System and a `LAN address changed` line in `main.log`.
3. **Windows decided the network is "Public".** Windows can switch a network to Public by itself (after an update, a router change, or a "new network" detection) and Public blocks incoming connections. The old rule only covered Private networks. *Confirm:* `diagnose-network.ps1` section 2.
4. **The PC's Wi-Fi adapter went to sleep to save power.** A sleeping adapter still lets the PC browse, but ignores phones. *Confirm:* `diagnose-network.ps1` section 8.
5. **The router:** "AP isolation / client isolation" switched on (some routers re-enable it after a restart or an update), or the phone joined a different Wi-Fi name (guest network, or the other band). *Confirm:* the phone test B below.

## The 3 tests to do the moment it fails (before restarting anything)

| Test | Where | Result means |
|---|---|---|
| A. Turn **mobile data OFF** on the phone, reload `http://<PC address>:3000/` | phone | Works now: the phone had switched to mobile data (suspect 1). |
| B. Still failing? Open the router's own page on the phone (usually `http://192.168.0.1`) | phone | Opens: the phone IS on the same network, so the problem is on the PC (suspects 2, 3, 4). Does not open: the phone is not really on the same network (wrong Wi-Fi name, guest network, AP isolation: suspect 5). |
| C. On the PC run `powershell -ExecutionPolicy Bypass -File .\tools\diagnose-network.ps1` | PC | Prints "WHAT LOOKS WRONG" in plain words and saves a report on the Desktop. Send me the file. |

## What this update changes

- **The firewall rule now works on every network type** (but still only for devices on your own local network, never the internet). The old rule broke when Windows flipped a network to Public. The firewall card in Settings warns when the rule is the old, weaker kind and fixes it with one button.
- **`tools\harden-network.ps1`** (administrator, run once): the same rule, plus the network adapter is never powered down, the PC never sleeps or hibernates on power, and Wi-Fi runs at maximum performance.
- **The POS now watches the network** every minute and writes to `main.log` when the PC's address changes and when the internet goes away or comes back. Settings > System shows the current address, when it last changed, and whether the internet is reachable. Next time, the log will show what happened overnight.
- **Phones that lose the POS for more than 10 seconds** show a message saying what to check (Wi-Fi vs mobile data), instead of a blank screen.

## The permanent setup (do all of these once)

**The PC**
- Use a **network cable** to the router if at all possible. A cable removes suspects 3, 4 and half of 5.
- Run `tools\harden-network.ps1` as administrator.

**The router**
- **DHCP reservation** for the PC (and later the receipt printer), so the address never changes. Without this, suspect 2 will come back.
- **AP isolation / client isolation: OFF.**
- Staff phones and the PC on the **same Wi-Fi name**, not a guest network.

**Every staff phone**
- **Android:** Settings > Wi-Fi > the restaurant network (or the Wi-Fi settings menu): turn off "Switch to mobile data automatically" (also called Smart network switch, Adaptive Wi-Fi, Mobile data always active, or Adaptive connectivity). If Android ever asks "This Wi-Fi has no internet. Stay connected?", answer **Yes** (and tick "Don't ask again").
- **iPhone:** Settings > Mobile Service > **Wi-Fi Assist: off**.
- Optional: set a fixed "auto-join" on the restaurant Wi-Fi and forget other known networks nearby.

**Best of all (optional, for the long term):** a small separate router just for the POS, with the PC, the printer and the staff phones on it. It does not matter that it has no internet: the POS never needs it. Staff phones answer "Stay connected" once, and then nothing can pull them away. The customer Wi-Fi stays on the main router.

## What to send me if it happens again

The `gats-network-report-….txt` from `diagnose-network.ps1`, which of test A or B changed anything, and the relevant lines of `main.log` (search for `LAN address changed` and `internet`).
