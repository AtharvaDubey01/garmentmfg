import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListPage, type Column } from '../../components/common/ListPage';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Toast } from '../../components/common/Toast';

interface Company {
  id: number;
  compname: string;
  cmpaddr1: string;
  cmpaddr2: string;
  cmpaddr3: string;
  statename: string;
  cmpmobile: string;
  cmpgstn: string;
}

export const CompanyList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/masters/companies', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setToast({ type: 'error', message: 'Failed to load Companies' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/masters/companies/${deleteTarget.id}`, {
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

  const columns: Column<Company>[] = [
    { key: 'id', header: 'ID', width: '70px' },
    { key: 'compname', header: 'Company Name' },
    { key: 'cmpaddr1', header: 'Address1' },
    { key: 'cmpaddr2', header: 'Address2' },
    { key: 'cmpaddr3', header: 'Address3' },
    { key: 'statename', header: 'State' },
    { key: 'cmpmobile', header: 'Mobile No.' },
    { key: 'cmpgstn', header: 'GSTIN No.' },
  ];

  return (
    <div>
      <ListPage<Company>
        title="Company Master"
        subtitle="View and manage company details"
        newPath="/masters/company/new"
        columns={columns}
        data={data}
        loading={loading}
        onEdit={(row) => navigate(`/masters/company/${row.id}`)}
        onDelete={(row) => setDeleteTarget(row)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Company"
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
