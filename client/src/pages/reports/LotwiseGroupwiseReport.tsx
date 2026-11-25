import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRowsThatFit } from '../../utils/useRowsThatFit';
import { sumOf } from '../../utils/reportTotals';
import { ExportButtons } from '../../components/common/ExportButtons';
import type { ExportColumn } from '../../utils/exportUtils';

// One row per year + month + lot. `groups` holds pieces per employee group (columns come from the server).
interface LotGroupPivotRow {
  yearname: string;
  monthname: string;
  lotno: string;
  fabricdtls: string;
  cutqty: string | number;
  groups: Record<string, number>;
  totalqty: number;
}

const groupQty = (row: LotGroupPivotRow, group: string) => Number(row.groups?.[group] || 0);

interface GroupOption {
  id: number;
  ledgrpname: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const LotwiseGroupwiseReport: React.FC = () => {
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState<string>(currentYear);
  const [month, setMonth] = useState<string>(MONTHS[new Date().getMonth()]); // opens on the current month
  const [group, setGroup] = useState<string>(''); // '' = all groups
  const [groups, setGroups] = useState<GroupOption[]>([]);

  const [data, setData] = useState<LotGroupPivotRow[]>([]);
  const [groupCols, setGroupCols] = useState<string[]>([]); // employee group names, one column each
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Pagination matching jQuery DataTables (10 entries per page by default)
  const [page, setPage] = useState<number>(1);
  const tableBoxRef = useRef<HTMLDivElement>(null);
  const pageSize = useRowsThatFit(tableBoxRef, [data]); // as many rows as fit on the screen

  // Sorting state
  const [sortField, setSortField] = useState<string>('yearname');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Load groups for dropdown
  useEffect(() => {
    fetch('/api/reports/groups', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((json) => setGroups(json))
      .catch((err) => console.error('Failed to load groups:', err));
  }, []);

  // Search with the Year / Month / Group filters (empty = all)
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (year.trim()) params.append('year', year.trim());
      if (month) params.append('month', month);
      if (group) params.append('group', group);
      const res = await fetch(`/api/reports/lot-group-qty?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const json = await res.json();
      setGroupCols(json.groups || []);
      setData(json.rows || []);
      setPage(1);
    } catch (err: any) {
      console.error('Failed to load Lotwise Groupwise Qty Report:', err);
      setError(err.message || 'Error loading report');
    } finally {
      setLoading(false);
    }
  }, [year, month, group]);

  // Initial load only (after that the Search button runs it)
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sort handler
  const handleSort = (field: string) => {
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
          r.lotno?.toLowerCase().includes(q) ||
          r.fabricdtls?.toLowerCase().includes(q)
      );
    }

    return [...result].sort((a: any, b: any) => {
      const isGroup = groupCols.includes(sortField);
      let aVal = isGroup ? groupQty(a, sortField) : a[sortField] ?? '';
      let bVal = isGroup ? groupQty(b, sortField) : b[sortField] ?? '';

      if (sortField === 'cutqty' || sortField === 'totalqty' || isGroup) {
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
  }, [data, search, sortField, sortOrder, groupCols]);

  // Total row: adds up every row that matches the filters and search (not just this page),
  // including each group column
  const totalRow: LotGroupPivotRow = useMemo(
    () => ({
      yearname: 'Total',
      monthname: '',
      lotno: '',
      fabricdtls: '',
      cutqty: sumOf(filteredData, (r) => r.cutqty),
      groups: Object.fromEntries(groupCols.map((g) => [g, sumOf(filteredData, (r) => groupQty(r, g))])),
      totalqty: sumOf(filteredData, (r) => r.totalqty),
    }),
    [filteredData, groupCols]
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
    { header: 'Lot No', key: 'lotno', align: 'left' },
    { header: 'Product Details', key: 'fabricdtls' },
    {
      header: 'Cut Qty',
      key: 'cutqty',
      render: (r: LotGroupPivotRow) => Number(r.cutqty || 0).toFixed(2),
      align: 'right',
    },
    ...groupCols.map((g) => ({
      header: g,
      key: g,
      render: (r: LotGroupPivotRow) => groupQty(r, g).toFixed(2),
      align: 'right' as const,
    })),
    {
      header: 'Total Qty',
      key: 'totalqty',
      render: (r: LotGroupPivotRow) => Number(r.totalqty || 0).toFixed(2),
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
      {/* 1. Page Title matching LotGrpQty.aspx */}
      <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 20px 0' }}>
        Lotwise Groupwise Qty Report
      </h2>

      {error && (
        <div style={{ padding: '10px 14px', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '18px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Filter Controls (same as the other reports) */}
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
          onClick={fetchData}
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

      {/* 2. DataTables Toolbar: Export buttons on left, Search on right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <ExportButtons
            reportName="Lotwise Groupwise Qty Report"
            subtitle={`${month || 'All months'} ${year}${group ? ` · ${group}` : ''}`}
            filename="Lotwise_Groupwise_Qty_Report"
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

      {/* 3. Table matching jQuery DataTables with cyan header (var(--primary)) and horizontal scrolling */}
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
                onClick={() => handleSort('lotno')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Lot No {sortField === 'lotno' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('fabricdtls')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none', minWidth: '240px' }}
              >
                Product Details {sortField === 'fabricdtls' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th
                onClick={() => handleSort('cutqty')}
                style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Cut Qty {sortField === 'cutqty' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>

              {groupCols.map((colName) => (
                <th
                  key={colName}
                  onClick={() => handleSort(colName)}
                  style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
                >
                  {colName} {sortField === colName ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
                </th>
              ))}

              <th
                onClick={() => handleSort('totalqty')}
                style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}
              >
                Total Qty {sortField === 'totalqty' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6 + groupCols.length} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>
                  Loading Lotwise Groupwise Qty Report...
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={6 + groupCols.length} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>
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
                    <td style={{ padding: '8px 12px', color: '#333333' }}>{row.lotno}</td>
                    <td style={{ padding: '8px 12px', color: '#333333', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.fabricdtls}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#333333' }}>
                      {Number(row.cutqty || 0).toFixed(2)}
                    </td>

                    {groupCols.map((colName) => (
                      <td key={colName} style={{ padding: '8px 12px', textAlign: 'right', color: '#333333' }}>
                        {groupQty(row, colName).toFixed(2)}
                      </td>
                    ))}

                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#333333' }}>
                      {Number(row.totalqty || 0).toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {!loading && filteredData.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{ padding: '8px 12px' }}>Total</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(totalRow.cutqty).toFixed(2)}</td>
                {groupCols.map((g) => (
                  <td key={g} style={{ padding: '8px 12px', textAlign: 'right' }}>{groupQty(totalRow, g).toFixed(2)}</td>
                ))}
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(totalRow.totalqty).toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 4. Footer: "Showing X to Y of Z entries" on left, Pagination on right */}
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
