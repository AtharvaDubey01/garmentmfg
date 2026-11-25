import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import config from '../config.js';

const SESSION_SECRET = config.sessionSecret;

/**
 * Load a login with its employee. Returns null if it doesn't exist, is inactive,
 * or its employee was deleted. Used at login and on every request, so a deactivated
 * login or a change of rights takes effect straight away.
 */
export async function loadLogin(loginId) {
  const res = await query(
    `SELECT l.id, l.isadmin, l.isactive, l.rights, o.id AS empid, o.empcode, o.operatorname
     FROM login l
     INNER JOIN operatormaster o ON o.id = l.empid AND TRIM(o.isdeleted) = 'NO'
     WHERE l.id = $1 AND l.isactive = 'YES';`,
    [loginId]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: Number(row.id),
    empid: Number(row.empid),
    username: row.empcode, // username = employee code (also saved as "entered by" on records)
    name: row.operatorname,
    isAdmin: row.isadmin === 'YES',
    rights: row.rights || {},
  };
}

/**
 * Authentication Middleware
 * Checks the login cookie, then reloads the login from the database (see loadLogin).
 */
export const requireAuth = async (req, res, next) => {
  let token = req.cookies?.garmentmfg_token;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized. Please log in.',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, SESSION_SECRET);
  } catch (err) {
    return res.status(401).json({
      status: 'error',
      message: 'Session expired or invalid token. Please log in again.',
    });
  }

  try {
    const user = await loadLogin(decoded.id);
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'This login is no longer active. Please contact an admin.',
      });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
