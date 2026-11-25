// Company Branding (the company's name and logo). Readable by everyone, also before login,
// because the login page shows it. Changing it: PUT /api/admin/branding (admins only, routes/admin.js).

import express from 'express';
import { query } from '../db.js';

const router = express.Router();

/** GET /api/branding  - { companyName, hasLogo, version }  (version changes on every save) */
router.get('/', async (req, res, next) => {
  try {
    const r = await query(`SELECT company_name, logo IS NOT NULL AS has_logo, updated_on FROM app_branding WHERE id = 1;`);
    const row = r.rows[0] || {};
    res.json({
      companyName: row.company_name || '',
      hasLogo: !!row.has_logo,
      version: row.updated_on ? new Date(row.updated_on).getTime() : 0,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/branding/logo  - the logo picture; 404 = none set (the app then uses its own logo) */
router.get('/logo', async (req, res, next) => {
  try {
    const r = await query(`SELECT logo, logo_type FROM app_branding WHERE id = 1;`);
    const row = r.rows[0];
    if (!row?.logo) return res.status(404).json({ message: 'No logo set' });
    res.set({ 'Content-Type': row.logo_type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.send(row.logo);
  } catch (err) {
    next(err);
  }
});

export default router;
