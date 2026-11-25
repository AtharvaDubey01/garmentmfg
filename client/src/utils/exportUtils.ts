import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportColumn {
  header: string;
  key: string;
  render?: (row: any) => any;
  // 'right' for numbers. 'left' set on purpose (Lot No., Year, codes) also keeps the value
  // as text in Excel, so Excel doesn't turn "40" into a number and push it to the right.
  align?: 'left' | 'center' | 'right';
}

export interface ExportOptions {
  // The heading at the top of the PDF / Print / Excel, typed by the user before exporting
  // (Report heading box in ExportButtons), e.g. "ABC Garments (P) Ltd - Salary Report".
  title?: string;
  subtitle?: string; // optional second line, e.g. "October 2026"
  logoDataUrl?: string; // the company logo next to the heading (PDF and Print); '' = none
  sheetName?: string; // Excel sheet name (short, e.g. "Salary Report")
  filename?: string;
  columns: ExportColumn[];
  data: any[];
  orientation?: 'portrait' | 'landscape';
  // A report's Total row: same shape as a data row ("Total" in the first column, sums in the
  // number columns). Added after the last row, in bold.
  totalRow?: any;
}

/** A file name from a heading: "ABC Garments (P) Ltd - Salary Report" -> "ABC_Garments_P_Ltd_Salary_Report" */
export function safeFileName(text: string): string {
  return text.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * A "wide" table has many columns (e.g. a report with 31 day columns). PDF and Print then
 * use smaller text and tighter cells, so every column fits across the page and no header
 * gets squeezed into one letter per line.
 */
const WIDE_TABLE_COLUMNS = 15;

export function getColumnAlign(col: ExportColumn): 'left' | 'right' | 'center' {
  if (col.align) return col.align;
  const matchStr = `${col.header} ${col.key}`.toLowerCase();
  if (/(qty|rate|amount|amt|total|price|af1|pcs)/i.test(matchStr)) {
    return 'right';
  }
  return 'left';
}

/**
 * Print arbitrary HTML content cleanly in a popup window
 */
export function printHtmlContent(title: string = 'GarmentMFG', contentHtml: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up was blocked. Please allow pop-ups for this site to print.');
    return;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: portrait;
      margin: 10mm 15mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #212529;
      margin: 0;
      padding: 20px;
      background: #ffffff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #dee2e6;
      padding: 6px 10px;
      text-align: left;
    }
    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  ${contentHtml}
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWhenReady(printWindow);
}

/** Print once every picture in the window (e.g. the company logo) has loaded */
function printWhenReady(win: Window) {
  const pending = Array.from(win.document.images)
    .filter((img) => !img.complete)
    .map((img) => new Promise<void>((resolve) => { img.onload = img.onerror = () => resolve(); }));
  Promise.all(pending).then(() => setTimeout(() => win.print(), 250));
}

/**
 * DataTables-style Print export:
 * Opens a clean popup window with only the heading (company logo, title, second line) and the
 * clean table, then triggers window.print(). Matches legacy jQuery DataTables print output.
 */
