import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * How many table rows fit in a table box (the div with className "table-box"),
 * so a list or report shows a full screen of rows instead of a fixed 10 or 25.
 *
 * Measured again when the window is resized and whenever something in `deps` changes
 * (pass the data, so it is measured once real rows are on screen).
 * Uses the height of the shortest data row (a one-line row); if some rows are
 * taller, the box scrolls a little inside. Never fewer than 3 rows.
 * Leaves room for the column titles and, in reports, the Total row (thead / tfoot).
 */
export function useRowsThatFit(boxRef: RefObject<HTMLElement | null>, deps: unknown[]): number {
  const [rowsThatFit, setRowsThatFit] = useState(10);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const headHeight = box.querySelector('thead')?.getBoundingClientRect().height || 40;
      const footHeight = box.querySelector('tfoot')?.getBoundingClientRect().height || 0;
      // data rows only: skip "Loading..." / "No records" rows (one cell spanning the whole table)
      const rowHeights = Array.from(box.querySelectorAll('tbody tr'))
        .filter((tr) => !tr.querySelector('td[colspan]'))
        .map((tr) => tr.getBoundingClientRect().height);
      const rowHeight = rowHeights.length ? Math.min(...rowHeights) : 40;
      setRowsThatFit(Math.max(3, Math.floor((box.clientHeight - headHeight - footHeight) / rowHeight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return rowsThatFit;
}
