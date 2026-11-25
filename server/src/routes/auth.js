import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { requireAuth, loadLogin } from '../middleware/auth.js';
import config from '../config.js';
import { checkPassword } from '../passwords.js';

const router = express.Router();
const SESSION_SECRET = config.sessionSecret;

/**
 * POST /api/auth/login
 * Mirrors old Login.aspx.cs behaviour:
 * - Empty fields -> "Please Enter valid Email Address and Password"
 * - Wrong credentials -> "Enter Correct Username or Passsword"
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const code = (username || '').trim();
  const rawPassword = (password || '').trim();

  if (!code || !rawPassword) {
    return res.status(400).json({
      status: 'error',
      message: 'Please enter your Employee Code and Password',
    });
  }

  try {
    // Username = employee code (any case). Password is plain text, set by an admin.
    const result = await query(
      `SELECT l.id, l.password, l.passwordhash, l.isactive
       FROM login l
       INNER JOIN operatormaster o ON o.id = l.empid AND TRIM(o.isdeleted) = 'NO'
       WHERE UPPER(TRIM(o.empcode)) = UPPER($1);`,
      [code]
    );

    // The hidden support login (KANVTECH) has only a hashed password; it can't log in until one is set
    const row = result.rows[0];
    const passwordOk = row && (row.passwordhash ? checkPassword(rawPassword, row.passwordhash) : row.password !== '' && row.password === rawPassword);
    if (!passwordOk) {
      return res.status(401).json({
        status: 'error',
        message: 'Enter Correct Employee Code or Password',
      });
    }
    if (result.rows[0].isactive !== 'YES') {
      return res.status(401).json({
        status: 'error',
        message: 'This login is deactivated. Please contact an admin.',
      });
    }

    const user = await loadLogin(result.rows[0].id);

    // Login cookie (7 days). It only holds the login id; rights are re-read on every request.
    const token = jwt.sign({ id: user.id }, SESSION_SECRET, { expiresIn: '7d' });
    res.cookie('garmentmfg_token', token, {
      httpOnly: true,
      secure: false, // the factory LAN uses plain http (no https), so the cookie must not be https-only
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      status: 'success',
      message: 'Logged in successfully',
      user,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error during login',
    });
  }
});

/**
 * POST /api/auth/logout
 * Clears authentication cookie
 */
router.post('/logout', (req, res) => {
  res.clearCookie('garmentmfg_token');
  return res.status(200).json({
    status: 'success',
    message: 'Logged out successfully',
  });
});

/**
 * GET /api/auth/me
 * Returns the logged-in user: code, name, isAdmin and rights (the screens use this to show/hide things)
 */
router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({
    status: 'success',
    user: req.user,
  });
});

export default router;
