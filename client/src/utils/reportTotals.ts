/**
 * Add up one number column for a report's Total row.
 * Pass ALL rows that match the filters and search (not just the current page).
 * Numbers saved as text ("232.00") count too; empty or non-number values count as 0.
 * Rounded to 2 decimals so adding many prices doesn't show 1712.0000000002.
 */
export function sumOf<T>(rows: T[], value: (row: T) => unknown): number {
  const total = rows.reduce((sum, row) => sum + (Number(value(row)) || 0), 0);
  return Math.round(total * 100) / 100;
}
