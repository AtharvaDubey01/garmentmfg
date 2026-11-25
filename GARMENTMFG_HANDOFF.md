# GarmentMFG — Handoff

**Last updated:** 24 Oct 2026

Read this before changing anything. It explains what the app does, how pieces move through the factory, where that logic lives in the code, and what is still unfinished. It's written so a developer can debug and change things without AI help.

---

## 1. What the app is

A production tracker for garment factories (first built for one garment company, then made general so any company can use it). The flow is:

```
Job Order Booking → Lot Operation Map → Daily Process Entry ⇄ Material Issue → (later) Salary
  order + lots        steps per lot       workers log pieces    finished pieces move
                                          on a step             to the next step
```

- A **Job Order** is a customer order, e.g. 500 shirts.
- The order is cut in one or more **lots** (e.g. lot A = 300, lot B = 200). Total cut across all lots can never be more than the order.
- Each lot goes through **steps** in a fixed order (Cutting → Stitching → Kaj Button → …).
- **Daily Process Entry**: the data-entry person logs how many pieces each worker did on a lot + step, per day. Workers can only work on pieces their step has **received**.
- **Material Issue** records **finished** pieces moving from one step to the next. A step can only send ahead what its workers have logged as done.
- Pay = pieces × the step's rate in Lot Operation Map.

The daily cycle on the floor:
```
Cutting workers log pieces → Cutting sends them ahead → Stitching workers log pieces → Stitching sends ahead → …
```

**In scope right now:** Job Order Booking, Lot Operation Map, Daily Process Entry (both screens), Material Issue, and the four Reports.
**Attendance:** a worker is present on a day only if they logged pieces that day. There's no other kind of attendance.

### Reports (sidebar → Reports)
All four read the same Daily Process Entry rows, so their totals always agree. Deleted rows, deleted workers and deleted lots are left out, and lots are matched ignoring upper/lower case.

| Report | Shows | Filters |
|---|---|---|
| Process Work Report | per worker + lot + operation: pieces, rate, amount | Year, Month, Group (opens on the current year and month, All Groups; type any year, e.g. 2027) |
| Daily Process Report | the same, with the pieces for each day 1–31 | Year, Month, Group (same defaults) |
| Salary Report | per worker per month: **Total Days** = days they logged any pieces (a day counts once, even across several lots/steps), **Amount** = pieces × rate. Worked out straight from Daily Process Entry: every worker who logged pieces is listed, always up to date, no button needed | Year, Month, Group (same defaults) |
| Lotwise Groupwise Qty Report | per lot per month: pieces logged by each employee group (one column per group in Master → Employee Group; only the chosen group's column when a Group is picked) | Year, Month, Group (same defaults) |
| Spine Attendance Excel (Utility) | per worker per day of the month: DP if pieces logged that day, else ABS, and that day's pay. Same rows and rates as Salary, always up to date, no Update Attendance needed | Month, Year |
| **Lot Balance Sheet** | like the factory's Excel BALANCE sheets: per lot and operation, **Previous** (all months before the chosen month), **This Month**, **Balance** = Total Cut − (Previous + This Month), Rate, **Amount = (Previous + This Month) × Rate** (all work on that step so far; only in these two reports — Salary and the other reports pay a month's work); a total line per lot (its operation rows added up: Previous, This Month, Rate, Amount; Total Cut = the lot's cut; Balance left empty) and a grand total (all lots' total lines added up, Balance empty) | Year, Month, Process (Process Master), Lot No. (dropdown) |
| **Lot Summary** | one line per lot = its total line from the Lot Balance Sheet, plus **Balance** (all its operation balances added up); Total line adds up all lots (Balance empty) | same as Lot Balance Sheet |

Amounts always use the current Lot Operation Map rate. Every report has a bold **Total** row (also in PDF / Print / Excel / CSV / Copy). Excel / PDF / Print first ask for the **report heading** (title, optional second line, company logo tick) in `client/src/components/common/ExportButtons.tsx`; the heading is drawn by `client/src/utils/exportUtils.ts`.

