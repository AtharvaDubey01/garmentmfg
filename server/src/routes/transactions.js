import { Router } from 'express';
import pool, { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { can, noRightMessage, requireAdmin, requireRight, requireViewFor } from '../permissions.js';

const router = Router();

// Protect all transactions endpoints with authentication
router.use(requireAuth);

// Reading needs View on the screen that uses the data (daily entries hold everyone's pieces and pay)
router.use(
  requireViewFor([
    ['/job-orders', ['transactions.jobOrder']],
    ['/lot-operations', ['transactions.lotMap', 'transactions.lotPrint']],
    ['/daily-entry', ['transactions.dailyEntry']],
    ['/material-issue', ['transactions.materialIssue']],
  ])
);

/**
 * Helper to safely normalize dates into 'YYYY-MM-DD' or null
 */
function normalizeDate(d) {
  if (!d || typeof d !== 'string' || !d.trim()) return null;
  const s = d.trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [day, month, year] = s.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
    const [day, month, year] = s.split('-');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  return s;
}

/**
 * Helper to safely normalize numeric inputs
 */
function normalizeNum(n, fallback = 0) {
  if (n === null || n === undefined || n === '') return fallback;
  const parsed = parseFloat(n);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Helper to safely normalize string inputs
 */
function normalizeStr(s, fallback = '') {
  if (s === null || s === undefined) return fallback;
  return String(s).trim();
}

/**
 * Phase A: Sum of cutqty and the Total Order Qty for all other active lots of a Job Order No.
 * totalqtypcs is a Job Order level value; the first lot's value is authoritative.
 */
async function getJobOrderCutState(db, joborderno, excludeId = null) {
  const res = await db.query(
    `SELECT
       (SELECT totalqtypcs FROM joborderbooking
         WHERE LOWER(TRIM(joborderno)) = LOWER(TRIM($1)) AND isdeleted = 'NO'
           AND ($2::bigint IS NULL OR id != $2)
         ORDER BY id ASC LIMIT 1) AS totalqtypcs,
       COALESCE(SUM(cutqty), 0) AS others_cut,
       COUNT(*) AS other_lots
     FROM joborderbooking
     WHERE LOWER(TRIM(joborderno)) = LOWER(TRIM($1)) AND isdeleted = 'NO'
       AND ($2::bigint IS NULL OR id != $2);`,
    [joborderno, excludeId]
  );
  const row = res.rows[0];
  return {
    otherLots: parseInt(row.other_lots, 10) || 0,
    totalQtyPcs: row.totalqtypcs != null ? parseFloat(row.totalqtypcs) : null,
    othersCut: parseFloat(row.others_cut) || 0,
  };
}

// ============================================================================
// JOB ORDER BOOKING
// ============================================================================

/**
 * GET /api/transactions/job-orders/cut-balance
 * Returns cut qty balance remaining for a given Job Order No.
 * Used by the form to cap cutqty when creating a new lot.
 * Query param: joborderno
 * Excludes a specific lot ID when editing (query param: excludeId)
 */
router.get('/job-orders/cut-balance', async (req, res, next) => {
  try {
    const { joborderno, excludeId } = req.query;
    if (!joborderno || !joborderno.trim()) {
      return res.status(400).json({ message: 'joborderno is required' });
    }

    // Get totalqtypcs (Total Order Qty) from the first lot with this joborderno
    // All lots under the same joborderno share the same totalqtypcs
    const masterSql = `
      SELECT totalqtypcs
      FROM joborderbooking
      WHERE LOWER(TRIM(joborderno)) = LOWER(TRIM($1))
        AND isdeleted = 'NO'
      ORDER BY id ASC
      LIMIT 1;
    `;
    const masterRes = await query(masterSql, [joborderno.trim()]);
    if (masterRes.rows.length === 0) {
      return res.status(200).json({
        joborderno: joborderno.trim(),
        totalqtypcs: null,
        already_cut: 0,
        balance: null,
        is_new_joborderno: true,
      });
    }

    const totalqtypcs = parseFloat(masterRes.rows[0].totalqtypcs) || 0;

    // Sum all cutqty across active lots, optionally excluding the one being edited
    const sumSql = excludeId
      ? `SELECT COALESCE(SUM(cutqty), 0) AS already_cut
         FROM joborderbooking
         WHERE LOWER(TRIM(joborderno)) = LOWER(TRIM($1))
           AND isdeleted = 'NO'
           AND id != $2;`
      : `SELECT COALESCE(SUM(cutqty), 0) AS already_cut
         FROM joborderbooking
         WHERE LOWER(TRIM(joborderno)) = LOWER(TRIM($1))
           AND isdeleted = 'NO';`;

    const sumParams = excludeId ? [joborderno.trim(), parseInt(excludeId, 10)] : [joborderno.trim()];
    const sumRes = await query(sumSql, sumParams);
    const already_cut = parseFloat(sumRes.rows[0].already_cut) || 0;
    const balance = Math.max(0, totalqtypcs - already_cut);

    return res.status(200).json({
      joborderno: joborderno.trim(),
      totalqtypcs,
      already_cut,
      balance,
      is_new_joborderno: false,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/job-orders/by-joborderno
 * Returns the details of the first lot of a Job Order No. for auto-fill on new lot creation.
 * Query param: joborderno
 */
router.get('/job-orders/by-joborderno', async (req, res, next) => {
  try {
    const { joborderno } = req.query;
    if (!joborderno || !joborderno.trim()) {
      return res.status(400).json({ message: 'joborderno is required' });
    }
    const sql = `
      SELECT
        job.joborderno,
        TO_CHAR(job.joborderdate, 'YYYY-MM-DD') AS joborderdate,
        job.customerid,
        COALESCE(p.stockitemname, '') AS stockitemname,
        COALESCE(job.custorderno, '') AS custorderno,
        TO_CHAR(job.custorderdate, 'YYYY-MM-DD') AS custorderdate,
        job.totalqtypcs,
        COALESCE(job.style, '') AS style,
        COALESCE(job.custdtl, '') AS custdtl,
        COALESCE(job.fabricdtls, '') AS fabricdtls
      FROM joborderbooking job
      LEFT JOIN product p ON job.customerid = p.id
      WHERE LOWER(TRIM(job.joborderno)) = LOWER(TRIM($1))
        AND job.isdeleted = 'NO'
      ORDER BY job.id ASC
      LIMIT 1;
    `;
    const result = await query(sql, [joborderno.trim()]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Job Order not found' });
    }
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/job-orders/unique-nos
 * Returns all unique Job Order Numbers for the dropdown on new lot form.
 */
router.get('/job-orders/unique-nos', async (req, res, next) => {
  try {
    const sql = `
      SELECT DISTINCT joborderno
      FROM joborderbooking
      WHERE isdeleted = 'NO'
      ORDER BY joborderno;
    `;
    const result = await query(sql);
    return res.status(200).json(result.rows.map((r) => r.joborderno));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/job-orders
 * List all active job orders (JOSelect equivalent)
 */
router.get('/job-orders', async (req, res, next) => {
  try {
    const sql = `
      SELECT 
        job.id,
        job.joborderno,
        TO_CHAR(job.joborderdate, 'DD/MM/YYYY') AS joborderdate_fmt,
        TO_CHAR(job.joborderdate, 'YYYY-MM-DD') AS joborderdate,
        job.customerid,
        COALESCE(p.stockitemname, '') AS stockitemname,
        COALESCE(job.custorderno, '') AS custorderno,
        TO_CHAR(job.custorderdate, 'DD/MM/YYYY') AS custorderdate_fmt,
        TO_CHAR(job.custorderdate, 'YYYY-MM-DD') AS custorderdate,
        job.totalqtypcs,
        COALESCE(job.fabriclotno, '') AS fabriclotno,
        job.fabricqty,
        job.totalcuttingpcs,
        job.avgrequirement,
        COALESCE(job.style, '') AS style,
        COALESCE(job.custdtl, '') AS custdtl,
        COALESCE(job.fabricdtls, '') AS fabricdtls,
        job.cutqty,
        COALESCE(job.lotclosed, 'No') AS lotclosed
      FROM joborderbooking job
      LEFT JOIN product p ON job.customerid = p.id
      WHERE job.isdeleted = 'NO'
      ORDER BY job.id DESC;
    `;
    const result = await query(sql);
    return res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/job-orders/:id
 * Retrieve single job order by ID
 */
router.get('/job-orders/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const sql = `
      SELECT 
        job.id,
        job.joborderno,
        TO_CHAR(job.joborderdate, 'YYYY-MM-DD') AS joborderdate,
        TO_CHAR(job.joborderdate, 'DD/MM/YYYY') AS joborderdate_fmt,
        job.customerid,
        COALESCE(p.stockitemname, '') AS stockitemname,
        COALESCE(job.custorderno, '') AS custorderno,
        TO_CHAR(job.custorderdate, 'YYYY-MM-DD') AS custorderdate,
        TO_CHAR(job.custorderdate, 'DD/MM/YYYY') AS custorderdate_fmt,
        job.totalqtypcs,
        COALESCE(job.fabricdtls, '') AS fabricdtls,
        COALESCE(job.fabriclotno, '') AS fabriclotno,
        job.fabricqty,
        job.totalcuttingpcs,
        job.avgrequirement,
        COALESCE(job.style, '') AS style,
        COALESCE(job.custdtl, '') AS custdtl,
        job.cutqty,
        COALESCE(job.lotclosed, 'No') AS lotclosed,
        (SELECT COUNT(*) FROM joborderbooking j2
          WHERE LOWER(TRIM(j2.joborderno)) = LOWER(TRIM(job.joborderno)) AND j2.isdeleted = 'NO')::int AS lot_count
      FROM joborderbooking job
      LEFT JOIN product p ON job.customerid = p.id
      WHERE job.id = $1 AND job.isdeleted = 'NO';
    `;
    const result = await query(sql, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Job Order not found' });
    }
    // Why the order details are locked on the form (null = still editable: no lot of this Job Order is used yet)
    const order = result.rows[0];
    const inUse = await jobOrderInUse(pool, order.joborderno);
    order.order_in_use = inUse ? `Lot ${inUse.lotno} is already used in ${inUse.usedIn.join(', ')}` : null;
    return res.status(200).json(order);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/transactions/job-orders
 * Create new job order booking
 */
router.post('/job-orders', requireRight('transactions.jobOrder', 'create'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      joborderno,
      joborderdate,
      customerid,
      custorderno,
      custorderdate,
      totalqtypcs,
      fabricdtls,
      fabriclotno,
      fabricqty,
      totalcuttingpcs,
      avgrequirement,
      style,
      custdtl,
      cutqty,
      lotclosed,
    } = req.body;

    const cleanJobOrderNo = normalizeStr(joborderno);
    const cleanLotNo = normalizeStr(fabriclotno);
    const cleanStyle = normalizeStr(style);
    const cleanCustDtl = normalizeStr(custdtl);
    const cleanFabricDtls = normalizeStr(fabricdtls);
    const cleanCustOrderNo = normalizeStr(custorderno);
    const cleanLotClosed = normalizeStr(lotclosed, 'No') || 'No';

    const cleanJobOrderDate = normalizeDate(joborderdate) || normalizeDate(new Date().toISOString().slice(0, 10));
    const cleanCustOrderDate = normalizeDate(custorderdate);

    const cleanCustomerId = customerid ? parseInt(customerid, 10) : null;
    const cleanTotalQtyPcs = normalizeNum(totalqtypcs);
    const cleanCutQty = normalizeNum(cutqty);
    const cleanFabricQty = normalizeNum(fabricqty);
    const cleanTotalCuttingPcs = normalizeNum(totalcuttingpcs);
    const cleanAvgRequirement = normalizeNum(avgrequirement);

    // Mandatory field validations (matching legacy)
    if (!cleanJobOrderNo || !cleanJobOrderDate || !cleanCustomerId || !cleanLotNo || !cleanStyle || cleanTotalQtyPcs <= 0) {
      return res.status(400).json({ message: 'Please Enter * Mandatory Fields' });
    }

    // Cut Qty is pieces, so whole numbers only (same as Daily Process Entry and Material Issue)
    if (cleanCutQty < 0 || !Number.isInteger(cleanCutQty)) {
      return res.status(400).json({ message: 'Cut Qty must be a whole number of pieces (e.g. 150, not 150.5).' });
    }

    // Saving a lot as closed needs the "Close / reopen lot" right
    if (cleanLotClosed.toLowerCase() === 'yes' && !can(req.user, 'transactions.jobOrder', 'closeLot')) {
      return res.status(403).json({ message: noRightMessage('transactions.jobOrder', 'closeLot') });
    }

    // Duplicate check on Fabric Lot No (case-insensitive)
    const dupCheck = await query(
      `SELECT id FROM joborderbooking WHERE LOWER(TRIM(fabriclotno)) = LOWER(TRIM($1)) AND isdeleted = 'NO';`,
      [cleanLotNo]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Lot No. Already Exists' });
    }

    // --- Phase A: Cut Balance Validation (R1/R2) ---
    // SUM(cutqty) across all lots of a Job Order No. must not exceed its Total Order Qty.
    // Lock on the Job Order No. so two concurrent saves cannot both spend the same balance.
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext(LOWER($1)));`, [cleanJobOrderNo]);

    const cutState = await getJobOrderCutState(client, cleanJobOrderNo);
    // Additional lots inherit the Job Order's Total Order Qty; only the first lot sets it.
    const effectiveTotalQtyPcs = cutState.otherLots > 0 ? cutState.totalQtyPcs || 0 : cleanTotalQtyPcs;
    const balance = Math.max(0, effectiveTotalQtyPcs - cutState.othersCut);
    if (cleanCutQty > balance) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message:
          balance <= 0
            ? `No cut balance remaining for Job Order "${cleanJobOrderNo}". Total Qty ${effectiveTotalQtyPcs} pcs already fully cut across existing lots.`
            : `Cut Qty exceeds available balance. Balance remaining: ${balance.toFixed(2)} pcs (Total Qty: ${effectiveTotalQtyPcs.toFixed(2)}, Already Cut: ${cutState.othersCut.toFixed(2)}).`,
      });
    }

    const enterBy = req.user?.username || 'admin@gmail.com';

    const insertSql = `
      INSERT INTO joborderbooking (
        joborderno,
        joborderdate,
        customerid,
        custorderno,
        custorderdate,
        totalqtypcs,
        fabricdtls,
        fabriclotno,
        fabricqty,
        totalcuttingpcs,
        avgrequirement,
        enterby,
        createdon,
        isdeleted,
        style,
        custdtl,
        cutqty,
        lotclosed
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), 'NO', $13, $14, $15, $16
      ) RETURNING id;
    `;

    const values = [
      cleanJobOrderNo,
      cleanJobOrderDate,
      cleanCustomerId,
      cleanCustOrderNo,
      cleanCustOrderDate,
      effectiveTotalQtyPcs,
      cleanFabricDtls,
      cleanLotNo,
      cleanFabricQty,
      cleanTotalCuttingPcs,
      cleanAvgRequirement,
      enterBy,
      cleanStyle,
      cleanCustDtl,
      cleanCutQty,
      cleanLotClosed,
    ];

    const result = await client.query(insertSql, values);
    await client.query('COMMIT');
    const newId = result.rows[0].id;

    return res.status(201).json({
      success: true,
      id: newId,
      message: 'Data Saved Successfully',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/**
 * PUT /api/transactions/job-orders/:id
 * Update existing job order
 */
router.put('/job-orders/:id', requireRight('transactions.jobOrder', 'edit'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      joborderno,
      joborderdate,
      customerid,
      custorderno,
      custorderdate,
      totalqtypcs,
      fabricdtls,
      fabriclotno,
      fabricqty,
      totalcuttingpcs,
      avgrequirement,
      style,
      custdtl,
      cutqty,
      lotclosed,
    } = req.body;

    const cleanJobOrderNo = normalizeStr(joborderno);
    const cleanLotNo = normalizeStr(fabriclotno);
    const cleanStyle = normalizeStr(style);
    const cleanCustDtl = normalizeStr(custdtl);
    const cleanFabricDtls = normalizeStr(fabricdtls);
    const cleanCustOrderNo = normalizeStr(custorderno);
    const cleanLotClosed = normalizeStr(lotclosed, 'No') || 'No';

    const cleanJobOrderDate = normalizeDate(joborderdate);
    const cleanCustOrderDate = normalizeDate(custorderdate);

    const cleanCustomerId = customerid ? parseInt(customerid, 10) : null;
    const cleanTotalQtyPcs = normalizeNum(totalqtypcs);
    const cleanCutQty = normalizeNum(cutqty);
    const cleanFabricQty = normalizeNum(fabricqty);
    const cleanTotalCuttingPcs = normalizeNum(totalcuttingpcs);
    const cleanAvgRequirement = normalizeNum(avgrequirement);

    if (!cleanJobOrderNo || !cleanJobOrderDate || !cleanCustomerId || !cleanLotNo || !cleanStyle || cleanTotalQtyPcs <= 0) {
      return res.status(400).json({ message: 'Please Enter * Mandatory Fields' });
    }

    // Cut Qty is pieces, so whole numbers only (same as Daily Process Entry and Material Issue)
    if (cleanCutQty < 0 || !Number.isInteger(cleanCutQty)) {
      return res.status(400).json({ message: 'Cut Qty must be a whole number of pieces (e.g. 150, not 150.5).' });
    }

    // Closing or reopening the lot needs the "Close / reopen lot" right
    const closedRes = await query(`SELECT COALESCE(lotclosed, 'No') AS lotclosed FROM joborderbooking WHERE id = $1;`, [id]);
    const wasClosed = (closedRes.rows[0]?.lotclosed || 'No').toLowerCase() === 'yes';
    if (wasClosed !== (cleanLotClosed.toLowerCase() === 'yes') && !can(req.user, 'transactions.jobOrder', 'closeLot')) {
      return res.status(403).json({ message: noRightMessage('transactions.jobOrder', 'closeLot') });
    }

    // Duplicate check on Fabric Lot No excluding current record
    const dupCheck = await query(
      `SELECT id FROM joborderbooking WHERE LOWER(TRIM(fabriclotno)) = LOWER(TRIM($1)) AND id != $2 AND isdeleted = 'NO';`,
      [cleanLotNo, id]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Lot No. Already Exists' });
    }

    // --- Phase A: Cut Balance Validation on edit (R1) ---
    // This lot's cutqty plus every other lot's cutqty must fit inside the Total Order Qty.
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext(LOWER($1)));`, [cleanJobOrderNo]);

    const cutState = await getJobOrderCutState(client, cleanJobOrderNo, id);
    const balance = Math.max(0, cleanTotalQtyPcs - cutState.othersCut);
    if (cleanCutQty > balance) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Cut Qty exceeds available balance. Balance remaining: ${balance.toFixed(2)} pcs (Total Qty: ${cleanTotalQtyPcs.toFixed(2)}, Cut in other lots: ${cutState.othersCut.toFixed(2)}).`,
      });
    }

    // Lot No. links the lot to its Lot Operation Map and Material Issue slips, so it can't be
    // changed once either exists (they would lose their lot).
    const currentRes = await client.query(
      `SELECT j.fabriclotno, j.joborderno, j.customerid, j.custorderno, TO_CHAR(j.custorderdate, 'YYYY-MM-DD') AS custorderdate,
              j.totalqtypcs, j.style, j.custdtl, COALESCE(p.stockitemname, '') AS product
       FROM joborderbooking j LEFT JOIN product p ON p.id = j.customerid
       WHERE j.id = $1;`,
      [id]
    );
    const before = currentRes.rows[0] || {};
    const currentLotNo = before.fabriclotno || '';
    if (currentLotNo && currentLotNo.trim().toLowerCase() !== cleanLotNo.toLowerCase()) {
      const mapRes = await client.query(
        `SELECT id FROM operationmappingheader WHERE LOWER(TRIM(lotno)) = LOWER(TRIM($1)) AND isdeleted = 'NO';`,
        [currentLotNo]
      );
      if (mapRes.rows.length > 0 || (await lotHasWork(client, currentLotNo))) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Lot ${currentLotNo.trim()} is already used in Lot Operation Map, Material Issue or Daily Process Entry, so its Lot No. can't be changed.`,
        });
      }
    }

    // Order details belong to the whole Job Order. They can be fixed (e.g. a wrong style) only while
    // none of its lots is used yet (Lot Operation Map, Material Issue, Daily Process Entry);
    // the change then goes to every lot of the Job Order.
    const orderChanges = [
      normalizeStr(before.custdtl) !== cleanCustDtl && 'Buyer',
      normalizeStr(before.style) !== cleanStyle && 'Style',
      Number(before.customerid) !== cleanCustomerId && 'Product Description',
      (parseFloat(before.totalqtypcs) || 0) !== cleanTotalQtyPcs && 'Total Order Qty',
      normalizeStr(before.custorderno) !== cleanCustOrderNo && 'Customer Order No.',
      (before.custorderdate || null) !== (cleanCustOrderDate || null) && 'Customer Order Date',
    ].filter(Boolean);
    if (orderChanges.length > 0) {
      const movedToOtherOrder = normalizeStr(before.joborderno).toLowerCase() !== cleanJobOrderNo.toLowerCase();
      const inUse =
        (await jobOrderInUse(client, before.joborderno)) || (movedToOtherOrder ? await jobOrderInUse(client, cleanJobOrderNo) : null);
      if (inUse) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `${orderChanges.join(', ')} can't be changed: Lot ${inUse.lotno} of this Job Order is already used in ${inUse.usedIn.join(', ')}.`,
        });
      }
    }

    // Cut Qty can't go below what the lot's first step has already done (workers logged) or sent ahead.
    const lotSteps = await getLotSteps(client, cleanLotNo);
    const firstStep = lotSteps?.steps[0];
    if (firstStep && cleanCutQty < Math.max(firstStep.done, firstStep.sent)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: firstStep.done >= firstStep.sent
          ? `Workers have already logged ${firstStep.done} pcs on Step ${firstStep.stepno} (${firstStep.operation_name}), so Cut Qty can't be less than ${firstStep.done}.`
          : `Step ${firstStep.stepno} (${firstStep.operation_name}) has already sent ${firstStep.sent} pcs ahead, so Cut Qty can't be less than ${firstStep.sent}.`,
      });
    }

    const alterBy = req.user?.username || 'admin@gmail.com';

    // Total Order Qty belongs to the Job Order, so keep every lot of it in sync.
    if (cutState.otherLots > 0) {
      await client.query(
        `UPDATE joborderbooking SET totalqtypcs = $1, alterby = $2, alteredon = NOW()
         WHERE LOWER(TRIM(joborderno)) = LOWER(TRIM($3)) AND isdeleted = 'NO' AND id != $4
           AND totalqtypcs IS DISTINCT FROM $1;`,
        [cleanTotalQtyPcs, alterBy, cleanJobOrderNo, id]
      );
    }

    // Fixed order details go to the Job Order's other lots too; their Product Details follow
    // when they still read "[Lot] Buyer # Style # Product" (text typed by hand is left alone).
    if (orderChanges.length > 0 && cutState.otherLots > 0) {
      const productRes = await client.query(`SELECT COALESCE(stockitemname, '') AS name FROM product WHERE id = $1;`, [cleanCustomerId]);
      const oldTail = detailsTail(normalizeStr(before.custdtl), normalizeStr(before.style), before.product || '');
      const newTail = detailsTail(cleanCustDtl, cleanStyle, productRes.rows[0]?.name || '');
      const others = await client.query(
        `SELECT id, fabricdtls FROM joborderbooking
         WHERE LOWER(TRIM(joborderno)) = LOWER(TRIM($1)) AND isdeleted = 'NO' AND id != $2;`,
        [cleanJobOrderNo, id]
      );
      for (const other of others.rows) {
        await client.query(
          `UPDATE joborderbooking SET customerid = $1, custdtl = $2, style = $3, custorderno = $4, custorderdate = $5,
                  fabricdtls = COALESCE($6, fabricdtls), alterby = $7, alteredon = NOW()
           WHERE id = $8;`,
          [cleanCustomerId, cleanCustDtl, cleanStyle, cleanCustOrderNo, cleanCustOrderDate, followProductDetails(other.fabricdtls, oldTail, newTail), alterBy, other.id]
        );
      }
    }

    const updateSql = `
      UPDATE joborderbooking SET
        joborderno = $1,
        joborderdate = $2,
        customerid = $3,
        custorderno = $4,
        custorderdate = $5,
        totalqtypcs = $6,
        fabricdtls = $7,
        fabriclotno = $8,
        fabricqty = $9,
        totalcuttingpcs = $10,
        avgrequirement = $11,
        alterby = $12,
        alteredon = NOW(),
        style = $13,
        custdtl = $14,
        cutqty = $15,
        lotclosed = $16
      WHERE id = $17 AND isdeleted = 'NO'
      RETURNING id;
    `;

    const values = [
      cleanJobOrderNo,
      cleanJobOrderDate,
      cleanCustomerId,
      cleanCustOrderNo,
      cleanCustOrderDate,
      cleanTotalQtyPcs,
      cleanFabricDtls,
      cleanLotNo,
      cleanFabricQty,
      cleanTotalCuttingPcs,
      cleanAvgRequirement,
      alterBy,
      cleanStyle,
      cleanCustDtl,
      cleanCutQty,
      cleanLotClosed,
      id,
    ];

    const result = await client.query(updateSql, values);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Job Order not found or already deleted' });
    }
    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      id: result.rows[0].id,
      message: 'Data Saved Successfully',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/transactions/job-orders/:id
 * Soft delete job order (isdeleted = 'YES')
 */
router.delete('/job-orders/:id', requireRight('transactions.jobOrder', 'delete'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const alterBy = req.user?.username || 'admin@gmail.com';

    // A lot that is used anywhere (Lot Operation Map, Material Issue slips, Daily Process Entry rows)
    // can't be deleted: those have to be deleted first, so nothing is left behind without its lot.
    const lotRes = await query(`SELECT fabriclotno FROM joborderbooking WHERE id = $1 AND isdeleted = 'NO';`, [id]);
    const usedIn = lotRes.rows.length > 0 ? await lotUsedIn(pool, lotRes.rows[0].fabriclotno) : [];
    if (usedIn.length > 0) {
      return res.status(400).json({
        message: `Lot ${String(lotRes.rows[0].fabriclotno).trim()} is already used in ${usedIn.join(', ')}, so it can't be deleted. Delete those first.`,
      });
    }

    const sql = `
      UPDATE joborderbooking
      SET isdeleted = 'YES', alterby = $1, alteredon = NOW()
      WHERE id = $2 AND isdeleted = 'NO'
      RETURNING id;
    `;
    const result = await query(sql, [alterBy, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Job Order not found or already deleted' });
    }

    return res.status(200).json({
      success: true,
      message: 'Record deleted successfully',
      id: result.rows[0].id,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// LOT OPERATION MAP (Phase 8)
// ============================================================================

/**
 * Step No. check for the operations grid.
 * Every kept operation (rate > 0) needs a Step No. of 1 or more, and no two can share one.
 * The same operation can't be added twice to one lot (Material Issue tracks pieces per operation).
 * Returns an error message, or null if everything is fine.
 */
function checkStepNos(operations) {
  const usedSteps = new Set();
  const usedOperations = new Set();
  for (const op of operations || []) {
    if (!op.processid || !op.operations || normalizeNum(op.rate, 0) === 0) continue;
    const step = parseInt(op.stepno, 10);
    if (!step || step < 1) {
      return 'Please enter a Step No. (1, 2, 3...) for every operation.';
    }
    if (usedSteps.has(step)) {
      return `Step No. ${step} is used twice. Each operation needs its own Step No.`;
    }
    if (usedOperations.has(String(op.operations))) {
      return 'The same operation is added twice. Each operation can only be one step.';
    }
    usedSteps.add(step);
    usedOperations.add(String(op.operations));
  }
  return null;
}

/**
 * "Change rates" right (Admin > Create Login). Without it:
 *   - a new step must use the operation's default rate from Master > Operations
 *   - an existing step's rate can't change, even if it's removed and added back as a "new" row
 *     (mapId = the lot map being edited, null when creating one)
 * Rate 0 means "remove this step" (old rule), so it isn't a rate change.
 * Returns an error message, or null if fine.
 */
async function checkRateChanges(user, operations, mapId = null) {
  if (can(user, 'transactions.lotMap', 'changeRates')) return null;
  for (const op of operations || []) {
    const rate = normalizeNum(op.rate, 0);
    if (!op.processid || !op.operations || rate === 0) continue;
    const detailId = normalizeNum(op.id, 0);
    // The rate this row must keep: its own saved rate; or, for a "new" row of an operation the lot
    // already has, that step's saved rate; otherwise the operation's default rate.
    let res = detailId > 0
      ? await query(`SELECT rate FROM joborder_operations WHERE id = $1;`, [detailId])
      : { rows: [] };
    let existingStep = detailId > 0;
    if (res.rows.length === 0 && mapId) {
      res = await query(
        `SELECT rate FROM joborder_operations WHERE joborderid = $1 AND operations = $2 AND isdeleted = 'NO' ORDER BY id LIMIT 1;`,
        [mapId, op.operations]
      );
      existingStep = res.rows.length > 0;
    }
    if (res.rows.length === 0) {
      res = await query(`SELECT oprate AS rate FROM operationrate WHERE id = $1;`, [op.operations]);
    }
    if (res.rows.length === 0) continue; // unknown step/operation: the other checks report it
    const allowedRate = normalizeNum(res.rows[0].rate, 0);
    if (Math.abs(allowedRate - rate) > 0.0001) {
      return existingStep
        ? `You don't have the "Change rates" right on Lot Operation Map, so a step's rate can't be changed (from ${allowedRate} to ${rate}). Ask an admin.`
        : `You don't have the "Change rates" right on Lot Operation Map, so a new step must use its operation's rate (${allowedRate}). Ask an admin.`;
    }
  }
  return null;
}

/**
 * GET /api/transactions/lot-operations/open-lots
 * Fetches open lots from joborderbooking (LotClosed = 'No' and isdeleted = 'NO')
 */
router.get('/lot-operations/open-lots', async (req, res, next) => {
  try {
    const sql = `
      SELECT 
        j.id, 
        j.fabriclotno, 
        j.joborderno, 
        j.style,
        j.custdtl,
        h.id AS mapping_id
      FROM joborderbooking j
      LEFT JOIN operationmappingheader h ON LOWER(TRIM(j.fabriclotno)) = LOWER(TRIM(h.lotno)) AND h.isdeleted = 'NO'
      WHERE j.isdeleted = 'NO' AND LOWER(TRIM(COALESCE(j.lotclosed, 'No'))) = 'no' 
      ORDER BY j.fabriclotno ASC;
    `;
    const result = await query(sql);
    return res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/lot-operations/lot-details/:id
 * Fetches job order details to auto-populate the lot mapping form
 */
router.get('/lot-operations/lot-details/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const sql = `
      SELECT 
        job.id,
        job.joborderno,
        TO_CHAR(job.joborderdate, 'YYYY-MM-DD') AS joborderdate,
        TO_CHAR(job.joborderdate, 'DD/MM/YYYY') AS joborderdate_fmt,
        job.fabriclotno,
        COALESCE(job.style, '') AS style,
        COALESCE(job.totalqtypcs, 0) AS totalqtypcs,
        COALESCE(job.custdtl, '') AS custdtl,
        COALESCE(job.custorderno, '') AS custorderno,
        TO_CHAR(job.custorderdate, 'YYYY-MM-DD') AS custorderdate,
        TO_CHAR(job.custorderdate, 'DD/MM/YYYY') AS custorderdate_fmt,
        COALESCE(job.fabricdtls, '') AS fabricdtls,
        COALESCE(p.stockitemname, '') AS stockitemname
      FROM joborderbooking job
      LEFT JOIN product p ON job.customerid = p.id
      WHERE job.id = $1 AND job.isdeleted = 'NO';
    `;
    const result = await query(sql, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Job Order not found' });
    }
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/lot-operations/operations-by-process/:processId
 * Fetches operations for a selected process master ID
 */
router.get('/lot-operations/operations-by-process/:processId', async (req, res, next) => {
  try {
    const { processId } = req.params;
    const sql = `
      SELECT 
        id, 
        operations, 
        oprate, 
        COALESCE(opcode, '') AS opcode, 
        processid 
      FROM operationrate 
      WHERE processid = $1 AND isdeleted = 'NO' 
      ORDER BY operations ASC;
    `;
    const result = await query(sql, [processId]);
    return res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/lot-operations/by-lot/:lotNo
 * Fetches operation mappings for print preview / report by lot number
 */
router.get('/lot-operations/by-lot/:lotNo', async (req, res, next) => {
  try {
    const { lotNo } = req.params;
    const sql = `
      SELECT 
        h.id, 
        h.lotno, 
        h.custdtl, 
        h.joborderno, 
        h.orderqty, 
        h.custorderno, 
        o.rate, 
        TO_CHAR(h.joborderdt, 'DD/MM/YYYY') AS joborderdate_fmt, 
        TO_CHAR(h.joborderdt, 'YYYY-MM-DD') AS joborderdate,
        h.proddtl, 
        TO_CHAR(h.custorderdt, 'DD/MM/YYYY') AS custorderdt_fmt, 
        h.style, 
        h.prodname, 
        o.operations, 
        o.processid,
        o.stepno,
        COALESCE(op.operations, 'Operation #' || o.operations) AS opname,
        COALESCE(c.stkcategoryname, '') AS stkcategoryname 
      FROM joborder_operations o 
      INNER JOIN operationmappingheader h ON o.joborderid = h.id 
      -- every step the lot has, like Material Issue (even if its operation/process was later deleted in Masters)
      LEFT JOIN operationrate op ON o.operations = op.id 
      LEFT JOIN stkcategory c ON o.processid = c.id 
      WHERE o.isdeleted = 'NO' 
        AND h.isdeleted = 'NO' 
        AND LOWER(TRIM(h.lotno)) = LOWER(TRIM($1))
      ORDER BY o.stepno, o.id;
    `;
    const result = await query(sql, [lotNo]);
    return res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/lot-operations
 * List all active lot mappings (OpmapLotSearch SO equivalent)
 */
router.get('/lot-operations', async (req, res, next) => {
  try {
    const sql = `
      SELECT 
        h.id,
        h.joborderno,
        COALESCE(c.stkcategoryname, 'All') AS stkcategoryname,
        h.lotno,
        COALESCE(h.style, '') AS style,
        COALESCE(h.prodname, '') AS prodname,
        COUNT(o.operations) AS operations,
        COALESCE(SUM(o.rate), 0) AS rate,
        COALESCE(o.processid, 0) AS processid,
        h.custdtl,
        TO_CHAR(h.joborderdt, 'DD/MM/YYYY') AS joborderdate_fmt
      FROM operationmappingheader h
      LEFT JOIN joborder_operations o ON o.joborderid = h.id AND o.isdeleted = 'NO'
      LEFT JOIN stkcategory c ON o.processid = c.id
      WHERE h.isdeleted = 'NO'
      GROUP BY h.id, h.joborderno, c.stkcategoryname, h.lotno, h.style, h.prodname, o.processid, h.custdtl, h.joborderdt
      ORDER BY h.id DESC, c.stkcategoryname;
    `;
    const result = await query(sql);
    return res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/lot-operations/:id
 * Retrieve single lot mapping header and all its mapped operations for editing
 */
router.get('/lot-operations/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const headerSql = `
      SELECT 
        h.id,
        h.lotno,
        h.custdtl,
        h.joborderno,
        TO_CHAR(h.joborderdt, 'YYYY-MM-DD') AS joborderdate,
        TO_CHAR(h.joborderdt, 'DD/MM/YYYY') AS joborderdate_fmt,
        COALESCE(h.style, '') AS style,
        COALESCE(h.orderqty, 0) AS orderqty,
        COALESCE(h.custorderno, '') AS custorderno,
        TO_CHAR(h.custorderdt, 'YYYY-MM-DD') AS custorderdt,
        TO_CHAR(h.custorderdt, 'DD/MM/YYYY') AS custorderdt_fmt,
        COALESCE(h.prodname, '') AS prodname,
        COALESCE(h.proddtl, '') AS proddtl
      FROM operationmappingheader h
      WHERE h.id = $1 AND h.isdeleted = 'NO';
    `;
    const headerResult = await query(headerSql, [id]);
    if (headerResult.rows.length === 0) {
      return res.status(404).json({ message: 'Lot mapping not found' });
    }

    const detailSql = `
      SELECT 
        o.id,
        o.processid,
        COALESCE(c.stkcategoryname, '') AS processname,
        o.operations,
        COALESCE(op.operations, '') AS opname,
        COALESCE(op.opcode, '') AS opcode,
        o.rate,
        o.stepno
      FROM joborder_operations o
      LEFT JOIN stkcategory c ON o.processid = c.id
      LEFT JOIN operationrate op ON o.operations = op.id
      WHERE o.joborderid = $1 AND o.isdeleted = 'NO'
      ORDER BY o.stepno, o.id;
    `;
    const detailResult = await query(detailSql, [id]);

    return res.status(200).json({
      header: headerResult.rows[0],
      operations: detailResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/transactions/lot-operations
 * Create a new lot operation map
 */
router.post('/lot-operations', requireRight('transactions.lotMap', 'create'), async (req, res, next) => {
  try {
    const {
      lotno,
      custdtl,
      joborderno,
      joborderdate,
      style,
      orderqty,
      custorderno,
      custorderdt,
      prodname,
      proddtl,
      operations,
    } = req.body;

    const cleanLotNo = normalizeStr(lotno);
    const cleanCustDtl = normalizeStr(custdtl);
    const cleanJobOrderNo = normalizeStr(joborderno);
    const cleanJobOrderDate = normalizeDate(joborderdate) || normalizeDate(new Date().toISOString().slice(0, 10));
    const cleanStyle = normalizeStr(style);
    const cleanOrderQty = normalizeNum(orderqty);
    const cleanCustOrderNo = normalizeStr(custorderno);
    const cleanCustOrderDate = normalizeDate(custorderdt);
    const cleanProdName = normalizeStr(prodname);
    const cleanProdDtl = normalizeStr(proddtl);

    if (!cleanLotNo || cleanLotNo === '--Select--') {
      return res.status(400).json({ message: 'Please Enter * Mandatory Fields' });
    }

    const stepError = checkStepNos(operations);
    if (stepError) {
      return res.status(400).json({ message: stepError });
    }
    const rateError = await checkRateChanges(req.user, operations);
    if (rateError) {
      return res.status(403).json({ message: rateError });
    }

    // Duplicate check on active mapping for this Lot No.
    const dupCheck = await query(
      `SELECT id FROM operationmappingheader WHERE LOWER(TRIM(lotno)) = LOWER(TRIM($1)) AND isdeleted = 'NO';`,
      [cleanLotNo]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ 
        message: 'This Lot is already mapped. Please edit the existing mapping.',
        existingId: dupCheck.rows[0].id
      });
    }

    const enterBy = req.user?.username || 'admin@gmail.com';

    // Insert header
    const insertHeaderSql = `
      INSERT INTO operationmappingheader (
        lotno,
        custdtl,
        joborderno,
        joborderdt,
        style,
        orderqty,
        custorderno,
        custorderdt,
        prodname,
        proddtl,
        enterby,
        createdon,
        isdeleted
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), 'NO'
      ) RETURNING id;
    `;

    const headerValues = [
      cleanLotNo,
      cleanCustDtl,
      cleanJobOrderNo,
      cleanJobOrderDate,
      cleanStyle,
      cleanOrderQty,
      cleanCustOrderNo,
      cleanCustOrderDate,
      cleanProdName,
      cleanProdDtl,
      enterBy,
    ];

    const headerRes = await query(insertHeaderSql, headerValues);
    const newHeaderId = headerRes.rows[0].id;

    // Insert detail operations
    if (Array.isArray(operations) && operations.length > 0) {
      for (const op of operations) {
        const procId = op.processid ? parseInt(op.processid, 10) : null;
        const opId = op.operations ? parseInt(op.operations, 10) : null;
        const rate = normalizeNum(op.rate, 0);
        const stepNo = parseInt(op.stepno, 10) || null;

        if (procId && opId) {
          // If Rate = 0, soft-deleted per legacy rule. If Rate > 0, isdeleted = 'NO'
          const isDel = rate === 0 ? 'YES' : 'NO';
          const opSql = `
            INSERT INTO joborder_operations (
              batchname,
              operations,
              rate,
              enterby,
              createdon,
              isdeleted,
              processid,
              joborderid,
              stepno
            ) VALUES (
              $1, $2, $3, $4, NOW(), $5, $6, $7, $8
            );
          `;
          await query(opSql, [cleanLotNo, opId, rate, enterBy, isDel, procId, newHeaderId, stepNo]);
        }
      }
    }

    return res.status(201).json({
      success: true,
      id: newHeaderId,
      message: 'Data Saved Successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/transactions/lot-operations/:id
 * Update existing lot operation mapping and its operations
 */
router.put('/lot-operations/:id', requireRight('transactions.lotMap', 'edit'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      lotno,
      custdtl,
      joborderno,
      joborderdate,
      style,
      orderqty,
      custorderno,
      custorderdt,
      prodname,
      proddtl,
      operations,
    } = req.body;

    const cleanLotNo = normalizeStr(lotno);
    const cleanCustDtl = normalizeStr(custdtl);
    const cleanJobOrderNo = normalizeStr(joborderno);
    const cleanJobOrderDate = normalizeDate(joborderdate);
    const cleanStyle = normalizeStr(style);
    const cleanOrderQty = normalizeNum(orderqty);
    const cleanCustOrderNo = normalizeStr(custorderno);
    const cleanCustOrderDate = normalizeDate(custorderdt);
    const cleanProdName = normalizeStr(prodname);
    const cleanProdDtl = normalizeStr(proddtl);

    if (!cleanLotNo || cleanLotNo === '--Select--') {
      return res.status(400).json({ message: 'Please Enter * Mandatory Fields' });
    }

    const stepError = checkStepNos(operations) || (await checkStepsLocked(pool, cleanLotNo, operations));
    if (stepError) {
      return res.status(400).json({ message: stepError });
    }
    const rateError = await checkRateChanges(req.user, operations, id);
    if (rateError) {
      return res.status(403).json({ message: rateError });
    }

    // Duplicate check on Lot No excluding current mapping
    const dupCheck = await query(
      `SELECT id FROM operationmappingheader WHERE LOWER(TRIM(lotno)) = LOWER(TRIM($1)) AND id != $2 AND isdeleted = 'NO';`,
      [cleanLotNo, id]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Lot No. Already Mapped' });
    }

    const alterBy = req.user?.username || 'admin@gmail.com';

    // Update header
    const updateHeaderSql = `
      UPDATE operationmappingheader SET
        lotno = $1,
        custdtl = $2,
        joborderno = $3,
        joborderdt = $4,
        style = $5,
        orderqty = $6,
        custorderno = $7,
        custorderdt = $8,
        prodname = $9,
        proddtl = $10,
        alterby = $11,
        alteredon = NOW()
      WHERE id = $12 AND isdeleted = 'NO'
      RETURNING id;
    `;

    const headerValues = [
      cleanLotNo,
      cleanCustDtl,
      cleanJobOrderNo,
      cleanJobOrderDate,
      cleanStyle,
      cleanOrderQty,
      cleanCustOrderNo,
      cleanCustOrderDate,
      cleanProdName,
      cleanProdDtl,
      alterBy,
      id,
    ];

    const headerRes = await query(updateHeaderSql, headerValues);
    if (headerRes.rows.length === 0) {
      return res.status(404).json({ message: 'Lot mapping not found or already deleted' });
    }

    // Process detail operations
    const preservedIds = [];
    if (Array.isArray(operations)) {
      for (const op of operations) {
        const detailId = op.id ? parseInt(op.id, 10) : null;
        const procId = op.processid ? parseInt(op.processid, 10) : null;
        const opId = op.operations ? parseInt(op.operations, 10) : null;
        const rate = normalizeNum(op.rate, 0);
        const stepNo = parseInt(op.stepno, 10) || null;

        if (procId && opId) {
          if (detailId) {
            // Existing row
            preservedIds.push(detailId);
            if (rate === 0) {
              // Legacy rule: Rate = 0 => IsDeleted = 'Yes'
              await query(
                `UPDATE joborder_operations SET isdeleted = 'YES', rate = 0, alterby = $1, alteredon = NOW() WHERE id = $2;`,
                [alterBy, detailId]
              );
            } else {
              // Rate > 0 => IsDeleted = 'NO'
              await query(
                `UPDATE joborder_operations SET 
                  batchname = $1, 
                  joborderid = $2, 
                  processid = $3, 
                  operations = $4, 
                  rate = $5,
                  stepno = $6,
                  isdeleted = 'NO',
                  alterby = $7,
                  alteredon = NOW()
                 WHERE id = $8;`,
                [cleanLotNo, id, procId, opId, rate, stepNo, alterBy, detailId]
              );
            }
          } else {
            // New row added in edit mode
            const isDel = rate === 0 ? 'YES' : 'NO';
            const insertOpRes = await query(
              `INSERT INTO joborder_operations (
                batchname, operations, rate, enterby, createdon, isdeleted, processid, joborderid, stepno
              ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8) RETURNING id;`,
              [cleanLotNo, opId, rate, alterBy, isDel, procId, id, stepNo]
            );
            if (isDel === 'NO') {
              preservedIds.push(insertOpRes.rows[0].id);
            }
          }
        }
      }
    }

    // Soft-delete any previous operations that were deleted or removed from the grid
    if (preservedIds.length > 0) {
      await query(
        `UPDATE joborder_operations SET isdeleted = 'YES', alterby = $1, alteredon = NOW() 
         WHERE joborderid = $2 AND isdeleted = 'NO' AND id NOT IN (${preservedIds.join(',')});`,
        [alterBy, id]
      );
    } else {
      await query(
        `UPDATE joborder_operations SET isdeleted = 'YES', alterby = $1, alteredon = NOW() 
         WHERE joborderid = $2 AND isdeleted = 'NO';`,
        [alterBy, id]
      );
    }

    return res.status(200).json({
      success: true,
      id,
      message: 'Data Saved Successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/transactions/lot-operations/:id
 * Soft delete lot mapping header and all child operations (matching JOOperation_SP 'D')
 */
router.delete('/lot-operations/:id', requireRight('transactions.lotMap', 'delete'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const alterBy = req.user?.username || 'admin@gmail.com';

    const mapRes = await query(`SELECT lotno FROM operationmappingheader WHERE id = $1 AND isdeleted = 'NO';`, [id]);
    if (mapRes.rows.length > 0) {
      const lockError = await checkStepsLocked(pool, mapRes.rows[0].lotno, []);
      if (lockError) {
        return res.status(400).json({ message: lockError });
      }
    }

    // Soft delete header
    const delHeader = await query(
      `UPDATE operationmappingheader SET isdeleted = 'YES', alterby = $1, alteredon = NOW() 
       WHERE id = $2 AND isdeleted = 'NO' RETURNING id;`,
      [alterBy, id]
    );

    if (delHeader.rows.length === 0) {
      return res.status(404).json({ message: 'Lot mapping not found or already deleted' });
    }

    // Soft delete child operations
    await query(
      `UPDATE joborder_operations SET isdeleted = 'YES', alterby = $1, alteredon = NOW() 
       WHERE joborderid = $2;`,
      [alterBy, id]
    );

    return res.status(200).json({
      success: true,
      id,
      message: 'Record deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// DAILY PROCESS ENTRY
// ============================================================================
//
// Rules (checkDailyPieces), for all workers together on one step of a lot:
//   * pieces logged <= what the step RECEIVED (first step = Cut Qty, others = what the step before sent ahead)
//   * pieces logged >= what the step already SENT AHEAD (edits and deletes can't take back moved pieces)
// Received / Sent come from getLotSteps in the Material Issue section. Pieces are whole numbers.
// Every save and delete of daily entries goes through checkDailyPieces.

/**
 * How many pieces can still be logged on one step of a lot.
 *   excludeDetailIds = monthentrydetail rows being saved now (their old pieces don't count)
 * Returns null if the operation isn't mapped to the lot.
 */
async function getDailyQuota(db, lotNo, operationId, excludeDetailIds = []) {
  const lotSteps = await getLotSteps(db, lotNo);
  const step = lotSteps?.steps.find((s) => String(s.operation_id) === String(operationId));
  if (!step) return null;

  const loggedRes = await db.query(
    `SELECT COALESCE(SUM(d1+d2+d3+d4+d5+d6+d7+d8+d9+d10+d11+d12+d13+d14+d15+d16+
                         d17+d18+d19+d20+d21+d22+d23+d24+d25+d26+d27+d28+d29+d30+d31), 0) AS logged
     FROM monthentrydetail
     WHERE LOWER(TRIM(lotno)) = LOWER(TRIM($1)) AND processid = $2 AND isdeleted = 'NO'
       AND NOT (id = ANY($3::bigint[]));`,
    [lotNo, operationId, excludeDetailIds]
  );
  const loggedByOthers = parseFloat(loggedRes.rows[0].logged) || 0;

  return {
    stepno: step.stepno,
    operationName: step.operation_name,
    received: step.received,
    sent: step.sent, // pieces this step already sent ahead: workers' total can't drop below this
    loggedByOthers,
    remainingAllowed: Math.max(0, step.received - loggedByOthers),
    minForThisEntry: Math.max(0, step.sent - loggedByOthers),
  };
}

/**
 * Check the pieces being saved for one lot + operation.
 *   days = the 31 day values, pieces = their total (all zeros when a row is being deleted)
 * Rule 1: all workers' pieces on the step <= what the step received.
 * Rule 2: all workers' pieces on the step >= what the step already sent ahead (can't take back moved pieces).
 * Returns an error message, or null if fine.
 */
async function checkDailyPieces(db, lotNo, operationId, days, excludeDetailIds = []) {
  if (days.some((d) => d < 0 || !Number.isInteger(d))) {
    return 'Pieces must be whole numbers (0 or more).';
  }
  const pieces = days.reduce((a, b) => a + b, 0);
  const quota = await getDailyQuota(db, lotNo, operationId, excludeDetailIds);
  if (!quota) {
    return `This operation is not mapped to Lot ${lotNo} in Lot Operation Map.`;
  }
  if (pieces > quota.remainingAllowed) {
    return `Step ${quota.stepno} (${quota.operationName}) for Lot ${lotNo} received ${quota.received} pcs; ` +
      `${quota.loggedByOthers} are already logged, so max ${quota.remainingAllowed} pcs here (you entered ${pieces}).`;
  }
  if (pieces < quota.minForThisEntry) {
    return `Step ${quota.stepno} (${quota.operationName}) for Lot ${lotNo} has already sent ${quota.sent} pcs ahead, ` +
      `so its workers' total can't go below ${quota.sent}. Other entries have ${quota.loggedByOthers} pcs, so ` +
      (pieces === 0
        ? `this entry can't be removed (it needs at least ${quota.minForThisEntry} pcs).`
        : `this entry needs at least ${quota.minForThisEntry} pcs (you entered ${pieces}).`);
  }
  return null;
}

/**
 * GET /api/transactions/daily-entry/groups
 * Return active employee/ledger groups
 */
router.get('/daily-entry/groups', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, ledgrpname FROM ledgergroup WHERE isdeleted = 'NO' ORDER BY ledgrpname ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/daily-entry/operators-by-group/:groupId
 * Return active operators filtered by group
 */
router.get('/daily-entry/operators-by-group/:groupId', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const result = await query(
      `SELECT id, operatorname, empcode FROM operatormaster 
       WHERE empgrp = $1 AND isdeleted = 'NO' AND hidden = 'NO'
       ORDER BY operatorname ASC;`,
      [groupId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/daily-entry/open-lots
 * Return active open fabric lots
 */
router.get('/daily-entry/open-lots', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT DISTINCT fabriclotno AS lotno 
       FROM joborderbooking 
       WHERE isdeleted = 'NO' AND (lotclosed IS NULL OR lotclosed = 'No') 
       ORDER BY fabriclotno ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/daily-entry/operations-by-lot/:lotNo
 * Return operations mapped to this lot with process info and rate
 */
router.get('/daily-entry/operations-by-lot/:lotNo', async (req, res, next) => {
  try {
    const { lotNo } = req.params;
    const result = await query(
      `SELECT 
         jo.stepno,
         jo.operations AS processid,
         COALESCE(op.operations, 'Operation #' || jo.operations) AS processname,
         op.opcode,
         jo.rate,
         sc.stkcategoryname AS processcategory
       FROM joborder_operations jo
       LEFT JOIN operationrate op ON jo.operations = op.id
       LEFT JOIN stkcategory sc ON jo.processid = sc.id
       WHERE LOWER(TRIM(jo.batchname)) = LOWER(TRIM($1))
         AND jo.isdeleted = 'NO'
       ORDER BY jo.stepno, jo.id;`,
      [lotNo]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/daily-entry/operation-quota/:lotNo/:processId
 * How many pieces can still be logged on this step (shown live on both screens).
 * processId here is the operation id. Query: excludeDetailId = the row being edited.
 */
router.get('/daily-entry/operation-quota/:lotNo/:processId', async (req, res, next) => {
  try {
    const lotNo = normalizeStr(req.params.lotNo);
    const operationId = normalizeNum(req.params.processId, 0);
    const excludeId = normalizeNum(req.query.excludeDetailId, 0);
    const quota = lotNo && operationId
      ? await getDailyQuota(pool, lotNo, operationId, excludeId > 0 ? [excludeId] : [])
      : null;
    if (!quota) {
      return res.json({ mapped: false, received: 0, loggedByOthers: 0, remainingAllowed: 0 });
    }
    res.json({ mapped: true, ...quota });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/daily-entry/header-search
 * Find an existing month entry header by month, year, group, and employee
 *
 * No screen uses this any more (the "Daily Process Entry New" screen was removed).
 * Kept because the automated test (scripts/test-production-flow.mjs) uses it
 * to find a worker's month entry.
 */
router.get('/daily-entry/header-search', async (req, res, next) => {
  try {
    const { month, year, groupId, empId } = req.query;
    if (!month || !year || !groupId || !empId) {
      return res.json({ id: 0 });
    }
    const result = await query(
      `SELECT id FROM monthentryheader 
       WHERE monthname = $1 AND yearname = $2 AND ledgrpid = $3 AND empid = $4 AND isdeleted = 'NO' 
       LIMIT 1;`,
      [month, year, groupId, empId]
    );
    if (result.rows.length > 0) {
      return res.json({ id: result.rows[0].id });
    }
    return res.json({ id: 0 });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/daily-entry/details-by-header/:headerId
 * Return all active detail rows for a given header with computed total quantity and rate
 */
router.get('/daily-entry/details-by-header/:headerId', async (req, res, next) => {
  try {
    const { headerId } = req.params;
    const result = await query(
      `SELECT 
         d.id,
         d.headerid,
         d.lotno,
         d.processid,
         d.processname,
         d.d1, d.d2, d.d3, d.d4, d.d5, d.d6, d.d7, d.d8, d.d9, d.d10,
         d.d11, d.d12, d.d13, d.d14, d.d15, d.d16, d.d17, d.d18, d.d19, d.d20,
         d.d21, d.d22, d.d23, d.d24, d.d25, d.d26, d.d27, d.d28, d.d29, d.d30, d.d31,
         (d.d1+d.d2+d.d3+d.d4+d.d5+d.d6+d.d7+d.d8+d.d9+d.d10+
          d.d11+d.d12+d.d13+d.d14+d.d15+d.d16+d.d17+d.d18+d.d19+d.d20+
          d.d21+d.d22+d.d23+d.d24+d.d25+d.d26+d.d27+d.d28+d.d29+d.d30+d.d31) AS totalqty,
         COALESCE(jo.rate, op.oprate, 0.00) AS rate,
         ROUND(((d.d1+d.d2+d.d3+d.d4+d.d5+d.d6+d.d7+d.d8+d.d9+d.d10+
           d.d11+d.d12+d.d13+d.d14+d.d15+d.d16+d.d17+d.d18+d.d19+d.d20+
           d.d21+d.d22+d.d23+d.d24+d.d25+d.d26+d.d27+d.d28+d.d29+d.d30+d.d31) * COALESCE(jo.rate, op.oprate, 0.00)), 2) AS amount,
         d.remark,
         d.opbalance,
         d.issuedqty
       FROM monthentrydetail d
       LEFT JOIN operationrate op ON d.processid = op.id
       LEFT JOIN joborder_operations jo ON LOWER(TRIM(d.lotno)) = LOWER(TRIM(jo.batchname)) AND d.processid = jo.operations AND jo.isdeleted = 'NO'
       WHERE d.headerid = $1 AND d.isdeleted = 'NO'
       ORDER BY d.id ASC;`,
      [headerId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/daily-entry/headers/:id
 * Get header data by ID including employee and group details
 */
router.get('/daily-entry/headers/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const headerRes = await query(
      `SELECT 
         h.id,
         h.monthname,
         h.yearname,
         h.empid,
         o.operatorname,
         o.empcode,
         h.ledgrpid,
         g.ledgrpname
       FROM monthentryheader h
       INNER JOIN operatormaster o ON h.empid = o.id
       INNER JOIN ledgergroup g ON h.ledgrpid = g.id
       WHERE h.id = $1 AND h.isdeleted = 'NO';`,
      [id]
    );
    if (headerRes.rows.length === 0) {
      return res.status(404).json({ message: 'Daily Process Entry not found' });
    }
    const header = headerRes.rows[0];
    res.json(header);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/transactions/daily-entry/save
 * Save header and detail line (creates header if none, or attaches detail)
 *
 * No screen uses this any more (the "Daily Process Entry New" screen was removed).
 * Kept, admin only, because the automated test (scripts/test-production-flow.mjs) uses it
 * to put work entries in quickly.
 */
router.post('/daily-entry/save', requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      headerId,
      monthName,
      yearName,
      empId,
      ledGrpId,
      detailId,
      lotNo,
      processId,
      processName,
      remark,
      d1, d2, d3, d4, d5, d6, d7, d8, d9, d10,
      d11, d12, d13, d14, d15, d16, d17, d18, d19, d20,
      d21, d22, d23, d24, d25, d26, d27, d28, d29, d30, d31,
    } = req.body;

    // Validate mandatory fields
    if (
      !monthName ||
      monthName === '--Select--' ||
      !yearName ||
      !empId ||
      !ledGrpId ||
      !lotNo ||
      lotNo === '--Select--' ||
      !processId ||
      processId === '--Select--'
    ) {
      return res.status(400).json({ message: 'Please Enter * Mandatory Fields' });
    }

    // Lock this lot so two saves at the same moment can't both use the same pieces.
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext(LOWER($1)));`, [normalizeStr(lotNo)]);

    const enterBy = req.user?.username || 'admin@gmail.com';
    let targetHeaderId = normalizeNum(headerId, 0);

    // Resolve operator primary key ID in case an empcode string was passed
    let resolvedEmpId = normalizeNum(empId, 0);
    const opLookup = await client.query(
      `SELECT id FROM operatormaster WHERE id = $1 OR empcode = $2 LIMIT 1;`,
      [resolvedEmpId, String(empId).trim()]
    );
    if (opLookup.rows.length > 0) {
      resolvedEmpId = Number(opLookup.rows[0].id);
    }

    // 1. Find or create header
    if (!targetHeaderId || targetHeaderId === 0) {
      const existingHeader = await client.query(
        `SELECT id FROM monthentryheader 
         WHERE monthname = $1 AND yearname = $2 AND empid = $3 AND ledgrpid = $4 AND isdeleted = 'NO' 
         LIMIT 1;`,
        [monthName, yearName, resolvedEmpId, ledGrpId]
      );
      if (existingHeader.rows.length > 0) {
        targetHeaderId = existingHeader.rows[0].id;
      } else {
        const newHeader = await client.query(
          `INSERT INTO monthentryheader 
           (monthname, yearname, empid, ledgrpid, enterby, createdon, isdeleted, opbalance, issuedqty) 
           VALUES ($1, $2, $3, $4, $5, NOW(), 'NO', 0, 0) 
           RETURNING id;`,
          [monthName, yearName, resolvedEmpId, ledGrpId, enterBy]
        );
        targetHeaderId = newHeader.rows[0].id;
      }
    }

    // Days array
    const days = [
      normalizeNum(d1), normalizeNum(d2), normalizeNum(d3), normalizeNum(d4), normalizeNum(d5),
      normalizeNum(d6), normalizeNum(d7), normalizeNum(d8), normalizeNum(d9), normalizeNum(d10),
      normalizeNum(d11), normalizeNum(d12), normalizeNum(d13), normalizeNum(d14), normalizeNum(d15),
      normalizeNum(d16), normalizeNum(d17), normalizeNum(d18), normalizeNum(d19), normalizeNum(d20),
      normalizeNum(d21), normalizeNum(d22), normalizeNum(d23), normalizeNum(d24), normalizeNum(d25),
      normalizeNum(d26), normalizeNum(d27), normalizeNum(d28), normalizeNum(d29), normalizeNum(d30),
      normalizeNum(d31),
    ];

    let targetDetailId = normalizeNum(detailId, 0);

    // 2. Check if detail exists by header, lot, and processId if detailId not specified
    if (!targetDetailId || targetDetailId === 0) {
      const existingDetail = await client.query(
        `SELECT id FROM monthentrydetail 
         WHERE headerid = $1 AND TRIM(lotno) = TRIM($2) AND processid = $3 AND isdeleted = 'NO' 
         LIMIT 1;`,
        [targetHeaderId, lotNo, processId]
      );
      if (existingDetail.rows.length > 0) {
        targetDetailId = existingDetail.rows[0].id;
      }
    }

    // 2.5 Pieces on this step can't go over what the step received
    const pieceError = await checkDailyPieces(
      client, normalizeStr(lotNo), normalizeNum(processId, 0), days, targetDetailId > 0 ? [targetDetailId] : []
    );
    if (pieceError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: pieceError });
    }

    let savedDetailId;
    if (targetDetailId && targetDetailId > 0) {
      // Update existing detail
      const updRes = await client.query(
        `UPDATE monthentrydetail 
         SET lotno = $1, processid = $2, processname = $3,
             d1 = $4, d2 = $5, d3 = $6, d4 = $7, d5 = $8, d6 = $9, d7 = $10,
             d8 = $11, d9 = $12, d10 = $13, d11 = $14, d12 = $15, d13 = $16, d14 = $17,
             d15 = $18, d16 = $19, d17 = $20, d18 = $21, d19 = $22, d20 = $23, d21 = $24,
             d22 = $25, d23 = $26, d24 = $27, d25 = $28, d26 = $29, d27 = $30, d28 = $31,
             d29 = $32, d30 = $33, d31 = $34,
             remark = $35, alterby = $36, alteredon = NOW()
         WHERE id = $37 AND isdeleted = 'NO'
         RETURNING id;`,
        [
          lotNo, processId, normalizeStr(processName),
          ...days,
          normalizeStr(remark), enterBy, targetDetailId
        ]
      );
      savedDetailId = updRes.rows[0]?.id || targetDetailId;
    } else {
      // Insert new detail
      const insRes = await client.query(
        `INSERT INTO monthentrydetail 
         (headerid, lotno, processid, processname,
          d1, d2, d3, d4, d5, d6, d7, d8, d9, d10,
          d11, d12, d13, d14, d15, d16, d17, d18, d19, d20,
          d21, d22, d23, d24, d25, d26, d27, d28, d29, d30, d31,
          enterby, createdon, isdeleted, remark, opbalance, issuedqty)
         VALUES 
         ($1, $2, $3, $4,
          $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
          $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35,
          $36, NOW(), 'NO', $37, 0, 0)
         RETURNING id;`,
        [
          targetHeaderId, lotNo, processId, normalizeStr(processName),
          ...days,
          enterBy, normalizeStr(remark)
        ]
      );
      savedDetailId = insRes.rows[0].id;
    }

    await client.query('COMMIT');
    return res.status(200).json({
      success: true,
      headerId: targetHeaderId,
      detailId: savedDetailId,
      message: 'Data Saved Successfully',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/**
 * Rights for saving a whole month sheet (Daily Process Entry grid):
 *   new rows need "create", saved rows whose lot/operation/days/remark changed need "edit",
 *   rows removed from the sheet need "delete". Rows saved again unchanged need nothing.
 * Returns an error message, or null if fine.
 */
async function checkSheetRights(user, rows, deletedRowIds) {
  const screen = 'transactions.dailyEntry';
  const list = (Array.isArray(rows) ? rows : []).filter(
    (r) => normalizeStr(r.lotNo) && normalizeStr(r.lotNo) !== '--Select--' && normalizeNum(r.processId, 0)
  );

  if (list.some((r) => !normalizeNum(r.id, 0)) && !can(user, screen, 'create')) {
    return noRightMessage(screen, 'create');
  }

  const removed = (Array.isArray(deletedRowIds) ? deletedRowIds : []).map((n) => parseInt(n, 10)).filter((n) => n > 0);
  if (removed.length > 0 && !can(user, screen, 'delete')) {
    return noRightMessage(screen, 'delete');
  }

  const savedIds = list.map((r) => normalizeNum(r.id, 0)).filter((n) => n > 0);
  if (savedIds.length > 0 && !can(user, screen, 'edit')) {
    const savedRes = await query(
      `SELECT * FROM monthentrydetail WHERE id = ANY($1::bigint[]) AND isdeleted = 'NO';`,
      [savedIds]
    );
    for (const r of list.filter((x) => normalizeNum(x.id, 0) > 0)) {
      const saved = savedRes.rows.find((x) => Number(x.id) === normalizeNum(r.id, 0));
      let changed = !saved
        || normalizeStr(saved.lotno).toLowerCase() !== normalizeStr(r.lotNo).toLowerCase()
        || Number(saved.processid) !== normalizeNum(r.processId, 0)
        || normalizeStr(saved.remark) !== normalizeStr(r.remark);
      for (let d = 1; d <= 31 && !changed; d++) {
        changed = normalizeNum(saved[`d${d}`], 0) !== normalizeNum(r[`d${d}`], 0);
      }
      if (changed) return noRightMessage(screen, 'edit');
    }
  }
  return null;
}

/**
 * POST /api/transactions/daily-entry/save-matrix
 * Save entire multi-row daily work matrix for an employee (header + all operation rows)
 * Matching legacy DailyOpEntry.aspx Button2_Click
 */
router.post('/daily-entry/save-matrix', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      headerId,
      monthName,
      yearName,
      empId,
      ledGrpId,
      rows,
      deletedRowIds,
    } = req.body;

    if (!monthName || monthName === '--Select--' || !yearName || !empId || !ledGrpId) {
      return res.status(400).json({ message: 'Please Enter * Mandatory Fields' });
    }

    const rightError = await checkSheetRights(req.user, rows, deletedRowIds);
    if (rightError) {
      return res.status(403).json({ message: rightError });
    }

    const enterBy = req.user?.username || 'admin@gmail.com';
    await client.query('BEGIN');

    let targetHeaderId = normalizeNum(headerId, 0);

    // Resolve operator primary key ID in case an empcode string was passed
    let resolvedEmpId = normalizeNum(empId, 0);
    const opLookup = await client.query(
      `SELECT id FROM operatormaster WHERE id = $1 OR empcode = $2 LIMIT 1;`,
      [resolvedEmpId, String(empId).trim()]
    );
    if (opLookup.rows.length > 0) {
      resolvedEmpId = Number(opLookup.rows[0].id);
    }

    // 1. Find or create header
    if (!targetHeaderId || targetHeaderId === 0) {
      const existingHeader = await client.query(
        `SELECT id FROM monthentryheader 
         WHERE monthname = $1 AND yearname = $2 AND empid = $3 AND ledgrpid = $4 AND isdeleted = 'NO' 
         LIMIT 1;`,
        [monthName, yearName, resolvedEmpId, ledGrpId]
      );
      if (existingHeader.rows.length > 0) {
        targetHeaderId = existingHeader.rows[0].id;
      } else {
        const insHdr = await client.query(
          `INSERT INTO monthentryheader 
           (monthname, yearname, empid, ledgrpid, enterby, createdon, isdeleted, opbalance, issuedqty) 
           VALUES ($1, $2, $3, $4, $5, NOW(), 'NO', 0, 0) RETURNING id;`,
          [monthName, yearName, resolvedEmpId, ledGrpId, enterBy]
        );
        targetHeaderId = insHdr.rows[0].id;
      }
    } else {
      await client.query(
        `UPDATE monthentryheader 
         SET monthname = $1, yearname = $2, empid = $3, ledgrpid = $4, alterby = $5, alteredon = NOW() 
         WHERE id = $6;`,
        [monthName, yearName, resolvedEmpId, ledGrpId, enterBy, targetHeaderId]
      );
    }

    // 2. Soft-delete any removed rows (their lot + operation are checked below like any other change)
    const removedLotOps = [];
    if (Array.isArray(deletedRowIds) && deletedRowIds.length > 0) {
      const validIds = deletedRowIds.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n > 0);
      if (validIds.length > 0) {
        const removedRes = await client.query(
          `SELECT lotno, processid FROM monthentrydetail
           WHERE headerid = $1 AND id = ANY($2::bigint[]) AND isdeleted = 'NO';`,
          [targetHeaderId, validIds]
        );
        removedLotOps.push(...removedRes.rows);
        await client.query(
          `UPDATE monthentrydetail 
           SET isdeleted = 'YES', alterby = $1, alteredon = NOW() 
           WHERE headerid = $2 AND id = ANY($3::bigint[]);`,
          [enterBy, targetHeaderId, validIds]
        );
      }
    }

    // 2.5 Check every lot + operation this save touches (same rules as the one-row form).
    // Rows of the same lot + operation in this sheet are added together first.
    const groups = new Map(); // "LOT||operationId" -> { lotNo, operationId, days[31] }
    const payloadDetailIds = [];
    for (const r of Array.isArray(rows) ? rows : []) {
      const rowLot = normalizeStr(r.lotNo);
      const rowOpId = normalizeNum(r.processId, 0);
      if (!rowLot || rowLot === '--Select--' || !rowOpId) continue;

      const rowDetailId = normalizeNum(r.id, 0);
      if (rowDetailId > 0) payloadDetailIds.push(rowDetailId);

      const key = `${rowLot.toUpperCase()}||${rowOpId}`;
      const group = groups.get(key) || { lotNo: rowLot, operationId: rowOpId, days: new Array(31).fill(0) };
      for (let d = 1; d <= 31; d++) {
        const val = normalizeNum(r[`d${d}`], 0);
        if (val < 0 || !Number.isInteger(val)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: `Lot ${rowLot}, day ${d}: pieces must be whole numbers (0 or more).` });
        }
        group.days[d - 1] += val;
      }
      groups.set(key, group);
    }

    // Rows removed from the grid lose their pieces, so their lot + operation is checked too.
    for (const removed of removedLotOps) {
      const key = `${normalizeStr(removed.lotno).toUpperCase()}||${removed.processid}`;
      if (!groups.has(key)) {
        groups.set(key, { lotNo: normalizeStr(removed.lotno), operationId: Number(removed.processid), days: new Array(31).fill(0) });
      }
    }

    // Lock each lot (always in the same order) so parallel saves can't both use the same pieces.
    const lotsToLock = [...new Set([...groups.values()].map((g) => g.lotNo.toLowerCase()))].sort();
    for (const lot of lotsToLock) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1));`, [lot]);
    }

    for (const group of groups.values()) {
      const pieceError = await checkDailyPieces(client, group.lotNo, group.operationId, group.days, payloadDetailIds);
      if (pieceError) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: pieceError });
      }
    }

    // 3. Insert or update each row
    if (Array.isArray(rows) && rows.length > 0) {
      for (const r of rows) {
        const rowLot = normalizeStr(r.lotNo);
        const rowProcessId = normalizeNum(r.processId, 0);
        if (!rowLot || rowLot === '--Select--' || !rowProcessId || rowProcessId === 0) {
          continue;
        }

        const days = [];
        for (let d = 1; d <= 31; d++) {
          days.push(normalizeNum(r[`d${d}`], 0));
        }

        const rowDetailId = normalizeNum(r.id, 0);
        if (rowDetailId > 0) {
          await client.query(
            `UPDATE monthentrydetail 
             SET lotno = $1, processid = $2, processname = $3,
                 d1=$4, d2=$5, d3=$6, d4=$7, d5=$8, d6=$9, d7=$10,
                 d8=$11, d9=$12, d10=$13, d11=$14, d12=$15, d13=$16, d14=$17,
                 d15=$18, d16=$19, d17=$20, d18=$21, d19=$22, d20=$23, d21=$24,
                 d22=$25, d23=$26, d24=$27, d25=$28, d26=$29, d27=$30, d28=$31,
                 d29=$32, d30=$33, d31=$34,
                 remark = $35, alterby = $36, alteredon = NOW()
             WHERE id = $37 AND isdeleted = 'NO';`,
            [
              rowLot, rowProcessId, normalizeStr(r.processName),
              ...days,
              normalizeStr(r.remark), enterBy, rowDetailId
            ]
          );
        } else {
          // Check if exists for same header, lot, and process
          const dup = await client.query(
            `SELECT id FROM monthentrydetail 
             WHERE headerid = $1 AND TRIM(lotno) = TRIM($2) AND processid = $3 AND isdeleted = 'NO' LIMIT 1;`,
            [targetHeaderId, rowLot, rowProcessId]
          );
          if (dup.rows.length > 0) {
            await client.query(
              `UPDATE monthentrydetail 
               SET lotno = $1, processid = $2, processname = $3,
                   d1=$4, d2=$5, d3=$6, d4=$7, d5=$8, d6=$9, d7=$10,
                   d8=$11, d9=$12, d10=$13, d11=$14, d12=$15, d13=$16, d14=$17,
                   d15=$18, d16=$19, d17=$20, d18=$21, d19=$22, d20=$23, d21=$24,
                   d22=$25, d23=$26, d24=$27, d25=$28, d26=$29, d27=$30, d28=$31,
                   d29=$32, d30=$33, d31=$34,
                   remark = $35, alterby = $36, alteredon = NOW()
               WHERE id = $37;`,
              [
                rowLot, rowProcessId, normalizeStr(r.processName),
                ...days,
                normalizeStr(r.remark), enterBy, dup.rows[0].id
              ]
            );
          } else {
            await client.query(
              `INSERT INTO monthentrydetail 
               (headerid, lotno, processid, processname,
                d1, d2, d3, d4, d5, d6, d7, d8, d9, d10,
                d11, d12, d13, d14, d15, d16, d17, d18, d19, d20,
                d21, d22, d23, d24, d25, d26, d27, d28, d29, d30, d31,
                enterby, createdon, isdeleted, remark, opbalance, issuedqty) 
               VALUES 
               ($1, $2, $3, $4,
                $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
                $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35,
                $36, NOW(), 'NO', $37, 0, 0);`,
              [
                targetHeaderId, rowLot, rowProcessId, normalizeStr(r.processName),
                ...days,
                enterBy, normalizeStr(r.remark)
              ]
            );
          }
        }
      }
    }

    await client.query('COMMIT');
    return res.status(200).json({
      success: true,
      headerId: targetHeaderId,
      message: 'Data Saved Successfully',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/**
 * Soft-delete daily entry rows after checking that each lot + operation keeps enough pieces
 * for what that step already sent ahead. Used by both delete routes below.
 *   rowsWhere = SQL condition picking the rows, e.g. 'id = $1' or 'headerid = $1'
 * Returns { status, body } to send back.
 */
async function deleteDailyRows(client, rowsWhere, param, alterBy) {
  const rowsRes = await client.query(
    `SELECT id, headerid, lotno, processid FROM monthentrydetail WHERE ${rowsWhere} AND isdeleted = 'NO';`,
    [param]
  );
  const rowIds = rowsRes.rows.map((r) => Number(r.id));

  // One check per lot + operation, with every row being deleted left out.
  const lotOps = new Map();
  for (const r of rowsRes.rows) lotOps.set(`${normalizeStr(r.lotno).toLowerCase()}||${r.processid}`, r);
  const lots = [...new Set(rowsRes.rows.map((r) => normalizeStr(r.lotno).toLowerCase()))].sort();
  for (const lot of lots) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1));`, [lot]);
  }
  for (const r of lotOps.values()) {
    const error = await checkDailyPieces(client, normalizeStr(r.lotno), Number(r.processid), new Array(31).fill(0), rowIds);
    if (error) return { status: 400, body: { message: error } };
  }

  if (rowIds.length > 0) {
    await client.query(
      `UPDATE monthentrydetail SET isdeleted = 'YES', alterby = $1, alteredon = NOW() WHERE id = ANY($2::bigint[]);`,
      [alterBy, rowIds]
    );
  }
  return { status: 200, body: { success: true, rowIds, headerId: rowsRes.rows[0]?.headerid } };
}

/**
 * DELETE /api/transactions/daily-entry/detail/:id
 * Soft delete a single detail row (blocked if its step already sent those pieces ahead)
 *
 * No screen uses this any more (the "Daily Process Entry New" screen was removed).
 * Kept, admin only, because the automated test (scripts/test-production-flow.mjs) uses it
 * to put work entries in quickly.
 */
router.delete('/daily-entry/detail/:id', requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const alterBy = req.user?.username || 'admin@gmail.com';
    await client.query('BEGIN');
    const result = await deleteDailyRows(client, 'id = $1', id, alterBy);
    if (result.status !== 200) {
      await client.query('ROLLBACK');
      return res.status(result.status).json(result.body);
    }
    if (result.body.rowIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Detail row not found or already deleted' });
    }
    await client.query('COMMIT');
    res.json({ success: true, id, headerId: result.body.headerId, message: 'Record deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/**
 * GET /api/transactions/daily-entry/list
 * Paginated list for Process Entry Report (DailyWorkRntryRpt.aspx)
 */
router.get('/daily-entry/list', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const { search, year, month, groupId } = req.query;

    const conditions = ["h.isdeleted = 'NO'"];
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      conditions.push(
        `(o.operatorname ILIKE $${pIdx} OR o.empcode ILIKE $${pIdx} OR g.ledgrpname ILIKE $${pIdx} OR h.monthname ILIKE $${pIdx})`
      );
    }

    if (year && year.trim()) {
      if (!/^\d{4}$/.test(year.trim())) {
        return res.status(400).json({ message: 'Year must be 4 digits, e.g. 2026.' });
      }
      params.push(year.trim());
      conditions.push(`h.yearname = $${params.length}`);
    }

    if (month && month.trim() && month !== '--Select--') {
      params.push(month.trim());
      conditions.push(`TRIM(h.monthname) ILIKE $${params.length}`);
    }

    if (groupId && groupId.trim() && groupId !== '--Select--') {
      params.push(groupId.trim());
      conditions.push(`h.ledgrpid = $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Total count query
    const countSql = `
      SELECT COUNT(*) AS total
      FROM monthentryheader h
      INNER JOIN ledgergroup g ON h.ledgrpid = g.id
      INNER JOIN operatormaster o ON h.empid = o.id
      ${whereClause};
    `;
    const countRes = await query(countSql, params);
    const totalCount = parseInt(countRes.rows[0].total, 10);

    // Data query
    const dataSql = `
      SELECT 
        h.id, 
        h.monthname, 
        h.yearname, 
        o.operatorname, 
        o.empcode, 
        g.ledgrpname, 
        COUNT(d.id) AS totalprocess,
        COALESCE(SUM(d.d1+d.d2+d.d3+d.d4+d.d5+d.d6+d.d7+d.d8+d.d9+d.d10+
                     d.d11+d.d12+d.d13+d.d14+d.d15+d.d16+d.d17+d.d18+d.d19+d.d20+
                     d.d21+d.d22+d.d23+d.d24+d.d25+d.d26+d.d27+d.d28+d.d29+d.d30+d.d31), 0) AS totalqty
      FROM monthentryheader h
      INNER JOIN ledgergroup g ON h.ledgrpid = g.id
      INNER JOIN operatormaster o ON h.empid = o.id
      LEFT JOIN monthentrydetail d ON h.id = d.headerid AND d.isdeleted = 'NO'
      ${whereClause}
      GROUP BY h.id, h.monthname, h.yearname, o.operatorname, o.empcode, g.ledgrpname
      ORDER BY h.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2};
    `;

    const dataRes = await query(dataSql, [...params, limit, offset]);

    res.json({
      data: dataRes.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/transactions/daily-entry/header/:id
 * Soft delete an entire header and all its child details
 */
router.delete('/daily-entry/header/:id', requireRight('transactions.dailyEntry', 'delete'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const alterBy = req.user?.username || 'admin@gmail.com';
    await client.query('BEGIN');

    // Delete the sheet's rows first (blocked if any of its steps already sent those pieces ahead)
    const result = await deleteDailyRows(client, 'headerid = $1', id, alterBy);
    if (result.status !== 200) {
      await client.query('ROLLBACK');
      return res.status(result.status).json(result.body);
    }

    const delHeader = await client.query(
      `UPDATE monthentryheader SET isdeleted = 'YES', alterby = $1, alteredon = NOW() 
       WHERE id = $2 AND isdeleted = 'NO' RETURNING id;`,
      [alterBy, id]
    );
    if (delHeader.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Process entry not found or already deleted' });
    }

    await client.query('COMMIT');
    return res.status(200).json({
      success: true,
      id,
      message: 'Record deleted successfully',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ============================================================================
// MATERIAL ISSUE MODULE (pieces moving from step to step)
// ============================================================================
//
// How it works:
//   * A lot moves through the steps set in Lot Operation Map (Step No. 1, 3, 4 ...).
//     "The step before" is the next lower Step No. that exists, so gaps are fine.
//   * Each material_issue row is ONE SLIP: "this step sent N pcs ahead to the next step".
//       material_issue.operation_id = the step (operation) that SENT the pieces
//       material_issue.issued_qty   = how many pieces it sent
//   * No totals are stored. Every number on screen is added up from the slips and daily entries:
//       Received        = first step: the lot's Cut Qty. Other steps: what the step before sent ahead.
//       Done by workers = pieces logged on this step in Daily Process Entry (all workers, all months)
//       Sent ahead      = total of this step's slips
//       Available       = Done by workers - Sent ahead   (a step can only pass on finished pieces)
//   * Pieces sent ahead by the LAST step are finished.

/**
 * Load a lot and its steps with Received / Done by workers / Sent ahead / Available.
 * This is the only place these numbers are worked out; the screen and every save check use it.
 * Returns null if the lot doesn't exist.
 */
async function getLotSteps(db, lotNo) {
  const lotRes = await db.query(
    `SELECT id, joborderno, TO_CHAR(joborderdate, 'YYYY-MM-DD') AS joborderdate,
            custorderno, TO_CHAR(custorderdate, 'YYYY-MM-DD') AS custorderdate, totalqtypcs,
            fabriclotno, fabricdtls, COALESCE(cutqty, 0) AS cutqty, style, custdtl,
            COALESCE(lotclosed, 'No') AS lotclosed
     FROM joborderbooking
     WHERE LOWER(TRIM(fabriclotno)) = LOWER(TRIM($1)) AND isdeleted = 'NO'
     ORDER BY id DESC LIMIT 1;`,
    [lotNo]
  );
  if (lotRes.rows.length === 0) return null;
  const lot = lotRes.rows[0];

  const stepsRes = await db.query(
    `SELECT
       jo.stepno,
       jo.operations AS operation_id,
       jo.processid,
       jo.rate,
       COALESCE(op.operations, 'Operation #' || jo.operations) AS operation_name,
       COALESCE(sc.stkcategoryname, '') AS process_name,
       (SELECT COALESCE(SUM(mi.issued_qty), 0)
          FROM material_issue mi
         WHERE LOWER(TRIM(mi.lotno)) = LOWER(TRIM(jo.batchname))
           AND mi.operation_id = jo.operations
           AND mi.isdeleted = 'NO') AS sent,
       (SELECT COALESCE(SUM(d.d1+d.d2+d.d3+d.d4+d.d5+d.d6+d.d7+d.d8+d.d9+d.d10+d.d11+d.d12+d.d13+d.d14+d.d15+d.d16+
                            d.d17+d.d18+d.d19+d.d20+d.d21+d.d22+d.d23+d.d24+d.d25+d.d26+d.d27+d.d28+d.d29+d.d30+d.d31), 0)
          FROM monthentrydetail d
         WHERE LOWER(TRIM(d.lotno)) = LOWER(TRIM(jo.batchname))
           AND d.processid = jo.operations
           AND d.isdeleted = 'NO') AS done
     FROM joborder_operations jo
     LEFT JOIN operationrate op ON op.id = jo.operations
     LEFT JOIN stkcategory sc ON sc.id = jo.processid
     WHERE LOWER(TRIM(jo.batchname)) = LOWER(TRIM($1)) AND jo.isdeleted = 'NO'
     ORDER BY jo.stepno, jo.id;`,
    [lotNo]
  );

  // Walk the steps in order: each step receives what the step before it sent ahead.
  let received = parseFloat(lot.cutqty) || 0;
  const steps = stepsRes.rows.map((row) => {
    const sent = parseFloat(row.sent) || 0;
    const done = parseFloat(row.done) || 0;
    const step = {
      ...row,
      rate: parseFloat(row.rate) || 0,
      received,
      done,
      sent,
      // Daily Process Entry keeps done <= received; Math.min is only a safety net.
      // Never below 0 (old slips made before workers were logged could otherwise show negative).
      available: Math.max(0, Math.min(done, received) - sent),
    };
    received = sent;
    return step;
  });

  return { lot, steps };
}

/**
 * Check one slip being added, edited or deleted.
 *   oldQty = the slip's current qty (0 for a new slip)
 *   newQty = the slip's qty after the change (0 for a delete)
 * Rule 1: a step can only send ahead pieces its workers have finished (Done by workers).
 * Rule 2: a step can't take back pieces the next step has already used
 *         (logged by its workers in Daily Process Entry, or sent further ahead).
 * Returns an error message, or null if the change is fine.
 */
function checkSlipChange(steps, operationId, oldQty, newQty) {
  const i = steps.findIndex((s) => String(s.operation_id) === String(operationId));
  if (i === -1) {
    return 'This operation is not mapped to the lot in Lot Operation Map.';
  }
  const step = steps[i];
  const next = steps[i + 1];
  const sentByOtherSlips = step.sent - oldQty;

  const maxAllowed = Math.min(step.done, step.received) - sentByOtherSlips;
  if (newQty > maxAllowed) {
    return `Only ${Math.max(0, maxAllowed)} pcs can be sent ahead from Step ${step.stepno} (${step.operation_name}): ` +
      `workers have finished ${step.done} of the ${step.received} pcs it received, and ${sentByOtherSlips} are already sent.`;
  }

  if (next) {
    const nextUsed = Math.max(next.done, next.sent);
    const minAllowed = nextUsed - sentByOtherSlips;
    if (newQty < minAllowed) {
      const why = next.done >= next.sent
        ? `workers on Step ${next.stepno} (${next.operation_name}) have already logged ${next.done} pcs`
        : `Step ${next.stepno} (${next.operation_name}) has already sent ${next.sent} pcs ahead`;
      return newQty === 0
        ? `This slip can't be deleted: ${why}.`
        : `This slip can't go below ${minAllowed} pcs: ${why}.`;
    }
  }
  return null;
}

/**
 * True if work has started on the lot: any Material Issue slip or any Daily Process Entry row.
 */
async function lotHasWork(db, lotNo) {
  const workRes = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM material_issue
         WHERE LOWER(TRIM(lotno)) = LOWER(TRIM($1)) AND isdeleted = 'NO') +
       (SELECT COUNT(*) FROM monthentrydetail
         WHERE LOWER(TRIM(lotno)) = LOWER(TRIM($1)) AND isdeleted = 'NO') AS work;`,
    [lotNo]
  );
  return parseInt(workRes.rows[0].work, 10) > 0;
}

/**
 * Where a lot is already used: its Lot Operation Map, Material Issue slips, Daily Process Entry rows.
 * Each one counts as a transaction: the lot can't be deleted, and its Job Order's order details
 * (Buyer, Style, Product, Total Order Qty, Customer Order) can't be changed any more.
 * Returns e.g. ['Lot Operation Map', 'Daily Process Entry'], or [] when the lot isn't used yet.
 */
async function lotUsedIn(db, lotNo) {
  const res = await db.query(
    `SELECT
       EXISTS (SELECT 1 FROM operationmappingheader WHERE LOWER(TRIM(lotno)) = LOWER(TRIM($1)) AND isdeleted = 'NO')
         OR EXISTS (SELECT 1 FROM joborder_operations WHERE LOWER(TRIM(batchname)) = LOWER(TRIM($1)) AND isdeleted = 'NO') AS map,
       EXISTS (SELECT 1 FROM material_issue WHERE LOWER(TRIM(lotno)) = LOWER(TRIM($1)) AND isdeleted = 'NO') AS slips,
       EXISTS (SELECT 1 FROM monthentrydetail WHERE LOWER(TRIM(lotno)) = LOWER(TRIM($1)) AND isdeleted = 'NO') AS work;`,
    [lotNo]
  );
  const used = res.rows[0];
  return [used.map && 'Lot Operation Map', used.slips && 'Material Issue', used.work && 'Daily Process Entry'].filter(Boolean);
}

/**
 * The first lot of a Job Order that is already used (see lotUsedIn), or null if none of its lots is.
 * Returns { lotno, usedIn }.
 */
async function jobOrderInUse(db, joborderno) {
  const lots = await db.query(
    `SELECT fabriclotno FROM joborderbooking
     WHERE LOWER(TRIM(joborderno)) = LOWER(TRIM($1)) AND isdeleted = 'NO' ORDER BY id;`,
    [joborderno]
  );
  for (const { fabriclotno } of lots.rows) {
    const usedIn = await lotUsedIn(db, fabriclotno);
    if (usedIn.length > 0) return { lotno: String(fabriclotno).trim(), usedIn };
  }
  return null;
}

/**
 * Product Details made by the Job Order form read "[Lot] Buyer # Style # Product".
 * When the order's Buyer / Style / Product change, a lot's details follow along (the [Lot] part is kept),
 * but only if they still read that way. Returns the new details, or null to leave them as they are
 * (empty, or typed by hand).
 */
const detailsTail = (buyer, style, product) => `${buyer} # ${style} # ${product}`;
function followProductDetails(details, oldTail, newTail) {
  const m = /^(\[[^\]]*\])\s*(.*)$/.exec(String(details || '').trim());
  if (!m || m[2].trim() !== oldTail.trim()) return null;
  return `${m[1]} ${newTail}`.trim();
}

/**
 * Once work has started on a lot (Material Issue slips or Daily Process Entry rows), its existing
 * steps are fixed: they can't be removed, renumbered or changed to another operation
 * (that would scramble pieces already moved or orphan workers' entries).
 * New operations can still be added after the last step.
 * `operations` is the grid being saved ([] when deleting the whole mapping).
 * Returns an error message, or null if the change is fine.
 */
async function checkStepsLocked(db, lotNo, operations) {
  if (!(await lotHasWork(db, lotNo))) return null;

  const existingRes = await db.query(
    `SELECT operations, stepno FROM joborder_operations
     WHERE LOWER(TRIM(batchname)) = LOWER(TRIM($1)) AND isdeleted = 'NO';`,
    [lotNo]
  );
  const existing = existingRes.rows;
  const lastStep = Math.max(0, ...existing.map((r) => r.stepno || 0));
  const message = `Work has started on Lot ${lotNo} (Material Issue or Daily Process Entry), so its steps can't be removed, renumbered or changed. You can only add new operations after Step ${lastStep}.`;

  const kept = (operations || []).filter((op) => op.processid && op.operations && normalizeNum(op.rate, 0) > 0);

  // Every existing step must still be there with the same operation and Step No.
  for (const old of existing) {
    const stillThere = kept.some(
      (op) => String(op.operations) === String(old.operations) && parseInt(op.stepno, 10) === old.stepno
    );
    if (!stillThere) return message;
  }

  // Any new operation must come after the last existing step.
  for (const op of kept) {
    const isNew = !existing.some((old) => String(old.operations) === String(op.operations));
    if (isNew && parseInt(op.stepno, 10) <= lastStep) return message;
  }
  return null;
}

/**
 * GET /api/transactions/material-issue/active-lots
 * Return all open, non-deleted lots with cut quantity and styling details
 */
router.get('/material-issue/active-lots', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
         id,
         fabriclotno,
         joborderno,
         joborderdate,
         style,
         COALESCE(cutqty, 0) AS cutqty,
         totalqtypcs,
         fabricdtls,
         custdtl
       FROM joborderbooking
       WHERE UPPER(TRIM(COALESCE(isdeleted, 'NO'))) != 'YES'
         AND UPPER(TRIM(COALESCE(lotclosed, 'NO'))) != 'YES'
       ORDER BY TRIM(fabriclotno) ASC, id DESC;`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transactions/material-issue/lot-details/:lotNo
 * Return the lot and its steps with Received / Sent ahead / Available
 */
router.get('/material-issue/lot-details/:lotNo', async (req, res, next) => {
  try {
    const result = await getLotSteps(pool, req.params.lotNo);
    if (!result) {
      return res.status(404).json({ message: 'Active lot not found' });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/transactions/material-issue/save
 * Save one slip: "Step X sent N pcs ahead".
 * Body: { lotNo, operationId, qty, issueDate, remark }
 */
router.post('/material-issue/save', requireRight('transactions.materialIssue', 'create'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const lotNo = normalizeStr(req.body.lotNo);
    const operationId = normalizeNum(req.body.operationId, 0);
    const qty = normalizeNum(req.body.qty, 0);
    const issueDate = normalizeDate(req.body.issueDate) || new Date().toISOString().slice(0, 10);
    const remark = normalizeStr(req.body.remark);
    const enterBy = req.user?.username || 'admin@gmail.com';

    if (!lotNo || !operationId) {
      return res.status(400).json({ message: 'Please select a Lot and a Step.' });
    }
    if (qty <= 0) {
      return res.status(400).json({ message: 'Please enter how many pieces to send ahead.' });
    }
    if (!Number.isInteger(qty)) {
      return res.status(400).json({ message: 'Pieces must be a whole number.' });
    }

    // Lock this lot so two saves at the same moment can't both use the same pieces.
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext(LOWER($1)));`, [lotNo]);

    const lotSteps = await getLotSteps(client, lotNo);
    if (!lotSteps) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Lot not found or deleted.' });
    }
    if (lotSteps.lot.lotclosed.toLowerCase() === 'yes') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Lot ${lotSteps.lot.fabriclotno} is closed. Re-open it in Job Order Booking to send pieces.` });
    }

    const error = checkSlipChange(lotSteps.steps, operationId, 0, qty);
    if (error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: error });
    }

    const step = lotSteps.steps.find((s) => String(s.operation_id) === String(operationId));
    const nextIdRes = await client.query(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM material_issue;`);
    const issueNo = `ISS-${issueDate.slice(0, 4)}-${String(nextIdRes.rows[0].next_id).padStart(4, '0')}`;

    await client.query(
      `INSERT INTO material_issue
       (issue_no, issue_date, joborderid, lotno, processid, operation_id, rate, cut_qty, issued_qty, remark, enterby, createdon, isdeleted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), 'NO');`,
      [
        issueNo,
        issueDate,
        lotSteps.lot.id,
        lotSteps.lot.fabriclotno,
        step.processid,
        operationId,
        step.rate,
        lotSteps.lot.cutqty,
        qty,
        remark,
        enterBy,
      ]
    );
    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      issue_no: issueNo,
      message: `Slip ${issueNo} saved: Step ${step.stepno} (${step.operation_name}) sent ${qty} pcs ahead.`,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/**
 * GET /api/transactions/material-issue/list
 * All slips, newest first, with search and lot filtering
 */
router.get('/material-issue/list', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const offset = (page - 1) * limit;

    const { search, lotNo, fromDate, toDate } = req.query;

    const conditions = ["mi.isdeleted = 'NO'"];
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      conditions.push(`(mi.lotno ILIKE $${pIdx} OR jb.joborderno ILIKE $${pIdx} OR op.operations ILIKE $${pIdx} OR sc.stkcategoryname ILIKE $${pIdx})`);
    }

    if (lotNo && lotNo.trim() && lotNo !== '--Select--') {
      params.push(lotNo.trim());
      conditions.push(`TRIM(mi.lotno) = TRIM($${params.length})`);
    }

    if (fromDate && fromDate.trim()) {
      params.push(normalizeDate(fromDate));
      conditions.push(`mi.issue_date >= $${params.length}`);
    }

    if (toDate && toDate.trim()) {
      params.push(normalizeDate(toDate));
      conditions.push(`mi.issue_date <= $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countSql = `
      SELECT COUNT(mi.id) AS total
      FROM material_issue mi
      LEFT JOIN joborderbooking jb ON mi.joborderid = jb.id
      LEFT JOIN operationrate op ON mi.operation_id = op.id
      LEFT JOIN stkcategory sc ON op.processid = sc.id
      ${whereClause};
    `;
    const countRes = await query(countSql, params);
    const totalCount = parseInt(countRes.rows[0].total, 10) || 0;

    const dataSql = `
      SELECT
        mi.id,
        mi.issue_no,
        TO_CHAR(mi.issue_date, 'YYYY-MM-DD') AS issue_date,
        mi.lotno,
        mi.joborderid,
        jb.joborderno,
        jb.style,
        mi.operation_id,
        (SELECT jo.stepno FROM joborder_operations jo
          WHERE LOWER(TRIM(jo.batchname)) = LOWER(TRIM(mi.lotno))
            AND jo.operations = mi.operation_id AND jo.isdeleted = 'NO'
          LIMIT 1) AS stepno,
        COALESCE(op.operations, 'Operation #' || mi.operation_id) AS operation_name,
        COALESCE(sc.stkcategoryname, '') AS process_name,
        mi.issued_qty AS qty,
        COALESCE(mi.remark, '') AS remark,
        mi.enterby,
        mi.createdon
      FROM material_issue mi
      LEFT JOIN joborderbooking jb ON mi.joborderid = jb.id
      LEFT JOIN operationrate op ON mi.operation_id = op.id
      LEFT JOIN stkcategory sc ON op.processid = sc.id
      ${whereClause}
      ORDER BY mi.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2};
    `;

    const dataRes = await query(dataSql, [...params, limit, offset]);

    res.json({
      data: dataRes.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Shared by edit and delete: change one slip's qty (0 = delete) after checking the rules.
 */
async function changeSlip(req, res, next, newQty) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const alterBy = req.user?.username || 'admin@gmail.com';

    const slipRes = await client.query(
      `SELECT id, lotno, operation_id, issued_qty FROM material_issue WHERE id = $1 AND isdeleted = 'NO';`,
      [id]
    );
    if (slipRes.rows.length === 0) {
      return res.status(404).json({ message: 'Slip not found or already deleted' });
    }
    const slip = slipRes.rows[0];

    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext(LOWER($1)));`, [slip.lotno]);

    const lotSteps = await getLotSteps(client, slip.lotno);
    const error = lotSteps
      ? checkSlipChange(lotSteps.steps, slip.operation_id, parseFloat(slip.issued_qty) || 0, newQty)
      : null;
    if (error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: error });
    }

    if (newQty === 0) {
      await client.query(
        `UPDATE material_issue SET isdeleted = 'YES', alterby = $1, alteredon = NOW() WHERE id = $2;`,
        [alterBy, id]
      );
    } else {
      await client.query(
        `UPDATE material_issue SET issued_qty = $1, alterby = $2, alteredon = NOW() WHERE id = $3;`,
        [newQty, alterBy, id]
      );
    }
    await client.query('COMMIT');

    return res.json({
      success: true,
      message: newQty === 0 ? 'Slip deleted successfully' : 'Slip updated successfully',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/transactions/material-issue/item/:id
 * Edit a slip's qty. Body: { qty }
 */
router.put('/material-issue/item/:id', requireRight('transactions.materialIssue', 'edit'), async (req, res, next) => {
  const qty = normalizeNum(req.body.qty, 0);
  if (qty <= 0) {
    return res.status(400).json({ message: 'Qty must be more than 0. Use Delete to remove a slip.' });
  }
  if (!Number.isInteger(qty)) {
    return res.status(400).json({ message: 'Pieces must be a whole number.' });
  }
  return changeSlip(req, res, next, qty);
});

/**
 * DELETE /api/transactions/material-issue/item/:id
 * Soft-delete a slip (same rules as editing it to 0)
 */
router.delete('/material-issue/item/:id', requireRight('transactions.materialIssue', 'delete'), async (req, res, next) => {
  return changeSlip(req, res, next, 0);
});

export default router;

