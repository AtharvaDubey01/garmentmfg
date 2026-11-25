import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListPage, type Column } from '../../components/common/ListPage';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Toast } from '../../components/common/Toast';

interface Employee {
  id: number;
  ledgrpname: string;
  empcode: string;
  operatorname: string;
  contactno: string;
  addharno: string;
}

export const EmployeeList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/masters/employees', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setToast({ type: 'error', message: 'Failed to load Employees' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/masters/employees/${deleteTarget.id}`, {
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

  const columns: Column<Employee>[] = [
    { key: 'id', header: 'ID', width: '70px' },
    { key: 'ledgrpname', header: 'Group Name' },
    { key: 'empcode', header: 'Employee Code' },
    { key: 'operatorname', header: 'Employee Name' },
    { key: 'contactno', header: 'Contact No.' },
    { key: 'addharno', header: 'Aadhar No.' },
  ];

  return (
    <div>
      <ListPage<Employee>
        title="Employee Master"
        subtitle="View and manage employees"
        newPath="/masters/employee/new"
        columns={columns}
        data={data}
        loading={loading}
        onEdit={(row) => navigate(`/masters/employee/${row.id}`)}
        onDelete={(row) => setDeleteTarget(row)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Employee"
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