The two balance reports are a separate add-on so they can be removed without touching the rest: server `server/src/routes/balanceReports.js` (`/api/balance-reports`), pages `client/src/pages/balance/`, plus lines marked `Balance Reports (new section)` in `server/src/app.js`, `server/src/permissions.js`, `client/src/App.tsx`, `client/src/components/layout/Sidebar.tsx`, `client/src/utils/screens.ts`. "Previous" is added up live from saved Daily Process Entries (nothing carried over by hand); Material Issue slips are not used by these reports. Which lots show: worked on this month, or still open with pieces left.

---

## 2. Running it

| What | Value |
|---|---|
| Folder | `garmentmfg` |
| Database | PostgreSQL 16, database **`garmentmfg`** |
| App (frontend) | http://localhost:6060 |
| API (backend) | http://localhost:6061 |
| pgweb (DB viewer) | http://localhost:8083 |
| Login | Employee Code `ADMIN` / password `Admin` (more logins: Admin → Create Login) |

```bash
npm run dev          # starts API (6061) and frontend (6060)
npm run db:studio    # starts pgweb on 8083 for the garmentmfg database
kill $(lsof -t -iTCP:6060 -iTCP:6061 -iTCP:8083 -sTCP:LISTEN)   # stop everything
```

Settings live in `.env` (copy `.env.example` if missing): `PORT=6061`, `DATABASE_URL=postgresql://localhost:5432/garmentmfg`. See `startup.md` for full start/stop/setup steps.

The login cookie is called `garmentmfg_token`.

**Git:** the owner manages git manually. Don't commit, push or pull unless asked.

---

## 3. The rules (what the app enforces)

### The four numbers for every step of a lot
| Number | Meaning |
|---|---|
| **Received** | First step: the lot's Cut Qty. Any other step: what the step before has **sent ahead**. |
| **Done by Workers** | All workers' pieces on this lot + step in Daily Process Entry (every month added together). |
| **Sent Ahead** | Total of this step's Material Issue slips. |
| **Can Send Now** | Done by Workers − Sent Ahead. |

They always stay in this order: **Sent Ahead ≤ Done by Workers ≤ Received.** Every rule below exists to keep that true.

### Job Order Booking
1. Total **Cut Qty** across all lots of a Job Order ≤ its **Total Order Qty**. Checked when creating *and* editing a lot. Cut Qty is **whole pieces** only (150, not 150.5).
2. To add a lot to an existing order, pick it from **"Select existing"**. The order's fields are copied and the remaining balance is shown.
3. The **order details** — Buyer, Style, Product Description, Total Order Qty, Customer Order No. / Date — belong to the order: editing them on one lot updates **all lots** of that order (their Product Details follow when they still read "[Lot] Buyer # Style # Product"; text typed by hand is left alone). They can be edited (Edit right) only while **no lot of the order is used** yet — no Lot Operation Map, Material Issue slip or Daily Process Entry row (the Lot Operation Map keeps its own copy of them). After that they are locked and the form says why.
4. A lot's Cut Qty can't go below what its first step's workers have logged (or what it has sent ahead).
5. A lot that is **used anywhere** — its Lot Operation Map, any Material Issue slip, any Daily Process Entry row — **can't be renamed or deleted**; the message names what is in the way. To delete it, delete those first (daily entries and slips, then the Lot Operation Map), so nothing is left behind without its lot.

### Lot Operation Map
6. Every operation in a lot has a **Step No.** Only the order matters: 1, 3, 4 works the same as 1, 2, 3. "The step before" = the next lower Step No. that exists.
7. No two operations in a lot can share a Step No., and the same operation can't be added twice to one lot.
8. Once work has started on a lot (any slip **or** any daily entry), its existing steps are **locked**: they can't be renumbered, removed or swapped. New operations can still be added *after* the last step, and **rates can still change**.
9. **Rates:** the rate in Lot Operation Map is the only rate. Changing it changes the amount for **every** entry on that lot + step, past and future, for all workers. Rates belong to each lot (lot 40's Side Taki U and lot 45's Side Taki U can differ).

