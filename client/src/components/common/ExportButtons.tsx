import React, { useState } from 'react';
import { useScreenRights } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import {
  exportToCopy,
  exportToCSV,
  exportToExcel,
  exportToPDF,
  exportToPrint,
  safeFileName,
  type ExportColumn,
} from '../../utils/exportUtils';

// Copy / CSV / Excel / PDF / Print for a report or list.
// Excel, PDF and Print first open the "Report heading" box: the user types the title for the top
// of the report (default "<company> - <report name>"), an optional second line (default: the
// screen's filter, e.g. "October 2026") and ticks the company logo. The last title typed for each
// report is remembered on this PC.

export interface ExportButtonsProps {
  reportName: string; // e.g. "Salary Report"; also the Excel sheet name
  subtitle?: string; // the screen's filter for the second line, e.g. "October 2026"
  filename?: string; // for CSV (Excel / PDF are named after the heading)
  columns: ExportColumn[];
  data: any[];
  orientation?: 'portrait' | 'landscape';
  totalRow?: any; // reports: the Total row, added at the end of every export
  onCopySuccess?: () => void;
  style?: React.CSSProperties;
}

type Action = 'excel' | 'pdf' | 'print';
const ACTION_LABEL: Record<Action, string> = { excel: 'Export Excel', pdf: 'Export PDF', print: 'Print' };
const ACTION_WHERE: Record<Action, string> = { excel: 'Excel file', pdf: 'PDF', print: 'printout' };

interface Heading {
  title: string;
  subtitle: string;
  showLogo: boolean;
}

const storageKey = (reportName: string) => `garmentmfg.reportHeading.${reportName}`;
function remembered(reportName: string): Partial<Heading> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(reportName)) || '{}');
  } catch {
    return {};
  }
}
function remember(reportName: string, h: Heading) {
  try {
    localStorage.setItem(storageKey(reportName), JSON.stringify(h));
  } catch {
    // private window / storage blocked: just don't remember
  }
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  reportName,
  subtitle = '',
  filename,
  columns,
  data,
  orientation,
  totalRow,
  onCopySuccess,
  style,
}) => {
  const [copied, setCopied] = useState(false);
  const [action, setAction] = useState<Action | null>(null); // the Report heading box is open for this
  const [heading, setHeading] = useState<Heading>({ title: '', subtitle: '', showLogo: true });
  const rights = useScreenRights(); // hidden without the Print / Export right on this screen
  const branding = useBranding();

  const defaultTitle = `${branding.displayName} - ${reportName}`;
  const csvName = filename || safeFileName(reportName);

  const handleCopy = () => {
    const success = exportToCopy({ columns, data, totalRow });
    if (success) {
      setCopied(true);
      if (onCopySuccess) onCopySuccess();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCSV = () => {
    exportToCSV({ filename: csvName, columns, data, totalRow });
  };

  /** Excel / PDF / Print: open the Report heading box first */
  const openHeading = (a: Action) => {
    if (!data || data.length === 0) {
      alert('No data available to export.');
      return;
    }
    const last = remembered(reportName);
    setHeading({
      title: last.title || defaultTitle,
      subtitle: subtitle || last.subtitle || '', // the screen's current filter wins
      showLogo: last.showLogo ?? true,
    });
    setAction(a);
  };

  const runExport = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!action) return;
    const h = { ...heading, title: heading.title.trim() || defaultTitle, subtitle: heading.subtitle.trim() };
    remember(reportName, h);
    const opts = {
      title: h.title,
      subtitle: h.subtitle,
      logoDataUrl: h.showLogo ? branding.logoDataUrl : '',
      filename: safeFileName(h.title) || csvName,
      sheetName: reportName,
      columns,
      data,
      orientation,
      totalRow,
    };
    setAction(null);
    if (action === 'excel') exportToExcel(opts);
    else if (action === 'pdf') exportToPDF(opts);
    else exportToPrint(opts);
  };

  const btnStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    border: '1px solid var(--border-color)',
    color: 'var(--text-heading)',
    padding: '7px 11px',
    fontSize: '0.8rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 500,
    lineHeight: 1.5,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.15s ease-in-out',
  };

  if (!rights.print) return null;

  return (
    <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', ...style }}>
      <button
        type="button"
        onClick={handleCopy}
        style={btnStyle}
        title="Copy table data to clipboard"
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-soft)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
      >
        <i className="bi bi-clipboard" /> {copied ? '✓ Copied' : 'Copy'}
      </button>

      <button
        type="button"
        onClick={handleCSV}
        style={btnStyle}
        title="Export as CSV"
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-soft)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
      >
