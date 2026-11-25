import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireViewFor } from '../permissions.js';
import { ROW_PIECES, WORK_FROM, workFilters } from '../workQueries.js';

// Balance Reports: the app's version of the process BALANCE sheets kept in Excel.
// For every lot and operation:
//   Previous   = pieces done in all months BEFORE the chosen month
//   This month = pieces done in the chosen month
//   Balance    = Cut Qty - (Previous + This month)       (pieces still to be done)
//   Amount     = (Previous + This month) x Rate          (everything earned on that step so far; rate = the lot's
//                current rate. Only for these two reports: Salary and the other reports pay a month's work only)
// "Previous" is added up from the saved Daily Process Entries, so nothing is carried over by hand.
// Lot Balance Sheet and Lot Summary both use GET /lot-balance.

const router = express.Router();

router.use(requireAuth);

const BALANCE_SCREENS = ['balance.lotBalance', 'balance.lotSummary'];
router.use(
  requireViewFor([
    ['/processes', BALANCE_SCREENS],
    ['/lots', BALANCE_SCREENS],
    ['/lot-balance', BALANCE_SCREENS],
  ])
);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// A sheet row's month as one number (year x 12 + month), so months can be compared: Sept 2026 < Oct 2026
const ROW_PERIOD = `(meh.yearname::int * 12 + EXTRACT(MONTH FROM to_date(TRIM(meh.monthname), 'Month'))::int)`;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * GET /api/balance-reports/processes
 * Processes for the filter (Process Master: Cutting, Stiching, Kaj Button, Pressing...)
 */