### Daily Process Entry (monthly grid)
10. **Any worker can work on any step** of any lot; many workers can work on the same step. Outside or machine work is logged under an ordinary worker (e.g. "Outside Work").
11. All workers' pieces on a step together ≤ what the step **Received**. (Nothing can be logged on a step that hasn't received pieces yet.)
12. All workers' pieces on a step together ≥ what the step has already **Sent Ahead**. So an entry can't be lowered or deleted if those pieces already moved on. This applies to editing a row, removing it from the grid, and deleting a whole month sheet.
13. Pieces are whole numbers. One row per worker + month + lot + step; saving the same combination again **replaces** that row's days (it doesn't add).
14. The person doing data entry is responsible for what they type; the app only enforces rules 11–13.

### Material Issue
15. Each **slip** says: *"Step X sent N finished pieces ahead to the next step."*
16. A slip can't be more than **Can Send Now** (pieces the workers finished and not yet sent).
17. Pieces sent ahead by the **last** step are **finished**.
18. Slips can be **edited** or **deleted**, but never so that the next step ends up with less than it already used (logged by its workers, or sent further ahead). Deleting = editing to 0.
19. Closed lots (Closed Lot = Yes) can't receive new slips.

### Masters
20. A master record that's **in use can't be deleted** (deleting it would make work vanish from the reports or leave entries pointing at nothing). The message says where it's used, e.g. *"It's still used in Daily Process Entry (2 month sheets), so it can't be deleted."* What counts as "in use" is listed in `IN_USE` at the top of `server/src/routes/masters.js`:
    - Employee Group → its workers, month sheets · Employee → month sheets · Operation → lot steps, daily entry rows, slips · Process → operations, lot steps, products · Product → job order lots · Unit / Product Group → products · Company → nothing (always deletable)
21. Renaming a worker, group or operation changes the name everywhere (screens and reports read the current name). An operation's **default rate** in Masters only fills in new lot steps; the lot's own rate in Lot Operation Map is what's paid.

### Logins and rights (Admin → Create Login)
22. Only **some employees get a login** (managers, clerks). Factory workers never log in; a manager types their daily work. **Username = the employee's code** (any case). **Passwords are plain text, set by an admin and visible to admins** on purpose (single company; if one leaks, change it).
23. Rights are **ticked per person**, per screen: **View / Create / Edit / Delete / Print-Export**, plus 3 special rights: Lot Operation Map → **Change rates**, Job Order Booking → **Close / reopen lot**, Update Attendance → **Run Update Attendance**. Any right also gives View. No View = the page is hidden from the sidebar and shows "No access".
24. The **server checks every save, delete and special right** (`requireRight` / `can` in `server/src/permissions.js`) **and every read** (`requireViewFor` at the top of each route file): reading data needs View on a screen that uses it, e.g. products can be read with Product *or* Job Order Booking view, daily entries with Daily Process Entry (either screen). A read address that isn't listed is refused for non-admins, so a new route can't leak data by being forgotten. Print / Export is only hidden on screen (it happens in the browser).
    - Without "Change rates", removing a step and adding the same operation back can't reset its rate either (it's compared with the lot's saved rate).
25. Daily Process Entry grid: new rows need Create, **changed** saved rows need Edit, removed rows need Delete; saving a sheet unchanged needs nothing.
26. **Admins** do everything (ticks ignored) and are the only ones who see **Admin → Create Login**. Several admins are allowed. Safety rules (`server/src/loginRules.js`): only an admin can remove / deactivate / un-admin a login; **nobody can do that to their own login**; the **last active admin** can never lose it; an employee who has a login can only be edited or deleted by an admin (deleting the employee removes the login too).
27. Changes apply **at once**: every request re-reads the login (`loadLogin` in `server/src/middleware/auth.js`), so a deactivated person is logged out on their next click and new ticks work without logging in again.

**Nothing in the database stores totals.** Every number is added up from slips and daily entries each time, so a change anywhere shows up everywhere straight away.

---

## 4. Where the logic lives

Almost everything is in **`server/src/routes/transactions.js`**. Search for these function names:

