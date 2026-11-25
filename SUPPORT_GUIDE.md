# GarmentMFG — Support Guide

For whoever looks after a GarmentMFG installation (the "support" person). Everyday users don't need this.

---

## 1. Before you start

You need:
- Access to the **server PC** — the PC GarmentMFG is installed on (in person or with a remote-desktop tool such as AnyDesk).
- The **KANVTECH password** (the hidden support admin login — also the "support code" that unlocks the support tool) and, sometimes, the **database password**. The public installer's defaults are in section 9 — **change them after installing**.

Where things are on the server PC (for example `D:\GarmentMFG`):

| What | Where |
|---|---|
| The app and the support tool `GarmentMFGSupport.exe` | the GarmentMFG folder |
| A place to drop a data file before loading it | the `import` folder inside it |
| Database, daily backups, logs | the `data` folder inside it (locked: administrators only) |
| The app in a browser | `http://localhost:6060` on the server PC; `http://<server IP>:6060` from other PCs |

## 2. Opening the support tool

1. On the server PC, right-click the **Start** button → **Terminal (Admin)** → **Yes**.
2. Go to the GarmentMFG folder, e.g.: `cd "D:\GarmentMFG"`
3. Type the command with `.\` in front, e.g.: `.\GarmentMFGSupport.exe status`
4. It asks for the **support code** (the KANVTECH password). Typing is hidden.

`status` is a good first look: the database, the backups and the logins.

Many things are easier **in the app** itself: open `http://localhost:6060` and log in as **KANVTECH** (a full admin that doesn't appear on any screen).

---

## 3. Common requests

| Someone says… | Do this |
|---|---|
| **"We forgot the ADMIN password"** | In the app as KANVTECH: **Admin → Create Login → ADMIN** → type a new password → Update. (Or `.\GarmentMFGSupport.exe set-admin-password`.) |
| **"An employee can't log in"** | In the app: **Admin → Create Login** → that person: make sure **Active** is ticked, reset the password, check what they're allowed to see. |
| **"The app doesn't open"** | On the server PC try `http://localhost:6060`. If that fails too, double-click **Start GarmentMFG** on the desktop. |
| **"Other PCs can't open it"** | On the server PC run `ipconfig`, use the **IPv4 Address** in the link (`http://192.168.x.x:6060`). Both PCs must be on the same network. |
| **"We entered something wrong / deleted data"** | Put back last night's backup — **section 7**. |
| **"Change our name / logo"** | In the app: **Admin → Company Branding**. |
| **"Install the new version"** | **Section 4.** |
| **"We got a new PC" / "Move the app"** | **Section 5.** |

---

## 4. Install a new version (update — the data stays)

1. *(Recommended)* In the app (ADMIN or KANVTECH): **Admin → Backups → Download full backup** → keep the file on a pendrive.
2. Copy the new `GarmentMFGSetup.exe` into the **same GarmentMFG folder** (e.g. `D:\GarmentMFG`), replacing the old file.
3. Double-click it → **Yes** (and **More info → Run anyway** if the blue box appears).
4. It says **"GarmentMFG will be UPDATED in this folder"** → press any key.
5. It stops the app, **makes a backup first** (`data\Backups\garmentmfg-backup-…`), puts in the new program, brings the database up to date and starts again (about a minute).
6. Refresh the browser and check. Data, logins, passwords and branding all stay.

Run in another folder, it stops and shows where GarmentMFG is installed (nothing is changed). If something looks wrong after an update, restore the backup it made (section 7). This also works after an uninstall that kept the folder.

## 5. Move data to a new installation (new PC, or a fresh install)

**On the old installation** — download one file with all the data:
1. Log in to the app (ADMIN or KANVTECH) → **Admin → Backups** → **Download full backup**.
2. You get one file like `garmentmfg-full-backup-2026-11-25.backup`. Copy it to a pendrive.

**On the new installation:**
1. Install GarmentMFG as usual (see the Setup Guide).
2. Copy the backup file into the **`import`** folder inside the GarmentMFG folder.
3. Open the support tool (section 2) and type:
   ```
   .\GarmentMFGSupport.exe import import\garmentmfg-full-backup-2026-11-25.backup
   ```
