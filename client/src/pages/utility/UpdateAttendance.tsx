import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRowsThatFit } from '../../utils/useRowsThatFit';
import { useNavigate } from 'react-router-dom';
import { useScreenRights } from '../../context/AuthContext';
import { ExportButtons } from '../../components/common/ExportButtons';
import type { ExportColumn } from '../../utils/exportUtils';

interface AttendanceRecord {
  id: string | number;
  empcode: string | number;
  operatorname: string;
  emp_code_number: string;
  ledgrpname: string;
  empgrp: number;
  monthyear: string;
  monthnm: string;
  yearnm: string;
  totaldays: number;
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
  alteredon?: string;
  enterby?: string;
}

// What the saved attendance would be if Update Attendance ran now (from /attendance/preview)
interface PreviewRow {
  empid: string | number;
  operatorname: string;
  [day: string]: string | number;
}

// Does the saved attendance match Daily Process Entry for the month?
interface AttendanceStatus {
  upToDate: boolean;
  workersWithEntries: number;
  workersDifferent: string[]; // names whose saved attendance is missing, extra or different
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const UpdateAttendance: React.FC = () => {
  const canRunUpdate = useScreenRights().has('runUpdate'); // "Run Update Attendance" right (server checks too)
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState<string>(currentYear);
  const [month, setMonth] = useState<string>(MONTHS[new Date().getMonth()]); // opens on the current month
  const [search, setSearch] = useState<string>('');

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [shownFor, setShownFor] = useState<string>(''); // "October 2026": the month the table is showing

  // Pagination matching jQuery DataTables
  const [page, setPage] = useState<number>(1);
  const tableBoxRef = useRef<HTMLDivElement>(null);
  const pageSize = useRowsThatFit(tableBoxRef, [records]); // as many rows as fit on the screen

  // Sorting state
  const [sortField, setSortField] = useState<keyof AttendanceRecord>('operatorname');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Search: load the SAVED attendance for the month, and compare it with Daily Process Entry
  // (the preview = what Update Attendance would save right now).
  const fetchRecords = useCallback(async (fetchMonth = month, fetchYear = year) => {
    if (!fetchMonth || fetchMonth === '--Select--' || !fetchYear.trim()) {
      setError('Please Enter * Mandatory Fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const qs = `month=${encodeURIComponent(fetchMonth.trim())}&year=${encodeURIComponent(fetchYear.trim())}`;
      const [recRes, prevRes] = await Promise.all([
        fetch(`/api/utility/attendance/records?${qs}`, { credentials: 'include' }),
        fetch(`/api/utility/attendance/preview?${qs}`, { credentials: 'include' }),
      ]);
      if (!recRes.ok || !prevRes.ok) throw new Error(`Server returned status ${recRes.ok ? prevRes.status : recRes.status}`);
      const saved: AttendanceRecord[] = await recRes.json();
      // One preview row per worker (a worker with sheets in two groups is combined, like Update Attendance does)
      const preview: PreviewRow[] = [];
      for (const p of (await prevRes.json()) as PreviewRow[]) {
        const same = preview.find((x) => String(x.empid) === String(p.empid));
        if (!same) preview.push({ ...p });
        else for (let d = 1; d <= 31; d++) same[`d${d}`] = Number(same[`d${d}`]) + Number(p[`d${d}`]);
      }

      // A worker differs if their saved 1/0 days don't match "logged pieces that day"
      const different: string[] = [];
      for (const p of preview) {
        const rec = saved.find((r) => String(r.empcode) === String(p.empid));
        const same = rec && Array.from({ length: 31 }, (_, i) => i + 1)
          .every((d) => Number((rec as any)[`d${d}`]) === (Number(p[`d${d}`]) > 0 ? 1 : 0));
        if (!same) different.push(p.operatorname);
      }
      for (const r of saved) {
        if (!preview.some((p) => String(p.empid) === String(r.empcode))) different.push(r.operatorname);
      }

      setRecords(saved);
      setStatus({ upToDate: different.length === 0, workersWithEntries: preview.length, workersDifferent: different });
      setShownFor(`${fetchMonth.trim()} ${fetchYear.trim()}`);
      setPage(1);
    } catch (err: any) {
      console.error('Failed to load attendance records:', err);
      setError(err.message || 'Failed to load attendance records');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  // Initial load on mount (current month)
  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Execute attendance update (replicates Button2_Click & AttendanceSP 'A' & 'I')
  const handleUpdateAttendance = async () => {
    if (!month || month === '--Select--' || !year.trim()) {
      setError('Please Enter * Mandatory Fields');
      setSuccessMessage('');
      return;
    }

    setUpdating(true);
    setError('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/utility/attendance/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ month: month.trim(), year: year.trim() })
      });

      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        throw new Error(data.message || 'Failed to update attendance');
      }

      setSuccessMessage(data.message || `Attendance updated successfully for ${month} ${year}.`);
      // Reload updated records
      await fetchRecords(month, year);
    } catch (err: any) {
      console.error('Error during attendance update:', err);
      setError(err.message || 'An error occurred while updating attendance.');
    } finally {
      setUpdating(false);
    }
  };

  // Sort handler
  const handleSort = (field: keyof AttendanceRecord) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Client-side quick filter
  const filteredData = useMemo(() => {
    let result = records;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = records.filter(
        (r) =>
          r.emp_code_number?.toLowerCase().includes(q) ||
          r.operatorname?.toLowerCase().includes(q) ||
          r.ledgrpname?.toLowerCase().includes(q)
      );
    }

    return [...result].sort((a, b) => {
      let aVal: any = a[sortField] ?? '';
      let bVal: any = b[sortField] ?? '';

      if (sortField === 'totaldays' || sortField.startsWith('d')) {
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
  }, [records, search, sortField, sortOrder]);

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

  // Export Columns definition
  const exportColumns: ExportColumn[] = [
    { header: 'Emp Code', key: 'emp_code_number' },
    { header: 'Operator Name', key: 'operatorname' },
    { header: 'Group', key: 'ledgrpname' },
    {
      header: 'Total Days',
      key: 'totaldays',
      render: (r: AttendanceRecord) => Number(r.totaldays || 0).toFixed(0),
      align: 'right',
    },
    ...Array.from({ length: 31 }, (_, i) => ({
      header: `${i + 1}`,
      key: `d${i + 1}`,
      render: (r: any) => (r[`d${i + 1}`] === 1 ? '1' : '0'),
      align: 'center' as const,
    })),
    {
      header: 'Updated On',
      key: 'alteredon',
      render: (r: AttendanceRecord) => (r.alteredon ? new Date(r.alteredon).toLocaleDateString() : 'N/A'),
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
      {/* 1. Page Header matching UpdateAttendance.aspx */}
      <h3 style={{ fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 24px 0', fontSize: '1.6rem' }}>
        Update Attendance
      </h3>

      {/* 2. Validation Message (matching legacy Label17) */}
      {error && (
        <div style={{ textAlign: 'center', color: '#dc3545', fontWeight: 'bold', fontSize: '14px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Success Notification */}
      {successMessage && (
        <div
          style={{
            maxWidth: '650px',
            margin: '0 auto 20px auto',
            padding: '10px 18px',
            backgroundColor: '#d4edda',
            borderColor: '#c3e6cb',
            color: '#155724',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          {successMessage}
        </div>
      )}

      {/* 3. Centered Form Row matching legacy UpdateAttendance.aspx 1:1 */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '24px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontWeight: 700, fontSize: '14px', color: '#000000', whiteSpace: 'nowrap' }}>
            Select Month *
          </label>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setError('');
              setSuccessMessage('');
            }}
            style={{
              width: '180px',
              padding: '6px 12px',
              border: '1px solid #ced4da',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: '#ffffff',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontWeight: 700, fontSize: '14px', color: '#000000', whiteSpace: 'nowrap' }}>
            Year
          </label>
          <input
            type="text"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setError('');
              setSuccessMessage('');
            }}
            style={{
              width: '130px',
              padding: '6px 12px',
              border: '1px solid #ced4da',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: '#ffffff',
            }}
          />
        </div>
      </div>

      {/* 4. Action Buttons (Search, Update Attendance & Exit) */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => {
            setSuccessMessage('');
            fetchRecords();
          }}
          disabled={loading || updating}
          style={{
            backgroundColor: 'var(--primary)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '7px 22px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: loading || updating ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s ease',
            opacity: loading || updating ? 0.7 : 1,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary)')}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>

        <button
          type="button"
          onClick={handleUpdateAttendance}
          disabled={updating || !canRunUpdate}
          title={canRunUpdate ? undefined : 'You don\'t have the "Run Update Attendance" right'}
          style={{
            backgroundColor: 'var(--primary)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '7px 22px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: updating ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s ease',
            opacity: updating ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!updating) e.currentTarget.style.backgroundColor = 'var(--primary-hover)';
          }}
          onMouseLeave={(e) => {
            if (!updating) e.currentTarget.style.backgroundColor = 'var(--primary)';
          }}
        >
          {updating ? 'Updating Attendance...' : 'Update Attendance'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            backgroundColor: '#ffffff',
            color: 'var(--text-heading)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '7px 22px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Exit
        </button>
      </div>

      {/* Status: does the saved attendance match Daily Process Entry? */}
      {status && !loading && (
        <div
          style={{
            maxWidth: '760px',
            margin: '0 auto 24px auto',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            textAlign: 'center',
            backgroundColor: status.upToDate ? 'var(--primary-soft)' : '#fff3cd',
            color: status.upToDate ? 'var(--primary-hover)' : '#856404',
            border: `1px solid ${status.upToDate ? '#fbd3bf' : '#ffeeba'}`,
          }}
        >
          {status.workersWithEntries === 0 && records.length === 0
            ? `No Daily Process Entry for ${shownFor}, so there is no attendance to update.`
            : status.upToDate
              ? `Saved attendance for ${shownFor} matches Daily Process Entry (${status.workersWithEntries} operators). Nothing to update.`
              : `Saved attendance for ${shownFor} is out of date for ${status.workersDifferent.length} operator(s): ${status.workersDifferent.join(', ')}. Click "Update Attendance" to save it.`}
        </div>
      )}

      {/* 5. DataTables Toolbar: Export buttons on left, Search on right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <ExportButtons
            reportName="Attendance Records"
            subtitle={shownFor}
            filename={`Attendance_Records_${shownFor.replace(' ', '_') || 'None'}`}
            columns={exportColumns}
            data={filteredData}
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
            placeholder=""
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

      {/* 6. Attendance Table with Cyan Header (var(--primary)) and full D1..D31 columns */}
      <div className="table-box" ref={tableBoxRef} style={{ width: '100%', overflowX: 'auto', borderBottom: '1px solid #dee2e6' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--primary)', color: '#ffffff' }}>
              <th
                onClick={() => handleSort('emp_code_number')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Emp Code {sortField === 'emp_code_number' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('operatorname')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Operator Name {sortField === 'operatorname' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('ledgrpname')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Group {sortField === 'ledgrpname' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>
              <th
                onClick={() => handleSort('totaldays')}
                style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
              >
                Total Days {sortField === 'totaldays' ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
              </th>

              {Array.from({ length: 31 }, (_, i) => {
                const dayKey = `d${i + 1}` as keyof AttendanceRecord;
                return (
                  <th
                    key={dayKey}
                    onClick={() => handleSort(dayKey)}
                    style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid rgba(255,255,255,0.2)', userSelect: 'none' }}
                  >
                    {i + 1} {sortField === dayKey ? (sortOrder === 'asc' ? '▲' : '▼') : '♦'}
                  </th>
                );
              })}

              <th
                onClick={() => handleSort('alteredon')}
                style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}
              >
                Updated On
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={36} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>
                  Loading attendance records...
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={36} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>
                  No saved attendance for {shownFor || `${month} ${year}`}. Click "Update Attendance" to create it.
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => {
                const isEven = idx % 2 === 1;
                return (
                  <tr
                    key={row.id || idx}
                    style={{
                      backgroundColor: isEven ? '#f9f9f9' : '#ffffff',
                      borderBottom: '1px solid #dee2e6',
                    }}
                  >
                    <td style={{ padding: '8px 12px', color: '#555555' }}>{row.emp_code_number}</td>
                    <td style={{ padding: '8px 12px', color: '#333333', fontWeight: 600 }}>{row.operatorname}</td>
                    <td style={{ padding: '8px 12px', color: '#333333' }}>{row.ledgrpname}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#333333', fontWeight: 700 }}>
                      {row.totaldays}
                    </td>

                    {Array.from({ length: 31 }, (_, i) => {
                      const dayVal = (row as any)[`d${i + 1}`];
                      const isPresent = dayVal === 1;
                      return (
                        <td
                          key={i}
                          style={{
                            padding: '8px 8px',
                            textAlign: 'center',
                            fontWeight: isPresent ? 700 : 400,
                            color: isPresent ? '#28a745' : '#aaaaaa',
                            backgroundColor: isPresent ? 'rgba(40, 167, 69, 0.05)' : 'transparent',
                          }}
                        >
                          {isPresent ? '1' : '0'}
                        </td>
                      );
                    })}

                    <td style={{ padding: '8px 12px', color: '#666666', fontSize: '12px' }}>
                      {row.alteredon ? new Date(row.alteredon).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 7. Footer: "Showing X to Y of Z entries" on left, Pagination on right */}
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