| Function | What it does |
|---|---|
| `getJobOrderCutState` | Total Order Qty and how much other lots of a Job Order have cut (rule 1). |
| `checkStepNos` | Step No. checks on Lot Operation Map save (rule 7). |
| `getLotSteps` | **The one place** Received / Done by Workers / Sent Ahead / Can Send Now are worked out. Every screen and every check uses it. |
| `checkSlipChange` | Slip rules 16 and 18 (new slips, edits, deletes). |
| `changeSlip` | Shared edit/delete handler for slips. |
| `getDailyQuota` | For one lot + step: received, sent, already logged by others, max and min for the entry being saved. |
| `checkDailyPieces` | Daily rules 11–13. Every daily save and delete goes through it. |
| `deleteDailyRows` | Checked delete of daily rows (one row, or a whole month sheet). |
| `lotHasWork` | True if a lot has any slip or daily entry. |
| `checkStepsLocked` | The Lot Operation Map lock (rule 8). |

The **Daily Process Entry** and **Material Issue** sections each start with a comment explaining their rules in plain words.

Saves that could clash (two people saving at the same moment) take a Postgres lock on the Job Order No. or Lot No. (`pg_advisory_xact_lock`) inside a transaction. Daily entries and slips on the same lot use the **same** lock, so they can't step on each other.

### Screens (frontend)
| Screen | File |
|---|---|
| Job Order Booking | `client/src/pages/transactions/JobOrderForm.tsx`, `JobOrderList.tsx` |
| Lot Operation Map | `client/src/pages/transactions/LotOperationMapForm.tsx`, `LotOperationMapList.tsx` |
| Daily Process Entry (monthly grid) | `client/src/pages/transactions/DailyOpEntry.tsx`: rows = lot + step, days 1–31, Total / Rate / Amount, Received / Avail tags, month summary box (Employee, Month, Total Pcs, Total Value) |
| Process Entry Report (list of month sheets) | `client/src/pages/transactions/DailyProcessEntryList.tsx` |
| Material Issue | `client/src/pages/transactions/MaterialIssueList.tsx`: slips table on top; steps with Received / Done by Workers / Sent Ahead / Can Send Now below |
| Home page | `client/src/pages/HomePage.tsx` + `LotsOverview.tsx`: two tiles, **Open Lots** and **Closed Lots** (counted from the Job Order list; Closed Lot = Yes/No). Clicking one opens Job Order Booking showing only those lots (`?status=open` / `?status=closed`, filter + "Show all lots" in `JobOrderList.tsx`). Shown with Job Order Booking view |
| Admin → Create Login | `client/src/pages/admin/LoginList.tsx`, `LoginForm.tsx` (tick grid drawn from `GET /api/admin/screens`); server `server/src/routes/admin.js` |
| Rights on screens | `client/src/utils/screens.ts` (page address → screen), `useAuth().can` / `useScreenRights()` in `client/src/context/AuthContext.tsx`; the sidebar, `AppLayout` ("No access"), `ListPage` and `ExportButtons` use them |
| Reports | `client/src/pages/reports/*.tsx`; server: `server/src/routes/reports.js`. Reports and the Spine export (`server/src/routes/utility.js`) all read work through `server/src/workQueries.js` (`WORK_FROM`, `workFilters`, `ROW_PIECES`), so they always agree |

The screens only display numbers and send requests. The server makes every decision and returns a plain error message, which the screen shows.

### API endpoints
```
Daily Process Entry
GET    /api/transactions/daily-entry/operations-by-lot/:lotNo           steps of a lot, in step order (stepno included)
GET    /api/transactions/daily-entry/operation-quota/:lotNo/:operationId?excludeDetailId=
                                                                         received / sent / loggedByOthers / remainingAllowed / minForThisEntry
POST   /api/transactions/daily-entry/save                               one row: admin only, used by the automated test (no screen)
POST   /api/transactions/daily-entry/save-matrix                        a worker's whole month sheet (grid), incl. deletedRowIds
DELETE /api/transactions/daily-entry/detail/:id                         delete one row: admin only, used by the automated test (no screen)
DELETE /api/transactions/daily-entry/header/:id                         delete a whole month sheet

Material Issue
GET    /api/transactions/material-issue/active-lots                     open lots for the dropdown
GET    /api/transactions/material-issue/lot-details/:lotNo              lot + steps with the four numbers
POST   /api/transactions/material-issue/save                            new slip  { lotNo, operationId, qty, issueDate, remark }
GET    /api/transactions/material-issue/list                            all slips
PUT    /api/transactions/material-issue/item/:id                        edit slip qty  { qty }
DELETE /api/transactions/material-issue/item/:id                        delete slip
```

