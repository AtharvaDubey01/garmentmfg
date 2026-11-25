import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListPage, type Column } from '../../components/common/ListPage';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Toast } from '../../components/common/Toast';

interface Operation {
  id: number;
  opcode: string;
  operations: string;
  oprate: number;
  processid: number;
  stkcategoryname: string;
}

export const OperationList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Operation | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchOperations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/masters/operations', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setToast({ type: 'error', message: 'Failed to load Operations' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperations();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/masters/operations/${deleteTarget.id}`, {
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

  const columns: Column<Operation>[] = [
    { key: 'id', header: 'ID', width: '70px' },
    { key: 'stkcategoryname', header: 'Process' },
    { key: 'opcode', header: 'Operation Code' },
    { key: 'operations', header: 'Operation' },
    {
      key: 'oprate',
      header: 'Rate',
      render: (row) => Number(row.oprate).toFixed(2),
    },
  ];

  return (
    <div>
      <ListPage<Operation>
        title="Operations Master"
        subtitle="View and manage operations and their default rates"
        newPath="/masters/operations/new"
        columns={columns}
        data={data}
        loading={loading}
        onEdit={(row) => navigate(`/masters/operations/${row.id}`)}
        onDelete={(row) => setDeleteTarget(row)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Operation"
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