export function exportToPrint({
  title = 'GarmentMFG',
  subtitle = '',
  logoDataUrl = '',
  columns,
  data,
  orientation,
  totalRow,
}: ExportOptions) {
  if (!data || data.length === 0) {
    alert('No data available to print.');
    return;
  }

  // Filter out Action columns or buttons
  const exportableCols = columns.filter(
    (c) => !['action', 'actions', 'delete', 'edit'].includes(c.key.toLowerCase())
  );

  const headers = exportableCols.map((c) => c.header);
  const aligns = exportableCols.map((c) => getColumnAlign(c));
  const allRows = totalRow ? [...data, totalRow] : data;
  const rows = allRows.map((row) =>
    exportableCols.map((c) => {
      if (c.render) {
        const res = c.render(row);
        if (typeof res === 'string' || typeof res === 'number') return String(res);
      }
      const val = row[c.key];
      return val !== undefined && val !== null ? String(val) : '';
    })
  );

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up was blocked. Please allow pop-ups for this site to print.');
    return;
  }

  const isLandscape = orientation === 'landscape' || exportableCols.length > 7;
  const isWide = exportableCols.length > WIDE_TABLE_COLUMNS;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${isLandscape ? 'landscape' : 'portrait'};
      margin: ${isWide ? '8mm' : '12mm 15mm'};
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #212529;
      margin: 0;
      padding: 24px;
      background: #ffffff;
    }
    .report-head {
      display: flex;
      align-items: center;
      gap: 14px;
      margin: 0 0 ${isWide ? '8px' : '18px'} 0;
    }
    .report-head img {
      max-height: ${isWide ? '34px' : '52px'};
      max-width: 200px;
      object-fit: contain;
    }
    h1 {
      font-size: ${isWide ? '18px' : '26px'};
      font-weight: 500;
      color: #212529;
      margin: 0;
    }
    .report-sub {
      font-size: ${isWide ? '11px' : '14px'};
      color: #6c757d;
      margin-top: 3px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${isWide ? '8px' : '13px'};
      margin-top: ${isWide ? '4px' : '10px'};
    }
    th, td {
      border: 1px solid #dee2e6;
      padding: ${isWide ? '3px 3px' : '7px 10px'};
      text-align: left;
    }
    th {
      white-space: ${isWide ? 'nowrap' : 'normal'};
    }
    th {
      background-color: #f8f9fa;
      font-weight: 600;
      color: #212529;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    tr:nth-child(even) td {
      background-color: #fafafa;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    tr.total td {
      font-weight: 700;
      background-color: #eef0f3;
      border-top: 2px solid #adb5bd;
    }
    @media print {
      body {
        padding: 0;
      }
      table {
        page-break-inside: auto;
      }
      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      thead {
        display: table-header-group;
      }
    }
  </style>
