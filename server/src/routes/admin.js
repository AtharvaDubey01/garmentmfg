// Admin > Create Login: give some employees a login, set their password and their rights.
// Admin > Backups: list, "Back up now", download.
// Admin > Company Branding: the company's name and logo.
// Admins only. Safety rules (own login, last admin, permanent logins) are in ../loginRules.js.

import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import pool, { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { SCREENS, cleanRights, requireAdmin } from '../permissions.js';
import { checkCanTakeAwayLogin } from '../loginRules.js';
import { backupPath, dumpTo, listBackups, makeBackup } from '../backup.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

const yesNo = (v) => (v === true || v === 'YES' || v === 'Yes' || v === 'yes' ? 'YES' : 'NO');

/** All changes to logins take this lock, so two admins can't remove each other at the same moment. */
const lockLogins = (client) => client.query(`SELECT pg_advisory_xact_lock(hashtext('garmentmfg-logins'));`);

/**
 * GET /api/admin/screens
 * The screens and rights for the tick grid (from permissions.js)
 */
router.get('/screens', (req, res) => {
  res.json(SCREENS);
});

/**
 * GET /api/admin/logins
 * Every login with its employee. Passwords are shown on purpose (admins only, single company).
 */
router.get('/logins', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT l.id, l.empid, o.empcode, o.operatorname, g.ledgrpname, l.password, l.isadmin, l.isactive, l.rights
       FROM login l
       INNER JOIN operatormaster o ON o.id = l.empid AND TRIM(o.isdeleted) = 'NO'
       LEFT JOIN ledgergroup g ON g.id = o.empgrp
       WHERE l.hidden = 'NO'
       ORDER BY l.isadmin DESC, o.operatorname;`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/logins/:id
 */
router.get('/logins/:id', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT l.id, l.empid, o.empcode, o.operatorname, g.ledgrpname, l.password, l.isadmin, l.isactive, l.rights
       FROM login l
       INNER JOIN operatormaster o ON o.id = l.empid AND TRIM(o.isdeleted) = 'NO'
       LEFT JOIN ledgergroup g ON g.id = o.empgrp
       WHERE l.id = $1 AND l.hidden = 'NO';`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Login not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/employees-without-login
 * Employees who can be given a login (the dropdown on "New Login")
 */
router.get('/employees-without-login', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT o.id, o.empcode, o.operatorname, g.ledgrpname
       FROM operatormaster o
       LEFT JOIN ledgergroup g ON g.id = o.empgrp
       WHERE TRIM(o.isdeleted) = 'NO' AND o.hidden = 'NO'
         AND NOT EXISTS (SELECT 1 FROM login l WHERE l.empid = o.id)
       ORDER BY o.operatorname;`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/logins
 * Body: { empid, password, isadmin, isactive, rights }
 */
router.post('/logins', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const empid = parseInt(req.body.empid, 10);
    const password = (req.body.password || '').trim();
    if (!empid || !password) {
      return res.status(400).json({ message: 'Please pick an employee and enter a password.' });
    }

    await client.query('BEGIN');
    await lockLogins(client);

    const emp = await client.query(
      `SELECT id, empcode FROM operatormaster WHERE id = $1 AND TRIM(isdeleted) = 'NO' AND hidden = 'NO';`,
      [empid]
    );
    if (emp.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Employee not found.' });
    }
    if (!(emp.rows[0].empcode || '').trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This employee has no Employee Code, which is needed as the username.' });
    }
    const existing = await client.query(`SELECT id FROM login WHERE empid = $1;`, [empid]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This employee already has a login.' });
    }

    const result = await client.query(
      `INSERT INTO login (loginid, password, role, empid, isadmin, isactive, rights)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
      [
        emp.rows[0].empcode.trim(), // kept for reference; the username is read from the employee's code
        password,
        yesNo(req.body.isadmin) === 'YES' ? 'admin' : 'user',
        empid,
        yesNo(req.body.isadmin),
        req.body.isactive === undefined ? 'YES' : yesNo(req.body.isactive),
        JSON.stringify(cleanRights(req.body.rights)),
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, id: result.rows[0].id, message: 'Login created' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/**
 * PUT /api/admin/logins/:id
 * Body: { password, isadmin, isactive, rights }
 */
router.put('/logins/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const password = (req.body.password || '').trim();
    if (!password) {
      return res.status(400).json({ message: 'Please enter a password.' });
    }

    await client.query('BEGIN');
    await lockLogins(client);

    const current = await client.query(`SELECT id, isadmin, isactive, permanent FROM login WHERE id = $1 AND hidden = 'NO';`, [req.params.id]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Login not found' });
    }
    const login = current.rows[0];
    const isadmin = yesNo(req.body.isadmin);
    const isactive = yesNo(req.body.isactive);

    // Removing the admin tick or deactivating: safety rules apply
    const takingAway = (login.isadmin === 'YES' && isadmin === 'NO') || (login.isactive === 'YES' && isactive === 'NO');
    if (takingAway) {
      const ruleError = await checkCanTakeAwayLogin(client, req.user, login);
      if (ruleError) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: ruleError });
      }
    }

    await client.query(
      `UPDATE login SET password = $1, isadmin = $2, isactive = $3, rights = $4, role = $5 WHERE id = $6;`,
      [password, isadmin, isactive, JSON.stringify(cleanRights(req.body.rights)), isadmin === 'YES' ? 'admin' : 'user', login.id]
    );
    await client.query('COMMIT');
    res.json({ success: true, message: 'Login saved' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/admin/logins/:id
 * Removes the login only; the employee and all their work stay.
 */
router.delete('/logins/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockLogins(client);

    const current = await client.query(`SELECT id, isadmin, isactive, permanent FROM login WHERE id = $1 AND hidden = 'NO';`, [req.params.id]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Login not found' });
    }
    const ruleError = await checkCanTakeAwayLogin(client, req.user, current.rows[0]);
    if (ruleError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: ruleError });
    }

    await client.query(`DELETE FROM login WHERE id = $1;`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Login removed. The employee and their work are kept.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ============================================================================
// Backups (Admin > Backups). Restoring is NOT possible from the app (support tool only).
// ============================================================================

/** GET /api/admin/backups  - newest first: [{ name, size, created }] */
router.get('/backups', (req, res, next) => {
  try {
    res.json(listBackups());
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/backups  - make a backup now */
router.post('/backups', async (req, res, next) => {
  try {
    const b = await makeBackup();
    res.status(201).json({ success: true, message: `Backup made: ${b.name}`, ...b });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/backups/full  - make one complete backup file now and download it (to keep,
 *  or to load into another installation with "GarmentMFGSupport.exe import"). Not saved on the server. */
router.get('/backups/full', async (req, res, next) => {
  const tmp = path.join(os.tmpdir(), `garmentmfg-full-${Date.now()}.backup`);
  try {
    await dumpTo(tmp);
    const asName = `garmentmfg-full-backup-${new Date().toISOString().slice(0, 10)}.backup`;
    res.download(tmp, asName, () => fs.rm(tmp, { force: true }, () => {}));
  } catch (err) {
    fs.rm(tmp, { force: true }, () => {});
    next(err);
  }
});

/** GET /api/admin/backups/:name/download  - save a backup file (e.g. to a pendrive) */
router.get('/backups/:name/download', (req, res) => {
  const file = backupPath(req.params.name);
  if (!file) return res.status(404).json({ message: 'Backup not found' });
  res.download(file, req.params.name);
});

// ---------------------------------------------------------------------------------------------
// Company Branding (Admin > Company Branding): the company's name and logo, shown everywhere.
// Read by everyone at GET /api/branding (routes/branding.js).

const LOGO_START = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff] };
const MAX_LOGO_BYTES = 1024 * 1024; // the screen shrinks the picture first, so this is plenty

/**
 * PUT /api/admin/branding  { companyName, logo }
 *   logo: 'data:image/png;base64,...' (new picture) | null (remove: use the app's own logo) | left out (keep)
 */
router.put('/branding', async (req, res, next) => {
  try {
    const companyName = String(req.body?.companyName ?? '').trim();
    if (companyName.length > 200) return res.status(400).json({ message: 'The company name is too long (200 characters at most).' });

    const changeLogo = req.body?.logo !== undefined;
    let logo = null;
    let logoType = null;
    if (changeLogo && req.body.logo !== null) {
      const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.logo));
      if (m) {
        logoType = m[1];
        logo = Buffer.from(m[2], 'base64');
      }
      // the file itself must really be a PNG / JPG, not just named like one
      if (!m || !LOGO_START[logoType].every((b, i) => logo[i] === b)) {
        return res.status(400).json({ message: 'The logo must be a PNG or JPG picture.' });
      }
      if (logo.length > MAX_LOGO_BYTES) return res.status(400).json({ message: 'The logo is too big (1 MB at most).' });
    }

    const by = req.user?.username || null;
    if (changeLogo) {
      await query(
        `INSERT INTO app_branding (id, company_name, logo, logo_type, updated_on, updated_by) VALUES (1, $1, $2, $3, NOW(), $4)
         ON CONFLICT (id) DO UPDATE SET company_name = $1, logo = $2, logo_type = $3, updated_on = NOW(), updated_by = $4;`,
        [companyName, logo, logoType, by]
      );
    } else {
      await query(
        `INSERT INTO app_branding (id, company_name, updated_on, updated_by) VALUES (1, $1, NOW(), $2)
         ON CONFLICT (id) DO UPDATE SET company_name = $1, updated_on = NOW(), updated_by = $2;`,
        [companyName, by]
      );
    }
    res.json({ success: true, message: 'Company branding saved' });
  } catch (err) {
    next(err);
  }
});

export default router;
