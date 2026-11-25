import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListPage, type Column } from '../../components/common/ListPage';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Toast } from '../../components/common/Toast';

// Admin > Create Login: every employee who has a login (most employees don't have one).

interface LoginRow {
  id: number;
  empcode: string; // = username
  operatorname: string;
  ledgrpname: string;
  password: string; // shown on purpose: admins only, single company
  isadmin: 'YES' | 'NO';
  isactive: 'YES' | 'NO';
}

export const LoginList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<LoginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<LoginRow | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchLogins = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/logins', { credentials: 'include' });
      if (res.ok) {
        setData(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ type: 'error', message: err.message || 'Failed to load logins' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogins();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/logins/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setToast({ type: 'success', message: json.message || 'Login removed' });
        setData((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      } else {
        setToast({ type: 'error', message: json.message || 'Remove failed' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const yesNoBadge = (value: 'YES' | 'NO', yesText: string, noText: string) => (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '0.8rem',
        fontWeight: 600,
        backgroundColor: value === 'YES' ? 'var(--primary-soft)' : '#f1f3f5',
        color: value === 'YES' ? 'var(--primary-hover)' : '#888',
      }}
    >
      {value === 'YES' ? yesText : noText}
    </span>
  );

  const columns: Column<LoginRow>[] = [
    { key: 'empcode', header: 'Employee Code (Username)' },
    { key: 'operatorname', header: 'Employee Name' },
    { key: 'ledgrpname', header: 'Group' },
    { key: 'password', header: 'Password' },
    { key: 'isadmin', header: 'Admin', render: (r) => yesNoBadge(r.isadmin, 'Admin', 'User') },
    { key: 'isactive', header: 'Status', render: (r) => yesNoBadge(r.isactive, 'Active', 'Inactive') },
  ];

  return (
    <div>
      <ListPage<LoginRow>
        title="Create Login"
        subtitle="Give employees a login and choose what each person can do"
        newPath="/admin/logins/new"
        columns={columns}
        data={data}
        loading={loading}
        onEdit={(row) => navigate(`/admin/logins/${row.id}`)}
        onDelete={(row) => setDeleteTarget(row)}
        showExportButtons={false}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Remove Login"
        message={`Remove the login of ${deleteTarget?.operatorname} (${deleteTarget?.empcode})? They won't be able to log in. The employee and all their work are kept.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
};
