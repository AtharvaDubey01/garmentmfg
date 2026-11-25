import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PencilIcon, TrashIcon, PlusIcon, PrinterIcon, SearchIcon } from './Icons';
import { ExportButtons } from './ExportButtons';
import { useScreenRights } from '../../context/AuthContext';
import { useRowsThatFit } from '../../utils/useRowsThatFit';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

export interface ListPageProps<T> {
  title: string;
  newPath?: string;
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onPrint?: (row: T) => void;
  showExportButtons?: boolean;
  subtitle?: string; // grey line under the title
  banner?: React.ReactNode; // optional strip shown above the table card
  pageSize?: number; // fixed rows per page; leave out = as many rows as fit on the screen
}

export function ListPage<T extends { id: string | number }>({
  title,
  newPath: newPathProp,
  columns,
  data,
  loading = false,
  onEdit: onEditProp,
  onDelete: onDeleteProp,
  onPrint: onPrintProp,
  showExportButtons = true,
  pageSize: fixedPageSize,
  subtitle,
  banner,
}: ListPageProps<T>) {
  const navigate = useNavigate();

  // Buttons follow the user's rights on this screen (Admin > Create Login); the server checks too.
  const rights = useScreenRights();
  const newPath = rights.create ? newPathProp : undefined;
  const onEdit = rights.edit ? onEditProp : undefined;
  const onDelete = rights.delete ? onDeleteProp : undefined;
  const onPrint = rights.print ? onPrintProp : undefined;
  const [searchTerm, setSearchTerm] = useState('');
  const [pageInState, setCurrentPage] = useState(1);

  // Search filter across all string/number fields of row
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((row: any) =>
      Object.values(row).some((val) =>
        val !== null && val !== undefined && String(val).toLowerCase().includes(term)
      )
    );
  }, [data, searchTerm]);

  // Rows per page = how many rows fit on the screen (unless the page gives a fixed number)
  const tableBoxRef = useRef<HTMLDivElement>(null);
  const rowsThatFit = useRowsThatFit(tableBoxRef, [loading, data]);
  const pageSize = fixedPageSize || rowsThatFit;

  // Pagination calculation
  const totalEntries = filteredData.length;
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;
  const currentPage = Math.min(pageInState, totalPages); // stays valid when rows per page changes
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedData = filteredData.slice(startIndex, endIndex);



  // Page numbers to show: first, last, and the ones around the current page ("…" between gaps)
  const pageNumbers: (number | '…')[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) pageNumbers.push(p);
    else if (pageNumbers[pageNumbers.length - 1] !== '…') pageNumbers.push('…');
  }
  const hasActions = !!(onEdit || onDelete || onPrint);

  return (
    <div className="fill-screen" style={{ maxWidth: '1240px', margin: '0 auto' }}>
      {/* 1. Title, subtitle and "+ New" */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{title}</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            {subtitle || `View and manage ${title.replace(/ Master$/, '').toLowerCase()} records`}
          </div>
        </div>
        {newPath && (
          <button
            type="button"
            onClick={() => navigate(newPath)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              padding: '9px 18px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(239, 122, 69, 0.35)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary)')}
          >
            <PlusIcon size={14} color="#ffffff" />
            New
          </button>
        )}
      </div>

      {banner}

      {/* 2. One rounded card: toolbar, table, paging (fills the rest of the screen) */}
      <div
        style={{
          flex: '1 1 0',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
        }}
      >
        {/* Toolbar: total, search, export */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '14px 18px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '32px', height: '32px', borderRadius: '9px', backgroundColor: 'var(--primary-soft)', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="bi bi-list-ul" />
            </span>
            <span style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>
              Total : <strong style={{ color: 'var(--text-heading)' }}>{totalEntries}</strong> records
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
                <SearchIcon size={13} />
              </span>
              <input
                id="searchBox"
                type="text"
                value={searchTerm}
                placeholder="Search..."
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: '8px 12px 8px 32px',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.88rem',
                  outline: 'none',
                  width: '240px',
                  backgroundColor: '#ffffff',
                }}
              />
            </div>
            {showExportButtons && <ExportButtons reportName={title} filename={title.replace(/\s+/g, '_')} columns={columns} data={filteredData} />}
          </div>
        </div>

        {/* Table */}
        <div className="table-box" ref={tableBoxRef}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} style={{ padding: '11px 10px', fontSize: '0.8rem', width: col.width || 'auto' }}>
                    {col.header}
                  </th>
                ))}
                {hasActions && (
                  <th style={{ ...actionColumnStyle, padding: '11px 10px', fontSize: '0.8rem', width: onPrint ? '116px' : '90px', textAlign: 'center' }}>Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length + (hasActions ? 1 : 0)} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    Loading data...
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (hasActions ? 1 : 0)} style={{ textAlign: 'center', padding: '56px 16px', color: 'var(--text-muted)' }}>
                    <i className="bi bi-inbox" style={{ fontSize: '2rem', display: 'block', marginBottom: '6px', color: '#c4c8cf' }} />
                    {searchTerm.trim() ? 'No matching records found' : 'No records yet'}
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, idx) => (
                  <tr
                    key={(row as any).id !== undefined && (row as any).processid !== undefined ? `${(row as any).id}-${(row as any).processid}-${idx}` : ((row as any).id !== undefined ? `${(row as any).id}-${idx}` : idx)}
                    style={{ borderBottom: '1px solid #f0f1f3', backgroundColor: '#ffffff' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fafafa')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
                  >
                    {columns.map((col) => (
                      <td key={col.key} style={{ padding: '12px 10px', color: 'var(--text-heading)' }}>
                        {col.render ? (
                          col.render(row)
                        ) : (
                          // long text: at most 2 lines, then "…" (full text when you point at it)
                          <div style={cellTextStyle} title={String((row as any)[col.key] ?? '')}>
                            {(row as any)[col.key]}
                          </div>
                        )}
                      </td>
                    ))}
                    {hasActions && (
                      <td style={{ ...actionColumnStyle, backgroundColor: 'inherit', padding: '10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                          {onEdit && (
                            <button type="button" onClick={() => onEdit(row)} title="Edit" style={actionIconBtnStyle}>
                              <PencilIcon size={13} color="var(--text-main)" />
                            </button>
                          )}
                          {onDelete && (
                            <button type="button" onClick={() => onDelete(row)} title="Delete" style={actionIconBtnStyle}>
                              <TrashIcon size={13} color="var(--danger)" />
                            </button>
                          )}
                          {onPrint && (
                            <button type="button" onClick={() => onPrint(row)} title="Print" style={actionIconBtnStyle}>
                              <PrinterIcon size={13} color="var(--primary)" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paging: "Showing x to y of z", page numbers, Back / Next */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '12px 18px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {totalEntries > 0 ? `Showing ${startIndex + 1} to ${endIndex} of ${totalEntries} entries` : 'Showing 0 to 0 of 0 entries'}
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {pageNumbers.map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} style={{ padding: '0 6px', color: 'var(--text-muted)' }}>…</span>
              ) : (
                <button key={p} type="button" onClick={() => setCurrentPage(p)} style={pageBtnStyle(currentPage === p)}>
                  {p}
                </button>
              )
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(currentPage - 1)} style={navBtnStyle(currentPage <= 1)}>
              ‹ Back
            </button>
            <button type="button" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(currentPage + 1)} style={navBtnStyle(currentPage >= totalPages)}>
              Next ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const cellTextStyle: React.CSSProperties = {
  maxWidth: '260px',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

// Action column stays pinned on the right if a wide table has to scroll sideways (small screens)
const actionColumnStyle: React.CSSProperties = {
  position: 'sticky',
  right: 0,
};

const actionIconBtnStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid var(--border-color)',
  padding: '5px 6px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const pageBtnStyle = (isActive: boolean): React.CSSProperties => ({
  minWidth: '32px',
  padding: '5px 9px',
  backgroundColor: '#ffffff',
  color: isActive ? 'var(--primary)' : 'var(--text-main)',
  border: `1px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
  fontWeight: isActive ? 700 : 500,
  fontSize: '0.85rem',
  cursor: 'pointer',
});

const navBtnStyle = (isDisabled: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  backgroundColor: '#ffffff',
  color: isDisabled ? '#c4c8cf' : 'var(--text-heading)',
  border: '1px solid var(--border-color)',
  fontSize: '0.85rem',
  fontWeight: 500,
  cursor: isDisabled ? 'not-allowed' : 'pointer',
});
