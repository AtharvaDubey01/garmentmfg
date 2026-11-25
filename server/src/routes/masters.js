import express from 'express';
import pool, { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRight, requireViewFor } from '../permissions.js';
import { loginOfEmployee, checkCanTakeAwayLogin } from '../loginRules.js';

const router = express.Router();

// Apply requireAuth to all master routes
router.use(requireAuth);

// Reading master lists needs View on a screen that uses them (e.g. Job Order Booking reads products)
router.use(
  requireViewFor([
    ['/employee-groups', ['masters.employeeGroup', 'masters.employee']],
    ['/units', ['masters.unit', 'masters.product']],
    ['/product-groups', ['masters.productGroup', 'masters.product']],
    ['/process-masters', ['masters.processMaster', 'masters.operations', 'transactions.lotMap']],
    ['/lookups/countries', ['masters.company']],
    ['/lookups/states', ['masters.company']],
    ['/lookups/brands', ['masters.product']],
    ['/lookups/colors', ['masters.product']],
    ['/companies', ['masters.company']],
    ['/employees', ['masters.employee']],
    ['/operations', ['masters.operations', 'transactions.lotMap']],
    ['/products', ['masters.product', 'transactions.jobOrder']],
  ])
);

/**
 * Before deleting a master record: is it still used anywhere?
 * Deleting a record that's in use would make that work disappear from the reports (they skip deleted
 * workers/groups) or leave entries pointing at a deleted record, so it's blocked.
 *   uses = [[screen where it's used, what is counted, SQL counting active rows that use $1], ...]
 * Returns an error message, or null if the record is free to delete.
 */
async function blockIfInUse(id, uses) {
  for (const [where, what, sql] of uses) {
    const result = await query(sql, [id]);
    const count = parseInt(result.rows[0].n, 10) || 0;
    if (count > 0) {
      return `It's still used in ${where} (${count} ${what}), so it can't be deleted.`;
    }
  }
  return null;
}

// What uses each master (only active rows count)
const IN_USE = {
  employeeGroup: [
    ['Employees', 'workers in this group', `SELECT COUNT(*) n FROM operatormaster WHERE empgrp = $1 AND TRIM(isdeleted) = 'NO'`],
    ['Daily Process Entry', 'month sheets', `SELECT COUNT(*) n FROM monthentryheader WHERE ledgrpid = $1 AND TRIM(isdeleted) = 'NO'`],
  ],
  unit: [
    ['Products', 'products', `SELECT COUNT(*) n FROM product WHERE (unit = $1 OR alternateunit = $1) AND TRIM(isdeleted) = 'NO'`],
  ],
  productGroup: [
    ['Products', 'products', `SELECT COUNT(*) n FROM product WHERE stockgroup = $1 AND TRIM(isdeleted) = 'NO'`],
  ],
  processMaster: [
    ['Operations', 'operations', `SELECT COUNT(*) n FROM operationrate WHERE processid = $1 AND TRIM(isdeleted) = 'NO'`],
    ['Lot Operation Map', 'lot steps', `SELECT COUNT(*) n FROM joborder_operations WHERE processid = $1 AND TRIM(isdeleted) = 'NO'`],
    ['Products', 'products', `SELECT COUNT(*) n FROM product WHERE stockcategory = $1 AND TRIM(isdeleted) = 'NO'`],
  ],
  employee: [
    ['Daily Process Entry', 'month sheets', `SELECT COUNT(*) n FROM monthentryheader WHERE empid = $1 AND TRIM(isdeleted) = 'NO'`],
  ],
  operation: [
    ['Lot Operation Map', 'lot steps', `SELECT COUNT(*) n FROM joborder_operations WHERE operations = $1 AND TRIM(isdeleted) = 'NO'`],
    ['Daily Process Entry', 'rows', `SELECT COUNT(*) n FROM monthentrydetail WHERE processid = $1 AND TRIM(isdeleted) = 'NO'`],
    ['Material Issue', 'slips', `SELECT COUNT(*) n FROM material_issue WHERE operation_id = $1 AND TRIM(isdeleted) = 'NO'`],
  ],
  product: [
    ['Job Order Booking', 'lots', `SELECT COUNT(*) n FROM joborderbooking WHERE customerid = $1 AND TRIM(isdeleted) = 'NO'`],
  ],
};

// ============================================================================
// 1. EMPLOYEE GROUP (LedgerGroup)
// ============================================================================

/**
 * GET /api/masters/employee-groups
 * Lists all active Employee Groups (ordered alphabetically by name)
 */
