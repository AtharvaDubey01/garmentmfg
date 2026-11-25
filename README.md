# GarmentMFG — Garment Production & Piece-Rate Payroll

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

If you build the installer yourself, you choose your own defaults (see *Build the Windows installer* below).

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

## Build the Windows installer

Built on a Mac (Apple Silicon):

```bash
cd packaging
cp build-config.example.json build-config.json   # put YOUR default passwords in it (git-ignored)
npm install && npm run build                      # -> ../../garmentmfg_build/GarmentMFGSetup.exe
```

The one-time downloads it needs (Node for Mac + Windows, PostgreSQL 16 for Windows, WinSW, 7-Zip, pgweb) are listed at the top of `packaging/build-windows.mjs`. Details: [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) section 6.

## Documents

| File | What it covers |
|---|---|
| [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) | **Start here:** everything in one place — run, test, build, release, install, support, security, decisions |
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
| `packaging/` | Builds the Windows installer |
| `scripts/` | Automated tests, test data and clean-up scripts |
| `docs/` | Setup Guide (PDF + source), brand files |

## License

[MIT](LICENSE)
