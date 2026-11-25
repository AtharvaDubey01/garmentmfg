import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRowsThatFit } from '../../utils/useRowsThatFit';
import { sumOf } from '../../utils/reportTotals';
import { ExportButtons } from '../../components/common/ExportButtons';
import type { ExportColumn } from '../../utils/exportUtils';

interface DailyProcessRow {
  monthname: string;
  yearname: string;
  operatorname: string;
  ledgrpname: string;
  lotno: string;
  processname: string;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  d5: number;
  d6: number;
  d7: number;
  d8: number;
  d9: number;
  d10: number;
  d11: number;
  d12: number;
  d13: number;
  d14: number;
  d15: number;
  d16: number;
  d17: number;
  d18: number;
  d19: number;
  d20: number;
  d21: number;
  d22: number;
  d23: number;
  d24: number;
  d25: number;
  d26: number;
  d27: number;
  d28: number;
  d29: number;
  d30: number;
  d31: number;
  totalqty: number;
  rate: string | number;
  totamt: string | number;
}

interface GroupOption {
  id: string | number;
  ledgrpname: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const DailyProcessReport: React.FC = () => {
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState<string>(currentYear);
  const [month, setMonth] = useState<string>(MONTHS[new Date().getMonth()]); // opens on the current month
  const [group, setGroup] = useState<string>(''); // '' = all groups
  const [search, setSearch] = useState<string>('');

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [data, setData] = useState<DailyProcessRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Pagination matching jQuery DataTables
  const [page, setPage] = useState<number>(1);
  const tableBoxRef = useRef<HTMLDivElement>(null);
  const pageSize = useRowsThatFit(tableBoxRef, [data]); // as many rows as fit on the screen

  // Sorting state
  const [sortField, setSortField] = useState<keyof DailyProcessRow>('operatorname');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Load groups for dropdown
  useEffect(() => {
    fetch('/api/reports/groups', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((json) => setGroups(json))
      .catch((err) => console.error('Failed to load groups:', err));
  }, []);

  // Fetch report data
  const handleSearch = useCallback(async (searchYear = year, searchMonth = month, searchGroup = group) => {
    if (!searchYear.trim()) {
      setError('Please enter a Year');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.append('year', searchYear.trim());
      if (searchMonth) params.append('month', searchMonth);
      if (searchGroup) params.append('group', searchGroup);

      const res = await fetch(`/api/reports/daily-process?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const json = await res.json();
      setData(json);
      setPage(1);
    } catch (err: any) {
      console.error('Failed to load Daily Process Report:', err);
      setError(err.message || 'Error loading report');
    } finally {
      setLoading(false);
    }
  }, [year, month, group]);

  // Initial load only once on component mount
  useEffect(() => {
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sort handler
  const handleSort = (field: keyof DailyProcessRow) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Client-side quick filter
  const filteredData = useMemo(() => {
    let result = data;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = data.filter(
        (r) =>
          r.yearname?.toLowerCase().includes(q) ||
          r.monthname?.toLowerCase().includes(q) ||
          r.ledgrpname?.toLowerCase().includes(q) ||
          r.operatorname?.toLowerCase().includes(q) ||
          r.lotno?.toLowerCase().includes(q) ||
          r.processname?.toLowerCase().includes(q)
      );
    }

    return [...result].sort((a, b) => {
      let aVal: any = a[sortField] ?? '';
      let bVal: any = b[sortField] ?? '';

      if (sortField === 'totalqty' || sortField === 'rate' || sortField === 'totamt' || sortField.startsWith('d')) {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, search, sortField, sortOrder]);

  // Total row: adds up every row that matches the filters and search (not just this page),
  // including each day D1..D31
  const totalRow = useMemo(() => {
    const row: Record<string, string | number> = {
      yearname: 'Total',
      monthname: '',
      ledgrpname: '',
      operatorname: '',
      lotno: '',
      processname: '',
    };
    for (let d = 1; d <= 31; d++) row[`d${d}`] = sumOf(filteredData, (r) => (r as any)[`d${d}`]);
    row.totalqty = sumOf(filteredData, (r) => r.totalqty);
    row.rate = sumOf(filteredData, (r) => r.rate);
    row.totamt = sumOf(filteredData, (r) => r.totamt);
    return row as unknown as DailyProcessRow;
  }, [filteredData]);

  // Pagination slice
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

  // Columns definition for DataTables export
  const exportColumns: ExportColumn[] = [
    { header: 'Year', key: 'yearname', align: 'left' },
    { header: 'Month', key: 'monthname' },
    { header: 'Group', key: 'ledgrpname' },
    { header: 'Employee Name', key: 'operatorname' },
    { header: 'Lot No.', key: 'lotno', align: 'left' },
    { header: 'Process', key: 'processname' },
    ...Array.from({ length: 31 }, (_, i) => ({
      header: `D${i + 1}`,
      key: `d${i + 1}`,
      render: (r: any) => (r[`d${i + 1}`] ? Number(r[`d${i + 1}`]).toFixed(0) : '0'),
      align: 'right' as const,
    })),
    {
      header: 'Total Qty',
      key: 'totalqty',
      render: (r: DailyProcessRow) => Number(r.totalqty || 0).toFixed(0),
      align: 'right',
    },
    {
      header: 'Rate',
      key: 'rate',
      render: (r: DailyProcessRow) => Number(r.rate || 0).toFixed(2),
      align: 'right',
    },
    {
      header: 'Amount',
      key: 'totamt',
      render: (r: DailyProcessRow) => Number(r.totamt || 0).toFixed(2),
      align: 'right',
    },
  ];

  // Helper for generating page numbers
  const renderPaginationButtons = () => {
    const buttons = [];
    const maxVisiblePages = 7;
    let startPage = Math.max(1, page - 3);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      buttons.push(
        <button
          key={i}
          type="button"
          onClick={() => setPage(i)}
          style={{
            padding: '4px 10px',
            backgroundColor: page === i ? '#ffffff' : 'transparent',
            border: page === i ? '1px solid #ced4da' : 'none',
            borderRadius: '6px',
            color: page === i ? '#333333' : '#555555',
            fontWeight: page === i ? 600 : 400,
            fontSize: '13px',
            cursor: 'pointer',
            minWidth: '28px',
          }}
        >
          {i}
        </button>
      );
    }
    return buttons;
  };

  return (
    <div className="fill-screen" style={{ padding: '24px 28px', backgroundColor: '#ffffff', color: 'var(--text-heading)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: 'var(--shadow-card)', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 1. Page Title matching DailyProcessReport.aspx */}
      <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 24px 0' }}>
        Daily Process Report
      </h2>

      {error && (
        <div style={{ textAlign: 'center', color: '#dc3545', fontWeight: 'bold', fontSize: '14px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* 2. Horizontal Filter Controls matching legacy DailyProcessReport.aspx */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontWeight: 700, fontSize: '14px', color: '#000000' }}>Year</label>
          <input
            type="text"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setError('');
            }}
            style={{
              width: '95px',
              padding: '5px 10px',
              fontSize: '14px',
              border: '1px solid #ced4da',
              borderRadius: '8px',
              outline: 'none',
              backgroundColor: '#ffffff',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontWeight: 700, fontSize: '14px', color: '#000000' }}>Month</label>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setError('');
            }}
            style={{
              width: '135px',
              padding: '5px 10px',
              fontSize: '14px',
              border: '1px solid #ced4da',
              borderRadius: '8px',
              outline: 'none',
              backgroundColor: '#ffffff',
            }}
          >
            <option value="">All Months</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontWeight: 700, fontSize: '14px', color: '#000000' }}>Group</label>
          <select
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setError('');
            }}
            style={{
              width: '180px',
              padding: '5px 10px',
              fontSize: '14px',
              border: '1px solid #ced4da',
              borderRadius: '8px',
              outline: 'none',
              backgroundColor: '#ffffff',
            }}
          >
            <option value="">All Groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.ledgrpname}>
                {g.ledgrpname}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={loading}
          style={{
            backgroundColor: 'var(--primary)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '6px 20px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary)')}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* 3. DataTables Toolbar: Export buttons on left, Search on right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <ExportButtons
            reportName="Daily Process Report"
            subtitle={`${month || 'All months'} ${year}${group ? ` · ${group}` : ''}`}
            filename={`Daily_Process_Report_${year}_${month || 'All'}`}
            columns={exportColumns}
            data={filteredData}
            totalRow={totalRow}
            orientation="landscape"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', color: '#555555' }}>Search:</label>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '4px 8px',
              fontSize: '13px',
              border: '1px solid #ced4da',
              borderRadius: '8px',
              width: '180px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* 4. Table matching jQuery DataTables with cyan header (var(--primary)) and horizontal scrolling */}
      <div className="table-box" ref={tableBoxRef} style={{ width: '100%', overflowX: 'auto', borderBottom: '1px solid #dee2e6' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--primary)', color: '#ffffff' }}>
              <th
                onClick={() => handleSort('yearname')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Year {sortField === 'yearname' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('monthname')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Month {sortField === 'monthname' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('ledgrpname')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Group {sortField === 'ledgrpname' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('operatorname')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Employee Name {sortField === 'operatorname' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('lotno')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Lot No. {sortField === 'lotno' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('processname')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Process {sortField === 'processname' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>

              {Array.from({ length: 31 }, (_, i) => {
                const dayKey = `d${i + 1}` as keyof DailyProcessRow;
                return (
                  <th
                    key={dayKey}
                    onClick={() => handleSort(dayKey)}
                    style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
                  >
                    D{i + 1} {sortField === dayKey ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
                  </th>
                );
              })}

              <th
                onClick={() => handleSort('totalqty')}
                style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Total Qty {sortField === 'totalqty' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('rate')}
                style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Rate {sortField === 'rate' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('totamt')}
                style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}
              >
                Amount {sortField === 'totamt' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={40} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>
                  Loading Daily Process Report...
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={40} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>
                  No matching records found
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => {
                const isEven = idx % 2 === 1;
                return (
                  <tr
                    key={idx}
                    style={{
                      backgroundColor: isEven ? '#f9f9f9' : '#ffffff',
                      borderBottom: '1px solid #dee2e6',
                    }}
                  >
                    <td style={{ padding: '8px 12px', color: '#333333' }}>{row.yearname}</td>
                    <td style={{ padding: '8px 12px', color: '#333333' }}>{row.monthname}</td>
                    <td style={{ padding: '8px 12px', color: '#333333' }}>{row.ledgrpname}</td>
                    <td style={{ padding: '8px 12px', color: '#333333' }}>{row.operatorname}</td>
                    <td style={{ padding: '8px 12px', color: '#333333' }}>{row.lotno}</td>
                    <td style={{ padding: '8px 12px', color: '#333333' }}>{row.processname}</td>

                    {Array.from({ length: 31 }, (_, i) => {
                      const dayVal = (row as any)[`d${i + 1}`];
                      return (
                        <td key={i} style={{ padding: '8px 10px', textAlign: 'right', color: '#333333' }}>
                          {dayVal !== undefined && dayVal !== null ? dayVal : 0}
                        </td>
                      );
                    })}

                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#333333', fontWeight: 600 }}>
                      {Number(row.totalqty || 0).toFixed(0)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#333333' }}>
                      {Number(row.rate || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#333333' }}>
                      {Number(row.totamt || 0).toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {!loading && filteredData.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} style={{ padding: '8px 12px' }}>Total</td>
                {Array.from({ length: 31 }, (_, i) => (
                  <td key={i} style={{ padding: '8px 10px', textAlign: 'right' }}>
                    {(totalRow as any)[`d${i + 1}`]}
                  </td>
                ))}
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(totalRow.totalqty).toFixed(0)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(totalRow.rate).toFixed(2)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(totalRow.totamt).toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 5. Footer: "Showing X to Y of Z entries" on left, Pagination on right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '13px', color: '#666666', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          Showing {startEntry} to {endEntry} of {filteredData.length} entries
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: page === 1 ? '#cccccc' : '#555555',
              cursor: page === 1 ? 'default' : 'pointer',
              padding: '4px 8px',
              fontSize: '13px',
            }}
          >
            Previous
          </button>

          {renderPaginationButtons()}

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || totalPages === 0}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: page === totalPages || totalPages === 0 ? '#cccccc' : '#555555',
              cursor: page === totalPages || totalPages === 0 ? 'default' : 'pointer',
              padding: '4px 8px',
              fontSize: '13px',
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
