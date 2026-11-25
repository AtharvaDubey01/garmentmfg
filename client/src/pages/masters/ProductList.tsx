import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListPage, type Column } from '../../components/common/ListPage';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Toast } from '../../components/common/Toast';

interface Product {
  id: number;
  stockitemname: string;
  stkgrpname: string;
  stkcode: string;
  unitname: string;
}

export const ProductList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/masters/products', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setToast({ type: 'error', message: 'Failed to load Products' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/masters/products/${deleteTarget.id}`, {
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

  const columns: Column<Product>[] = [
    { key: 'id', header: 'ID', width: '70px' },
    { key: 'stockitemname', header: 'Name' },
    { key: 'stkgrpname', header: 'Group Name' },
    { key: 'stkcode', header: 'Product Code' },
    { key: 'unitname', header: 'Unit' },
  ];

  return (
    <div>
      <ListPage<Product>
        title="Product Master"
        subtitle="View and manage products"
        newPath="/masters/product/new"
        columns={columns}
        data={data}
        loading={loading}
        onEdit={(row) => navigate(`/masters/product/${row.id}`)}
        onDelete={(row) => setDeleteTarget(row)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Product"
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