---

## 5. Database

### Key tables
| Table | What one row is | Notes |
|---|---|---|
| `joborderbooking` | One **lot** of a Job Order | `joborderno`, `fabriclotno` (= Lot No.), `totalqtypcs` (order total), `cutqty` (this lot), `lotclosed` |
| `operationmappingheader` | One lot's map | `lotno` |
| `login` | One **login** (only some employees have one) | `empid` → `operatormaster` (username = its `empcode`), `password` (plain), `isadmin`, `isactive` ('YES'/'NO'), `rights` (JSON: `{"screen.key": ["view","create",…]}`) |
| `joborder_operations` | One step of a lot | `batchname` = Lot No., `operations` = operation id, `processid`, `rate`, **`stepno`** |
| `monthentryheader` | One worker's month sheet | `monthname`, `yearname`, `empid` → `operatormaster`, `ledgrpid` → `ledgergroup` |
| `monthentrydetail` | One row of a sheet: worker + month + lot + step | `headerid`, `lotno`, `processid` (= **operation** id), `d1`…`d31` pieces per day |
| `material_issue` | One **slip** | `lotno`, `operation_id` = the step that **sent** the pieces, `issued_qty` = how many |
| `previous_data` | The version before a record's last change | see below |
| `operatormaster` | Workers (employees) | `operatorname`, `empcode`, `empgrp` → `ledgergroup` |
| `ledgergroup` | Employee groups | `ledgrpname` |
| `operationrate` | Operation master | `operations` = name, `processid` → `stkcategory` |
| `stkcategory` | Process master (Cutting, Stitching, …) | |

### Things that look odd but are intentional (from the old system)
- `joborderbooking.customerid` holds the **Product** id, not a customer.
- `joborder_operations.joborderid` points to `operationmappingheader.id`, **not** `joborderbooking.id`.
- Lots are linked across tables by the **Lot No. text** (`fabriclotno` = `batchname` = `lotno`). That's why renaming a lot in use is blocked.
- `monthentrydetail.processid` is actually an **operation** id (it matches `joborder_operations.operations`).
- Soft delete everywhere: `isdeleted = 'NO'` / `'YES'` (text, not true/false). Deleted rows stay in the table.
- Table `dailyattandance` is spelled that way on purpose.

### Keeping the previous version (`previous_data`)
- One row per edited record: the record's values **just before its last change**, who changed it and when. Each new edit overwrites that row, so the table never grows beyond one row per record.
- Filled automatically by a database trigger on 24 tables (all business tables except `login`, `country`, `statemaster`). No app code is involved.
- Edits that change nothing except `alterby`/`alteredon` are ignored.
- Look up a record: `SELECT * FROM previous_data WHERE table_name = 'monthentrydetail' AND record_id = 5;`
- To track another table, add its name to the list at the bottom of `server/db/003_previous_data.sql` and run the file again.

### Database changes (migrations)
Run in order on a fresh database. Each file is safe to run again.
```
server/db/001_schema.sql          original tables  (⚠ drops and recreates tables)
server/db/002_material_issue.sql  material_issue table
server/db/003_previous_data.sql   previous_data table + trigger
server/db/004_step_no.sql         stepno column on joborder_operations
server/db/005_users_rights.sql    login.empid / isadmin / isactive / rights; creates the ADMIN employee + login (Office Staff group)
```
`psql -d garmentmfg -f server/db/00X_name.sql`

---

## 6. Testing

**Automated factory test**: 411 checks across every part of the flow. The app must be running.
```bash
node scripts/test-production-flow.mjs                       # creates QA* data, prints PASS/FAIL per check
psql -d garmentmfg -f scripts/test-production-flow-cleanup.sql  # removes only the QA* data afterwards
```
Always run the cleanup before running the test again (it creates fixed names like "QA Worker A").

**Balance Reports test**: works out every number of Lot Balance Sheet / Lot Summary a second way straight from the raw tables (every month x process x lot) and checks it matches Salary, Process Work, Daily Process, Lotwise and Material Issue. Changes nothing (a rate is changed and put back).
```bash
node scripts/test-balance-reports.mjs
```

