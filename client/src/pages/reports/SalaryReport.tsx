import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRowsThatFit } from '../../utils/useRowsThatFit';
import { sumOf } from '../../utils/reportTotals';
import { ExportButtons } from '../../components/common/ExportButtons';
import type { ExportColumn } from '../../utils/exportUtils';

interface SalaryRow {
  yearname: string;
  monthname: string;
  ledgrpname: string;
  empcode: string;
  operatorname: string;
  totaldays: number;
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

export const SalaryReport: React.FC = () => {
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState<string>(currentYear);
  const [month, setMonth] = useState<string>(MONTHS[new Date().getMonth()]); // opens on the current month
  const [group, setGroup] = useState<string>(''); // '' = all groups
  const [search, setSearch] = useState<string>('');

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [data, setData] = useState<SalaryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Pagination matching jQuery DataTables
  const [page, setPage] = useState<number>(1);
  const tableBoxRef = useRef<HTMLDivElement>(null);
  const pageSize = useRowsThatFit(tableBoxRef, [data]); // as many rows as fit on the screen

  // Sorting state
  const [sortField, setSortField] = useState<keyof SalaryRow>('operatorname');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Load groups for dropdown
  useEffect(() => {
    fetch('/api/reports/groups', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((json) => setGroups(json))
      .catch((err) => console.error('Failed to load groups:', err));
  }, []);

  // Fetch report data
  const handleSearch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (year.trim()) params.append('year', year.trim());
      if (month && month !== '--Select--') params.append('month', month);
      if (group && group !== '--Select--') params.append('group', group);

      const res = await fetch(`/api/reports/salary?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const json = await res.json();
      setData(json);
      setPage(1);
    } catch (err: any) {
      console.error('Failed to load Salary Report:', err);
      setError(err.message || 'Error loading report');
    } finally {
      setLoading(false);
    }
  }, [year, month, group]);

  // Initial load
  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  // Sort handler
  const handleSort = (field: keyof SalaryRow) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Client-side text filter (DataTables quick search)
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
          String(r.empcode)?.toLowerCase().includes(q) ||
          String(r.totaldays).includes(q) ||
          String(r.totamt).includes(q)
      );
    }

    return [...result].sort((a, b) => {
      let aVal: any = a[sortField] ?? '';
      let bVal: any = b[sortField] ?? '';

      if (sortField === 'totaldays' || sortField === 'totamt') {
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

  // Total row: adds up every row that matches the filters and search (not just this page)
  const totalRow: SalaryRow = useMemo(
    () => ({
      yearname: 'Total',
      monthname: '',
      ledgrpname: '',
      empcode: '',
      operatorname: '',
      totaldays: sumOf(filteredData, (r) => r.totaldays),
      totamt: sumOf(filteredData, (r) => r.totamt),
    }),
    [filteredData]
  );

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
    { header: 'Emp Code', key: 'empcode', align: 'left' },
    { header: 'Employee Name', key: 'operatorname' },
    { header: 'Total Days', key: 'totaldays', align: 'right' },
    {
      header: 'Amount',
      key: 'totamt',
      render: (r: SalaryRow) => Number(r.totamt || 0).toFixed(2),
      align: 'right',
    },
  ];

  return (
    <div className="fill-screen" style={{ padding: '24px 28px', backgroundColor: '#ffffff', color: 'var(--text-heading)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: 'var(--shadow-card)', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 1. Page Title matching SalaryReport.aspx */}
      <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 24px 0' }}>
        Salary Report
      </h2>

      {error && (
        <div style={{ padding: '10px 14px', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '18px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* 2. Horizontal Filter Controls matching legacy SalaryReport.aspx */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontWeight: 700, fontSize: '14px', color: '#000000' }}>Year</label>
          <input
            type="text"
            value={year}
            onChange={(e) => setYear(e.target.value)}
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
            onChange={(e) => setMonth(e.target.value)}
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
            onChange={(e) => setGroup(e.target.value)}
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
          onClick={handleSearch}
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
            reportName="Salary Report"
            subtitle={`${month || 'All months'} ${year}${group ? ` · ${group}` : ''}`}
            filename={`Salary_Report_${year}_${month || 'All'}`}
            columns={exportColumns}
            data={filteredData}
            totalRow={totalRow}
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

      {/* 4. Table matching jQuery DataTables with cyan header (var(--primary)) */}
      <div className="table-box" ref={tableBoxRef} style={{ width: '100%', overflowX: 'auto', borderBottom: '1px solid #dee2e6' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--primary)', color: '#ffffff' }}>
              <th
                onClick={() => handleSort('yearname')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none', whiteSpace: 'nowrap' }}
              >
                Year {sortField === 'yearname' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('monthname')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none', whiteSpace: 'nowrap' }}
              >
                Month {sortField === 'monthname' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('ledgrpname')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none', whiteSpace: 'nowrap' }}
              >
                Group {sortField === 'ledgrpname' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('empcode')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none', whiteSpace: 'nowrap' }}
              >
                Emp Code {sortField === 'empcode' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('operatorname')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none', whiteSpace: 'nowrap' }}
              >
                Employee Name {sortField === 'operatorname' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('totaldays')}
                style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none', whiteSpace: 'nowrap' }}
              >
                Total Days {sortField === 'totaldays' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('totamt')}
                style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
              >
                Amount {sortField === 'totamt' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>
                  Loading Salary Report...
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>
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
                    <td style={{ padding: '8px 12px', color: '#333333' }}>{row.empcode}</td>
                    <td style={{ padding: '8px 12px', color: '#333333' }}>{row.operatorname}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#333333' }}>
                      {row.totaldays}
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
                <td colSpan={5} style={{ padding: '8px 12px' }}>Total</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{totalRow.totaldays}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(totalRow.totamt).toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 5. Footer: "Showing X to Y of Z entries" on left, Pagination on right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '13px', color: '#666666' }}>
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

          <span
            style={{
              padding: '4px 10px',
              backgroundColor: '#ffffff',
              border: '1px solid #ced4da',
              borderRadius: '6px',
              color: '#333333',
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            {page}
          </span>

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
