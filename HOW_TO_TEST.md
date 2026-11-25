# How to test GarmentMFG by hand

A walk through the whole flow on one lot, the way the factory would use it: workers log pieces, finished pieces move to the next step, and mistakes get fixed. Each step says what you should see (✅).

Takes about 20 minutes. Uses the test data that's already in `garmentmfg`:
- **Lot 50** of job order **SHIRT/102**: cut 150, steps **10 Shirt Cut (₹4) → 20 Side Taki U (₹55) → 30 Cuff Making (₹70) → 40 Final Press (₹8)**
- Workers **Ramesh, Suresh** (Group A) and **Mohan, Outside Work** (Group B)
- Month **November 2026** (so it doesn't mix with anything you entered for October)

---

## Before you start

1. Start the app (see [startup.md](startup.md)): `npm run dev`, and `npm run db:studio` for the database viewer.
2. Open http://localhost:6060 and log in with Employee Code `ADMIN` / password `Admin`.
3. Where the screens are, under **Transactions** in the sidebar:

| Sidebar item | What it is |
|---|---|
| **Daily Process Entry** | Opens the **Process Entry Report** (list of month sheets). The **+** button starts a new **monthly grid** (days 1–31). To reopen a saved sheet, click **Edit** on it in this list. |
| **Material Issue** | Slips table on top; **Select Lot** below shows the steps with **Received / Done by Workers / Sent Ahead / Can Send Now**. |

**The four numbers** (shown on every step):

| Received | Done by Workers | Sent Ahead | Can Send Now |
|---|---|---|---|
| Step 1: the Cut Qty. Others: what the step before sent ahead | Pieces logged by all workers on this step | Total of this step's slips | Done − Sent |

---

## Part 1 · Cutting workers log their pieces (monthly grid)

1. **Daily Process Entry** → **+ New Daily Entry**: November, 2026, Group **A**, **Ramesh**. In row 1 pick Lot **50** and Operation **"Step 10 · Shirt Cut"**.
   - ✅ Under the operation: **Received: 150 · Avail: 150**.
2. Enter **60** on day 1 and **40** on day 2. Save.
   - ✅ Saved. Total 100 pcs, Total Value ₹400.00.
3. **+ New Daily Entry** again for **Suresh** (November, Group A), Lot 50, Step 10.
   - ✅ **Avail: 50**.
4. Enter **60** on day 3.
   - ✅ Avail turns **red** (−10). Saving is refused with *"…Step 10 received 150 pcs; 100 are already logged, so max 50 pcs here (you entered 60)."*
5. Change it to **50** and Save. ✅ Saved. All 150 cut pieces are now done.
6. **+ New Daily Entry** for Group **B**, **Mohan**, Lot 50, **"Step 20 · Side Taki U"**. Enter **5**.
   - ✅ **Received: 0**, and saving is refused: stitching can't start before cutting sends pieces.

## Part 2 · Cutting sends finished pieces ahead (Material Issue)

7. **Material Issue** → bottom section → Select Lot **50**.
   - ✅ Step 10: **Received 150 · Done 150 · Sent 0 · Can Send Now 150**. Steps 20–40 are all 0 and greyed out.
8. In Step 10's **Send Now** box type **100** and click **Send**.
   - ✅ A slip appears in the top table. Step 10 now shows Sent 100 / Can Send Now 50.
   - ✅ Step 20 now shows **Received 100**, but **Done 0 and Can Send Now 0**. Stitching has the pieces but hasn't done them yet.

## Part 3 · Stitching workers log pieces (monthly grid)

9. **Daily Process Entry** → **+**. November, 2026, Group **B**, **Mohan**. Add a row: Lot **50**, **"Step 20 · Side Taki U"**.
   - ✅ Under the operation you see **Received: 100** and **Avail: 100**.
10. Enter **30** on day 4 and **40** on day 5. Save.
    - ✅ The row shows Total **70**, Rate **₹55.00**, Amount **₹3,850.00**.
    - ✅ The summary box under the grid: Employee Name **Mohan**, Month **November 2026**, Total Pcs **70**, Total Value **₹3,850.00**.
11. Start another grid (+) for **Outside Work** (Group B): lot 50, Step 20, enter **40**.
    - ✅ The Total turns red with "+10 over!", and Save is refused (*max 30*).
    - Change it to **30** and Save. ✅ Saved. Outside Work is treated like any other worker.

## Part 4 · Stitching can only send what's finished

12. **Material Issue**, lot 50.
    - ✅ Step 20: **Received 100 · Done 100 · Sent 0 · Can Send Now 100**.
13. Type **110** in Step 20's box. ✅ The box turns red with "Max: 100", and Send is disabled.
14. Send **80**. ✅ Step 30 (Cuff Making) now shows **Received 80**.

## Part 5 · Rates change every amount

15. **Lot Operation Map** → Edit lot **50** → change **Side Taki U** rate from 55 to **60** → Save.
    - ✅ It saves. Steps are locked once work has started, but **rates can always change**.
16. **Daily Process Entry** (the report list) → **Edit** Mohan's November sheet.
    - ✅ Rate ₹60.00, Amount **₹4,200.00** (70 × 60). Outside Work's sheet would show ₹1,800.00.
17. Set the rate back to **55**.

## Part 6 · Fixing mistakes (nothing that moved on can be taken back)

18. **Lower a worker's entry too far.** In Mohan's sheet, change his Step 20 days so the total is **40**, then Save.
    - ✅ Refused: *"Step 20 (Side Taki U) for Lot 50 has already sent 80 pcs ahead, so its workers' total can't go below 80. Other entries have 30 pcs, so this entry needs at least 50 pcs (you entered 40)."*
    - Set it to **50** total and Save. ✅ Allowed (50 + 30 = 80, exactly what was sent). Then put it back to **70**.
19. **Lower a slip too far.** Material Issue, top table → **Edit** the Step 10 slip (100) → change to **90** → Save.
    - ✅ Refused: *"This slip can't go below 100 pcs: workers on Step 20 (Side Taki U) have already logged 100 pcs."* **Delete** on that slip is refused too.
20. **Delete a slip that's safe to delete.** Delete the **Step 20** slip (80).
    - ✅ Allowed (nobody on Step 30 has used those pieces yet). Step 30 goes back to Received 0. Send **80** from Step 20 again.
21. **Can't go below what was sent.** Daily Process Entry (report list) → **Edit** Ramesh's November sheet → change his Step 10 row to **40** in total → Save.
    - ✅ Refused: *"Step 10 (Shirt Cut) for Lot 50 has already sent 100 pcs ahead, so its workers' total can't go below 100. Other entries have 50 pcs, so this entry needs at least 50 pcs (you entered 40)."* Put it back to 100.
22. **Delete a whole sheet.** Daily Process Entry (report list) → **Delete** Ramesh's November sheet.
    - ✅ Refused: his 100 cutting pieces are needed for the 100 already sent.

## Part 7 · Locks on the earlier screens

23. **Lot Operation Map**, lot 50: change a Step No. (e.g. 30 → 35) and Save.
    - ✅ Refused: *"Work has started on Lot 50… only add new operations after Step 40."*
24. **Job Order Booking**, lot 50: change Cut Qty to **140**.
    - ✅ Refused: *"Workers have already logged 150 pcs on Step 10… Cut Qty can't be less than 150."*
    - Changing the **Lot No.** is refused, and so is **Delete** in the list.

## Part 8 · Look at it in the database (pgweb, http://localhost:8083)

- **`monthentrydetail`**: one row per worker + month + lot + step. `processid` is the operation, and `d1`…`d31` are the pieces per day.
- **`material_issue`**: one row per slip. `operation_id` is the step that sent, `issued_qty` is how many. Deleted slips have `isdeleted = YES`.
- **`previous_data`**: the version before each record's last change. Try this in the SQL tab:
  ```sql
  SELECT table_name, record_id, changed_by, changed_on, old_data
  FROM previous_data ORDER BY changed_on DESC LIMIT 10;
  ```
  ✅ You'll see Mohan's row from before you changed it in step 18, and the rate change from step 15.

---

## Part 9 · Reports (sidebar → Reports)

Every report reads the same Daily Process Entry rows, so the totals must agree.

25. **Daily Process Report.** It opens on the **current month** and **All Groups**. Pick **November**, 2026, All Groups → Search.
    - ✅ One row per worker + lot + step from Parts 1–6 (Ramesh, Suresh, Mohan, Outside Work), with the pieces under each day and Amount = Total × Rate.
26. **Process Work Report**, same filters. ✅ Same pieces and amounts, one line per worker + lot + operation (no day columns).
27. **Lotwise Groupwise Qty Report**: November, 2026, All Groups → Search.
    - ✅ One column per employee group. For lot 50, November: **Group A** = Ramesh + Suresh cutting, **Group B** = Mohan + Outside Work stitching. The Total column = the sum of the groups.
    - Pick **Group B** → Search. ✅ Only the Group B column is shown.
28. **Salary Report**, November 2026, All Groups (no Update Attendance needed).
    - ✅ Every worker with November entries appears once: Ramesh, Suresh, Mohan, Outside Work.
    - ✅ **Total Days** = the days they logged pieces (Ramesh: days 1 and 2 → **2**), and **Amount** = the total of their rows in Process Work.
    - Change a worker's entry in Daily Process Entry, then search Salary again: ✅ it's updated straight away.
29. **Spine Attendance Excel** (Utility): November 2026 (no Update Attendance needed).
    - ✅ 30 days per worker (November has 30), **DP** with that day's pay on the days they logged pieces, **ABS** with 0 on the rest. Each worker's total pay = their Salary amount.
    - Change one of Mohan's days in Daily Process Entry, export again: ✅ it follows straight away.
30. **Update Attendance** (Utility): pick November 2026 and click **Search** first. This screen only keeps a saved copy for viewing.
    - ✅ The yellow line says the saved copy is out of date and names the workers. Click **Update Attendance**. ✅ The table shows **1** on the days with pieces and the line turns green.
31. **Job Order Booking:** in Cut Qty, try typing **150.5**. ✅ The dot can't be typed; Cut Qty is whole pieces only.

## Part 10 · Things only a browser can check (print, files, clicking)

The automated test checks the data behind these; this is about how they look and behave in the browser. Allow pop-ups for localhost:6060 first (print opens a new window).

32. **Masters → Employee:** delete **Suresh**. ✅ A red message: *"It's still used in Daily Process Entry (… month sheets), so it can't be deleted."* Suresh stays in the list. Same for Group A (Employee Group), Shirt Cut (Operations), Cutting (Process Master), Mens Formal Shirt (Product), PCS (Unit), Male Shirt (Product Group).
33. **Masters → Company / Unit / Product Group:** add a test record, edit it, delete it. ✅ Each works, with a green message.
34. **Lot Operation Print:** pick lot **40** → ✅ 5 steps in step order (Shirt Cut, Side Taki U, Sleeve Bottom, Kaj Button, Final Press) with rates; click Print → ✅ a clean print preview.
35. **Lot Operation Map → edit lot 02:** ✅ step 1 shows **"Shirt cutting (deleted in Masters)"**, not "--Select--". Click **Print** → ✅ both steps printed with names.
36. **Job Order Booking:** Print on any lot → ✅ preview shows order no., lot, product, cut qty.
37. **Reports → Salary (October 2026):** try each button:
    - **Copy** → paste into Excel/Notes ✅ header row + one line per worker.
    - **CSV** → ✅ opens in Excel with the same columns.
    - **Excel** → ✅ in the Amount column, select the cells: Excel's status bar shows a **Sum** (numbers, not text, and no green triangles).
    - **PDF** → ✅ a landscape/portrait table titled "GarmentMFG".
    - **Print** → ✅ a clean table in a print preview.
38. **Process Entry Report** (Transactions → Daily Process Entry): search **Suresh**, then Year 2026 + October + Group A. ✅ Only matching sheets; Total Qty matches the sheet. Type year **abc** → ✅ a plain message.
39. Click through every sidebar item once. ✅ Every page opens without a blank screen or red error.

## Part 11 · Logins and rights (Admin → Create Login)

40. Logged in as **ADMIN**, open **Admin → Create Login** → **+ New**. ✅ The Employee list only shows employees without a login.
41. Pick **Ramesh**, password `r1`, leave Admin unticked, Active ticked. In the grid tick only **Daily Process Entry → Create** (✅ View ticks itself) and **Reports → Salary Report → View**. Save. ✅ Ramesh is in the list with his password visible.
42. Log out, log in as Ramesh's **employee code** / `r1`. ✅ The sidebar only shows **Daily Process Entry** and **Salary Report**; no Master, no Admin.
43. Open Daily Process Entry: ✅ **+ New Daily Entry** is there, but no Delete buttons. Add a sheet → ✅ saves. Change a saved row and Save → ✅ refused: *"You don't have the right to change Daily Process Entry."*
44. Type another page's address (e.g. `localhost:6060/masters/employee`) → ✅ "No access".
45. As **ADMIN** (another browser or after logging back in) untick **Active** on Ramesh and save. Back in Ramesh's window, click anything → ✅ he's logged out; logging in says the login is deactivated.
46. Safety: as ADMIN, try to untick your own Admin or Active, or remove your own login → ✅ refused with a plain message.
47. Special rights: give someone **Lot Operation Map → Edit** without **Change rates** → ✅ the Rate boxes are grey; tick **Change rates** → ✅ editable.
48. When done, remove Ramesh's login (trash icon). ✅ Ramesh stays in Master → Employee with all his work.

## Part 12 · Home page lots

49. Open **Home**. ✅ Two boxes: **Open Lots** and **Closed Lots**, each with a number.
50. Click **Open Lots** → ✅ Job Order Booking shows only lots with Closed Lot = No, with a green line "Showing open lots only (n)". The count matches the Home page number.
51. Click **Show all lots** → ✅ every lot is back.
52. Go back Home and click **Closed Lots** → ✅ only lots with Closed Lot = Yes.
53. Close a lot (Closed Lot = Yes) and go Home → ✅ Open went down by 1 and Closed up by 1.

**If something doesn't match a ✅:** note the step number and take a screenshot.

**Automated version of all this:** `node scripts/test-production-flow.mjs` (400+ checks), then `psql -d garmentmfg -f scripts/test-production-flow-cleanup.sql`.
