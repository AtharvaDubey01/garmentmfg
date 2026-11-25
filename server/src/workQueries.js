// Shared SQL for anything that reads Daily Process Entry work: the Reports and the Spine Attendance export.
// Keeping it in one place means Salary, the reports and Spine always agree.
//
// Usage:  SELECT ... ${WORK_FROM} WHERE ${where}   with { where, params } = workFilters({ year, month, group })
// Table aliases: meh = month sheet, med = sheet row, om = worker, lg = group, joo = lot step (rate), op = operation

// Total pieces in one monthentrydetail row (days 1..31)
export const ROW_PIECES = `(med.d1+med.d2+med.d3+med.d4+med.d5+med.d6+med.d7+med.d8+med.d9+med.d10+
  med.d11+med.d12+med.d13+med.d14+med.d15+med.d16+med.d17+med.d18+med.d19+med.d20+
  med.d21+med.d22+med.d23+med.d24+med.d25+med.d26+med.d27+med.d28+med.d29+med.d30+med.d31)`;

// Daily Process Entry rows with worker, group and the lot's CURRENT rate from Lot Operation Map.
// Lots are matched ignoring case/spaces, like the rest of the app. Deleted rows are skipped.
export const WORK_FROM = `
  FROM monthentryheader meh
  INNER JOIN monthentrydetail med ON meh.id = med.headerid
  INNER JOIN operatormaster om ON meh.empid = om.id
  INNER JOIN ledgergroup lg ON meh.ledgrpid = lg.id
  INNER JOIN joborder_operations joo ON LOWER(TRIM(med.lotno)) = LOWER(TRIM(joo.batchname))
                                    AND med.processid = joo.operations AND TRIM(joo.isdeleted) = 'NO'
  LEFT JOIN operationrate op ON op.id = med.processid`;

/**
 * WHERE conditions + params for the Year / Month / Group filters shared by the reports.
 * Empty values (or '--Select--') mean "all".
 */
export function workFilters({ year, month, group }) {
  const where = [
    "TRIM(meh.isdeleted) = 'NO'",
    "TRIM(med.isdeleted) = 'NO'",
    "TRIM(om.isdeleted) = 'NO'",
    "TRIM(lg.isdeleted) = 'NO'",
  ];
  const params = [];
  if (year && year.trim() !== '') {
    params.push(year.trim());
    where.push(`TRIM(meh.yearname::text) = $${params.length}`);
  }
  if (month && month.trim() !== '' && month !== '--Select--') {
    params.push(month.trim());
    where.push(`TRIM(meh.monthname) ILIKE $${params.length}`);
  }
  if (group && group.trim() !== '' && group !== '--Select--') {
    params.push(group.trim());
    where.push(`TRIM(lg.ledgrpname) ILIKE $${params.length}`);
  }
  return { where: where.join(' AND '), params };
}