router.get('/processes', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, TRIM(stkcategoryname) AS name
       FROM stkcategory
       WHERE TRIM(isdeleted) = 'NO'
       ORDER BY stkcategoryname ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching processes for balance reports:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/balance-reports/lots
 * Lots for the Lot No. dropdown: every lot mapped in Lot Operation Map, with its details,
 * in number order (2, 10, 40 ... then lot numbers that aren't numbers).
 */
router.get('/lots', async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (LOWER(TRIM(joo.batchname))) TRIM(joo.batchname) AS lotno,
              COALESCE(NULLIF(TRIM(b.fabricdtls), ''), TRIM(b.style), '') AS details
       FROM joborder_operations joo
       LEFT JOIN joborderbooking b ON LOWER(TRIM(b.fabriclotno)) = LOWER(TRIM(joo.batchname)) AND TRIM(b.isdeleted) = 'NO'
       WHERE TRIM(joo.isdeleted) = 'NO' AND TRIM(joo.batchname) <> ''
       ORDER BY LOWER(TRIM(joo.batchname)), b.id DESC;`
    );
    const lots = result.rows.sort((a, b) => {
      const na = Number(a.lotno);
      const nb = Number(b.lotno);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      if (!Number.isNaN(na)) return -1;
      if (!Number.isNaN(nb)) return 1;
      return a.lotno.localeCompare(b.lotno);
    });
    res.json(lots);
  } catch (err) {
    console.error('Error fetching lots for balance reports:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/balance-reports/lot-balance?year=2026&month=October&process=2&lot=84
 * process and lot are optional ('' = all).
 * Returns {
 *   year, month,
 *   lots:   [{ lotno, details, cutqty, closed, steps: [{ stepno, operation, process, rate, previous, current, balance, amount }],
 *              total: { previous, current, balance, rate, amount } }],  (the lot's operation rows added up)
 *   totals: { cutqty, previous, current, rate, amount },  (all lots' total lines added up)
 * }
 * Which lots: worked on this month, or started before and still open with pieces left.
 */
router.get('/lot-balance', async (req, res) => {
  try {
    const year = Number(String(req.query.year || '').trim());
    const monthIndex = MONTHS.findIndex((m) => m.toLowerCase() === String(req.query.month || '').trim().toLowerCase());
    if (!year || monthIndex === -1) {
      return res.status(400).json({ status: 'error', message: 'Please choose a Year and a Month.' });
    }
    const period = year * 12 + monthIndex + 1;
    const processId = String(req.query.process || '').trim();
    const lotNo = String(req.query.lot || '').trim();

    // Filters shared by the work queries (process + lot)
    const base = workFilters({});
    const params = [...base.params, period];
    const where = [base.where, `${ROW_PERIOD} <= $${params.length}`];
    if (processId) {
      params.push(processId);
      where.push(`joo.processid = $${params.length}`);
    }
    if (lotNo) {
      params.push(lotNo);
      where.push(`LOWER(TRIM(med.lotno)) = LOWER(TRIM($${params.length}))`);
    }
    const periodParam = `$${base.params.length + 1}`;

    // 1. Pieces per lot + operation: before the chosen month, and in it
    const work = await query(
      `SELECT LOWER(TRIM(med.lotno)) AS lotkey, med.processid AS operationid,
              SUM(CASE WHEN ${ROW_PERIOD} < ${periodParam} THEN ${ROW_PIECES} ELSE 0 END) AS previous,
              SUM(CASE WHEN ${ROW_PERIOD} = ${periodParam} THEN ${ROW_PIECES} ELSE 0 END) AS current
       ${WORK_FROM}
       WHERE ${where.join(' AND ')}
       GROUP BY LOWER(TRIM(med.lotno)), med.processid;`,
      params
    );

    const lotKeys = [...new Set(work.rows.map((r) => r.lotkey))];
    if (lotKeys.length === 0) {
      return res.json({ year, month: MONTHS[monthIndex], lots: [], totals: { cutqty: 0, previous: 0, current: 0, rate: 0, amount: 0 } });
    }

    // 2. Every step of those lots in this process (also steps with no work yet), with the lot's details
    const stepParams = [lotKeys];
    let stepProcess = '';
    if (processId) {
      stepParams.push(processId);
      stepProcess = `AND joo.processid = $${stepParams.length}`;
    }
    const steps = await query(
      `SELECT LOWER(TRIM(joo.batchname)) AS lotkey, TRIM(joo.batchname) AS lotno,
              joo.operations AS operationid, joo.stepno, joo.rate,
              COALESCE(TRIM(op.operations), '') AS operation, COALESCE(TRIM(c.stkcategoryname), '') AS process,
              job.cutqty, job.details, job.lotclosed
       FROM joborder_operations joo
       LEFT JOIN operationrate op ON op.id = joo.operations
       LEFT JOIN stkcategory c ON c.id = joo.processid
       LEFT JOIN LATERAL (
         SELECT COALESCE(NULLIF(TRIM(b.fabricdtls), ''), TRIM(b.style), '') AS details, b.cutqty, b.lotclosed
         FROM joborderbooking b
         WHERE LOWER(TRIM(b.fabriclotno)) = LOWER(TRIM(joo.batchname)) AND TRIM(b.isdeleted) = 'NO'
         ORDER BY b.id DESC
         LIMIT 1
       ) job ON true
       WHERE TRIM(joo.isdeleted) = 'NO' AND LOWER(TRIM(joo.batchname)) = ANY($1) ${stepProcess}
       ORDER BY joo.stepno ASC NULLS LAST, joo.id ASC;`,
      stepParams
    );

    // 3. Put it together, lot by lot
    const workOf = new Map(work.rows.map((r) => [`${r.lotkey}|${r.operationid}`, r]));
    const lotsByKey = new Map();
    for (const s of steps.rows) {
      if (!lotsByKey.has(s.lotkey)) {
        lotsByKey.set(s.lotkey, {
          lotno: s.lotno,
          details: s.details || '',
          cutqty: Number(s.cutqty) || 0,
          closed: String(s.lotclosed || '').trim().toUpperCase() === 'YES',
          steps: [],
        });
      }
      const lot = lotsByKey.get(s.lotkey);
      const w = workOf.get(`${s.lotkey}|${s.operationid}`);
      const previous = Number(w?.previous) || 0;
      const current = Number(w?.current) || 0;
      const rate = Number(s.rate) || 0;
      lot.steps.push({
        stepno: s.stepno,
        operation: s.operation,
        process: s.process,
        rate,
        previous,
        current,
        balance: lot.cutqty - (previous + current),
        amount: round2((previous + current) * rate),
      });
    }

    const lots = [];
    for (const lot of lotsByKey.values()) {
      const workedThisMonth = lot.steps.some((s) => s.current > 0);
      const piecesLeft = lot.steps.some((s) => s.balance > 0);
      if (!workedThisMonth && (lot.closed || !piecesLeft)) continue; // finished or closed, nothing this month

      // Lot total line: each column of the lot's operation rows added up
      // (rate = full garment rate). Total Cut stays the lot's cut qty.
      const add = (field) => lot.steps.reduce((sum, s) => sum + s[field], 0);
      lots.push({
        lotno: lot.lotno,
        details: lot.details,
        cutqty: lot.cutqty,
        closed: lot.closed,
        steps: lot.steps,
        total: {
          previous: add('previous'),
          current: add('current'),
          balance: add('balance'), // shown in Lot Summary only (left empty on the Lot Balance Sheet total lines)
          rate: round2(add('rate')),
          amount: round2(add('amount')),
        },
      });
    }

    // Lots in number order (2, 10, 40 ...), lot numbers that aren't numbers after them
    lots.sort((a, b) => {
      const na = Number(a.lotno);
      const nb = Number(b.lotno);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      if (!Number.isNaN(na)) return -1;
      if (!Number.isNaN(nb)) return 1;
      return a.lotno.localeCompare(b.lotno);
    });

    res.json({
      year,
      month: MONTHS[monthIndex],
      lots,
      // Grand total: every lot's total line added up
      totals: {
        cutqty: lots.reduce((sum, l) => sum + l.cutqty, 0),
        previous: lots.reduce((sum, l) => sum + l.total.previous, 0),
        current: lots.reduce((sum, l) => sum + l.total.current, 0),
        rate: round2(lots.reduce((sum, l) => sum + l.total.rate, 0)),
        amount: round2(lots.reduce((sum, l) => sum + l.total.amount, 0)),
      },
    });
  } catch (err) {
    console.error('Error building lot balance:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
