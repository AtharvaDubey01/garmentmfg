import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListPage, type Column } from '../../components/common/ListPage';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Toast } from '../../components/common/Toast';

interface Unit {
  id: number;
  unitname: string;
  unittype: string;
  decimalplaces: number;
}

export const UnitList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Unit | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchUnits = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/masters/units', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setToast({ type: 'error', message: 'Failed to load Units' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnits();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/masters/units/${deleteTarget.id}`, {
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

  const columns: Column<Unit>[] = [
    { key: 'id', header: 'ID', width: '80px' },
    { key: 'unitname', header: 'Unit Name' },
    { key: 'unittype', header: 'Unit Type' },
  ];

  return (
    <div>
      <ListPage<Unit>
        title="Unit Master"
        subtitle="View and manage units of measure"
        newPath="/masters/unit/new"
        columns={columns}
        data={data}
        loading={loading}
        onEdit={(row) => navigate(`/masters/unit/${row.id}`)}
        onDelete={(row) => setDeleteTarget(row)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Unit"
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
