import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRowsThatFit } from '../../utils/useRowsThatFit';
import { ExportButtons } from '../../components/common/ExportButtons';
import type { ExportColumn } from '../../utils/exportUtils';

interface SpineAttendanceRow {
  empcode: string;
  attdt: string;
  portion: number;
  dp: string;
  amt: string | number;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const SpineAttendance: React.FC = () => {
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState<string>(currentYear);
  const [month, setMonth] = useState<string>('January');
  const [search, setSearch] = useState<string>('');

  const [data, setData] = useState<SpineAttendanceRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string>('');

  // Pagination (matching screenshot: 10 entries per page default)
  const [page, setPage] = useState<number>(1);
  const tableBoxRef = useRef<HTMLDivElement>(null);
  const pageSize = useRowsThatFit(tableBoxRef, [data]); // as many rows as fit on the screen

  // Sorting
  const [sortField, setSortField] = useState<keyof SpineAttendanceRow>('attdt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSearch = useCallback(async (searchMonth = month, searchYear = year) => {
    if (!searchMonth || searchMonth === '--Select--' || !searchYear.trim()) {
      setValidationError('Please select all fields');
      setData([]);
      return;
    }

    setValidationError('');
    setLoading(true);

    try {
      const res = await fetch(
        `/api/utility/spine-attendance?month=${encodeURIComponent(searchMonth.trim())}&year=${encodeURIComponent(searchYear.trim())}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const json: SpineAttendanceRow[] = await res.json();

      // Ensure portion is ALWAYS hardcoded to 1 as requested
      const mapped = json.map((item) => ({
        ...item,
        portion: 1
      }));

      setData(mapped);
      setPage(1);
    } catch (err: any) {
      console.error('Failed to load Spine Attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  // Initial load on mount for January 2026 matching screenshot
  useEffect(() => {
    handleSearch('January', '2026');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSort = (field: keyof SpineAttendanceRow) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredData = useMemo(() => {
    let result = data;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = data.filter(
        (r) =>
          String(r.empcode)?.toLowerCase().includes(q) ||
          r.attdt?.toLowerCase().includes(q) ||
          r.dp?.toLowerCase().includes(q)
      );
    }

    return [...result].sort((a, b) => {
      let aVal: any = a[sortField] ?? '';
      let bVal: any = b[sortField] ?? '';

      if (sortField === 'amt') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      } else if (sortField === 'attdt') {
        // Parse date like '01-Jan-2026'
        aVal = new Date(aVal).getTime() || 0;
        bVal = new Date(bVal).getTime() || 0;
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, search, sortField, sortOrder]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, page, pageSize]);

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  // rows per page changes with the window size: stay on a page that exists
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const startEntry = filteredData.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, filteredData.length);

  // Export Columns: Portion is hardcoded to 1 for all exports
  const exportColumns: ExportColumn[] = [
    { header: 'Employee Code', key: 'empcode' },
    { header: 'Date', key: 'attdt' },
    { header: 'Day Type', key: 'dp' },
    { header: 'Portion', key: 'portion', render: () => '1' },
    {
      header: 'AF1',
      key: 'amt',
      render: (r: SpineAttendanceRow) => Number(r.amt || 0).toFixed(2),
      align: 'right'
    },
  ];

  const renderPaginationButtons = () => {
    const buttons = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      buttons.push(
        <button
          key={p}
          type="button"
          onClick={() => setPage(p)}
          style={{
            minWidth: '32px',
            height: '32px',
            border: '1px solid #dee2e6',
            backgroundColor: page === p ? 'var(--primary)' : '#ffffff',
            color: page === p ? '#ffffff' : '#333333',
            fontSize: '13px',
            cursor: 'pointer',
            padding: '0 8px',
            borderRadius: '6px',
            fontWeight: page === p ? 'bold' : 'normal',
          }}
        >
          {p}
        </button>
      );
    }
    return buttons;
  };

  return (
    <div className="fill-screen" style={{ padding: '24px 28px', backgroundColor: '#ffffff', color: 'var(--text-heading)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: 'var(--shadow-card)', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page title */}
      <h2
        style={{
          fontSize: '1.6rem',
          fontWeight: 600,
          color: 'var(--text-heading)',
          margin: '0 0 20px 0',
        }}
      >
        Spine Attendance Report
      </h2>

      {/* Validation Message in Red */}
      {validationError && (
        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
          <span style={{ color: '#dc3545', fontWeight: 'bold', fontSize: '14px' }}>
            {validationError}
          </span>
        </div>
      )}

      {/* Horizontal Filter Bar: Year, Month, Search Button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '15px',
          marginBottom: '30px',
          flexWrap: 'wrap',
        }}
      >
        {/* Year Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', fontSize: '14px', color: '#000000' }}>Year</label>
          <input
            type="text"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={{
              width: '130px',
              height: '34px',
              padding: '4px 10px',
              borderRadius: '8px',
              border: '1px solid #ced4da',
              fontSize: '14px',
              backgroundColor: '#ffffff',
              outline: 'none',
            }}
          />
        </div>

        {/* Month Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', fontSize: '14px', color: '#000000' }}>Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              width: '150px',
              height: '34px',
              padding: '4px 10px',
              borderRadius: '8px',
              border: '1px solid #ced4da',
              fontSize: '14px',
              backgroundColor: '#ffffff',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="--Select--">--Select--</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Search Button matching legacy var(--primary) */}
        <button
          type="button"
          onClick={() => handleSearch(month, year)}
          disabled={loading}
          style={{
            backgroundColor: 'var(--primary)',
            borderColor: 'var(--primary)',
            color: '#ffffff',
            height: '34px',
            padding: '0 22px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '14px',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.8 : 1,
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.backgroundColor = 'var(--primary-hover)')}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.backgroundColor = 'var(--primary)')}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Toolbar: Export Buttons (Left) & Search (Right) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <ExportButtons
          reportName="Spine Attendance Report"
          subtitle={`${month} ${year}`}
          filename={`Spine_Attendance_${year}_${month}`}
          columns={exportColumns}
          data={filteredData}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', color: '#333333' }}>Search:</span>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{
              height: '31px',
              padding: '3px 8px',
              fontSize: '13px',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              width: '180px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Table matching SpineAttend.aspx GridView */}
      <div className="table-box" ref={tableBoxRef} style={{ overflowX: 'auto', border: '1px solid #dee2e6', borderRadius: '6px', marginBottom: '15px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#212529' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--primary)', color: '#ffffff' }}>
              <th
                onClick={() => handleSort('empcode')}
                style={{
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderRight: '1px solid rgba(255,255,255,0.2)',
                  whiteSpace: 'nowrap',
                }}
              >
                Employee Code {sortField === 'empcode' ? (sortOrder === 'asc' ? '▲' : '▼') : '◆'}
              </th>
              <th
                onClick={() => handleSort('attdt')}
                style={{
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderRight: '1px solid rgba(255,255,255,0.2)',
                  whiteSpace: 'nowrap',
                }}
              >
                Date {sortField === 'attdt' ? (sortOrder === 'asc' ? '▲' : '▼') : '▲'}
              </th>
              <th
                onClick={() => handleSort('dp')}
                style={{
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderRight: '1px solid rgba(255,255,255,0.2)',
                  whiteSpace: 'nowrap',
                }}
              >
                Day Type {sortField === 'dp' ? (sortOrder === 'asc' ? '▲' : '▼') : '◆'}
              </th>
              <th
                onClick={() => handleSort('portion')}
                style={{
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderRight: '1px solid rgba(255,255,255,0.2)',
                  whiteSpace: 'nowrap',
                }}
              >
                Portion {sortField === 'portion' ? (sortOrder === 'asc' ? '▲' : '▼') : '◆'}
              </th>
              <th
                onClick={() => handleSort('amt')}
                style={{
                  padding: '10px 14px',
                  textAlign: 'right',
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                AF1 {sortField === 'amt' ? (sortOrder === 'asc' ? '▲' : '▼') : '◆'}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: '#6c757d' }}>
                  Loading Spine Attendance records...
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: '#6c757d' }}>
                  No matching attendance records found.
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => {
                const isEven = idx % 2 === 0;
                return (
                  <tr
                    key={idx}
                    style={{
                      backgroundColor: isEven ? '#ffffff' : '#f9f9f9',
                      borderBottom: '1px solid #dee2e6',
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <td style={{ padding: '8px 14px', textAlign: 'left', color: '#333333' }}>
                      {row.empcode}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'left', color: '#333333' }}>
                      {row.attdt}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'left', color: '#333333' }}>
                      {row.dp}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'left', color: '#333333' }}>
                      {/* Hardcoded to 1 for all rows per explicit requirement */}
                      1
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: '#333333' }}>
                      {Number(row.amt || 0).toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination row matching DataTables format */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px',
          color: '#6c757d',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          Showing {startEntry} to {endEntry} of {filteredData.length} entries
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              padding: '4px 10px',
              border: '1px solid #dee2e6',
              backgroundColor: '#ffffff',
              color: page === 1 ? '#999999' : '#333333',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              borderRadius: '6px',
            }}
          >
            Previous
          </button>

          {renderPaginationButtons()}

          <button
            type="button"
            disabled={page === totalPages || totalPages === 0}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{
              padding: '4px 10px',
              border: '1px solid #dee2e6',
              backgroundColor: '#ffffff',
              color: page === totalPages || totalPages === 0 ? '#999999' : '#333333',
              cursor: page === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              borderRadius: '6px',
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
