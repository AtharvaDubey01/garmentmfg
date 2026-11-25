// Safety rules for logins, used by Admin > Create Login and by Master > Employee.
//
//   * Only an admin can remove, deactivate or un-admin a login.
//   * Nobody can do that to their OWN login (another admin has to).
//   * The last active admin can never be removed, deactivated or un-admined
//     (otherwise nobody could manage logins any more).
//   * An employee who has a login can only be edited or deleted by an admin
//     (their employee code is their username).
//   * Permanent logins (ADMIN, and our hidden KANVTECH support login) can never be removed,
//     deactivated or un-admined. ADMIN's password can still be changed.

/** The login of an employee, or null if they don't have one. */
export async function loginOfEmployee(db, empId) {
  const res = await db.query(`SELECT id, isadmin, isactive, permanent, hidden FROM login WHERE empid = $1;`, [empId]);
  return res.rows[0] || null;
}

/** How many active admin logins exist, leaving out one login (or none). */
export async function activeAdminCount(db, exceptLoginId = null) {
  const res = await db.query(
    `SELECT COUNT(*) AS n FROM login l
     INNER JOIN operatormaster o ON o.id = l.empid AND TRIM(o.isdeleted) = 'NO'
     WHERE l.isadmin = 'YES' AND l.isactive = 'YES' AND l.hidden = 'NO' AND ($1::bigint IS NULL OR l.id <> $1);`,
    [exceptLoginId]
  );
  return parseInt(res.rows[0].n, 10);
}

/**
 * Can `user` take a login away (delete it, deactivate it, or remove its admin tick)?
 * Returns an error message, or null if it's allowed.
 */
export async function checkCanTakeAwayLogin(db, user, login) {
  if (!user?.isAdmin) {
    return 'Only an admin can change or remove a login.';
  }
  if (login.permanent === 'YES') {
    return "ADMIN is the permanent main login: it can't be removed, deactivated or lose admin (its password can still be changed).";
  }
  if (Number(login.id) === Number(user.id)) {
    return "You can't remove, deactivate or un-admin your own login. Another admin has to do it.";
  }
  if (login.isadmin === 'YES' && login.isactive === 'YES' && (await activeAdminCount(db, login.id)) === 0) {
    return "This is the last active admin, so it can't be removed, deactivated or un-admined.";
  }
  return null;
}
