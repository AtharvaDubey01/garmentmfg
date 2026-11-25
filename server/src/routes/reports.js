import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRight, requireViewFor } from '../permissions.js';
import { ROW_PIECES, WORK_FROM, workFilters } from '../workQueries.js';

const router = express.Router();

// Require authentication for all reports
router.use(requireAuth);

// Each report also checks its own View right below; the group list is for any report screen
router.use(
  requireViewFor([
    ['/groups', ['reports.processWork', 'reports.dailyProcess', 'reports.salary', 'reports.lotwise']],
    ['/process-work', ['reports.processWork']],
    ['/daily-process', ['reports.dailyProcess']],
    ['/salary', ['reports.salary']],
    ['/lot-group-qty', ['reports.lotwise']],
  ])
);

/**
 * GET /api/reports/groups
 * Retrieves all active employee/ledger groups for filter dropdowns
 */
router.get('/groups', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, ledgrpname 
       FROM ledgergroup 
       WHERE TRIM(isdeleted) = 'NO' 
       ORDER BY ledgrpname ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching report groups:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/reports/process-work
 * Replicates DailyReport.aspx and Report_SP with @TransType = 'PW' or 'D'
 * Query Params: year, month, group
 */
router.get('/process-work', requireRight('reports.processWork', 'view'), async (req, res) => {
  try {
    const { where, params } = workFilters(req.query);
    const sql = `
      SELECT
        meh.monthname,
        meh.yearname::text,
        om.operatorname,
        lg.ledgrpname,
        med.lotno,
        COALESCE(op.operations, med.processname) AS processname,
        SUM(${ROW_PIECES}) AS totalqty,
        joo.rate,
        ROUND(SUM(${ROW_PIECES}) * joo.rate, 2) AS totamt
      ${WORK_FROM}
      WHERE ${where}
      GROUP BY meh.yearname, meh.monthname, om.operatorname, med.lotno, lg.ledgrpname,
               COALESCE(op.operations, med.processname), joo.rate
      ORDER BY meh.yearname, meh.monthname, lg.ledgrpname, om.operatorname, med.lotno;
    `;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching Process Work Report:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/reports/daily-process
 * Replicates DailyProcessReport.aspx and Report_SP with @TransType = 'DP' or 'A'
 * Query Params: year, month, group
 */
router.get('/daily-process', requireRight('reports.dailyProcess', 'view'), async (req, res) => {
  try {
    const { where, params } = workFilters(req.query);
    const sql = `
      SELECT
        meh.monthname,
        meh.yearname::text,
        om.operatorname,
        lg.ledgrpname,
        med.lotno,
        COALESCE(op.operations, med.processname) AS processname,
        CAST(med.d1 AS INT) AS d1, CAST(med.d2 AS INT) AS d2, CAST(med.d3 AS INT) AS d3, CAST(med.d4 AS INT) AS d4, CAST(med.d5 AS INT) AS d5, CAST(med.d6 AS INT) AS d6, CAST(med.d7 AS INT) AS d7, CAST(med.d8 AS INT) AS d8, CAST(med.d9 AS INT) AS d9, CAST(med.d10 AS INT) AS d10, CAST(med.d11 AS INT) AS d11, CAST(med.d12 AS INT) AS d12, CAST(med.d13 AS INT) AS d13, CAST(med.d14 AS INT) AS d14, CAST(med.d15 AS INT) AS d15, CAST(med.d16 AS INT) AS d16, CAST(med.d17 AS INT) AS d17, CAST(med.d18 AS INT) AS d18, CAST(med.d19 AS INT) AS d19, CAST(med.d20 AS INT) AS d20, CAST(med.d21 AS INT) AS d21, CAST(med.d22 AS INT) AS d22, CAST(med.d23 AS INT) AS d23, CAST(med.d24 AS INT) AS d24, CAST(med.d25 AS INT) AS d25, CAST(med.d26 AS INT) AS d26, CAST(med.d27 AS INT) AS d27, CAST(med.d28 AS INT) AS d28, CAST(med.d29 AS INT) AS d29, CAST(med.d30 AS INT) AS d30, CAST(med.d31 AS INT) AS d31,
        CAST(${ROW_PIECES} AS INT) AS totalqty,
        joo.rate,
        ROUND(${ROW_PIECES} * joo.rate, 2) AS totamt
      ${WORK_FROM}
      WHERE ${where}
      ORDER BY meh.yearname, meh.monthname, lg.ledgrpname, om.operatorname, med.lotno;
    `;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching Daily Process Report:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/reports/salary
 * One row per worker per month (per group):
 *   Total Days = days the worker logged any pieces (on any lot or step) in Daily Process Entry
 *   Amount     = pieces x current Lot Operation Map rate
 * Worked out straight from the daily entries, so it's always up to date and needs no Update Attendance.
 * (Update Attendance is only for the Spine Attendance Excel export.)
 * Query Params: year, month, group
 */
router.get('/salary', requireRight('reports.salary', 'view'), async (req, res) => {
  try {
    const { where, params } = workFilters(req.query);
    const sql = `
      WITH work_rows AS (
        SELECT meh.yearname, TRIM(meh.monthname) AS monthname, lg.ledgrpname, om.empcode, om.operatorname,
               ROUND(${ROW_PIECES} * joo.rate, 2) AS amount,
               med.d1, med.d2, med.d3, med.d4, med.d5, med.d6, med.d7, med.d8, med.d9, med.d10, med.d11, med.d12, med.d13, med.d14, med.d15, med.d16, med.d17, med.d18, med.d19, med.d20, med.d21, med.d22, med.d23, med.d24, med.d25, med.d26, med.d27, med.d28, med.d29, med.d30, med.d31
        ${WORK_FROM}
        WHERE ${where}
      )
      SELECT yearname::text, monthname, ledgrpname, empcode, operatorname,
             -- a day counts once if the worker logged pieces that day on any row
             ((SUM(d1) > 0)::int +
               (SUM(d2) > 0)::int +
               (SUM(d3) > 0)::int +
               (SUM(d4) > 0)::int +
               (SUM(d5) > 0)::int +
               (SUM(d6) > 0)::int +
               (SUM(d7) > 0)::int +
               (SUM(d8) > 0)::int +
               (SUM(d9) > 0)::int +
               (SUM(d10) > 0)::int +
               (SUM(d11) > 0)::int +
               (SUM(d12) > 0)::int +
               (SUM(d13) > 0)::int +
               (SUM(d14) > 0)::int +
               (SUM(d15) > 0)::int +
               (SUM(d16) > 0)::int +
               (SUM(d17) > 0)::int +
               (SUM(d18) > 0)::int +
               (SUM(d19) > 0)::int +
               (SUM(d20) > 0)::int +
               (SUM(d21) > 0)::int +
               (SUM(d22) > 0)::int +
               (SUM(d23) > 0)::int +
               (SUM(d24) > 0)::int +
               (SUM(d25) > 0)::int +
               (SUM(d26) > 0)::int +
               (SUM(d27) > 0)::int +
               (SUM(d28) > 0)::int +
               (SUM(d29) > 0)::int +
               (SUM(d30) > 0)::int +
               (SUM(d31) > 0)::int) AS totaldays,
             SUM(amount) AS totamt
      FROM work_rows
      GROUP BY yearname, monthname, ledgrpname, empcode, operatorname
      ORDER BY yearname, monthname, ledgrpname, operatorname;
    `;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching Salary Report:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/reports/lot-group-qty
 * Pieces logged per lot per month, split by employee group (one column per group).
 * Returns { groups: [names...], rows: [{ yearname, monthname, lotno, fabricdtls, cutqty, groups: {name: qty}, totalqty }] }
 * Query Params (optional): year, month, group, lot. With a group, only that group's column is returned.
 */
router.get('/lot-group-qty', requireRight('reports.lotwise', 'view'), async (req, res) => {
  try {
    const { year, month, group, lot } = req.query;
    const { where, params } = workFilters({ year, month, group });
    let lotWhere = '';
    if (lot && lot.trim() !== '') {
      params.push(`%${lot.trim()}%`);
      lotWhere = ` AND med.lotno ILIKE $${params.length}`;
    }

    const result = await query(
      `SELECT meh.yearname::text AS yearname, TRIM(meh.monthname) AS monthname,
              job.fabriclotno AS lotno, COALESCE(job.fabricdtls, '') AS fabricdtls, job.cutqty,
              lg.ledgrpname, SUM(${ROW_PIECES}) AS qty
       FROM monthentryheader meh
       INNER JOIN monthentrydetail med ON meh.id = med.headerid
       INNER JOIN operatormaster om ON meh.empid = om.id
       INNER JOIN ledgergroup lg ON meh.ledgrpid = lg.id
       INNER JOIN joborderbooking job ON LOWER(TRIM(job.fabriclotno)) = LOWER(TRIM(med.lotno)) AND job.isdeleted = 'NO'
       WHERE ${where}${lotWhere}
       GROUP BY meh.yearname, TRIM(meh.monthname), job.fabriclotno, job.fabricdtls, job.cutqty, lg.ledgrpname
       ORDER BY meh.yearname, TRIM(meh.monthname), job.fabriclotno;`,
      params
    );

    // Columns: every active group (so the layout stays the same month to month), or just the chosen group
    const oneGroup = group && group.trim() !== '' && group !== '--Select--';
    const groupRes = await query(
      `SELECT ledgrpname FROM ledgergroup
       WHERE TRIM(isdeleted) = 'NO' ${oneGroup ? 'AND TRIM(ledgrpname) ILIKE $1' : ''}
       ORDER BY ledgrpname;`,
      oneGroup ? [group.trim()] : []
    );
    const groups = groupRes.rows.map((g) => g.ledgrpname);

    // One row per year + month + lot, with a qty per group
    const rowsByKey = new Map();
    for (const r of result.rows) {
      const key = `${r.yearname}|${r.monthname}|${r.lotno}`;
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          yearname: r.yearname, monthname: r.monthname, lotno: r.lotno,
          fabricdtls: r.fabricdtls, cutqty: r.cutqty, groups: {}, totalqty: 0,
        });
      }
      const row = rowsByKey.get(key);
      row.groups[r.ledgrpname] = (row.groups[r.ledgrpname] || 0) + parseFloat(r.qty);
      row.totalqty += parseFloat(r.qty);
    }
    res.json({ groups, rows: [...rowsByKey.values()] });
  } catch (err) {
    console.error('Error fetching Lotwise Groupwise Report:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
