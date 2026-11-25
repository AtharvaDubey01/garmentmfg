import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Toast } from '../../components/common/Toast';
import { useScreenRights } from '../../context/AuthContext';
import { ExportButtons } from '../../components/common/ExportButtons';

interface ProcessEntryRow {
  id: string | number;
  yearname: string | number;
  monthname: string;
  operatorname: string;
  empcode: string;
  ledgrpname: string;
  totalprocess: string | number;
  totalqty: string | number;
}

interface GroupOption {
  id: string | number;
  ledgrpname: string;
}

export const DailyProcessEntryList: React.FC = () => {
  const rights = useScreenRights(); // Daily Process Entry rights (Admin > Create Login)
  const navigate = useNavigate();

  const [data, setData] = useState<ProcessEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState<GroupOption[]>([]);

  // Deletion modal & toast
  const [deleteTarget, setDeleteTarget] = useState<ProcessEntryRow | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load Groups for dropdown filter
  useEffect(() => {
    fetch('/api/transactions/daily-entry/groups', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((json) => setGroups(json))
      .catch((err) => console.error('Failed to load groups:', err));
  }, []);

  // Fetch list data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search.trim()) params.append('search', search.trim());
      if (year.trim()) params.append('year', year.trim());
      if (month && month !== '--Select--') params.append('month', month);
      if (groupId && groupId !== '--Select--') params.append('groupId', groupId);

      const res = await fetch(`/api/transactions/daily-entry/list?${params.toString()}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.data || []);
        setTotalPages(json.pagination?.totalPages || 1);
        setTotalCount(json.pagination?.totalCount || 0);
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ type: 'error', message: err.message || 'Failed to load Process Entry Report' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, year, month, groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/transactions/daily-entry/header/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setToast({ type: 'success', message: 'Record deleted successfully' });
        setDeleteTarget(null);
        fetchData();
      } else {
        const errJson = await res.json();
        setToast({ type: 'error', message: errJson.message || 'Delete failed' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    }
  };



  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return (
    <div className="fill-screen" style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--text-heading)', fontWeight: 600, fontSize: '1.6rem' }}>Process Entry Report</h3>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
            Monthly garment process work entries by employee ({totalCount} total entries)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <ExportButtons
            reportName="Daily Process Entry"
            filename="Process_Entry_Report"
            columns={[
              { header: 'ID', key: 'id' },
              { header: 'Year', key: 'yearname' },
              { header: 'Month', key: 'monthname' },
              { header: 'Employee Name', key: 'operatorname' },
              { header: 'Emp Code', key: 'empcode' },
              { header: 'Group', key: 'ledgrpname' },
              { header: 'No. of Operations', key: 'totalprocess' },
              { header: 'Total Qty', key: 'totalqty' },
            ]}
            data={data}
            onCopySuccess={() => setToast({ type: 'success', message: 'Table data copied to clipboard' })}
          />
          {rights.create && <button
            onClick={() => navigate('/transactions/daily-process-entry/new')}
            style={primaryBtnStyle}
          >
            <i className="bi bi-plus-lg"></i> New Daily Entry
          </button>}
        </div>
      </div>

      {/* Filter panel */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '16px 20px',
          boxShadow: 'var(--shadow-card)',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div>
            <label style={labelStyle}>
              Search
            </label>
            <input
              type="text"
              style={inputStyle}
              placeholder="Search employee, group..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Month
            </label>
            <select
              style={inputStyle}
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>
              Year
            </label>
            <input
              type="number"
              style={inputStyle}
              placeholder="e.g. 2026"
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Group
            </label>
            <select
              style={inputStyle}
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.ledgrpname}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(search || month || year || groupId) && (
          <div style={{ marginTop: '10px', textAlign: 'right' }}>
            <button
              onClick={() => {
                setSearch('');
                setMonth('');
                setYear('');
                setGroupId('');
                setPage(1);
              }}
              style={{ color: 'var(--danger)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '13px' }}
            >
              <i className="bi bi-x-circle"></i> Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Main Table (fills the rest of the screen) */}
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
        <div className="table-box">
          <table className="garmentmfg-table">
            <thead>
              <tr>
                <th style={{ width: '70px' }}>ID</th>
                <th style={{ width: '80px' }}>Year</th>
                <th style={{ width: '100px' }}>Month</th>
                <th>Employee</th>
                <th>Group</th>
                <th style={{ textAlign: 'center', width: '130px' }}>Operations</th>
                <th style={{ textAlign: 'right', width: '120px' }}>Total Qty</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Loading Process Entries...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No Process Entries found.
                  </td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{row.id}</td>
                    <td>{row.yearname}</td>
                    <td>
                      <span style={pillStyle('#f3f4f6', 'var(--text-main)')}>{row.monthname}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{row.operatorname}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Code: {row.empcode}</div>
                    </td>
                    <td>
                      <span style={pillStyle('var(--primary-soft)', 'var(--primary-hover)')}>{row.ledgrpname}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={pillStyle('#f3f4f6', 'var(--text-main)')}>
                        {row.totalprocess} ops
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>
                      {parseFloat(String(row.totalqty)).toLocaleString('en-IN', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => navigate(`/transactions/daily-process-entry/${row.id}`)}
                        style={{ ...iconBtnStyle, marginRight: '6px' }}
                        title="Edit Entry"
                      >
                        <i className="bi bi-pencil-square"></i>
                      </button>
                      {rights.delete && <button
                        onClick={() => setDeleteTarget(row)}
                        style={{ ...iconBtnStyle, color: 'var(--danger)' }}
                        title="Delete Record"
                      >
                        <i className="bi bi-trash"></i>
                      </button>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: '#ffffff',
            fontSize: '13px',
          }}
        >
          <div style={{ color: 'var(--text-muted)' }}>
            Showing {data.length > 0 ? (page - 1) * limit + 1 : 0} to{' '}
            {Math.min(page * limit, totalCount)} of {totalCount} entries
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Rows per page:</span>
            <select
              style={{ ...inputStyle, width: '70px' }}
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value, 10));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>

            <button
              style={pageBtnStyle(page <= 1)}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span style={{ padding: '0 8px', fontWeight: 'bold' }}>
              {page} / {totalPages}
            </span>
            <button
              style={pageBtnStyle(page >= totalPages)}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {deleteTarget && (
        <ConfirmModal
          isOpen={true}
          title="Delete Process Entry Record"
          message={`Are you sure you want to delete the daily process entry for "${deleteTarget.operatorname}" (${deleteTarget.monthname} ${deleteTarget.yearname})? All logged operations under this header will also be soft-deleted.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-heading)',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  border: '1px solid var(--border-color)',
  fontSize: '14px',
  fontFamily: 'inherit',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '9px 16px',
  border: 'none',
  backgroundColor: 'var(--primary)',
  color: '#ffffff',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
  boxShadow: '0 4px 10px rgba(239, 122, 69, 0.25)',
};

const iconBtnStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid var(--border-color)',
  padding: '5px 8px',
  cursor: 'pointer',
  color: 'var(--text-main)',
};

const pageBtnStyle = (isDisabled: boolean): React.CSSProperties => ({
  padding: '5px 12px',
  border: '1px solid var(--border-color)',
  backgroundColor: '#ffffff',
  color: isDisabled ? '#c0c4cc' : 'var(--text-main)',
  cursor: isDisabled ? 'default' : 'pointer',
  fontSize: '13px',
});

const pillStyle = (background: string, color: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 600,
  backgroundColor: background,
  color,
});
