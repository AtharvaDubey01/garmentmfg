// Screens and the rights an admin can tick for each login (Admin > Create Login).
// This is the ONE list of screens/rights: the server checks against it, and the
// Create Login screen draws its tick grid from it (GET /api/admin/screens).
//
// A login's rights are stored in login.rights as { screenKey: [action, ...] }.
// Admins (login.isadmin = 'YES') may do everything; their ticks are ignored.
//
// Actions:
//   view    - see the screen (no view = hidden from the sidebar)
//   create  - add new records
//   edit    - change existing records
//   delete  - delete records
//   print   - Print / Export buttons (Copy, CSV, Excel, PDF, Print)
//   special - extra rights listed per screen (e.g. changeRates)

export const SCREENS = [
  // Master
  { key: 'masters.company', group: 'Master', name: 'Company', actions: ['view', 'create', 'edit', 'delete', 'print'] },
  { key: 'masters.employeeGroup', group: 'Master', name: 'Employee Group', actions: ['view', 'create', 'edit', 'delete', 'print'] },
  { key: 'masters.employee', group: 'Master', name: 'Employee', actions: ['view', 'create', 'edit', 'delete', 'print'] },
  { key: 'masters.unit', group: 'Master', name: 'Unit', actions: ['view', 'create', 'edit', 'delete', 'print'] },
  { key: 'masters.productGroup', group: 'Master', name: 'Product Group', actions: ['view', 'create', 'edit', 'delete', 'print'] },
  { key: 'masters.product', group: 'Master', name: 'Product', actions: ['view', 'create', 'edit', 'delete', 'print'] },
  { key: 'masters.processMaster', group: 'Master', name: 'Process Master', actions: ['view', 'create', 'edit', 'delete', 'print'] },
  { key: 'masters.operations', group: 'Master', name: 'Operations', actions: ['view', 'create', 'edit', 'delete', 'print'] },

  // Transactions
  {
    key: 'transactions.jobOrder', group: 'Transactions', name: 'Job Order Booking',
    actions: ['view', 'create', 'edit', 'delete', 'print'],
    special: [{ key: 'closeLot', name: 'Close / reopen lot' }],
  },
  {
    key: 'transactions.lotMap', group: 'Transactions', name: 'Lot Operation Map',
    actions: ['view', 'create', 'edit', 'delete', 'print'],
    special: [{ key: 'changeRates', name: 'Change rates' }],
  },
  { key: 'transactions.materialIssue', group: 'Transactions', name: 'Material Issue', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'transactions.dailyEntry', group: 'Transactions', name: 'Daily Process Entry', actions: ['view', 'create', 'edit', 'delete', 'print'] },
  { key: 'transactions.lotPrint', group: 'Transactions', name: 'Lot Operation Print', actions: ['view', 'print'] },

  // Reports
  { key: 'reports.processWork', group: 'Reports', name: 'Process Work Report', actions: ['view', 'print'] },
  { key: 'reports.dailyProcess', group: 'Reports', name: 'Daily Process Report', actions: ['view', 'print'] },
  { key: 'reports.salary', group: 'Reports', name: 'Salary Report', actions: ['view', 'print'] },
  { key: 'reports.lotwise', group: 'Reports', name: 'Lotwise Groupwise Qty Report', actions: ['view', 'print'] },

  // Balance Reports (new section): previous months + this month + balance per lot (listed under Reports)
  { key: 'balance.lotBalance', group: 'Reports', name: 'Lot Balance Sheet', actions: ['view', 'print'] },
  { key: 'balance.lotSummary', group: 'Reports', name: 'Lot Summary', actions: ['view', 'print'] },

  // Utility
  {
    key: 'utility.updateAttendance', group: 'Utility', name: 'Update Attendance',
    actions: ['view', 'print'],
    special: [{ key: 'runUpdate', name: 'Run Update Attendance' }],
  },
  { key: 'utility.spine', group: 'Utility', name: 'Spine Attendance Excel', actions: ['view', 'print'] },
];

const ACTION_WORDS = {
  view: 'see', create: 'add to', edit: 'change', delete: 'delete from', print: 'print or export',
};

/** Every right that exists for a screen (normal actions + its special keys). */
function allowedActions(screen) {
  return [...screen.actions, ...(screen.special || []).map((s) => s.key)];
}

/**
 * Clean a rights object coming from the Create Login screen: keep only real screens and actions.
 * Any right other than view also needs view (you can't edit a screen you can't open), so view is added.
 */
export function cleanRights(rights) {
  const clean = {};
  for (const screen of SCREENS) {
    const ticked = Array.isArray(rights?.[screen.key]) ? rights[screen.key] : [];
    const kept = allowedActions(screen).filter((a) => ticked.includes(a));
    if (kept.length > 0) {
      clean[screen.key] = kept.includes('view') ? kept : ['view', ...kept];
    }
  }
  return clean;
}

/** Can this logged-in user do `action` on `screenKey`? */
export function can(user, screenKey, action) {
  if (!user) return false;
  if (user.isAdmin) return true;
  const list = user.rights?.[screenKey];
  return Array.isArray(list) && list.includes(action);
}

/** Plain message for a refused action. */
export function noRightMessage(screenKey, action) {
  const screen = SCREENS.find((s) => s.key === screenKey);
  const special = screen?.special?.find((s) => s.key === action);
  const what = special ? `"${special.name}" on ${screen.name}` : `${ACTION_WORDS[action] || action} ${screen ? screen.name : screenKey}`;
  return special ? `You don't have the right ${what}. Ask an admin.` : `You don't have the right to ${what}. Ask an admin.`;
}

/**
 * Route middleware: only let the request through if the user has the right.
 *   router.post('/units', requireRight('masters.unit', 'create'), ...)
 */
export const requireRight = (screenKey, action) => (req, res, next) => {
  if (can(req.user, screenKey, action)) return next();
  return res.status(403).json({ status: 'error', message: noRightMessage(screenKey, action) });
};

/** Route middleware: admins only (Admin > Create Login). */
export const requireAdmin = (req, res, next) => {
  if (req.user?.isAdmin) return next();
  return res.status(403).json({ status: 'error', message: 'Only an admin can do this.' });
};

/**
 * Router middleware for READS (GET): the user needs View on at least one screen that uses that data.
 *   router.use(requireViewFor([['/products', ['masters.product', 'transactions.jobOrder']], ...]))
 * Paths match exactly or as a prefix ("/products" also covers "/products/12").
 * A GET that isn't listed is refused for non-admins, so a new route can't leak data by being forgotten.
 */
export const requireViewFor = (pathScreens) => (req, res, next) => {
  if (req.method !== 'GET' || req.user?.isAdmin) return next();
  const entry = pathScreens.find(([path]) => req.path === path || req.path.startsWith(path + '/'));
  if (entry && entry[1].some((screenKey) => can(req.user, screenKey, 'view'))) return next();
  const names = entry ? entry[1].map((k) => SCREENS.find((s) => s.key === k)?.name || k).join(' or ') : 'this data';
  return res.status(403).json({ status: 'error', message: `You don't have the right to see ${names}. Ask an admin.` });
};
