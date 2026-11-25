// Which rights screen (see server/src/permissions.js) each page address belongs to.
// Used by the sidebar, the page guard in AppLayout, ListPage and ExportButtons.

const SCREEN_PATHS: Array<[string, string]> = [
  ['/masters/company', 'masters.company'],
  ['/masters/employee-group', 'masters.employeeGroup'],
  ['/masters/employee', 'masters.employee'],
  ['/masters/unit', 'masters.unit'],
  ['/masters/product-group', 'masters.productGroup'],
  ['/masters/product', 'masters.product'],
  ['/masters/process-master', 'masters.processMaster'],
  ['/masters/operations', 'masters.operations'],
  ['/transactions/job-order', 'transactions.jobOrder'],
  ['/transactions/lot-operation-map', 'transactions.lotMap'],
  ['/transactions/lot-operation-print', 'transactions.lotPrint'],
  ['/transactions/material-issue', 'transactions.materialIssue'],
  ['/transactions/daily-process-entry', 'transactions.dailyEntry'],
  ['/transactions/daily-op-entry', 'transactions.dailyEntry'],
  ['/reports/process-work', 'reports.processWork'],
  ['/reports/daily-process', 'reports.dailyProcess'],
  ['/reports/salary', 'reports.salary'],
  ['/reports/lot-group-qty', 'reports.lotwise'],
  ['/balance/lot-balance', 'balance.lotBalance'], // Balance Reports (new section)
  ['/balance/lot-summary', 'balance.lotSummary'], // Balance Reports (new section)
  ['/utility/update-attendance', 'utility.updateAttendance'],
  ['/utility/spine-attendance', 'utility.spine'],
];

/** The screen key for a page address, e.g. "/masters/employee/12" -> "masters.employee". Null if none. */
export function screenForPath(pathname: string): string | null {
  for (const [path, key] of SCREEN_PATHS) {
    if (pathname === path || pathname.startsWith(path + '/')) return key;
  }
  return null;
}
