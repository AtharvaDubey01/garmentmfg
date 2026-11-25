import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRight, requireViewFor } from '../permissions.js';
import { WORK_FROM, workFilters } from '../workQueries.js';

const router = express.Router();

router.use(requireAuth);

router.use(
  requireViewFor([
    ['/attendance', ['utility.updateAttendance']],
    ['/spine-attendance', ['utility.spine']],
  ])
);

/**
 * GET /api/utility/attendance/preview
 * Previews attendance days calculated from Daily Process Entry (monthentryheader & monthentrydetail)
 * Query Params: month, year
 */
router.get('/attendance/preview', requireRight('utility.updateAttendance', 'view'), async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year || month === '--Select--') {
      return res.status(400).json({ status: 'error', message: 'Month and Year are required.' });
    }

    const sql = `
      SELECT 
        meh.monthname, 
        meh.yearname::text, 
        COALESCE(om.id, meh.empid) AS empid, 
        COALESCE(om.operatorname, 'Unknown Operator') AS operatorname,
        COALESCE(NULLIF(TRIM(om.empcode), ''), meh.empid::text) AS empcode,
        COALESCE(lg.ledgrpname, '') AS ledgrpname,
        meh.ledgrpid,
        CAST(SUM(med.d1) AS INT) AS d1, CAST(SUM(med.d2) AS INT) AS d2, CAST(SUM(med.d3) AS INT) AS d3,
        CAST(SUM(med.d4) AS INT) AS d4, CAST(SUM(med.d5) AS INT) AS d5, CAST(SUM(med.d6) AS INT) AS d6,
        CAST(SUM(med.d7) AS INT) AS d7, CAST(SUM(med.d8) AS INT) AS d8, CAST(SUM(med.d9) AS INT) AS d9,
        CAST(SUM(med.d10) AS INT) AS d10, CAST(SUM(med.d11) AS INT) AS d11, CAST(SUM(med.d12) AS INT) AS d12,
        CAST(SUM(med.d13) AS INT) AS d13, CAST(SUM(med.d14) AS INT) AS d14, CAST(SUM(med.d15) AS INT) AS d15,
        CAST(SUM(med.d16) AS INT) AS d16, CAST(SUM(med.d17) AS INT) AS d17, CAST(SUM(med.d18) AS INT) AS d18,
        CAST(SUM(med.d19) AS INT) AS d19, CAST(SUM(med.d20) AS INT) AS d20, CAST(SUM(med.d21) AS INT) AS d21,
        CAST(SUM(med.d22) AS INT) AS d22, CAST(SUM(med.d23) AS INT) AS d23, CAST(SUM(med.d24) AS INT) AS d24,
        CAST(SUM(med.d25) AS INT) AS d25, CAST(SUM(med.d26) AS INT) AS d26, CAST(SUM(med.d27) AS INT) AS d27,
        CAST(SUM(med.d28) AS INT) AS d28, CAST(SUM(med.d29) AS INT) AS d29, CAST(SUM(med.d30) AS INT) AS d30,
        CAST(SUM(med.d31) AS INT) AS d31
      FROM monthentryheader meh 
      INNER JOIN monthentrydetail med ON meh.id = med.headerid 
      LEFT JOIN operatormaster om ON (meh.empid = om.id OR meh.empid::text = om.empcode)
      LEFT JOIN ledgergroup lg ON meh.ledgrpid = lg.id 
      WHERE TRIM(meh.isdeleted) = 'NO' AND TRIM(med.isdeleted) = 'NO' 
        AND TRIM(meh.monthname) ILIKE $1 AND TRIM(meh.yearname::text) = $2
      GROUP BY meh.yearname, meh.monthname, meh.empid, COALESCE(om.id, meh.empid), om.operatorname, om.empcode, lg.ledgrpname, meh.ledgrpid
      ORDER BY lg.ledgrpname, om.operatorname;
    `;

    const result = await query(sql, [month.trim(), year.trim()]);
    
    // Compute total active days per row
    const enriched = result.rows.map(r => {
      let daysCount = 0;
      for (let i = 1; i <= 31; i++) {
        if (Number(r[`d${i}`]) > 0) {
          daysCount++;
        }
      }
      return {
        ...r,
        calculatedDays: daysCount
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching attendance preview:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/utility/attendance/records
 * Returns existing records from dailyattandance table for the given month & year
 * Query Params: month, year
 */
router.get('/attendance/records', requireRight('utility.updateAttendance', 'view'), async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year || month === '--Select--') {
      return res.status(400).json({ status: 'error', message: 'Month and Year are required.' });
    }

    const sql = `
      SELECT 
        da.id, 
        da.empcode, 
        COALESCE(om.operatorname, 'Unknown Operator') AS operatorname, 
        COALESCE(NULLIF(TRIM(om.empcode), ''), da.empcode::text) AS emp_code_number,
        COALESCE(lg.ledgrpname, '') AS ledgrpname, 
        da.empgrp, 
        da.monthyear, 
        da.monthnm, 
        da.yearnm::text,
        da.d1, da.d2, da.d3, da.d4, da.d5, da.d6, da.d7, da.d8, da.d9, da.d10,
        da.d11, da.d12, da.d13, da.d14, da.d15, da.d16, da.d17, da.d18, da.d19, da.d20,
        da.d21, da.d22, da.d23, da.d24, da.d25, da.d26, da.d27, da.d28, da.d29, da.d30, da.d31,
        (da.d1 + da.d2 + da.d3 + da.d4 + da.d5 + da.d6 + da.d7 + da.d8 + da.d9 + da.d10 +
         da.d11 + da.d12 + da.d13 + da.d14 + da.d15 + da.d16 + da.d17 + da.d18 + da.d19 + da.d20 +
         da.d21 + da.d22 + da.d23 + da.d24 + da.d25 + da.d26 + da.d27 + da.d28 + da.d29 + da.d30 + da.d31) AS totaldays,
        da.alteredon,
        da.enterby
      FROM dailyattandance da
      LEFT JOIN operatormaster om ON (da.empcode = om.id OR (da.empcode::text = om.empcode AND om.empcode IS NOT NULL AND om.empcode != ''))
      LEFT JOIN ledgergroup lg ON da.empgrp = lg.id
      WHERE TRIM(da.isdeleted) = 'NO'
        AND TRIM(da.monthnm) ILIKE $1 AND TRIM(da.yearnm::text) = $2
      ORDER BY lg.ledgrpname, om.operatorname;
    `;

    const result = await query(sql, [month.trim(), year.trim()]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching attendance records:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/utility/attendance/update
 * Saves a copy of attendance (present = pieces logged that day) into dailyattandance, for viewing on the
 * Update Attendance screen. Salary and the Spine export don't use this copy; they read Daily Process Entry directly.
 * Replicates UpdateAttendance.aspx.cs Button2_Click & AttendanceSP ('A' and 'I')
 * Automatically computes attendance flags (D1..D31 = 1 if pieces > 0 else 0)
 * and upserts records into dailyattandance.
 * Request Body: { month, year }
 */
router.post('/attendance/update', requireRight('utility.updateAttendance', 'runUpdate'), async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year || month === '--Select--') {
      return res.status(400).json({ status: 'error', message: 'Month and Year are required.' });
    }

    const normMonth = month.trim();
    const normYear = year.trim();
    const enterBy = req.user?.username || req.user?.email || 'admin@gmail.com';
    const monthYear = `${normMonth}-${normYear}`;

    // 1. Fetch raw work from monthentryheader & monthentrydetail for month & year
    const fetchSql = `
      SELECT 
        meh.monthname, 
        meh.yearname::text, 
        COALESCE(om.id, meh.empid) AS empid, 
        MAX(meh.ledgrpid) AS ledgrpid,
        CAST(SUM(med.d1) AS INT) AS d1, CAST(SUM(med.d2) AS INT) AS d2, CAST(SUM(med.d3) AS INT) AS d3,
        CAST(SUM(med.d4) AS INT) AS d4, CAST(SUM(med.d5) AS INT) AS d5, CAST(SUM(med.d6) AS INT) AS d6,
        CAST(SUM(med.d7) AS INT) AS d7, CAST(SUM(med.d8) AS INT) AS d8, CAST(SUM(med.d9) AS INT) AS d9,
        CAST(SUM(med.d10) AS INT) AS d10, CAST(SUM(med.d11) AS INT) AS d11, CAST(SUM(med.d12) AS INT) AS d12,
        CAST(SUM(med.d13) AS INT) AS d13, CAST(SUM(med.d14) AS INT) AS d14, CAST(SUM(med.d15) AS INT) AS d15,
        CAST(SUM(med.d16) AS INT) AS d16, CAST(SUM(med.d17) AS INT) AS d17, CAST(SUM(med.d18) AS INT) AS d18,
        CAST(SUM(med.d19) AS INT) AS d19, CAST(SUM(med.d20) AS INT) AS d20, CAST(SUM(med.d21) AS INT) AS d21,
        CAST(SUM(med.d22) AS INT) AS d22, CAST(SUM(med.d23) AS INT) AS d23, CAST(SUM(med.d24) AS INT) AS d24,
        CAST(SUM(med.d25) AS INT) AS d25, CAST(SUM(med.d26) AS INT) AS d26, CAST(SUM(med.d27) AS INT) AS d27,
        CAST(SUM(med.d28) AS INT) AS d28, CAST(SUM(med.d29) AS INT) AS d29, CAST(SUM(med.d30) AS INT) AS d30,
        CAST(SUM(med.d31) AS INT) AS d31
      FROM monthentryheader meh 
      INNER JOIN monthentrydetail med ON meh.id = med.headerid 
      LEFT JOIN operatormaster om ON (meh.empid = om.id OR meh.empid::text = om.empcode)
      WHERE TRIM(meh.isdeleted) = 'NO' AND TRIM(med.isdeleted) = 'NO' 
        AND TRIM(meh.monthname) ILIKE $1 AND TRIM(meh.yearname::text) = $2
      GROUP BY meh.yearname, meh.monthname, COALESCE(om.id, meh.empid);
    `;

    const workData = await query(fetchSql, [normMonth, normYear]);

    // Workers who no longer have any entries this month (e.g. their entries were deleted):
    // remove their old attendance so they don't show as present in the Spine export.
    const workerIds = workData.rows.map((r) => Number(r.empid));
    const removed = await query(
      `UPDATE dailyattandance SET isdeleted = 'YES', alterby = $1, alteredon = NOW()
       WHERE TRIM(isdeleted) = 'NO' AND TRIM(monthnm) ILIKE $2 AND TRIM(yearnm::text) = $3
         AND NOT (empcode = ANY($4::bigint[]))
       RETURNING id;`,
      [enterBy, normMonth, normYear, workerIds]
    );
    const removedNote = removed.rows.length > 0
      ? ` Removed old attendance for ${removed.rows.length} operator(s) with no entries this month.`
      : '';

    if (workData.rows.length === 0) {
      return res.status(200).json({
        status: 'success',
        updatedCount: 0,
        message: `No work entries found for ${normMonth} ${normYear}.${removedNote}`
      });
    }

    let processedCount = 0;

    // 2. Upsert each employee record into dailyattandance
    for (const row of workData.rows) {
      const empCode = row.empid;
      const empGrp = row.ledgrpid;

      const dFlags = {};
      for (let i = 1; i <= 31; i++) {
        dFlags[`d${i}`] = Number(row[`d${i}`]) > 0 ? 1 : 0;
      }

      // Check if row already exists
      const checkSql = `
        SELECT id 
        FROM dailyattandance 
        WHERE empcode = $1 AND TRIM(monthnm) ILIKE $2 AND TRIM(yearnm::text) = $3 AND TRIM(isdeleted) = 'NO';
      `;
      const existing = await query(checkSql, [empCode, normMonth, normYear]);

      if (existing.rows.length === 0) {
        // Insert new record
        const insertSql = `
          INSERT INTO dailyattandance (
            empcode, empgrp, monthyear, 
            d1, d2, d3, d4, d5, d6, d7, d8, d9, d10,
            d11, d12, d13, d14, d15, d16, d17, d18, d19, d20,
            d21, d22, d23, d24, d25, d26, d27, d28, d29, d30, d31,
            enterby, createdon, isdeleted, monthnm, yearnm
          ) VALUES (
            $1, $2, $3,
            $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
            $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
            $35, NOW(), 'NO', $36, $37
          );
        `;
        const insertVals = [
          empCode, empGrp, monthYear,
          dFlags.d1, dFlags.d2, dFlags.d3, dFlags.d4, dFlags.d5, dFlags.d6, dFlags.d7, dFlags.d8, dFlags.d9, dFlags.d10,
          dFlags.d11, dFlags.d12, dFlags.d13, dFlags.d14, dFlags.d15, dFlags.d16, dFlags.d17, dFlags.d18, dFlags.d19, dFlags.d20,
          dFlags.d21, dFlags.d22, dFlags.d23, dFlags.d24, dFlags.d25, dFlags.d26, dFlags.d27, dFlags.d28, dFlags.d29, dFlags.d30, dFlags.d31,
          enterBy, normMonth, normYear
        ];
        await query(insertSql, insertVals);
      } else {
        // Update existing record
        const updateSql = `
          UPDATE dailyattandance SET
            d1 = $1, d2 = $2, d3 = $3, d4 = $4, d5 = $5, d6 = $6, d7 = $7, d8 = $8, d9 = $9, d10 = $10,
            d11 = $11, d12 = $12, d13 = $13, d14 = $14, d15 = $15, d16 = $16, d17 = $17, d18 = $18, d19 = $19, d20 = $20,
            d21 = $21, d22 = $22, d23 = $23, d24 = $24, d25 = $25, d26 = $26, d27 = $27, d28 = $28, d29 = $29, d30 = $30, d31 = $31,
            alterby = $32, alteredon = NOW(), empgrp = $33
          WHERE empcode = $34 AND TRIM(monthnm) ILIKE $35 AND TRIM(yearnm::text) = $36 AND TRIM(isdeleted) = 'NO';
        `;
        const updateVals = [
          dFlags.d1, dFlags.d2, dFlags.d3, dFlags.d4, dFlags.d5, dFlags.d6, dFlags.d7, dFlags.d8, dFlags.d9, dFlags.d10,
          dFlags.d11, dFlags.d12, dFlags.d13, dFlags.d14, dFlags.d15, dFlags.d16, dFlags.d17, dFlags.d18, dFlags.d19, dFlags.d20,
          dFlags.d21, dFlags.d22, dFlags.d23, dFlags.d24, dFlags.d25, dFlags.d26, dFlags.d27, dFlags.d28, dFlags.d29, dFlags.d30, dFlags.d31,
          enterBy, empGrp, empCode, normMonth, normYear
        ];
        await query(updateSql, updateVals);
      }
      processedCount++;
    }

    res.json({
      status: 'success',
      updatedCount: processedCount,
      message: `Successfully updated attendance for ${processedCount} operators for ${month} ${year}.${removedNote}`
    });
  } catch (err) {
    console.error('Error updating attendance:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/utility/spine-attendance
 * Spine export: one row per worker per day of the month.
 *   dp  = DP if the worker logged any pieces that day, otherwise ABS
 *   amt = that day's pieces x current Lot Operation Map rate
 * Worked out straight from Daily Process Entry (same rows and rates as the Salary report),
 * so it's always up to date. It does NOT need Update Attendance.
 * Query Params: month, year
 */
router.get('/spine-attendance', requireRight('utility.spine', 'view'), async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year || month === '--Select--') {
      return res.status(400).json({ status: 'error', message: 'Month and Year are required.' });
    }

    const { where, params } = workFilters({ year, month });
    params.push(month.trim(), year.trim());
    const monthParam = `$${params.length - 1}`;
    const yearParam = `$${params.length}`;

    const sql = `
      WITH work_rows AS (
        SELECT meh.empid, om.empcode, joo.rate, med.d1, med.d2, med.d3, med.d4, med.d5, med.d6, med.d7, med.d8, med.d9, med.d10, med.d11, med.d12, med.d13, med.d14, med.d15, med.d16, med.d17, med.d18, med.d19, med.d20, med.d21, med.d22, med.d23, med.d24, med.d25, med.d26, med.d27, med.d28, med.d29, med.d30, med.d31
        ${WORK_FROM}
        WHERE ${where}
      ),
      per_day AS (
        -- one line per worker per day number (1..31), adding up all their rows
        SELECT w.empid, w.empcode, t.dayno, SUM(t.pieces) AS pieces, SUM(t.pieces * w.rate) AS amt
        FROM work_rows w,
             UNNEST(ARRAY[w.d1, w.d2, w.d3, w.d4, w.d5, w.d6, w.d7, w.d8, w.d9, w.d10, w.d11, w.d12, w.d13, w.d14, w.d15, w.d16,
                          w.d17, w.d18, w.d19, w.d20, w.d21, w.d22, w.d23, w.d24, w.d25, w.d26, w.d27, w.d28, w.d29, w.d30, w.d31])
               WITH ORDINALITY AS t(pieces, dayno)
        GROUP BY w.empid, w.empcode, t.dayno
      ),
      month_start AS (
        SELECT TO_DATE('1 ' || ${monthParam} || ' ' || ${yearParam}, 'DD Month YYYY') AS d0
      )
      SELECT
        per_day.empcode,
        TO_CHAR(month_start.d0 + (per_day.dayno - 1)::int, 'DD-Mon-YYYY') AS attdt,
        1 AS portion,
        CASE WHEN per_day.pieces > 0 THEN 'DP' ELSE 'ABS' END AS dp,
        ROUND(per_day.amt, 2) AS amt
      FROM per_day, month_start
      -- skip day numbers the month doesn't have (e.g. 31 September)
      WHERE per_day.dayno <= EXTRACT(DAY FROM month_start.d0 + INTERVAL '1 month - 1 day')
      ORDER BY per_day.empcode, per_day.dayno;
    `;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching Spine Attendance:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