</head>
<body>
  <div class="report-head">
    ${logoDataUrl ? `<img src="${escapeHtml(logoDataUrl)}" alt="" />` : ''}
    <div>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<div class="report-sub">${escapeHtml(subtitle)}</div>` : ''}
    </div>
  </div>
  <table>
    <thead>
      <tr>
        ${headers.map((h, i) => `<th style="text-align:${aligns[i]}">${escapeHtml(h)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row, r) =>
            `<tr${totalRow && r === rows.length - 1 ? ' class="total"' : ''}>${row
              .map((cell, i) => `<td style="text-align:${aligns[i]}">${escapeHtml(cell)}</td>`)
              .join('')}</tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWhenReady(printWindow); // after the logo has loaded
}

/**
 * Value for one Excel cell:
 *   - number-looking text ("232.00", "15") becomes a real number, so Excel can SUM it;
 *     `decimals` keeps how it was shown (232.00 stays 232.00)
 *   - codes with a leading zero ("01", "001") stay text, so the zero isn't lost
 */
function toExcelCell(value: any): { v: any; decimals: number | null } {
  if (typeof value === 'number') return { v: value, decimals: null };
  if (typeof value !== 'string') return { v: value ?? '', decimals: null };
  const text = value.trim();
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(text)) {
    const dot = text.indexOf('.');
    return { v: Number(text), decimals: dot === -1 ? null : text.length - dot - 1 };
  }
  return { v: value, decimals: null };
}

/**
 * Native Excel (.xlsx) export using SheetJS:
 * Generates an actual .xlsx file with proper column widths and sheet naming.
 * With a title: the heading (and second line) are the first rows, spread across the table, then
 * an empty row, then the column headers and the data. (Excel files get no logo: the free SheetJS
 * can't put pictures in.)
 */
export function exportToExcel({
  filename = 'GarmentMFG_Export',
  title = '',
  subtitle = '',
  sheetName = '',
  columns,
  data,
  totalRow,
}: ExportOptions) {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  const exportableCols = columns.filter(
    (c) => !['action', 'actions', 'delete', 'edit'].includes(c.key.toLowerCase())
  );

  const headers = exportableCols.map((c) => c.header);
  const allRows = totalRow ? [...data, totalRow] : data;
  const cells = allRows.map((row) =>
    exportableCols.map((c) => {
      let value = row[c.key];
      if (c.render) {
        const res = c.render(row);
        if (typeof res === 'string' || typeof res === 'number') value = res;
      }
      if (c.align === 'left') return { v: value ?? '', decimals: null }; // codes stay text
      return toExcelCell(value);
    })
  );
  const rows = cells.map((r) => r.map((cell) => cell.v));

  // heading rows above the table: title, second line, an empty row
  const headingRows: string[][] = [];
  if (title) headingRows.push([title]);
  if (title && subtitle) headingRows.push([subtitle]);
  if (headingRows.length) headingRows.push([]);
  const headerRow = headingRows.length; // where the column headers are (0-based)

  const worksheet = XLSX.utils.aoa_to_sheet([...headingRows, headers, ...rows]);
  const lastCol = Math.max(headers.length - 1, 0);
  worksheet['!merges'] = headingRows
    .filter((r) => r.length)
    .map((_, i) => ({ s: { r: i, c: 0 }, e: { r: i, c: lastCol } }));

  // Keep the decimals the screen shows (e.g. 232.00) on number cells
  cells.forEach((r, rowIdx) =>
    r.forEach((cell, colIdx) => {
      if (cell.decimals) {
        const ref = XLSX.utils.encode_cell({ r: headerRow + rowIdx + 1, c: colIdx });
        if (worksheet[ref]) worksheet[ref].z = `0.${'0'.repeat(cell.decimals)}`;
      }
    })
  );

  // Set intelligent column widths
  const colWidths = headers.map((header, colIdx) => {
    let maxLen = header.length;
    for (const r of rows) {
      const len = String(r[colIdx] ?? '').length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  const safeSheetName = (sheetName || title || 'Data').replace(/[\\/?*[\]:]/g, '').slice(0, 31).trim();
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName || 'Sheet1');

  const cleanFilename = `${filename.replace(/\.xlsx$/i, '')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, cleanFilename);
}

/**
 * Standard CSV export with UTF-8 BOM for proper character and column display.
 */