**Simulated factory data** (May–Oct 2026: job orders SIM/201–210, workers SIM01–13, operations SIM01–12) to see the reports with real-looking data:
```bash
node scripts/simulate-real-data.mjs                            # adds it through the API (app must be running)
psql -d garmentmfg -f scripts/simulate-real-data-cleanup.sql       # removes it again
```
While it is in the database the factory test skips its Update Attendance checks (Aug / Sep are not empty).

| Section | Covers |
|---|---|
| 1 | Masters: group, workers, product, processes, operations |
| 2 | Job Order Booking: cut limits, order total shared by lots, duplicates; 2b: order details fixed before any work go to every lot (Product Details follow, hand-typed kept) |
| 3 | Lot Operation Map: step gaps, duplicates, reordering before work; once a lot is mapped its order details are locked (from any lot of the order) and it can't be deleted |
| 4 | Daily Process Entry: limit = Received on both screens, editing, bad input |
| 5 | Monthly grid: Total × Rate = Amount; rate change updates every worker |
| 6 | Material Issue: only finished pieces move; a week on the floor; slip edits; two clerks at once |
| 7 | Locks once pieces have moved |
| 8 | Second lot independent; work spanning two months |
| 9 | Fixing mistakes: nothing that moved on can be taken back; allowed fixes; daily work alone locks a lot |
| 10 | Reports: every report's totals match Daily Process Entry; group/month filters; lower-case lot; deleted rows not counted; Lotwise group columns; Salary days and amounts straight from entries (a day counts once); Update Attendance doesn't change Salary; Spine export on a 30-day month (Update Attendance only run on a month with QA data alone) |
| 11 | Spine export follows entry changes at once (no Update needed), DP days = paid days, total = Salary; Update Attendance saves/refreshes its copy and removes stale rows (only on a month with QA data alone) |
| 12 | Every report and the Spine export find work entered for another year (January 2027) and keep years apart; Lotwise Year / Month / Group filters, empty Year = all years |
| 13 | Masters: in-use records can't be deleted (all 7 kinds) and reports stay the same; renames flow everywhere; default rate doesn't change lot rates; create / edit / delete for all 8 masters incl. Company, Unit, Product Group |
| 14 | Process Entry Report list: search by name / code, Year + Month + Group filters, totals, bad year, pages |
| 15 | Print data: Lot Operation Print has the same steps, order, rates and processes as Material Issue; Job Order print data |
| 16 | Excel export (runs the app's own export code): numbers are real numbers with 2 decimals, SUM = report total, leading zeros kept |
| 17 | Users & Rights: creating logins, login by code, every right on/off (create/edit/delete, reports, admin pages), special rights, rights apply at once, employees with a login, admin safety rules, password change, deactivate (open session ends), remove login (work kept) |
| 18 | Trying to break the login rules: a user with every Master right tries to edit/delete the only admin, its group, a fake "admin" code, admin pages, self-promotion; the only admin tries to remove itself; reading data without the right (daily entries, employees, salary…); rate-reset trick; fake / wrong-secret / deleted-login cookies; odd login input; odd rights shapes |
| 19 | Home page counts: open + closed = every active lot; closing / reopening a lot moves it between the counts; deleted lots not counted; needs Job Order Booking view |
| 20 | Deleting a lot: refused while it has a lot map / daily work (message names both); allowed after they're deleted, and the order details are editable again |

**Test data for trying things by hand:** `scripts/seed-daily-entry-test-data.mjs` (run once) created workers Akhilesh, Anuj, Ramesh, Suresh (Group A), Mohan, Outside Work (Group B); operations Shirt Cut, Side Taki U, Sleeve Bottom, Cuff Making, Kaj Button, Final Press; job orders SHIRT/101 (lots 40, 45) and SHIRT/102 (lot 50), all mapped.

---

## 7. Not done yet / known gaps

1. **Update Attendance** only saves a copy of attendance (present = pieces logged that day) into `dailyattandance`, for viewing on that screen. Its **Search** button shows the saved copy for a month and whether it still matches Daily Process Entry (`/utility/attendance/records` + `/utility/attendance/preview`); Update also removes the saved row of a worker who no longer has entries that month. **Nothing else uses this copy**: Salary and the Spine export read Daily Process Entry directly.
   - The reports and the Spine export no longer use the old views (`processworkamt`, `attendancedays`, `lotgroupqty`, `lotgrouppivot`, `dailyoperatorrate`, `empqtyrate`, `dailyempamt`, `spineattendance`, `dailyattendanceamt`). They counted deleted rows, matched lots by exact text, and the Spine one mixed saved attendance with live amounts. They're left in the database untouched.
2. Lots **10** and **20** (`JOB/01`) have slips made before rule 16 existed, with no worker entries. They're left as they are; Can Send Now shows 0.
3. Lot **02** (test data) still uses the old "Shirt cutting" operation, which is deleted in Masters. The screens still show it, because the lot's map is what counts.
4. Lots are linked by Lot No. text, not by id (old design). That's why renaming a lot in use is blocked rather than supported.
5. Rates aren't frozen: changing a rate changes past amounts too (by design, rule 9). A salary already paid for an earlier month would show a different amount in the report afterwards.
6. **Browser-only checks** can't be automated here: how print sheets and PDF files look, the Copy button, pop-up blocking. See HOW_TO_TEST.md Part 10.
7. Lot **02** (old test data) has a step whose operation and process were deleted in Masters before rule 20 existed. Screens show it as "(deleted in Masters)" and print it by its saved name.

---

## 8. How to work on this project

- Keep it simple: plain rules, no hidden formulas, new screens styled like the existing ones.
- Put each rule in **one** server function and call it from every place that needs it. Don't copy the logic into the screen.
- Error messages should say what's wrong in factory words, e.g. *"This slip can't go below 150 pcs: workers on Step 2 (Stitching) have already logged 150 pcs."*
- Plan with the owner first and build one step at a time; test each step (extend `scripts/test-production-flow.mjs`).

---

## 9. The installed app (Windows installer, support tool, branding)

How a client's copy works and where that code is. How we support a client day to day is in [SUPPORT_GUIDE.md](SUPPORT_GUIDE.md).

| Part | File |
|---|---|
| Settings (installed: `garmentmfg-config.json` named in `GARMENTMFG_CONFIG`; Mac: `.env`) | `server/src/config.js` |
| Database set-up and updates on every start (`server/db/001…`, applied once each, listed in table `schema_migrations`) | `server/src/migrate.js` |
| Permanent / hidden logins (columns `login.permanent`, `login.hidden`, `login.passwordhash`, `operatormaster.hidden`) | `server/db/007_permanent_and_support_logins.sql`, `server/src/loginRules.js` |
| Hashed password of KANVTECH | `server/src/passwords.js` |
| Backups (daily, Admin → Backups, restore, import) | `server/src/backup.js`, `server/src/routes/admin.js`, `client/src/pages/admin/BackupsPage.tsx` |
| Support tool (incl. `view-db` database viewer = bundled `pgweb.exe`) | `server/tools/garmentmfg-support.js` |
| Start/Stop desktop shortcuts | `server/src/setup.js` (`makeShortcuts`) |
| Company Branding (name + logo; table `app_branding`, set-up file `008`) | `server/src/routes/branding.js` (read, no login), `server/src/routes/admin.js` (save, admins), `client/src/context/BrandingContext.tsx`, `client/src/pages/admin/BrandingPage.tsx` |
| Installer / first-install + update + uninstall logic | `packaging/entry-setup.js`, `server/src/setup.js` |
| How `GarmentMFGSetup.exe` is built (bundle → obfuscate → Node single-exe, PostgreSQL + services) | `packaging/build-windows.mjs` |

**Building `GarmentMFGSetup.exe`** (on the Mac): put the default database and KANVTECH passwords in `packaging/build-config.json` (copy `build-config.example.json`; never committed), then `cd packaging && npm install && npm run build` → `../../garmentmfg_build/GarmentMFGSetup.exe`. The server is bundled into one JavaScript file, obfuscated, then baked inside a copy of `node.exe` (its Properties > Details are set to GarmentMFG), so the client gets only `.exe` files — no source. The one-time downloads it needs are listed at the top of `build-windows.mjs`.

A new version that needs a database change adds the next numbered file in `server/db/` (e.g. `009_….sql`). Every installation applies it on its next start; a failed update stops the app with the error instead of running half-updated.