router.get('/employee-groups', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, ledgrpname, isdeleted, createdon, alteredon, enterby, alterby 
       FROM ledgergroup 
       WHERE TRIM(isdeleted) = 'NO' 
       ORDER BY ledgrpname ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching employee groups:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/masters/employee-groups/:id
 */
router.get('/employee-groups/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, ledgrpname 
       FROM ledgergroup 
       WHERE id = $1 AND TRIM(isdeleted) = 'NO';`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Employee Group not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/masters/employee-groups
 * Create new Employee Group with duplicate check
 */
router.post('/employee-groups', requireRight('masters.employeeGroup', 'create'), async (req, res) => {
  const { ledgrpname } = req.body;
  const groupName = (ledgrpname || '').trim();

  if (!groupName) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    // Duplicate check matching LedgerGroup_SP
    const check = await query(
      `SELECT id FROM ledgergroup 
       WHERE LOWER(TRIM(ledgrpname)) = LOWER(TRIM($1)) AND TRIM(isdeleted) = 'NO';`,
      [groupName]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Group Name Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const insertResult = await query(
      `INSERT INTO ledgergroup (ledgrpname, isdeleted, createdon, enterby)
       VALUES ($1, 'NO', NOW(), $2)
       RETURNING id, ledgrpname;`,
      [groupName, username]
    );

    res.status(201).json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: insertResult.rows[0],
    });
  } catch (err) {
    console.error('Error creating employee group:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * PUT /api/masters/employee-groups/:id
 * Update Employee Group with duplicate check (excluding current row)
 */
router.put('/employee-groups/:id', requireRight('masters.employeeGroup', 'edit'), async (req, res) => {
  const { ledgrpname } = req.body;
  const groupName = (ledgrpname || '').trim();
  const id = req.params.id;

  if (!groupName) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    const check = await query(
      `SELECT id FROM ledgergroup 
       WHERE LOWER(TRIM(ledgrpname)) = LOWER(TRIM($1)) 
         AND id != $2 
         AND TRIM(isdeleted) = 'NO';`,
      [groupName, id]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Group Name Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const updateResult = await query(
      `UPDATE ledgergroup 
       SET ledgrpname = $1, alteredon = NOW(), alterby = $2 
       WHERE id = $3 AND TRIM(isdeleted) = 'NO'
       RETURNING id, ledgrpname;`,
      [groupName, username, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: updateResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * DELETE /api/masters/employee-groups/:id
 * Soft delete (IsDeleted = 'YES')
 */
router.delete('/employee-groups/:id', requireRight('masters.employeeGroup', 'delete'), async (req, res) => {
  try {
    const inUse = await blockIfInUse(req.params.id, IN_USE.employeeGroup);
    if (inUse) {
      return res.status(400).json({ status: 'error', message: inUse });
    }
    const username = req.user?.username || 'admin@gmail.com';
    const result = await query(
      `UPDATE ledgergroup 
       SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
       WHERE id = $2 AND TRIM(isdeleted) = 'NO'
       RETURNING id;`,
      [username, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({ status: 'success', message: 'Record deleted successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============================================================================
// 2. UNIT MASTER (Unit)
// ============================================================================

/**
 * GET /api/masters/units
 */
router.get('/units', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, unitname, unittype, formalname, uqc, decimalplaces 
       FROM unit 
       WHERE TRIM(isdeleted) = 'NO' 
       ORDER BY id ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/masters/units/:id
 */
router.get('/units/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, unitname, unittype, formalname, uqc, decimalplaces 
       FROM unit 
       WHERE id = $1 AND TRIM(isdeleted) = 'NO';`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Unit not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/masters/units
 */
router.post('/units', requireRight('masters.unit', 'create'), async (req, res) => {
  const { unitname, unittype, formalname, uqc, decimalplaces } = req.body;
  const name = (unitname || '').trim();
  const type = (unittype || 'Simple').trim();
  const decPlaces = parseInt(decimalplaces !== undefined && decimalplaces !== '' ? decimalplaces : 0, 10);

  if (!name || isNaN(decPlaces)) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    // Duplicate check matching Unit_SP
    const check = await query(
      `SELECT id FROM unit 
       WHERE LOWER(TRIM(unitname)) = LOWER(TRIM($1)) AND TRIM(isdeleted) = 'NO';`,
      [name]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Unit Name Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const insertResult = await query(
      `INSERT INTO unit (unitname, unittype, formalname, uqc, decimalplaces, isdeleted, createdon, enterby)
       VALUES ($1, $2, $3, $4, $5, 'NO', NOW(), $6)
       RETURNING id, unitname, unittype, decimalplaces;`,
      [name, type, (formalname || '').trim(), (uqc || '').trim(), decPlaces, username]
    );

    res.status(201).json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: insertResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * PUT /api/masters/units/:id
 */
router.put('/units/:id', requireRight('masters.unit', 'edit'), async (req, res) => {
  const { unitname, unittype, formalname, uqc, decimalplaces } = req.body;
  const name = (unitname || '').trim();
  const type = (unittype || 'Simple').trim();
  const decPlaces = parseInt(decimalplaces !== undefined && decimalplaces !== '' ? decimalplaces : 0, 10);
  const id = req.params.id;

  if (!name || isNaN(decPlaces)) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    const check = await query(
      `SELECT id FROM unit 
       WHERE LOWER(TRIM(unitname)) = LOWER(TRIM($1)) 
         AND id != $2 
         AND TRIM(isdeleted) = 'NO';`,
      [name, id]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Unit Name Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const updateResult = await query(
      `UPDATE unit 
       SET unitname = $1, unittype = $2, formalname = $3, uqc = $4, decimalplaces = $5, alteredon = NOW(), alterby = $6 
       WHERE id = $7 AND TRIM(isdeleted) = 'NO'
       RETURNING id, unitname, unittype, decimalplaces;`,
      [name, type, (formalname || '').trim(), (uqc || '').trim(), decPlaces, username, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: updateResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * DELETE /api/masters/units/:id
 */
router.delete('/units/:id', requireRight('masters.unit', 'delete'), async (req, res) => {
  try {
    const inUse = await blockIfInUse(req.params.id, IN_USE.unit);
    if (inUse) {
      return res.status(400).json({ status: 'error', message: inUse });
    }
    const username = req.user?.username || 'admin@gmail.com';
    const result = await query(
      `UPDATE unit 
       SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
       WHERE id = $2 AND TRIM(isdeleted) = 'NO'
       RETURNING id;`,
      [username, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({ status: 'success', message: 'Record deleted successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============================================================================
// 3. PRODUCT GROUP (StkGroupMaster)
// ============================================================================

/**
 * GET /api/masters/product-groups
 */
router.get('/product-groups', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, stkgrpname 
       FROM stkgroupmaster 
       WHERE TRIM(isdeleted) = 'NO' 
       ORDER BY id ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/masters/product-groups/:id
 */
router.get('/product-groups/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, stkgrpname 
       FROM stkgroupmaster 
       WHERE id = $1 AND TRIM(isdeleted) = 'NO';`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Product Group not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/masters/product-groups
 */
router.post('/product-groups', requireRight('masters.productGroup', 'create'), async (req, res) => {
  const { stkgrpname } = req.body;
  const name = (stkgrpname || '').trim();

  if (!name) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    const check = await query(
      `SELECT id FROM stkgroupmaster 
       WHERE LOWER(TRIM(stkgrpname)) = LOWER(TRIM($1)) AND TRIM(isdeleted) = 'NO';`,
      [name]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Product Group Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const insertResult = await query(
      `INSERT INTO stkgroupmaster (stkgrpname, isdeleted, createdon, enterby)
       VALUES ($1, 'NO', NOW(), $2)
       RETURNING id, stkgrpname;`,
      [name, username]
    );

    res.status(201).json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: insertResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * PUT /api/masters/product-groups/:id
 */
router.put('/product-groups/:id', requireRight('masters.productGroup', 'edit'), async (req, res) => {
  const { stkgrpname } = req.body;
  const name = (stkgrpname || '').trim();
  const id = req.params.id;

  if (!name) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    const check = await query(
      `SELECT id FROM stkgroupmaster 
       WHERE LOWER(TRIM(stkgrpname)) = LOWER(TRIM($1)) 
         AND id != $2 
         AND TRIM(isdeleted) = 'NO';`,
      [name, id]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Product Group Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const updateResult = await query(
      `UPDATE stkgroupmaster 
       SET stkgrpname = $1, alteredon = NOW(), alterby = $2 
       WHERE id = $3 AND TRIM(isdeleted) = 'NO'
       RETURNING id, stkgrpname;`,
      [name, username, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: updateResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * DELETE /api/masters/product-groups/:id
 */
router.delete('/product-groups/:id', requireRight('masters.productGroup', 'delete'), async (req, res) => {
  try {
    const inUse = await blockIfInUse(req.params.id, IN_USE.productGroup);
    if (inUse) {
      return res.status(400).json({ status: 'error', message: inUse });
    }
    const username = req.user?.username || 'admin@gmail.com';
    const result = await query(
      `UPDATE stkgroupmaster 
       SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
       WHERE id = $2 AND TRIM(isdeleted) = 'NO'
       RETURNING id;`,
      [username, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({ status: 'success', message: 'Record deleted successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============================================================================
// 4. PROCESS MASTER (StkCategory)
// ============================================================================

/**
 * GET /api/masters/process-masters
 */
router.get('/process-masters', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, stkcategoryname 
       FROM stkcategory 
       WHERE TRIM(isdeleted) = 'NO' 
       ORDER BY id ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/masters/process-masters/:id
 */
router.get('/process-masters/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, stkcategoryname 
       FROM stkcategory 
       WHERE id = $1 AND TRIM(isdeleted) = 'NO';`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Process Master not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/masters/process-masters
 */
router.post('/process-masters', requireRight('masters.processMaster', 'create'), async (req, res) => {
  const { stkcategoryname } = req.body;
  const name = (stkcategoryname || '').trim();

  if (!name) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    const check = await query(
      `SELECT id FROM stkcategory 
       WHERE LOWER(TRIM(stkcategoryname)) = LOWER(TRIM($1)) AND TRIM(isdeleted) = 'NO';`,
      [name]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Process Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const insertResult = await query(
      `INSERT INTO stkcategory (stkcategoryname, isdeleted, createdon, enterby)
       VALUES ($1, 'NO', NOW(), $2)
       RETURNING id, stkcategoryname;`,
      [name, username]
    );

    res.status(201).json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: insertResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * PUT /api/masters/process-masters/:id
 */
router.put('/process-masters/:id', requireRight('masters.processMaster', 'edit'), async (req, res) => {
  const { stkcategoryname } = req.body;
  const name = (stkcategoryname || '').trim();
  const id = req.params.id;

  if (!name) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    const check = await query(
      `SELECT id FROM stkcategory 
       WHERE LOWER(TRIM(stkcategoryname)) = LOWER(TRIM($1)) 
         AND id != $2 
         AND TRIM(isdeleted) = 'NO';`,
      [name, id]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Process Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const updateResult = await query(
      `UPDATE stkcategory 
       SET stkcategoryname = $1, alteredon = NOW(), alterby = $2 
       WHERE id = $3 AND TRIM(isdeleted) = 'NO'
       RETURNING id, stkcategoryname;`,
      [name, username, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: updateResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * DELETE /api/masters/process-masters/:id
 */
router.delete('/process-masters/:id', requireRight('masters.processMaster', 'delete'), async (req, res) => {
  try {
    const inUse = await blockIfInUse(req.params.id, IN_USE.processMaster);
    if (inUse) {
      return res.status(400).json({ status: 'error', message: inUse });
    }
    const username = req.user?.username || 'admin@gmail.com';
    const result = await query(
      `UPDATE stkcategory 
       SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
       WHERE id = $2 AND TRIM(isdeleted) = 'NO'
       RETURNING id;`,
      [username, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({ status: 'success', message: 'Record deleted successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============================================================================
// 5. LOOKUPS (Country, StateMaster)
// ============================================================================

/**
 * GET /api/masters/lookups/countries
 */
router.get('/lookups/countries', async (req, res) => {
  try {
    const result = await query(`SELECT id, country FROM country ORDER BY country ASC;`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/masters/lookups/states
 */
router.get('/lookups/states', async (req, res) => {
  try {
    const result = await query(`SELECT id, statename FROM statemaster ORDER BY statename ASC;`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============================================================================
// 6. COMPANY MASTER (Company)
// ============================================================================

/**
 * GET /api/masters/companies
 */
router.get('/companies', async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id, c.compname, c.mailingname, c.cmpaddr1, c.cmpaddr2, c.cmpaddr3, 
              c.cmpstate, s.statename, c.cmpcountry, co.country, c.cmppincode, 
              c.cmptelephone, c.cmpmobile, c.cmpemail, c.cmpwebsite, c.cmpgstn, 
              c.cmppanno, c.cmpcinno, c.cmpcity, c.cmplbtno 
       FROM company c
       LEFT JOIN statemaster s ON c.cmpstate = s.id
       LEFT JOIN country co ON c.cmpcountry = co.id
       WHERE TRIM(c.isdeleted) = 'NO' 
       ORDER BY c.id ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/masters/companies/:id
 */
router.get('/companies/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, compname, mailingname, cmpaddr1, cmpaddr2, cmpaddr3, 
              cmpstate, cmpcountry, cmppincode, cmptelephone, cmpmobile, 
              cmpemail, cmpwebsite, cmpgstn, cmppanno, cmpcinno, cmpcity, cmplbtno 
       FROM company 
       WHERE id = $1 AND TRIM(isdeleted) = 'NO';`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Company not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/masters/companies
 */
router.post('/companies', requireRight('masters.company', 'create'), async (req, res) => {
  const {
    compname,
    mailingname,
    cmpaddr1,
    cmpaddr2,
    cmpaddr3,
    cmpcountry,
    cmpstate,
    cmpcity,
    cmppincode,
    cmptelephone,
    cmpmobile,
    cmpemail,
    cmpwebsite,
    cmpgstn,
    cmppanno,
    cmpcinno,
    cmplbtno,
  } = req.body;

  const name = (compname || '').trim();
  const addr1 = (cmpaddr1 || '').trim();
  const stateId = Number(cmpstate);

  if (!name || !addr1 || !stateId) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    const check = await query(
      `SELECT id FROM company 
       WHERE LOWER(TRIM(compname)) = LOWER(TRIM($1)) AND TRIM(isdeleted) = 'NO';`,
      [name]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Company Name Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const insertResult = await query(
      `INSERT INTO company (
         compname, compid, mailingname, cmpaddr1, cmpaddr2, cmpaddr3,
         cmpstate, cmpcountry, cmppincode, cmptelephone, cmpmobile, cmpemail,
         cmpwebsite, cmpgstn, cmppanno, cmpcinno, cmplbtno, cmpcity,
         isdeleted, createdon, enterby
       ) VALUES ($1, '0', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'NO', NOW(), $18)
       RETURNING id, compname;`,
      [
        name,
        (mailingname || '').trim(),
        addr1,
        (cmpaddr2 || '').trim(),
        (cmpaddr3 || '').trim(),
        stateId,
        Number(cmpcountry) || 1,
        (cmppincode || '').trim(),
        (cmptelephone || '').trim(),
        (cmpmobile || '').trim(),
        (cmpemail || '').trim(),
        (cmpwebsite || '').trim(),
        (cmpgstn || '').trim(),
        (cmppanno || '').trim(),
        (cmpcinno || '').trim(),
        (cmplbtno || '').trim(),
        (cmpcity || '').trim(),
        username,
      ]
    );

    res.status(201).json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: insertResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * PUT /api/masters/companies/:id
 */
router.put('/companies/:id', requireRight('masters.company', 'edit'), async (req, res) => {
  const {
    compname,
    mailingname,
    cmpaddr1,
    cmpaddr2,
    cmpaddr3,
    cmpcountry,
    cmpstate,
    cmpcity,
    cmppincode,
    cmptelephone,
    cmpmobile,
    cmpemail,
    cmpwebsite,
    cmpgstn,
    cmppanno,
    cmpcinno,
    cmplbtno,
  } = req.body;

  const id = req.params.id;
  const name = (compname || '').trim();
  const addr1 = (cmpaddr1 || '').trim();
  const stateId = Number(cmpstate);

  if (!name || !addr1 || !stateId) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    const check = await query(
      `SELECT id FROM company 
       WHERE LOWER(TRIM(compname)) = LOWER(TRIM($1)) 
         AND id != $2 
         AND TRIM(isdeleted) = 'NO';`,
      [name, id]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Company Name Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const updateResult = await query(
      `UPDATE company SET
         compname = $1, mailingname = $2, cmpaddr1 = $3, cmpaddr2 = $4, cmpaddr3 = $5,
         cmpstate = $6, cmpcountry = $7, cmppincode = $8, cmptelephone = $9, cmpmobile = $10,
         cmpemail = $11, cmpwebsite = $12, cmpgstn = $13, cmppanno = $14, cmpcinno = $15,
         cmplbtno = $16, cmpcity = $17, alteredon = NOW(), alterby = $18
       WHERE id = $19 AND TRIM(isdeleted) = 'NO'
       RETURNING id, compname;`,
      [
        name,
        (mailingname || '').trim(),
        addr1,
        (cmpaddr2 || '').trim(),
        (cmpaddr3 || '').trim(),
        stateId,
        Number(cmpcountry) || 1,
        (cmppincode || '').trim(),
        (cmptelephone || '').trim(),
        (cmpmobile || '').trim(),
        (cmpemail || '').trim(),
        (cmpwebsite || '').trim(),
        (cmpgstn || '').trim(),
        (cmppanno || '').trim(),
        (cmpcinno || '').trim(),
        (cmplbtno || '').trim(),
        (cmpcity || '').trim(),
        username,
        id,
      ]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: updateResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * DELETE /api/masters/companies/:id
 */
router.delete('/companies/:id', requireRight('masters.company', 'delete'), async (req, res) => {
  try {
    const username = req.user?.username || 'admin@gmail.com';
    const result = await query(
      `UPDATE company 
       SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
       WHERE id = $2 AND TRIM(isdeleted) = 'NO'
       RETURNING id;`,
      [username, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({ status: 'success', message: 'Record deleted successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============================================================================
// 7. EMPLOYEE MASTER (OperatorMaster)
// ============================================================================

/**
 * GET /api/masters/employees
 */
router.get('/employees', async (req, res) => {
  try {
    const result = await query(
      `SELECT o.id, o.operatorname, o.empcode, o.empgrp, g.ledgrpname, 
              o.contactno, o.addharno 
       FROM operatormaster o
       LEFT JOIN ledgergroup g ON o.empgrp = g.id
       WHERE TRIM(o.isdeleted) = 'NO' AND o.hidden = 'NO'
       ORDER BY o.id ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/masters/employees/:id
 */
router.get('/employees/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, operatorname, empcode, empgrp, contactno, addharno 
       FROM operatormaster 
       WHERE id = $1 AND TRIM(isdeleted) = 'NO' AND hidden = 'NO';`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Employee not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/masters/employees
 */
router.post('/employees', requireRight('masters.employee', 'create'), async (req, res) => {
  const { operatorname, empcode, empgrp, contactno, addharno } = req.body;
  const name = (operatorname || '').trim();
  const code = (empcode || '').trim();
  const contact = (contactno || '').trim();
  const grpId = Number(empgrp);

  if (!name || !code || !contact || !grpId) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    // Duplicate check on empcode
    const codeCheck = await query(
      `SELECT id FROM operatormaster 
       WHERE LOWER(TRIM(empcode)) = LOWER(TRIM($1)) AND TRIM(isdeleted) = 'NO';`,
      [code]
    );
    if (codeCheck.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Employee Code Already Exists' });
    }

    // Duplicate check on operatorname
    const nameCheck = await query(
      `SELECT id FROM operatormaster 
       WHERE LOWER(TRIM(operatorname)) = LOWER(TRIM($1)) AND TRIM(isdeleted) = 'NO';`,
      [name]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Employee Name Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const insertResult = await query(
      `INSERT INTO operatormaster (
         operatorname, empcode, empgrp, contactno, addharno,
         isdeleted, createdon, enterby
       ) VALUES ($1, $2, $3, $4, $5, 'NO', NOW(), $6)
       RETURNING id, operatorname, empcode;`,
      [name, code, grpId, contact, (addharno || '').trim(), username]
    );

    res.status(201).json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: insertResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * PUT /api/masters/employees/:id
 */
router.put('/employees/:id', requireRight('masters.employee', 'edit'), async (req, res) => {
  const { operatorname, empcode, empgrp, contactno, addharno } = req.body;
  const id = req.params.id;

  // An employee with a login (their code is their username): admins only
  try {
    const hidden = await query(`SELECT 1 FROM operatormaster WHERE id = $1 AND hidden = 'YES';`, [id]);
    if (hidden.rows.length > 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }
    const login = await loginOfEmployee(pool, id);
    if (!req.user?.isAdmin && login) {
      return res.status(403).json({ status: 'error', message: 'This employee has a login, so only an admin can change it.' });
    }
    // ADMIN's employee code is its username, so it stays "ADMIN"
    if (login?.permanent === 'YES') {
      const current = await query(`SELECT empcode FROM operatormaster WHERE id = $1;`, [id]);
      if ((current.rows[0]?.empcode || '').trim().toUpperCase() !== (empcode || '').trim().toUpperCase()) {
        return res.status(400).json({ status: 'error', message: "ADMIN's Employee Code is its username, so it can't be changed." });
      }
    }
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
  const name = (operatorname || '').trim();
  const code = (empcode || '').trim();
  const contact = (contactno || '').trim();
  const grpId = Number(empgrp);

  if (!name || !code || !contact || !grpId) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    // Duplicate check on empcode
    const codeCheck = await query(
      `SELECT id FROM operatormaster 
       WHERE LOWER(TRIM(empcode)) = LOWER(TRIM($1)) 
         AND id != $2 
         AND TRIM(isdeleted) = 'NO';`,
      [code, id]
    );
    if (codeCheck.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Employee Code Already Exists' });
    }

    // Duplicate check on operatorname
    const nameCheck = await query(
      `SELECT id FROM operatormaster 
       WHERE LOWER(TRIM(operatorname)) = LOWER(TRIM($1)) 
         AND id != $2 
         AND TRIM(isdeleted) = 'NO';`,
      [name, id]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Employee Name Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const updateResult = await query(
      `UPDATE operatormaster SET
         operatorname = $1, empcode = $2, empgrp = $3, contactno = $4, addharno = $5,
         alteredon = NOW(), alterby = $6
       WHERE id = $7 AND TRIM(isdeleted) = 'NO'
       RETURNING id, operatorname, empcode;`,
      [name, code, grpId, contact, (addharno || '').trim(), username, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: updateResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * DELETE /api/masters/employees/:id
 */
router.delete('/employees/:id', requireRight('masters.employee', 'delete'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Same lock as Admin > Create Login, so two admins can't remove each other's logins at once
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('garmentmfg-logins'));`);

    // The hidden support employee doesn't exist as far as the app is concerned
    const hidden = await client.query(`SELECT 1 FROM operatormaster WHERE id = $1 AND hidden = 'YES';`, [req.params.id]);
    if (hidden.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    // An employee with a login: only another admin can remove it (and never the last admin)
    const login = await loginOfEmployee(client, req.params.id);
    if (login) {
      const loginError = await checkCanTakeAwayLogin(client, req.user, login);
      if (loginError) {
        await client.query('ROLLBACK');
        return res.status(400).json({ status: 'error', message: `This employee has a login. ${loginError}` });
      }
    }
    const inUse = await blockIfInUse(req.params.id, IN_USE.employee);
    if (inUse) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: inUse });
    }
    const username = req.user?.username || 'admin@gmail.com';
    const result = await client.query(
      `UPDATE operatormaster 
       SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
       WHERE id = $2 AND TRIM(isdeleted) = 'NO'
       RETURNING id;`,
      [username, req.params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    // The employee is gone, so their login goes too
    if (login) {
      await client.query(`DELETE FROM login WHERE id = $1;`, [login.id]);
    }
    await client.query('COMMIT');

    res.json({ status: 'success', message: 'Record deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    client.release();
  }
});

// ============================================================================
// 8. OPERATIONS MASTER (OperationRate)
// ============================================================================

/**
 * GET /api/masters/operations
 */
router.get('/operations', async (req, res) => {
  try {
    const result = await query(
      `SELECT op.id, op.opcode, op.operations, op.oprate, op.processid, 
              c.stkcategoryname 
       FROM operationrate op
       LEFT JOIN stkcategory c ON op.processid = c.id
       WHERE TRIM(op.isdeleted) = 'NO' 
       ORDER BY op.id ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/masters/operations/:id
 */
router.get('/operations/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, opcode, operations, oprate, processid 
       FROM operationrate 
       WHERE id = $1 AND TRIM(isdeleted) = 'NO';`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Operation not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/masters/operations
 */
router.post('/operations', requireRight('masters.operations', 'create'), async (req, res) => {
  const { operations, opcode, oprate, processid } = req.body;
  const name = (operations || '').trim();
  const code = (opcode || '').trim();
  const procId = Number(processid);
  const rateNum = Number(oprate) || 0;

  if (!name || !code || !procId) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    // Duplicate check on opcode
    const codeCheck = await query(
      `SELECT id FROM operationrate 
       WHERE LOWER(TRIM(opcode)) = LOWER(TRIM($1)) AND TRIM(isdeleted) = 'NO';`,
      [code]
    );
    if (codeCheck.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Operation Code Already Exists' });
    }

    // Duplicate check on operations
    const nameCheck = await query(
      `SELECT id FROM operationrate 
       WHERE LOWER(TRIM(operations)) = LOWER(TRIM($1)) AND TRIM(isdeleted) = 'NO';`,
      [name]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Operation Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const insertResult = await query(
      `INSERT INTO operationrate (
         operations, opcode, oprate, processid,
         isdeleted, createdon, enterby
       ) VALUES ($1, $2, $3, $4, 'NO', NOW(), $5)
       RETURNING id, operations, opcode, oprate;`,
      [name, code, rateNum, procId, username]
    );

    res.status(201).json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: insertResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * PUT /api/masters/operations/:id
 */
router.put('/operations/:id', requireRight('masters.operations', 'edit'), async (req, res) => {
  const { operations, opcode, oprate, processid } = req.body;
  const id = req.params.id;
  const name = (operations || '').trim();
  const code = (opcode || '').trim();
  const procId = Number(processid);
  const rateNum = Number(oprate) || 0;

  if (!name || !code || !procId) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    // Duplicate check on opcode
    const codeCheck = await query(
      `SELECT id FROM operationrate 
       WHERE LOWER(TRIM(opcode)) = LOWER(TRIM($1)) 
         AND id != $2 
         AND TRIM(isdeleted) = 'NO';`,
      [code, id]
    );
    if (codeCheck.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Operation Code Already Exists' });
    }

    // Duplicate check on operations
    const nameCheck = await query(
      `SELECT id FROM operationrate 
       WHERE LOWER(TRIM(operations)) = LOWER(TRIM($1)) 
         AND id != $2 
         AND TRIM(isdeleted) = 'NO';`,
      [name, id]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Operation Already Exists' });
    }

    const username = req.user?.username || 'admin@gmail.com';
    const updateResult = await query(
      `UPDATE operationrate SET
         operations = $1, opcode = $2, oprate = $3, processid = $4,
         alteredon = NOW(), alterby = $5
       WHERE id = $6 AND TRIM(isdeleted) = 'NO'
       RETURNING id, operations, opcode, oprate;`,
      [name, code, rateNum, procId, username, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: updateResult.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * DELETE /api/masters/operations/:id
 */
router.delete('/operations/:id', requireRight('masters.operations', 'delete'), async (req, res) => {
  try {
    const inUse = await blockIfInUse(req.params.id, IN_USE.operation);
    if (inUse) {
      return res.status(400).json({ status: 'error', message: inUse });
    }
    const username = req.user?.username || 'admin@gmail.com';
    const result = await query(
      `UPDATE operationrate 
       SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
       WHERE id = $2 AND TRIM(isdeleted) = 'NO'
       RETURNING id;`,
      [username, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    res.json({ status: 'success', message: 'Record deleted successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============================================================================
// 9. LOOKUPS: BRANDS & COLORS
// ============================================================================

/**
 * GET /api/masters/lookups/brands
 */
router.get('/lookups/brands', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, brandname FROM brandmaster WHERE TRIM(isdeleted) = 'NO' ORDER BY brandname ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/masters/lookups/colors
 */
router.get('/lookups/colors', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, colorcode, colorname FROM colormaster WHERE TRIM(isdeleted) = 'NO' ORDER BY colorname ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============================================================================
// 10. PRODUCT MASTER (Product + StockOpening)
// ============================================================================

/**
 * GET /api/masters/products
 * List all active products joined with Product Group, Unit, and Category
 */
router.get('/products', async (req, res) => {
  try {
    const result = await query(
      `SELECT p.id, p.stockitemname, p.stockgroup, g.stkgrpname, 
              p.stockcategory, c.stkcategoryname, p.stkcode, p.partno, 
              p.stkdescription, p.unit, u.unitname, p.mrp, p.hsncode, 
              p.hsndescription, p.gstrate, p.costingmethod, p.valuationmethod, 
              p.conversion, p.alternateunit, au.unitname as alternateunitname
       FROM product p
       LEFT JOIN stkgroupmaster g ON p.stockgroup = g.id
       LEFT JOIN unit u ON p.unit = u.id
       LEFT JOIN unit au ON p.alternateunit = au.id
       LEFT JOIN stkcategory c ON p.stockcategory = c.id
       WHERE TRIM(p.isdeleted) = 'NO'
       ORDER BY p.id ASC;`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/masters/products/:id
 * Single product header plus all active opening stock detail rows
 */
router.get('/products/:id', async (req, res) => {
  try {
    const prodResult = await query(
      `SELECT p.id, p.stockitemname, p.stockgroup, g.stkgrpname, 
              p.stockcategory, c.stkcategoryname, p.stkcode, p.partno, 
              p.stkdescription, p.unit, u.unitname, p.mrp, p.hsncode, 
              p.hsndescription, p.gstrate, p.costingmethod, p.valuationmethod, 
              p.conversion, p.alternateunit
       FROM product p
       LEFT JOIN stkgroupmaster g ON p.stockgroup = g.id
       LEFT JOIN unit u ON p.unit = u.id
       LEFT JOIN stkcategory c ON p.stockcategory = c.id
       WHERE p.id = $1 AND TRIM(p.isdeleted) = 'NO';`,
      [req.params.id]
    );

    if (prodResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Product not found' });
    }

    const product = prodResult.rows[0];

    // Fetch opening stock rows
    const stockResult = await query(
      `SELECT so.id, so.batchno, so.brandid, b.brandname, 
              so.colorid, co.colorname, so.style, 
              so.s, so.m, so.l, so.xl, so.xxl, so.xxxl, so.xxxxl, so.xl5, so.totalqty
       FROM stockopening so
       LEFT JOIN brandmaster b ON so.brandid = b.id
       LEFT JOIN colormaster co ON so.colorid = co.id
       WHERE so.stockid = $1 AND TRIM(so.isdeleted) = 'NO'
       ORDER BY so.id ASC;`,
      [req.params.id]
    );

    product.openingStock = stockResult.rows;
    res.json(product);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/masters/products
 * Transaction: create product header and attached opening stock rows
 */
router.post('/products', requireRight('masters.product', 'create'), async (req, res) => {
  const {
    stockitemname,
    stockgroup,
    stockcategory,
    stkcode,
    partno,
    stkdescription,
    unit,
    alternateunit,
    conversion,
    mrp,
    hsncode,
    hsndescription,
    gstrate,
    costingmethod,
    valuationmethod,
    openingStock,
  } = req.body;

  const name = (stockitemname || '').trim();
  const code = (stkcode || '').trim();
  const grpId = Number(stockgroup);
  const unitId = Number(unit);

  if (!name || !grpId || !unitId) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  // Duplicate checks
  try {
    const nameCheck = await query(
      `SELECT id FROM product WHERE LOWER(TRIM(stockitemname)) = LOWER(TRIM($1)) AND TRIM(isdeleted) = 'NO';`,
      [name]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Product Name Already Exists' });
    }

    if (code) {
      const codeCheck = await query(
        `SELECT id FROM product WHERE LOWER(TRIM(stkcode)) = LOWER(TRIM($1)) AND TRIM(isdeleted) = 'NO';`,
        [code]
      );
      if (codeCheck.rows.length > 0) {
        return res.status(400).json({ status: 'error', message: 'Product Code Already Exists' });
      }
    }
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }

  const username = req.user?.username || 'admin@gmail.com';
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insert Product Header
    const insertProd = await client.query(
      `INSERT INTO product (
         stockitemname, stockgroup, stockcategory, brandid, stkcode, partno,
         stkdescription, unit, mrp, hsncode, hsndescription, gstrate,
         costingmethod, valuationmethod, conversion, alternateunit,
         isdeleted, createdon, enterby
       ) VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'NO', NOW(), $16)
       RETURNING id, stockitemname;`,
      [
        name,
        grpId,
        Number(stockcategory) || 0,
        code,
        (partno || '').trim(),
        (stkdescription || '').trim(),
        unitId,
        Number(mrp) || 0,
        (hsncode || '').trim(),
        (hsndescription || '').trim(),
        Number(gstrate) || 0,
        (costingmethod || '').trim(),
        (valuationmethod || '').trim(),
        Number(conversion) || 0,
        Number(alternateunit) || 0,
        username,
      ]
    );

    const newProductId = insertProd.rows[0].id;

    // 2. Insert Opening Stock Rows
    if (Array.isArray(openingStock) && openingStock.length > 0) {
      for (const row of openingStock) {
        const batch = (row.batchno || '').trim();
        const total = Number(row.totalqty) || 0;

        // Skip blank rows
        if (!batch && total === 0) continue;

        await client.query(
          `INSERT INTO stockopening (
             stockid, batchno, brandid, colorid, style,
             s, m, l, xl, xxl, xxxl, xxxxl, xl5, totalqty,
             isdeleted, createdon, enterby
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'NO', NOW(), $15);`,
          [
            newProductId,
            batch,
            Number(row.brandid) || 0,
            Number(row.colorid) || 0,
            (row.style || '').trim(),
            Number(row.s) || 0,
            Number(row.m) || 0,
            Number(row.l) || 0,
            Number(row.xl) || 0,
            Number(row.xxl) || 0,
            Number(row.xxxl) || 0,
            Number(row.xxxxl) || 0,
            Number(row.xl5) || 0,
            total,
            username,
          ]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: { id: newProductId, stockitemname: name },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating product:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/masters/products/:id
 * Transaction: update product header and reconcile opening stock rows
 */
router.put('/products/:id', requireRight('masters.product', 'edit'), async (req, res) => {
  const prodId = req.params.id;
  const {
    stockitemname,
    stockgroup,
    stockcategory,
    stkcode,
    partno,
    stkdescription,
    unit,
    alternateunit,
    conversion,
    mrp,
    hsncode,
    hsndescription,
    gstrate,
    costingmethod,
    valuationmethod,
    openingStock,
  } = req.body;

  const name = (stockitemname || '').trim();
  const code = (stkcode || '').trim();
  const grpId = Number(stockgroup);
  const unitId = Number(unit);

  if (!name || !grpId || !unitId) {
    return res.status(400).json({ status: 'error', message: 'Please Enter * Mandatory Fields' });
  }

  try {
    const nameCheck = await query(
      `SELECT id FROM product WHERE LOWER(TRIM(stockitemname)) = LOWER(TRIM($1)) AND id != $2 AND TRIM(isdeleted) = 'NO';`,
      [name, prodId]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Product Name Already Exists' });
    }

    if (code) {
      const codeCheck = await query(
        `SELECT id FROM product WHERE LOWER(TRIM(stkcode)) = LOWER(TRIM($1)) AND id != $2 AND TRIM(isdeleted) = 'NO';`,
        [code, prodId]
      );
      if (codeCheck.rows.length > 0) {
        return res.status(400).json({ status: 'error', message: 'Product Code Already Exists' });
      }
    }
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }

  const username = req.user?.username || 'admin@gmail.com';
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Update Product Header
    const updateResult = await client.query(
      `UPDATE product SET
         stockitemname = $1, stockgroup = $2, stockcategory = $3, stkcode = $4,
         partno = $5, stkdescription = $6, unit = $7, mrp = $8, hsncode = $9,
         hsndescription = $10, gstrate = $11, costingmethod = $12, valuationmethod = $13,
         conversion = $14, alternateunit = $15, alteredon = NOW(), alterby = $16
       WHERE id = $17 AND TRIM(isdeleted) = 'NO'
       RETURNING id, stockitemname;`,
      [
        name,
        grpId,
        Number(stockcategory) || 0,
        code,
        (partno || '').trim(),
        (stkdescription || '').trim(),
        unitId,
        Number(mrp) || 0,
        (hsncode || '').trim(),
        (hsndescription || '').trim(),
        Number(gstrate) || 0,
        (costingmethod || '').trim(),
        (valuationmethod || '').trim(),
        Number(conversion) || 0,
        Number(alternateunit) || 0,
        username,
        prodId,
      ]
    );

    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Product not found' });
    }

    // 2. Reconcile Opening Stock Rows
    const activeRowIds = [];

    if (Array.isArray(openingStock)) {
      for (const row of openingStock) {
        const batch = (row.batchno || '').trim();
        const total = Number(row.totalqty) || 0;

        if (!batch && total === 0) continue;

        if (row.id && Number(row.id) > 0) {
          // Update existing row
          await client.query(
            `UPDATE stockopening SET
               batchno = $1, brandid = $2, colorid = $3, style = $4,
               s = $5, m = $6, l = $7, xl = $8, xxl = $9, xxxl = $10, xxxxl = $11, xl5 = $12,
               totalqty = $13, alteredon = NOW(), alterby = $14
             WHERE id = $15 AND stockid = $16;`,
            [
              batch,
              Number(row.brandid) || 0,
              Number(row.colorid) || 0,
              (row.style || '').trim(),
              Number(row.s) || 0,
              Number(row.m) || 0,
              Number(row.l) || 0,
              Number(row.xl) || 0,
              Number(row.xxl) || 0,
              Number(row.xxxl) || 0,
              Number(row.xxxxl) || 0,
              Number(row.xl5) || 0,
              total,
              username,
              row.id,
              prodId,
            ]
          );
          activeRowIds.push(Number(row.id));
        } else {
          // Insert new row
          const insertRow = await client.query(
            `INSERT INTO stockopening (
               stockid, batchno, brandid, colorid, style,
               s, m, l, xl, xxl, xxxl, xxxxl, xl5, totalqty,
               isdeleted, createdon, enterby
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'NO', NOW(), $15)
             RETURNING id;`,
            [
              prodId,
              batch,
              Number(row.brandid) || 0,
              Number(row.colorid) || 0,
              (row.style || '').trim(),
              Number(row.s) || 0,
              Number(row.m) || 0,
              Number(row.l) || 0,
              Number(row.xl) || 0,
              Number(row.xxl) || 0,
              Number(row.xxxl) || 0,
              Number(row.xxxxl) || 0,
              Number(row.xl5) || 0,
              total,
              username,
            ]
          );
          activeRowIds.push(insertRow.rows[0].id);
        }
      }
    }

    // Soft-delete rows removed by the user in this product
    if (activeRowIds.length > 0) {
      await client.query(
        `UPDATE stockopening 
         SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
         WHERE stockid = $2 AND id NOT IN (${activeRowIds.map((_, i) => `$${i + 3}`).join(',')}) AND TRIM(isdeleted) = 'NO';`,
        [username, prodId, ...activeRowIds]
      );
    } else {
      await client.query(
        `UPDATE stockopening 
         SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
         WHERE stockid = $2 AND TRIM(isdeleted) = 'NO';`,
        [username, prodId]
      );
    }

    await client.query('COMMIT');

    res.json({
      status: 'success',
      message: 'Data Saved Successfully',
      data: { id: prodId, stockitemname: name },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating product:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/masters/products/:id
 * Soft-delete product and its opening stock detail rows
 */
router.delete('/products/:id', requireRight('masters.product', 'delete'), async (req, res) => {
  const prodId = req.params.id;
  const username = req.user?.username || 'admin@gmail.com';
  try {
    const inUse = await blockIfInUse(prodId, IN_USE.product);
    if (inUse) {
      return res.status(400).json({ status: 'error', message: inUse });
    }
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE product 
       SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
       WHERE id = $2 AND TRIM(isdeleted) = 'NO'
       RETURNING id;`,
      [username, prodId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Record not found' });
    }

    // Soft-delete attached stockopening rows
    await client.query(
      `UPDATE stockopening 
       SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
       WHERE stockid = $2 AND TRIM(isdeleted) = 'NO';`,
      [username, prodId]
    );

    await client.query('COMMIT');
    res.json({ status: 'success', message: 'Record deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/masters/products/:id/opening-stock/:detailId
 * Soft-delete a single opening stock row
 */
router.delete('/products/:id/opening-stock/:detailId', requireRight('masters.product', 'edit'), async (req, res) => {
  try {
    const username = req.user?.username || 'admin@gmail.com';
    const result = await query(
      `UPDATE stockopening 
       SET isdeleted = 'YES', alteredon = NOW(), alterby = $1 
       WHERE id = $2 AND stockid = $3 AND TRIM(isdeleted) = 'NO'
       RETURNING id;`,
      [username, req.params.detailId, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Detail record not found' });
    }

    res.json({ status: 'success', message: 'Opening stock row deleted successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
