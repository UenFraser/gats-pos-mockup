# Decisions made (do not re-litigate without a reason)

## Architecture
- One Electron app; Express + Socket.IO + SQLite run inside it; phones open the server address from a QR code.
- One package.json, one React bundle, routes /desktop, /waiter, /kitchen. Window loads http://localhost:PORT/desktop.
- Local system first; cloud HQ later (sync via the sync_outbox table). HQ owns menu, prices, staff; branch owns transactions.
- Conventions: UUID text ids, UTC ISO timestamps, integer centavos, sales rows never edited or deleted, numbered migrations only.

## Login and roles
- Roles: WAITER, CASHIER, KDS, MANAGER.
- WAITER, CASHIER, KDS: tap name, 6-digit PIN. MANAGER: username + password (8+ characters).
- 5 wrong attempts locks that account for 1 minute.
- Logins last until logout (no expiry). Deactivating a user or resetting a PIN logs them out everywhere.
- First manager is created on the main terminal at first run (no default passwords).

## Voids
- A cashier or manager approves every void by typing their own PIN/password. Stored as voided_by and approved_by.
- Voids are new rows; order items are never edited.

## Swap (transfer to another table)
- Purpose: fix a waiter's mistake of adding an item or raising a quantity on the WRONG table. Not a void, because the food is not wasted.
- Only CASHIER and MANAGER can do it. Waiters cannot.
- Design (build in Phase 6): never edit the original item. Create a new item on the target table's session, linked to the source item, plus an audit row (who, when, quantity, reason). Net quantity on the source = ordered - voided - moved. The kitchen is notified so a ticket still being cooked shows the right table. Alcohol cannot be moved to a table where alcohol is not allowed. The target must be an open or free token.

## Ice requests
- Front-house staff request trays of ice from the back house so they never leave the front house. One row per request (table, trays, status REQUESTED / DELIVERED / CANCELLED).

## Printing
- Raw ESC/POS (own tiny encoder). LAN printers over TCP 9100; USB printers through the Windows spooler (RAW). No brand driver. Peso sign printed as "PHP".
- Printer to buy: 80 mm thermal, ESC/POS, USB + Ethernet.
