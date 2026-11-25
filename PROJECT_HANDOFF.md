# GarmentMFG — Project Handoff (start here)

Everything about this project in one place — what it is, how the repository is laid out, how to run, test, build, release, install and support it, how it's kept safe, and why things are the way they are.

The public installer's default passwords are in [README.md](README.md#default-passwords) — change them after installing (section 8).

---

## Contents

1. [What GarmentMFG is](#1-what-garmentmfg-is)
2. [Repository layout](#2-repository-layout)
3. [Download and install](#3-download-and-install)
4. [Run from source](#4-run-from-source)
5. [Test it](#5-test-it)
6. [Build the Windows installer (exe)](#6-build-the-windows-installer-exe)
7. [Publish a release on GitHub](#7-publish-a-release-on-github)
8. [Passwords and security](#8-passwords-and-security)
9. [What the installer does](#9-what-the-installer-does)
10. [Looking after an installation](#10-looking-after-an-installation)
11. [Backups and moving data](#11-backups-and-moving-data)
12. [Company branding and report headings](#12-company-branding-and-report-headings)
13. [Network: how other PCs reach it](#13-network-how-other-pcs-reach-it)
14. [Design decisions (and why)](#14-design-decisions-and-why)
15. [Known gaps and ideas](#15-known-gaps-and-ideas)
16. [Other documents](#16-other-documents)

---

## 1. What GarmentMFG is

A production and piece-rate payroll app for **garment factories**: Job Order Booking → Lot Operation Map (steps and piece rates per lot) → Daily Process Entry (pieces each worker made) ⇄ Material Issue (pieces passed from step to step), plus reports (Process Work, Daily Process, Salary, Lotwise Groupwise Qty, Lot Balance Sheet, Lot Summary), attendance, users & rights and backups.

- **One product, many companies.** It was first built for one garment factory (rebuilt from an older ASP.NET + SQL Server app) and then made general: any company installs the same `GarmentMFGSetup.exe` and sets its own name and logo inside the app.
- **How a company uses it:** one Windows PC in the factory is the **server** (it runs the installer once); every other office PC opens it in a browser over the local network. No internet needed.
- **Tech:** React + TypeScript (Vite) screens · Node.js + Express server · PostgreSQL 16 · a Windows installer built on a Mac (Node single-executable + private PostgreSQL + Windows services).

## 2. Repository layout

| Folder / file | What it is |
|---|---|
| `client/` | The screens (React + TypeScript, Vite). `client/src/pages/…` one file per screen; `client/public/brand/` the GarmentMFG logo |
| `server/` | The API (Express). `server/src/routes/` one file per area (masters, transactions, reports, balance reports, admin, branding, auth, utility); `server/db/001…008_*.sql` the database set-up files; `server/tools/garmentmfg-support.js` the support tool |
| `packaging/` | Makes the Windows installer: `make-exe.mjs` (the one-command build: passwords, packages, tools, build), `build-windows.mjs` (the build itself), `entry-garmentmfg.js` (the app exe), `entry-support.js` (the support tool exe), `entry-setup.js` (the installer exe) |
| `MAKE-EXE.cmd` | Windows: double-click to make your own exe (runs `make-exe.mjs`) |
| `.github/workflows/make-exe.yml` | GitHub's automatic check that making the exe works (Windows: make + install + test; Mac, Linux: make) |
| `scripts/` | Automated tests, test data and clean-up SQL |
| `docs/` | Setup Guide PDF + its editable HTML; the original GarmentMFG logo |
| Never committed (git-ignored) | `.build/` (downloaded tools, build scratch, `build-passwords.txt`), `my-exe/` (the result), `packaging/build-config.json` (your passwords), `.env`; development backups go to `../garmentmfg_backups/` |

How the app works in detail — every rule, the API, the database tables — is in [GARMENTMFG_HANDOFF.md](GARMENTMFG_HANDOFF.md).

## 3. Download and install

- **Download:** [latest release](https://github.com/AtharvaDubey01/garmentmfg/releases/latest) → `GarmentMFGSetup.exe` + `GarmentMFG-Setup-Guide.pdf`.
- **Install:** on the server PC (Windows 10/11, 64-bit) make a folder, e.g. `D:\GarmentMFG`, copy the exe into it and double-click it → "Windows protected your PC": **More info → Run anyway** (the exe isn't code-signed) → **Yes** → press a key. About a minute later it shows the web addresses.
- **First steps:** log in as **ADMIN / Admin** and change it (Admin → Create Login), change the KANVTECH and database passwords (section 8), set the company name and logo (Admin → Company Branding).
- **Check a download:** on Windows `certutil -hashfile GarmentMFGSetup.exe SHA256` must print the SHA-256 shown in the release notes.

## 4. Run from source

Needs **Node.js 22+** and **PostgreSQL 16**.

```bash
git clone https://github.com/AtharvaDubey01/garmentmfg.git
cd garmentmfg
createdb garmentmfg
cp .env.example .env        # PORT=6061, DATABASE_URL=postgresql://localhost:5432/garmentmfg, SESSION_SECRET
npm run install:all         # first time only
npm run dev                 # screens on http://localhost:6060, server on 6061
```

- On start the server applies the database set-up files (`server/db/001…008`) by itself, so an empty database becomes a working one. Log in as **ADMIN / Admin**.
- The hidden **KANVTECH** login has no password on a development database until you set one: `node server/tools/garmentmfg-support.js set-support-password` (needed for the logins test and the support tool).
- Test data: `node scripts/simulate-real-data.mjs` (made-up factory data May–Oct 2026: job orders SIM/201–210, workers SIM01–13; remove with `psql -d garmentmfg -f scripts/simulate-real-data-cleanup.sql`) or `node scripts/seed-daily-entry-test-data.mjs` (a small set for trying Daily Process Entry by hand — see [HOW_TO_TEST.md](HOW_TO_TEST.md)).
- Empty the database (keeps countries/states and the ADMIN + KANVTECH logins): `psql -d garmentmfg -f scripts/clean-database.sql` — take a backup first.
- On some Macs "localhost" lookups are slow for Node, so the scripts use `127.0.0.1`; the screens server answers on `[::1]:6060`, so use `http://localhost:6060` in the browser.
- More: [startup.md](startup.md).

## 5. Test it

The app must be running (`npm run dev`). Run all three after every change:

| Command | What it checks |
|---|---|
| `node scripts/test-production-flow.mjs`, then `psql -h 127.0.0.1 -d garmentmfg -q -f scripts/test-production-flow-cleanup.sql` | the whole production flow, all rules, reports, Excel export, users & rights, login rules (400+ checks; it skips its attendance checks when a month already has other data) |
| `node scripts/test-balance-reports.mjs` | Lot Balance Sheet / Lot Summary, every number worked out a second way from the raw tables |
| `node scripts/test-logins-and-backups.mjs '<KANVTECH password>'` | permanent ADMIN, hidden KANVTECH, backups, Company Branding (50) |

- All must say **0 failed**. Point them at another server with `GARMENTMFG_API=http://127.0.0.1:<port>/api` (and `PGDATABASE=<database>`; for an installed copy also `GARMENTMFG_SESSION_SECRET` = its `sessionSecret`).
- Type check: `cd client && npx tsc --noEmit -p tsconfig.app.json`.
- Hand-testing walkthrough: [HOW_TO_TEST.md](HOW_TO_TEST.md).

## 6. Build the Windows installer (exe)

**The easy way (anyone):** Windows — double-click `MAKE-EXE.cmd`; Mac / Linux — `npm run make-exe`. Needs only Node.js 22+ and internet the first time; the result is in `my-exe/` (`GarmentMFGSetup.exe`, `MY-PASSWORDS.txt`, the Setup Guide). Step-by-step for users: [README → Make your own exe](README.md#make-your-own-exe-with-your-own-passwords).

The installer is always a **Windows** program: it can be made on Windows, a Mac or Linux, but installs and runs only on Windows 10/11 (64-bit).

What `packaging/make-exe.mjs` does (Node built-ins only, so it runs before `npm install`):
1. **Passwords:** uses `packaging/build-config.json` (git-ignored) or, if it's missing, makes strong random ones (no look-alike characters) and saves them there — so later builds keep the same passwords.
2. **Packages:** `npm install` in the project, `server/`, `client/` and `packaging/`.
3. **Tools** into `.build/` (git-ignored), each downloaded from its official site and checked against a pinned SHA-256 (list at the top of `make-exe.mjs`): Node.js **24.22.1** for Windows (`node.exe` inside the installer) and for this computer (makes the packed files — must be the same version), PostgreSQL **16.15** Windows binaries (only `bin` / `lib` / `share` are unpacked; `bin` keeps every `.dll` and `initdb`, `pg_ctl`, `pg_dump`, `pg_restore`, `postgres`, `psql`), **WinSW 2.12.0**, **7-Zip 25.01** (Extra's `7za.exe` goes inside the installer; `7zr.exe` / `7za.exe` on Windows or `7zz` on Mac/Linux does the unpacking and packing), **pgweb 0.16.2**. Already-downloaded files are reused.
4. **Build:** runs `packaging/build-windows.mjs` with `GARMENTMFG_BUILD_DIR=.build`.
5. **Result:** copies the exe and the Setup Guide to `my-exe/` and writes `MY-PASSWORDS.txt`.

What `build-windows.mjs` does: builds the screens → bundles + obfuscates the server and the support tool → bakes each into a copy of Windows `node.exe` (Node single-executable, injected with `postject`) after setting its Properties → Details to "GarmentMFG" → packs the app, PostgreSQL, WinSW and pgweb into `payload.7z` → makes `GarmentMFGSetup.exe`, itself a Node single-executable carrying `payload.7z` + `7za.exe`. The default passwords are baked in at this step (the database one obfuscated, KANVTECH only as a hash).

Why not a normal installer tool: NSIS (`makensis`) from Homebrew crashed on the build Mac and current 7-Zip no longer ships its installer stub — so the installer is a small Node program. The exe isn't code-signed, so Windows shows "Windows protected your PC" → **More info → Run anyway**.

**Automatic check:** `.github/workflows/make-exe.yml` ("Make the exe" in GitHub Actions) runs when the build files change or by hand: on Windows it runs `MAKE-EXE.cmd`, installs the result into `C:\GarmentMFG` and runs the three test suites against the installed app with the passwords it made; on Mac and Linux it runs `npm run make-exe`.

**Setup Guide PDF:** edit `docs/guide-source/GarmentMFG-Setup-Guide.html` and print it to PDF with Chrome, e.g.
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --no-pdf-header-footer --allow-file-access-from-files --print-to-pdf=docs/GarmentMFG-Setup-Guide.pdf "file://<full path to the .html>"`.

## 7. Publish a release on GitHub

The exe is over 100 MB, too big for the code, so it goes on a **Release**:
```bash
gh release create v1.1 --repo AtharvaDubey01/garmentmfg --target main --title "GarmentMFG v1.1" --notes-file notes.md \
  my-exe/GarmentMFGSetup.exe docs/GarmentMFG-Setup-Guide.pdf
gh release view v1.1 --repo AtharvaDubey01/garmentmfg --json assets   # each "digest" must equal your local SHA-256
```
Put the exe's size and SHA-256 in the notes so people can check their download.

## 8. Passwords and security

Three logins/passwords matter:

| What | Who uses it | Notes |
|---|---|---|
| **ADMIN** (Employee Code `ADMIN`) | the company's own admin | Default `Admin` — change on first login. Permanent: can't be deleted, deactivated or lose admin. |
| **KANVTECH** | the support person | A hidden full-admin login that doesn't appear on any screen. Its password is also the **support code** that unlocks `GarmentMFGSupport.exe`. Stored only as a one-way (scrypt) hash. |
| **Database password** | the support tool / the app | The private PostgreSQL of each install (user `garmentmfg`). Stored scrambled in `data\garmentmfg-config.json`. |

- **Defaults** are baked into the exe at build time (`packaging/build-config.json`, git-ignored; `make-exe` makes random ones if it's missing and writes them to `my-exe/MY-PASSWORDS.txt`). The public release's defaults are published in the [README](README.md#default-passwords) — **change the KANVTECH and database passwords right after installing**: `.\GarmentMFGSupport.exe set-support-password` and `change-db-password` ([SUPPORT_GUIDE.md](SUPPORT_GUIDE.md) section 9). Making your own exe (section 6) gives it its own random passwords — the other way.
- **Keep the KANVTECH password safe above all:** with it, the support tool can show or change everything else.
- **What protects an installation:** the database answers only on that PC (localhost, port 5433) with its own password; the `data` folder is locked to administrators; the support tool needs the support code; logins and rights are checked on the server for every read and write. The source being public means the *way* things are stored is known (e.g. how the settings file scrambles the database password) — the protection is the passwords and the locked `data` folder, so change the defaults and keep Windows admin rights to trusted people.
- **Nothing on screen names the support login or a vendor**; the Windows publisher is "GarmentMFG".

## 9. What the installer does

1. The company makes a folder (e.g. `D:\GarmentMFG`), copies `GarmentMFGSetup.exe` in and double-clicks it → Windows admin prompt → a window shows the folder → press a key.
2. It unpacks into that folder: `GarmentMFG.exe` (the app), `GarmentMFGSupport.exe` (support tool), `GarmentMFGService.exe`, `web\`, `pgsql\`, `pgweb.exe`, an empty `import\` folder, and creates `data\` (database, `Backups`, `logs`, `garmentmfg-config.json`) locked to administrators.
3. `GarmentMFG.exe --setup` creates the private PostgreSQL (port **5433**, this PC only), the database, ADMIN + KANVTECH, two Windows services that start with Windows (**GarmentMFGDatabase**, **GarmentMFG**), a firewall rule **GarmentMFG** for port **6060**, desktop shortcuts **GarmentMFG** (opens `http://localhost:6060`), **Start GarmentMFG**, **Stop GarmentMFG**, and an entry in Installed apps (publisher **GarmentMFG**).

- **Update:** put the new `GarmentMFGSetup.exe` in the **same folder** and run it — it backs up first and keeps the data (also after an uninstall that kept the folder).
- **Uninstall:** Settings → Apps → GarmentMFG → Uninstall. Removes services, firewall rule and shortcuts; **the folder with the data stays**.
- It refuses to run from a temporary folder (e.g. inside a zip) or from a different folder than an existing install.
- If setup fails, the window shows the reason and `data\logs\setup.log` has details; running it again is safe (it repairs a half-made install).

## 10. Looking after an installation

The full, simple guide is **[SUPPORT_GUIDE.md](SUPPORT_GUIDE.md)**; step-by-step recipes are in [SERVER_PC_HOWTO.md](SERVER_PC_HOWTO.md).

In short: on the server PC either log in to the app as **KANVTECH**, or open **Terminal (Admin)** → `cd "<the GarmentMFG folder>"` → `.\GarmentMFGSupport.exe <command>` (asks for the support code). Commands: `status`, `backup`, `list-backups`, `restore <file>`, `import <file>`, `view-db` (read-only database viewer at `http://localhost:8083`), `set-admin-password`, `set-support-password`, `show-db-password`, `change-db-password`.

## 11. Backups and moving data

- **Automatic:** one complete backup **every day** (the first time the app runs each day, checked hourly), a **new file each day** (`garmentmfg-backup-YYYY-MM-DD_HHMMSS.backup`), kept **6 months**, in `data\Backups`. Also one before every update, restore and import.
- **Download full backup** (in the app: Admin → Backups, admins only) makes one complete file and downloads it to the browser's PC — keep one on a pendrive regularly, because the automatic ones are on the same PC.
- **Move to a new PC / fresh install:** download the full backup → install on the new PC → put the file in its `import` folder → `.\GarmentMFGSupport.exe import import\<file>` → type IMPORT. Works with `.backup` and `.sql` files; older data is upgraded automatically; KANVTECH keeps the new install's password.
- **Undo:** `restore <full path to a backup in data\Backups>` → type RESTORE. Every import/restore saves the current data first.

## 12. Company branding and report headings

- **Admin → Company Branding** (admins only): company name + logo (PNG/JPG; shrunk in the browser to ≤ 800×400; checked on the server; ≤ 1 MB). Stored in the database (so it's in backups and imports). Shown on the login page, sidebar, home page, footer, browser tab, and printed Job Order / Lot Operation sheets. Until set: the GarmentMFG logo.
- **Login and home pages** show only the logo and the company name — no product description.
- **Report heading box:** Excel / PDF / Print first ask for the title (default "<company> - <report>"), an optional second line (prefilled with the report's month/year/filters) and a "show company logo" tick (PDF and Print only). File names follow the title; the last title per report is remembered on that PC. Copy and CSV stay plain.

## 13. Network: how other PCs reach it

- **Use the server's IP address:** `http://192.168.x.x:6060` (from `ipconfig` → IPv4 Address on the server PC). Ask whoever runs the router to **reserve** that IP for the server PC so it never changes.
- **PC names aren't reliable** — in testing, `http://DESKTOP-…:6060` failed from both Windows and a Mac while the IP worked, so the Setup Guide uses the IP.
- If a PC can't reach the IP: same network? Server network set to **Private**? Some office/guest Wi-Fi blocks devices from seeing each other ("client isolation") — then only a different network or a cable helps.

## 14. Design decisions (and why)

| Decision | Why |
|---|---|
| Each company sets its **own name + logo**; the app shows no product description | the company sees only its own identity |
| Install into **any folder the company picks** (program + data together) | simple to find, back up and move; works on any drive |
| Restore / import **only via the support tool** (with the support code); daily backups kept 6 months; full-backup download in the app | protect data without dangerous buttons for everyday users |
| Other PCs use the **IP**, not the PC name | names failed on the test network |
| **Rates are always the current Lot Operation Map rate** (changing a rate changes past amounts too) | how the factory works; no rate freezing |
| Any worker can do any operation; outside work = an ordinary employee | keep it simple |
| Rights **ticked per person** (no roles); username = employee code | single-company simplicity |
| Balance Reports computed live from all earlier months (no carry-over sheets); Amount = (Previous + This Month) × Rate | matches how the factory tracked lot balances, without manual carrying |
| Job Order details (buyer, style, product, order qty, customer order) editable only until the lot is used; a used lot can't be deleted | other screens keep copies of these and depend on the lot |
| No code signing (for now) | cost; users click "Run anyway" |

## 15. Known gaps and ideas

- **Not code-signed** — Windows SmartScreen warning on install.
- **Lots are linked by Lot No. text**, not by id (from the original database) — that's why renaming a used lot is blocked.
- **Rates aren't frozen** per month (by design, see section 14).
- More known gaps of the app: [GARMENTMFG_HANDOFF.md](GARMENTMFG_HANDOFF.md) section 7.
- Ideas not built: shipped qty for pressing, contractor column, deductions (e.g. a percentage on a step), month-wise cutting, extra making.

## 16. Other documents

| File | For whom | What |
|---|---|---|
| [README.md](README.md) | everyone | overview, download, default passwords, run, test, build |
| [GARMENTMFG_HANDOFF.md](GARMENTMFG_HANDOFF.md) | developers | how the app works: every rule, where the code is, the API, the database, known gaps; section 9 = installed-app internals |
| [SUPPORT_GUIDE.md](SUPPORT_GUIDE.md) | support person | updates, moving data, restore, passwords |
| [SERVER_PC_HOWTO.md](SERVER_PC_HOWTO.md) | support person | detailed step-by-step recipes on the server PC |
| [startup.md](startup.md) | developers | starting/stopping, database commands, common problems |
| [HOW_TO_TEST.md](HOW_TO_TEST.md) | developers / testers | hand-testing walkthrough |
| `docs/GarmentMFG-Setup-Guide.pdf` | each company | how to install, start using and update it (also on the Release) |