4. Type the support code, then type **IMPORT**.
5. Refresh the browser and log in again. The company's own logins (and their ADMIN password) and branding come from the old data; **KANVTECH keeps this installation's password**.
6. A new server PC has a new IP: run `ipconfig` and give the other PCs the new address.

Importing **replaces everything** on that installation. It saves what was there first, so it can be undone (section 7).

## 6. Load a database file

Works the same for a **`.backup`** file (from the app's Backups page or the daily backups) or a **`.sql`** file (a `pg_dump`):
1. Copy the file into the **`import`** folder.
2. `.\GarmentMFGSupport.exe import import\<file name>`
3. Support code → type **IMPORT** → refresh the browser and log in again.

Older data is brought up to the current version automatically. "import" is for data from somewhere else; for this installation's own backups use "restore" (section 7).

## 7. Undo a mistake: restore a backup

GarmentMFG makes a backup **every day by itself** and keeps six months.
1. See the list: `.\GarmentMFGSupport.exe list-backups`
2. Put one back (full path; backups are in `data\Backups`):
   ```
   .\GarmentMFGSupport.exe restore "D:\GarmentMFG\data\Backups\garmentmfg-backup-2026-11-24_090000.backup"
   ```
3. Support code → type **RESTORE** → refresh the browser and log in again.

It saves the current data first, so even a restore can be undone. To make a backup right now: `.\GarmentMFGSupport.exe backup`

## 8. Look inside the database (database viewer)

1. `.\GarmentMFGSupport.exe view-db` → support code.
2. The viewer opens in the browser at `http://localhost:8083`.
3. It is **read-only** — looking around can't change anything — and works only on the server PC.
4. Keep the terminal open while you use it; press **Ctrl+C** in the terminal to close it.

---

## 9. Passwords

**Defaults of the public installer** (from the GitHub Release). They are published, so **change the KANVTECH and database passwords right after installing**, and the ADMIN one on first login:

| Login / password | Default |
|---|---|
| ADMIN (Employee Code `ADMIN`) | `Admin` |
| KANVTECH (hidden support login = support code) | `Gmfg-FgVt-gUkZ-t6Su` |
| Database (user `garmentmfg`) | `GmfgDb-7Kdg-6pVX` |

**Change the KANVTECH password** (support login + support code):
1. `.\GarmentMFGSupport.exe set-support-password`
2. Type the current support code, then the new password twice (at least 10 characters).
3. From now on, log in as KANVTECH and unlock the tool with the new one.

**Change the database password:**
1. `.\GarmentMFGSupport.exe change-db-password`
2. Support code, then the new password twice (at least 8 characters).
3. Restart the app so it uses the new password: double-click **Stop GarmentMFG**, then **Start GarmentMFG** on the desktop.

**Forgot the database password?** `.\GarmentMFGSupport.exe show-db-password` shows it (needs the support code).

**ADMIN password:** in the app as KANVTECH (section 3), or `.\GarmentMFGSupport.exe set-admin-password`.

> ⚠️ After this first change, **don't change them again unless you have to** (for example, if one was leaked), and **write every new password down somewhere safe straight away.**
> **The KANVTECH password must never be lost:** with it, the tool can show or change everything else.

---

## 10. Good to know

- **Backups are automatic** — one a day, six months kept. **Download full backup** (Admin → Backups) gives one file to keep on a pendrive; do that regularly, because the automatic ones are on the same PC.
- **Don't delete, move or rename the GarmentMFG folder** — the database is inside it.
- **Uninstalling keeps the data** (Settings → Apps → GarmentMFG → Uninstall); the folder stays until someone deletes it.
- **If installing fails**, the window shows the reason; running `GarmentMFGSetup.exe` again is safe.
- **Lots and Job Orders:** a Job Order can't be deleted while its lot has a Lot Operation Map, Material Issue slips or Daily Process Entry rows — delete those first. Its Buyer / Style / Product / Order Qty / Customer Order can be fixed only before any of these exist.

---

## Support sheet (one per installation — keep it private)

```
Company:                ____________________   Installed on: __________
Server PC IP:           ____________________   Address: http://__________:6060
GarmentMFG folder:      ____________________
KANVTECH password:      ____________________   (= the support code)
Database password:      ____________________   (changed on: __________)
ADMIN password given:   ____________________   (they may change it)
Updates installed:      ____________________
Notes:
```
