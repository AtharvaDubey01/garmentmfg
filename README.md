# GarmentMFG — Garment Production & Piece-Rate Payroll

[![Make the exe](https://github.com/AtharvaDubey01/garmentmfg/actions/workflows/make-exe.yml/badge.svg)](https://github.com/AtharvaDubey01/garmentmfg/actions/workflows/make-exe.yml)

<img src="client/public/brand/garmentmfg-logo.png" alt="GarmentMFG" height="70">

A production and payroll app for garment factories: job orders, lots, the steps (operations) each lot goes through with their piece rates, the pieces each worker makes every day, pieces passed from step to step, and the reports that come out of it — salary, process work, lot balances and more. Any company can install it and set its own name and logo.

It installs on **one Windows PC** in the factory (the server) with a single `GarmentMFGSetup.exe`. Every other office PC just opens it in a browser over the local network — no internet needed.

## Download

**[Latest release](https://github.com/AtharvaDubey01/garmentmfg/releases/latest)** →
- `GarmentMFGSetup.exe` — the Windows installer (one file: the app + its own private PostgreSQL database)
- `GarmentMFG-Setup-Guide.pdf` — how to install it, start using it and update it (also in [docs/](docs/GarmentMFG-Setup-Guide.pdf))

**Install in short:** make a folder (e.g. `D:\GarmentMFG`) on a Windows 10/11 PC → copy `GarmentMFGSetup.exe` into it → double-click (on "Windows protected your PC": **More info → Run anyway**; the exe isn't code-signed) → **Yes** → press a key. Then open `http://localhost:6060` (or `http://<server IP>:6060` from other PCs).

## Default passwords

The public installer starts with these. **They are public, so change them right after installing** (Setup Guide section 9, or [SUPPORT_GUIDE.md](SUPPORT_GUIDE.md) section 9).

| Login / password | Default | Change it with |
|---|---|---|
| **ADMIN** — the company's admin login (Employee Code `ADMIN`) | `Admin` | in the app: **Admin → Create Login → ADMIN** |
| **KANVTECH** — a hidden full-admin support login, and the **support code** that unlocks `GarmentMFGSupport.exe` | `Gmfg-FgVt-gUkZ-t6Su` | `.\GarmentMFGSupport.exe set-support-password` |
| **Database** — the private PostgreSQL (user `garmentmfg`, port 5433, this PC only) | `GmfgDb-7Kdg-6pVX` | `.\GarmentMFGSupport.exe change-db-password` |

If you [make the exe yourself](#make-your-own-exe-with-your-own-passwords), it gets its own random passwords instead.

## What it does

- **Production flow:** Job Order Booking → Lot Operation Map (steps and piece rates per lot) → Daily Process Entry (pieces each worker made) ⇄ Material Issue (pieces passed from step to step), with locks so finished work can't be undone by mistake
- **Reports:** Process Work, Daily Process, Salary, Lotwise Groupwise Qty, Lot Balance Sheet, Lot Summary — each with a Total row and Copy / CSV / Excel / PDF / Print
- **Report headings:** before Excel / PDF / Print the user types the title and a second line; the company logo goes on PDFs and printouts
- **Company Branding:** each company's own name and logo on the login page, menu, prints and exports
- **Users & rights:** a login per employee, rights ticked per screen (view / create / edit / delete / print); a permanent ADMIN and a hidden support login
- **Attendance:** monthly attendance from the daily entries, and an attendance Excel export
- **Safety:** automatic daily backups (six months kept), one-click full backup download, and a locked support tool for passwords, backups, restore and data import

## Tech

- **Screens:** React + TypeScript (Vite) — `client/`
- **Server:** Node.js + Express — `server/`
- **Database:** PostgreSQL 16; the set-up files `server/db/001`–`008` are applied automatically when the server starts
- **Windows installer:** the server is bundled (esbuild), obfuscated and packed into `.exe` files (Node single-executable), with a private PostgreSQL and Windows services (WinSW) — [packaging/](packaging/build-windows.mjs)

## Run from source (development)

Needs **Node.js 22+** and **PostgreSQL 16**.

```bash
git clone https://github.com/AtharvaDubey01/garmentmfg.git
cd garmentmfg
createdb garmentmfg                 # an empty database
cp .env.example .env                # PORT=6061, DATABASE_URL=…/garmentmfg, SESSION_SECRET
npm run install:all                 # first time only
npm run dev                         # screens on http://localhost:6060, API on 6061
```

On first start the server creates all tables. Log in with Employee Code **`ADMIN`** / password **`Admin`**.
Optional demo data: `node scripts/simulate-real-data.mjs` (made-up factory data, May–Oct 2026) or `node scripts/seed-daily-entry-test-data.mjs`.
More: [startup.md](startup.md).

## Tests

The app must be running (`npm run dev`).

| Command | Checks |
|---|---|
| `node scripts/test-production-flow.mjs` (then `psql -d garmentmfg -f scripts/test-production-flow-cleanup.sql`) | the whole production flow, all rules, reports, Excel export, users & rights (400+ checks) |
| `node scripts/test-balance-reports.mjs` | Lot Balance Sheet / Lot Summary against the raw tables |
| `node scripts/test-logins-and-backups.mjs <support password>` | permanent logins, backups, Company Branding (50) — first set a support password on your dev database: `node server/tools/garmentmfg-support.js set-support-password` |

## Make your own exe (with your own passwords)

You can make `GarmentMFGSetup.exe` yourself — the same installer as in Releases, but with **your own secret passwords**. One double-click (Windows) or one command (Mac); it downloads everything it needs by itself.

> **Windows only app.** The installer can be **made on Windows or on a Mac** (Linux works too), but the app **installs and runs only on Windows 10/11 (64-bit)**. Made on a Mac, it won't run on the Mac — copy it to a Windows PC.

**You need:** [Node.js](https://nodejs.org) (the **LTS** version, 22 or newer) · about 2 GB of free disk space · internet the first time.

### On Windows
1. Install **Node.js** from [nodejs.org](https://nodejs.org) (LTS — just click Next through the installer).
2. On this page click **Code → Download ZIP**, and unzip it to a **short** folder, e.g. `C:\garmentmfg`.
3. Open that folder and **double-click `MAKE-EXE.cmd`**. (If Windows says "Windows protected your PC": **More info → Run anyway**.)
4. Wait — about **10 minutes the first time**. When it's done, the **`my-exe`** folder opens by itself.

### On a Mac
1. Install **Node.js** from [nodejs.org](https://nodejs.org) (LTS).
2. Click **Code → Download ZIP** and unzip it (or `git clone https://github.com/AtharvaDubey01/garmentmfg.git`).
3. Open **Terminal** in that folder and run:
   ```bash
   npm run make-exe
   ```
4. Wait about 10 minutes the first time, then open the **`my-exe`** folder and copy `GarmentMFGSetup.exe` to the Windows PC.

### What you get — the `my-exe` folder

| File | What it is |
|---|---|
| `GarmentMFGSetup.exe` | your Windows installer — install it as in the [Setup Guide](docs/GarmentMFG-Setup-Guide.pdf) |
| `MY-PASSWORDS.txt` | **your** passwords: KANVTECH (support login + support code) and database; ADMIN starts as `Admin`. **Keep it private.** |
| `GarmentMFG Setup Guide.pdf` | how to install and use it |

### Your passwords
- The first run makes **strong random passwords** for your installer and keeps them in `packaging/build-config.json` (never uploaded — it's in `.gitignore`). Every installation made with your exe starts with them.
- Running it again is quicker (the downloads are kept) and **uses the same passwords**.
- **Choose your own:** before the first run, copy `packaging/build-config.example.json` to `packaging/build-config.json` and type them in (support password at least 10 characters, database at least 8).
- **New random ones:** delete `packaging/build-config.json` and run it again.
- After installing, the passwords can still be changed on the server PC (Setup Guide section 9).

### If something goes wrong
| Problem | Fix |
|---|---|
| "Node.js is not installed" | Install it from nodejs.org, then run it again |
| A download failed | Check the internet and run it again — finished parts are kept |
| Errors about long paths (Windows) | Move the folder to a short one, e.g. `C:\garmentmfg` |
| Want to start completely fresh | Delete the `.build` and `my-exe` folders and run it again |

### How it works
`make-exe` ([packaging/make-exe.mjs](packaging/make-exe.mjs)) installs the packages, downloads the tools from their official sites and checks each one against its SHA-256 — Node.js 24.22.1, PostgreSQL 16.15 for Windows, WinSW 2.12.0, 7-Zip 25.01 and pgweb 0.16.2 — then runs [packaging/build-windows.mjs](packaging/build-windows.mjs): it builds the screens, bundles and obfuscates the server, puts it inside Windows `node.exe` (Node "single executable application") as `GarmentMFG.exe` and `GarmentMFGSupport.exe`, packs them with PostgreSQL, WinSW and pgweb, and wraps everything into one `GarmentMFGSetup.exe`.

This is checked automatically on GitHub's own Windows, Mac and Linux machines — on Windows the exe is also installed and fully tested ([Make the exe](https://github.com/AtharvaDubey01/garmentmfg/actions/workflows/make-exe.yml)).

## Documents

| File | What it covers |
|---|---|
| [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) | **Start here:** everything in one place — run, test, make the exe, release, install, support, security, decisions |
| [GARMENTMFG_HANDOFF.md](GARMENTMFG_HANDOFF.md) | How the app works: every rule, where the code is, the API, the database |
| [docs/GarmentMFG-Setup-Guide.pdf](docs/GarmentMFG-Setup-Guide.pdf) | Installing and using it, for the company ([editable source](docs/guide-source/GarmentMFG-Setup-Guide.html)) |
| [SUPPORT_GUIDE.md](SUPPORT_GUIDE.md) | Looking after an installation: updates, moving data, restore, passwords |
| [SERVER_PC_HOWTO.md](SERVER_PC_HOWTO.md) | Step-by-step recipes on the server PC |
| [startup.md](startup.md) | Starting, stopping, database commands, common problems (development) |
| [HOW_TO_TEST.md](HOW_TO_TEST.md) | Testing by hand, step by step |

## Folders

| Folder | What it is |
|---|---|
| `client/` | The screens |
| `server/` | The API; `server/db/` the database set-up files; `server/tools/` the support tool |
| `packaging/` | Makes the Windows installer (`make-exe.mjs`, `build-windows.mjs`) |
| `scripts/` | Automated tests, test data and clean-up scripts |
| `docs/` | Setup Guide (PDF + source), brand files |

## License

[MIT](LICENSE)
