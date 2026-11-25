# GarmentMFG on the server PC — how to do things

A plain, step-by-step guide for looking after an installed GarmentMFG on a Windows server PC.
Everything here is for the **support person**, in person or over a remote-desktop tool such as AnyDesk. The short version (common requests and
what to do) is `SUPPORT_GUIDE.md`; how the code works is `GARMENTMFG_HANDOFF.md`.

> In the examples the GarmentMFG folder is `D:\GarmentMFG`. On a real PC it's wherever the
> client put `GarmentMFGSetup.exe` — use that path instead.

---

## Contents
1. [The basics (where things are, the two addresses, the two passwords)](#1-the-basics)
2. [Opening an admin terminal (and the `.\` rule)](#2-opening-an-admin-terminal)
3. [Opening the app / logging in](#3-opening-the-app)
3b. [Connecting the other (employee) PCs over the network](#3b-connecting-the-other-employee-pcs)
3c. [The company's name and logo (Company Branding)](#3c-the-companys-name-and-logo)
3d. [Report headings (title on PDF / Excel / Print)](#3d-report-headings)
4. [Looking inside the database (view-db)](#4-looking-inside-the-database)
5. [Backups (automatic + "Download full backup")](#5-backups)
6. [Import data (a `.sql` or a `.backup` file)](#6-import-data)
7. [Go back / restore](#7-go-back--restore)
8. [import vs restore (which to use, and the password rule)](#8-import-vs-restore)
9. [A full test: empty → simulation → back to empty](#9-a-full-test)
10. [Passwords (see, change)](#10-passwords)
11. [Start / Stop GarmentMFG](#11-start--stop-garmentmfg)
12. [Install / update / uninstall / reinstall](#12-install--update--uninstall--reinstall)
13. [Checking a transferred file arrived whole](#13-checking-a-transferred-file)
14. [Common messages ("not recognized", "operation not permitted")](#14-common-messages)

---

## 1. The basics

**Two addresses** (the app runs by itself as a Windows service, always on):
- On the server PC: `http://localhost:6060`
- From other PCs on the same network: `http://<SERVER-PC-NAME>:6060`

**What's in the GarmentMFG folder:**
| Folder / file | What it is |
|---|---|
| `GarmentMFG.exe`, `GarmentMFGSupport.exe`, `GarmentMFGService.exe`, `web\`, `pgsql\`, `pgweb.exe` | the program |
| `data\` | the database, `data\Backups\`, `data\logs\`, settings — **locked** (administrators only) |
| `import\` | where you drop a file to load |

**Two passwords** (the public build's defaults are in [README.md](README.md#default-passwords) — **change both after installing**, see [SUPPORT_GUIDE.md](SUPPORT_GUIDE.md) section 9):
- **KANVTECH password** — the hidden support admin login, and the **support code** that unlocks `GarmentMFGSupport.exe`. Keep this one safe above all.
- **Database password** — the private database's password; the tool can show it any time.

---

## 2. Opening an admin terminal

Every `GarmentMFGSupport.exe` command must be run **as administrator** (the data folder is locked).

1. Right-click the **Start** button → **Terminal (Admin)** (or **Windows PowerShell (Admin)**) → **Yes**.
2. Go into the GarmentMFG folder:
   ```
   cd "D:\GarmentMFG"
   ```
3. Run commands with `.\` in front (PowerShell needs it; plain Command Prompt doesn't):
   ```
   .\GarmentMFGSupport.exe status
   ```

Every command below is run like that. `.\GarmentMFGSupport.exe status` is a good first check — it shows the database, the updates applied, the backups, and the logins.

---

## 3. Opening the app

- On the server PC: open a browser to `http://localhost:6060` (or the desktop **GarmentMFG** shortcut).
- Log in as **ADMIN** (the company's admin) or **KANVTECH** (the hidden support login).
- **Tip:** when you're testing or loading data, log in as **KANVTECH** — its password never changes, while ADMIN's password changes with whatever data is loaded.

---

## 3b. Connecting the other (employee) PCs

GarmentMFG is installed on the **server PC only**. Every other PC in the office just opens it in a web browser — nothing is installed on them.

**Step 1 — find the server PC's address.** On the server PC, in Command Prompt:
```
ipconfig
```
Use the **IPv4 Address** line, e.g. `192.168.29.120` — *that* is the server PC.
Do **not** use "Default Gateway" (e.g. `192.168.29.1`) — that's the Wi-Fi router, not the PC.

**Step 2 — decide how to write the address.** Two ways:

- **By IP (recommended — always works):** `http://192.168.1.33:6060`. The IP **can change** when the PC or router restarts, so have the router **reserve** it for the server PC (see below).
- **By PC name:** `http://<name>:6060` (name from `hostname` on the server PC). It doesn't work on every network (tested 31 Oct 2026: failed on the office Wi-Fi from both Windows and Mac while the IP worked; Macs need `<name>.local`), so only use it if it opens.

**Step 3 — set it up once on each employee PC:**
1. Open Chrome/Edge and go to that address.
2. When the GarmentMFG login page appears, **bookmark it** (star), or drag the address to the desktop to make a clickable shortcut.
3. Staff click it every day and log in with their own Employee Code and password.

**Keep the address stable:** give the server PC a **fixed IP** (a static IP in Windows, or a "DHCP reservation" in the router so it always gets the same address).

**If an employee PC can't open it:**
- Both PCs must be on the **same Wi-Fi / network** (not guest Wi-Fi, not a phone hotspot).
- On the server PC, `http://localhost:6060` must work first. If it doesn't, GarmentMFG isn't running — use the **Start GarmentMFG** shortcut.
- Some guest or "client isolation" Wi-Fi blocks PCs from seeing each other — use the normal office network.
- Check the firewall rule on the server PC (admin Command Prompt): `netsh advfirewall firewall show rule name=GarmentMFG` — it should allow TCP port 6060.

---

## 3c. The company's name and logo

Each company sees **its own** name and logo — on the login page, the menu, the home page, the browser tab, printed Job Orders and Lot Operation sheets, and report exports. Until it's set, the app shows **GarmentMFG** and the GarmentMFG logo.

To set it (admin only — ADMIN or KANVTECH):
1. Log in → **Admin → Company Branding**.
2. Type the **Company name** (e.g. `ABC Garments (P) Ltd`).
3. **Choose logo…** → pick a **PNG or JPG**. Big pictures are made smaller automatically; a PNG with a see-through background looks best.
4. **Save.** It changes everywhere straight away.

- **Use the GarmentMFG logo** puts the default logo back; an empty name shows "GarmentMFG".
- It's stored **inside the database**, so it's part of every backup and comes along with an `import`.

---

## 3d. Report headings

On any report or list, clicking **Excel**, **PDF** or **Print** first opens a small **Report heading** box:
- **Title** — prefilled as "*company name* - *report name*" (e.g. `ABC Garments (P) Ltd - Salary Report`); type anything you like.
- **Second line** (optional) — prefilled with what the screen is showing (e.g. `October 2026 · Office Staff`).
- **Show the company logo** — on the PDF and the printout. (Excel files can't hold pictures, so Excel gets the title rows only.)

The file is named after the title (e.g. `ABC_Garments_P_Ltd_Salary_Report_2026-10-29.pdf`). The last title typed for each report is remembered on that PC; **Reset to default** brings back the standard one. **Copy** and **CSV** stay plain data, without a heading.

---

## 4. Looking inside the database

To browse the raw tables (pgweb-style), in the admin terminal:
```
.\GarmentMFGSupport.exe view-db
```
- It asks for the support code, then opens a viewer in the browser at `http://localhost:8083`.
- It is **read-only** — looking around can't change anything.
- Only reachable on the server PC itself, not from other PCs.
- Keep that terminal window open while using it. Press **Ctrl+C** in it to close the viewer.

(To actually *change* data, use `psql` in `pgsql\bin` instead — rarely needed.)

---

## 5. Backups

- **Automatic:** GarmentMFG makes one complete backup every day by itself and keeps the last **6 months**. Nothing to do.
- **One file on demand (in the app):** log in as admin → **Backups** → **Download full backup**. This gives you one file with the whole database — keep it on a pendrive, or use it to move data to another install.
- **One file on demand (terminal):**
  ```
  .\GarmentMFGSupport.exe backup
  ```
  It prints the file name, e.g. `Backup made: garmentmfg-backup-2026-10-29_0210.backup`.
- **List them:**
  ```
  .\GarmentMFGSupport.exe list-backups
  ```
- **Where the files live:** `D:\GarmentMFG\data\Backups\`
- Every backup file is a **complete copy of the whole database** — not a piece. One file = everything.

---

## 6. Import data

Loads a file into the database. **It replaces everything** with what's in the file (a backup is made first, so it can be undone). Works for a `.sql` dump **or** a `.backup` file.

1. Put the file in the `import` folder, e.g. copy it into:
   `D:\GarmentMFG\import\`
2. In the admin terminal:
   ```
   cd "D:\GarmentMFG"
   .\GarmentMFGSupport.exe import import\my-data.sql
   ```
3. Type the support code, then type **IMPORT**.

It stops the app, saves the current data as a backup first, loads the file, brings older data up to the current version, keeps **your** KANVTECH password, and starts the app again. It ends with e.g. `Imported: 24 employees, 18 lots, 3 logins.`

Then refresh `http://localhost:6060` (log in again) to see the new data.

---

## 7. Go back / restore

Puts a backup file back. Use it to undo an import, or to return to an earlier day.

1. Find the backup you want:
   ```
   .\GarmentMFGSupport.exe list-backups
   ```
2. Restore it — give the **full path** (the file is in `data\Backups\`):
   ```
   .\GarmentMFGSupport.exe restore "D:\GarmentMFG\data\Backups\garmentmfg-backup-2026-10-29_0210.backup"
   ```
3. Type the support code, then type **RESTORE**.

It stops the app, saves the *current* data too (so you can undo the undo), restores the file, and starts the app again.

---

## 8. import vs restore

Both take a file and **replace everything** with it (empty file → empty, full file → full). You can use `import` for anything, including backup files. The difference:

- **`import`** — the everyday "load this file" command. Works for `.sql` and `.backup`. It **keeps the KANVTECH password this installation has now** (the file's KANVTECH is discarded) and upgrades old data to the current version. Use it for new data: a `.sql` from the Mac, a client's old data, data from another install.
- **`restore`** — the precise "rewind one of *this* install's own snapshots" command. It brings back **everything in the file exactly**, including the logins as they were when that backup was made.

**The one thing to remember about passwords:**
- If you changed the KANVTECH password and then **import** a file → KANVTECH stays the **new** (current) one.
- If you **restore** an **old** backup made *before* you changed it → KANVTECH goes back to the **old** one from that backup.

Rule of thumb: **`import` = do-everything, keeps your current KANVTECH.** **`restore` = exact rewind of your own backup.** When unsure, `import` is the safe choice.

---

## 9. A full test

To prove data can be loaded and undone (empty → simulation → empty):

1. **Save the empty state:**
   ```
   .\GarmentMFGSupport.exe backup
   ```
   Note the name it prints, e.g. `garmentmfg-backup-2026-10-29_0210.backup`.
2. **Check it's empty:** `http://localhost:6060`, log in as KANVTECH — no real employees/lots yet.
3. **Import test data:** put a `.sql` dump with test data in `import\` (e.g. made on a development PC with `scripts/simulate-real-data.mjs`, then `pg_dump`), then
   `.\GarmentMFGSupport.exe import import\test-data.sql` → support code → IMPORT.
4. **Check the data:** refresh `http://localhost:6060` — the simulated workers and lots show.
5. **Go back to empty:**
   `.\GarmentMFGSupport.exe restore "D:\GarmentMFG\data\Backups\garmentmfg-backup-2026-10-29_0210.backup"` → support code → RESTORE.
6. **Check again:** refresh — back to empty. Test passed.

(After each import/restore, refresh the browser and log in again; the old session won't carry over.)

---

## 10. Passwords

All in the admin terminal.

- **See the database password** (never lost):
  ```
  .\GarmentMFGSupport.exe show-db-password
  ```
- **Change the database password** (then restart GarmentMFG so it uses it — see section 11):
  ```
  .\GarmentMFGSupport.exe change-db-password
  ```
- **Change the KANVTECH password** (the support code):
  ```
  .\GarmentMFGSupport.exe set-support-password
  ```
- **Reset the company's ADMIN password** (also re-activates ADMIN):
  ```
  .\GarmentMFGSupport.exe set-admin-password
  ```

After any change, **write it on the support sheet.** Remember: you only need to keep **one** of the two passwords safe — if you forget the database one, the KANVTECH one recovers it with `show-db-password`.

---

## 11. Start / Stop GarmentMFG

GarmentMFG restarts itself and starts with Windows, so staff never start it. If *you* need to:

- **Desktop shortcuts:** **Start GarmentMFG** / **Stop GarmentMFG** (each asks for administrator).
- **Or in the admin terminal:**
  ```
  net stop GarmentMFG
  net start GarmentMFG
  ```

(There's no stop button inside the web app on purpose — once stopped, there'd be no page to start it again.)

---

## 12. Install / update / uninstall / reinstall

- **Install:** make a folder (any fixed drive), copy `GarmentMFGSetup.exe` into it, double-click → **Yes** → press a key. It installs everything into that folder.
- **Update:** put the new `GarmentMFGSetup.exe` in the **same folder** and run it. Data is kept.
- **Uninstall:** *Settings → Apps → GarmentMFG → Uninstall.* Removes the services, firewall rule and shortcuts; **the folder with the data stays.**
- **Remove completely:** uninstall first, then delete the folder by hand (Windows asks for admin on `data\` → **Continue**). This deletes the data — download a full backup first if you may need it.
- **Reinstall same data:** if the folder wasn't deleted, just run `GarmentMFGSetup.exe` in it again.
- **Reinstall fresh + bring data back:** new empty folder → install → `import` the backup you saved.

**Don't move or rename the GarmentMFG folder after installing** — the services remember it. To move it: uninstall, move, reinstall.

---

## 13. Checking a transferred file

After sending `GarmentMFGSetup.exe` over WhatsApp/Drive, make sure it arrived whole:

1. On the build PC (Mac): note its SHA-256 (`shasum -a 256 GarmentMFGSetup.exe`).
2. On Windows, in the folder:
   ```
   certutil -hashfile GarmentMFGSetup.exe SHA256
   ```
3. If the long codes match, the file is identical. (The size showing as e.g. "151 MB" on Mac and "144 MB" on Windows is normal — same bytes, different way of counting.)

---

## 14. Common messages

- **"GarmentMFGSupport.exe is not recognized..."** — in PowerShell, put `.\` in front: `.\GarmentMFGSupport.exe status`.
- **"EPERM: operation not permitted ... data\..."** — the terminal isn't running as administrator. Close it, open **Terminal (Admin)**, `cd` to the folder, try again.
- **Setup failed** — the reason is shown in the window and saved in `data\logs\setup.log`. Take a photo / copy it. You can run `GarmentMFGSetup.exe` again afterwards.
- **"Windows protected your PC" (blue box) when running GarmentMFGSetup.exe** — it's just because the file isn't code-signed yet: **More info → Run anyway.**