<i className="bi bi-filetype-csv" /> CSV
      </button>

      <button
        type="button"
        onClick={() => openHeading('excel')}
        style={btnStyle}
        title="Export as Excel Spreadsheet (.xlsx)"
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-soft)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
      >
<i className="bi bi-file-earmark-excel" /> Excel
      </button>

      <button
        type="button"
        onClick={() => openHeading('pdf')}
        style={btnStyle}
        title="Export as PDF Document"
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-soft)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
      >
<i className="bi bi-file-earmark-pdf" /> PDF
      </button>

      <button
        type="button"
        onClick={() => openHeading('print')}
        style={btnStyle}
        title="Print clean table report"
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-soft)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
      >
<i className="bi bi-printer" /> Print
      </button>

      {action && (
        <div style={overlay} onMouseDown={() => setAction(null)} onKeyDown={(e) => e.key === 'Escape' && setAction(null)}>
          <form style={dialog} onSubmit={runExport} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-heading)' }}>Report heading</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 16px' }}>
              Shown at the top of the {ACTION_WHERE[action]}.
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={labelStyle} htmlFor="report-title">Title</label>
              <button
                type="button"
                style={linkBtn}
                onClick={() => setHeading({ title: defaultTitle, subtitle, showLogo: true })}
              >
                Reset to default
              </button>
            </div>
            <input
              id="report-title"
              autoFocus
              value={heading.title}
              maxLength={150}
              onChange={(e) => setHeading({ ...heading, title: e.target.value })}
              style={inputStyle}
            />

            <label style={{ ...labelStyle, marginTop: '14px' }} htmlFor="report-subtitle">
              Second line <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
            </label>
            <input
              id="report-subtitle"
              value={heading.subtitle}
              maxLength={150}
              placeholder="e.g. October 2026"
              onChange={(e) => setHeading({ ...heading, subtitle: e.target.value })}
              style={inputStyle}
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '0.9rem', cursor: action === 'excel' ? 'default' : 'pointer', color: action === 'excel' ? 'var(--text-muted)' : 'var(--text-heading)' }}>
              <input
                type="checkbox"
                checked={action !== 'excel' && heading.showLogo}
                disabled={action === 'excel'}
                onChange={(e) => setHeading({ ...heading, showLogo: e.target.checked })}
              />
              Show the company logo
              {action === 'excel' && <span style={{ fontSize: '0.8rem' }}>(Excel files can't hold pictures)</span>}
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
              <button type="button" onClick={() => setAction(null)} style={secondaryBtn}>Cancel</button>
              <button type="submit" style={primaryBtn}>{ACTION_LABEL[action]}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(17, 24, 39, 0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
};
const dialog: React.CSSProperties = {
  width: '460px',
  maxWidth: '92vw',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.2)',
  padding: '24px 26px',
  textAlign: 'left',
};
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px', fontSize: '0.88rem' };
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  fontSize: '0.93rem',
  outline: 'none',
  boxSizing: 'border-box',
};
const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--primary)',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
};
const primaryBtn: React.CSSProperties = {
  backgroundColor: 'var(--primary)',
  color: '#ffffff',
  border: 'none',
  borderRadius: '9px',
  padding: '9px 18px',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  backgroundColor: '#ffffff',
  color: 'var(--text-heading)',
  border: '1px solid var(--border-color)',
  borderRadius: '9px',
  padding: '9px 16px',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
};
