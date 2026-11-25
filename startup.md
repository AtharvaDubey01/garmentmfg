# GarmentMFG — How to Start

Everything you need to start, stop and check this project. For how the app works and where the code is, see [GARMENTMFG_HANDOFF.md](GARMENTMFG_HANDOFF.md).

---

## Start (every day)

Open a terminal and run:

```bash
cd garmentmfg
npm run dev
```

That starts the app and the API together. Leave this terminal open.

To look at the database, open a **second** terminal:

```bash
cd garmentmfg
npm run db:studio
```

Then open:

| What | Address |
|---|---|
| **App** | http://localhost:6060 |
| **Database viewer (pgweb)** | http://localhost:8083 |
| API health check | http://localhost:6061/api/health (should say `"database":"connected"`) |

### Login
| Employee Code | Password |
|---|---|
| `ADMIN` | `Admin` |

The username is the **Employee Code** (any case). Passwords are case-sensitive.
More logins are made by an admin in **Admin → Create Login** (only the employees who need one).

---

## Stop

- In each terminal: press **Ctrl + C**.
- Or, from any terminal, stop everything on garmentmfg's ports:
  ```bash
  kill $(lsof -t -iTCP:6060 -iTCP:6061 -iTCP:8083 -sTCP:LISTEN)
  ```

---

## Ports

| | |
|---|---|
| App (screens) | **6060** |
| API (server) | **6061** |
| pgweb (database viewer) | **8083** |
| Database | **garmentmfg** (PostgreSQL, port 5432) |

---

## First-time setup (only on a new machine)

```bash
cd garmentmfg
npm run install:all          # installs root, server and client packages
cp .env.example .env         # settings file (see below)
```

`.env` must contain:
```env
PORT=6061
DATABASE_URL=postgresql://localhost:5432/garmentmfg
SESSION_SECRET=<any long random text>
NODE_ENV=development
```

You also need **PostgreSQL 16** and **pgweb** installed (`brew install postgresql@16 pgweb`).

---

## Database

- PostgreSQL must be running. Check with `brew services list`. If it's stopped:
  ```bash
  brew services start postgresql@16
  ```
- Open the database in the terminal:
  ```bash
  psql -d garmentmfg
  ```
- Database changes added for garmentmfg are in `server/db/` and run in order. Each is safe to run again:
  ```bash
  psql -d garmentmfg -f server/db/002_material_issue.sql
  psql -d garmentmfg -f server/db/003_previous_data.sql
  psql -d garmentmfg -f server/db/004_step_no.sql
  psql -d garmentmfg -f server/db/005_users_rights.sql
  ```

### ⚠️ Reset commands: these wipe data
Only use these if you mean to start the database again from scratch. **They delete what's in `garmentmfg`.**

| Command | What it does |
|---|---|
| `npm run db:schema` | Runs `001_schema.sql`, which **drops and recreates** the tables |
| `psql -d garmentmfg -f scripts/clean-database.sql` | **Empty start**: removes all work and masters, keeps only countries, states and the ADMIN login (with its group "Office Staff"). Take a backup first |
| `node scripts/simulate-real-data.mjs` (app running) | Adds made-up May–Oct 2026 factory data (lots 201–210, workers SIM01–SIM13) to see the reports with data; `psql -d garmentmfg -f scripts/simulate-real-data-cleanup.sql` removes it |

After a reset, run the four `server/db/00X` files above again (005 also creates the ADMIN / Admin login).

---

## Testing

With the app running:

```bash
node scripts/test-production-flow.mjs                       # 411 checks, prints PASS/FAIL
psql -d garmentmfg -f scripts/test-production-flow-cleanup.sql  # removes the test data it created
```

Run the cleanup before running the test again (the test creates fixed names like "QA Worker A").

```bash
node scripts/test-balance-reports.mjs                          # Balance Reports: every number checked against the raw tables
node scripts/test-logins-and-backups.mjs <KANVTECH password>   # permanent ADMIN, hidden KANVTECH login, backups
psql -d garmentmfg -f scripts/simulate-real-data-cleanup.sql       # remove the simulated May-Oct data (SIM/201-210)
```

A hands-on walkthrough of the whole flow (Job Order → Lot Operation Map → Daily Process Entry → Material Issue) is in [HOW_TO_TEST.md](HOW_TO_TEST.md).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| App page won't load | Check the `npm run dev` terminal for errors; check http://localhost:6061/api/health |
| Health check says database error | `brew services restart postgresql@16`, and check `.env` has `DATABASE_URL=postgresql://localhost:5432/garmentmfg` |
| "Port already in use" | Something is still running on it. See what: `lsof -nP -iTCP:6060 -sTCP:LISTEN` (or 6061 / 8083), then stop it with the command under **Stop** |
| Logged out unexpectedly | Log in again (a login lasts 7 days; an admin can also end it by deactivating that login) |

---

## Other docs

- [GARMENTMFG_HANDOFF.md](GARMENTMFG_HANDOFF.md): how the app works, the rules, where the code is, what's unfinished
- [HOW_TO_TEST.md](HOW_TO_TEST.md): testing by hand, step by step
- [SUPPORT_GUIDE.md](SUPPORT_GUIDE.md): looking after an installation (common requests, the support tool, passwords)