export function exportToCSV({
  filename = 'GarmentMFG_Export',
  columns,
  data,
  totalRow,
}: ExportOptions) {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  const exportableCols = columns.filter(
    (c) => !['action', 'actions', 'delete', 'edit'].includes(c.key.toLowerCase())
  );

  const headerRow = exportableCols.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');
  const rows = (totalRow ? [...data, totalRow] : data).map((row) =>
    exportableCols
      .map((c) => {
        let val = '';
        if (c.render) {
          const res = c.render(row);
          if (typeof res === 'string' || typeof res === 'number') val = String(res);
        } else {
          val = row[c.key] !== undefined && row[c.key] !== null ? String(row[c.key]) : '';
        }
        return `"${val.replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  const csvContent = '\uFEFF' + [headerRow, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename.replace(/\.csv$/i, '')}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * PDF file export using jsPDF & autotable:
 * Directly downloads a structured, beautifully styled PDF document.
 */
export function exportToPDF({
  filename = 'GarmentMFG_Export',
  title = 'GarmentMFG',
  subtitle = '',
  logoDataUrl = '',
  columns,
  data,
  orientation,
  totalRow,
}: ExportOptions) {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  const exportableCols = columns.filter(
    (c) => !['action', 'actions', 'delete', 'edit'].includes(c.key.toLowerCase())
  );

  const isLandscape = orientation === 'landscape' || exportableCols.length > 7;
  const isWide = exportableCols.length > WIDE_TABLE_COLUMNS;
  const sideMargin = isWide ? 20 : 40;

  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  // Heading: company logo on the left, then the title, the second line and the date beside it
  const top = 24;
  let textX = sideMargin;
  let logoBottom = 0;
  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl);
      let h = isWide ? 30 : 42;
      let w = (h * props.width) / props.height;
      if (w > 170) {
        w = 170;
        h = (w * props.height) / props.width;
      }
      doc.addImage(logoDataUrl, props.fileType || 'PNG', sideMargin, top, w, h);
      textX = sideMargin + w + 14;
      logoBottom = top + h;
    } catch {
      // a picture jsPDF can't read: the heading without it
    }
  }
  const maxTextWidth = doc.internal.pageSize.getWidth() - textX - sideMargin;
  let size = 18; // shrink a long title until it fits on one line
  doc.setFontSize(size);
  while (size > 10 && doc.getTextWidth(title) > maxTextWidth) doc.setFontSize(--size);
  doc.setTextColor(33, 37, 41);
  doc.text(title || 'GarmentMFG', textX, 42);
  let textBottom = 42;
  if (subtitle) {
    doc.setFontSize(11);
    doc.setTextColor(73, 80, 87);
    doc.text(subtitle, textX, 58);
    textBottom = 58;
  }
  doc.setFontSize(9);
  doc.setTextColor(108, 117, 125);
  doc.text(`Generated on ${new Date().toLocaleString()}`, textX, textBottom + 14);
  textBottom += 14;
  const tableTop = Math.max(textBottom, logoBottom) + 12;

  const headers = exportableCols.map((c) => c.header);
  const aligns = exportableCols.map((c) => getColumnAlign(c));
  const allRows = totalRow ? [...data, totalRow] : data;
  const rows = allRows.map((row) =>
    exportableCols.map((c) => {
      if (c.render) {
        const res = c.render(row);
        if (typeof res === 'string' || typeof res === 'number') return String(res);
      }
      const val = row[c.key];
      return val !== undefined && val !== null ? String(val) : '';
    })
  );

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: tableTop,
    margin: { left: sideMargin, right: sideMargin, bottom: 30 },
    theme: 'grid',
    headStyles: {
      fillColor: [240, 242, 245],
      textColor: [33, 37, 41],
      fontStyle: 'bold',
      fontSize: isWide ? 6.5 : 9,
    },
    styles: {
      fontSize: isWide ? 6.5 : 8,
      cellPadding: isWide ? 2 : 5,
      textColor: [33, 37, 41],
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    // numbers on the right (titles too); the Total row in bold
    didParseCell: (cell) => {
      cell.cell.styles.halign = aligns[cell.column.index];
      if (totalRow && cell.section === 'body' && cell.row.index === rows.length - 1) {
        cell.cell.styles.fontStyle = 'bold';
        cell.cell.styles.fillColor = [235, 237, 240];
      }
    },
  });

  doc.save(`${filename.replace(/\.pdf$/i, '')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * Tab-delimited copy to clipboard with header row
 */
export function exportToCopy({
  columns,
  data,
  totalRow,
}: ExportOptions): boolean {
  if (!data || data.length === 0) return false;

  const exportableCols = columns.filter(
    (c) => !['action', 'actions', 'delete', 'edit'].includes(c.key.toLowerCase())
  );

  const headerRow = exportableCols.map((c) => c.header).join('\t');
  const rows = (totalRow ? [...data, totalRow] : data).map((row) =>
    exportableCols
      .map((c) => {
        if (c.render) {
          const res = c.render(row);
          if (typeof res === 'string' || typeof res === 'number') return String(res);
        }
        return row[c.key] !== undefined && row[c.key] !== null ? String(row[c.key]) : '';
      })
      .join('\t')
  );

  const text = [headerRow, ...rows].join('\n');
  navigator.clipboard.writeText(text);
  return true;
}
