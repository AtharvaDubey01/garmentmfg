import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListPage, type Column } from '../../components/common/ListPage';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Toast } from '../../components/common/Toast';

interface EmployeeGroup {
  id: number;
  ledgrpname: string;
}

export const EmployeeGroupList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<EmployeeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeGroup | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/masters/employee-groups', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setToast({ type: 'error', message: 'Failed to load Employee Groups' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/masters/employee-groups/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setToast({ type: 'success', message: 'Record deleted successfully' });
        setData((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      } else {
        const err = await res.json();
        setToast({ type: 'error', message: err.message || 'Delete failed' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns: Column<EmployeeGroup>[] = [
    { key: 'id', header: 'ID', width: '80px' },
    { key: 'ledgrpname', header: 'Group Name' },
  ];

  return (
    <div>
      <ListPage<EmployeeGroup>
        title="Employee Group Master"
        subtitle="View and manage employee groups"
        newPath="/masters/employee-group/new"
        columns={columns}
        data={data}
        loading={loading}
        onEdit={(row) => navigate(`/masters/employee-group/${row.id}`)}
        onDelete={(row) => setDeleteTarget(row)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Employee Group"
        message="Are you sure you want to delete this Record?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};
