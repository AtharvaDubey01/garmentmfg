import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ListPage, type Column } from '../../components/common/ListPage';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Toast } from '../../components/common/Toast';
import { JobOrderPrintModal, type JobOrderPrintData } from './JobOrderPrintModal';

interface JobOrder extends JobOrderPrintData {
  joborderdate_fmt?: string;
  custorderdate_fmt?: string;
}

export const JobOrderList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<JobOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<JobOrder | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [printOrder, setPrintOrder] = useState<JobOrder | null>(null);

  // Opened from the Home page lot counts: ?status=open or ?status=closed shows only those lots
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status');
  const isClosed = (row: JobOrder) => String(row.lotclosed || 'No').toLowerCase() === 'yes';
  const shownData =
    status === 'open' ? data.filter((row) => !isClosed(row)) : status === 'closed' ? data.filter(isClosed) : data;

  const fetchJobOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/transactions/job-orders', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setToast({ type: 'error', message: 'Failed to load Job Orders' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobOrders();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/transactions/job-orders/${deleteTarget.id}`, {
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

  const columns: Column<JobOrder>[] = [
    { key: 'id', header: 'ID', width: '60px' },
    { key: 'joborderno', header: 'Job Order No.' },
    { key: 'custdtl', header: 'Buyer' },
    { key: 'fabriclotno', header: 'Lot No' },
    { key: 'style', header: 'Style' },
    { key: 'stockitemname', header: 'Product Description' },
    { key: 'fabricdtls', header: 'Product Details' },
    {
      key: 'totalqtypcs',
      header: 'Total Qty',
      render: (row) => <span>{row.totalqtypcs}</span>,
    },
    {
      key: 'cutqty',
      header: 'Cut Qty',
      render: (row) => <span>{row.cutqty || '0.00'}</span>,
    },
    {
      key: 'lotclosed',
      header: 'Lot Closed',
      render: (row) => (
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '8px',
            fontSize: '0.8rem',
            fontWeight: 600,
            backgroundColor: row.lotclosed === 'Yes' ? '#ffebe9' : 'var(--primary-soft)',
            color: row.lotclosed === 'Yes' ? 'var(--danger)' : 'var(--primary)',
          }}
        >
          {row.lotclosed || 'No'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <ListPage<JobOrder>
        title="Job Order Booking"
        // Coming from the Home page tiles: say which lots are shown, with a way back to all
        banner={
          (status === 'open' || status === 'closed') && (
            <div
              style={{
                margin: '0 0 14px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 600,
                backgroundColor: status === 'open' ? 'var(--primary-soft)' : '#f1f3f5',
                color: status === 'open' ? 'var(--primary-hover)' : '#475569',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Showing {status === 'open' ? 'open' : 'closed'} lots only ({shownData.length})</span>
              <button
                type="button"
                onClick={() => setSearchParams({})}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer' }}
              >
                Show all lots
              </button>
            </div>
          )
        }
        subtitle="Job orders and their lots, with cut quantity and status"
        newPath="/transactions/job-order/new"
        columns={columns}
        data={shownData}
        loading={loading}
        onEdit={(row) => navigate(`/transactions/job-order/${row.id}`)}
        onDelete={(row) => setDeleteTarget(row)}
        onPrint={(row) => setPrintOrder(row)}
      />

      {/* Confirmation Modal for Delete */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Confirm Deletion"
        message={`Are you sure you want to delete Job Order #${deleteTarget?.joborderno || deleteTarget?.id} (Lot No: ${deleteTarget?.fabriclotno})?`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Printable Job Order Modal */}
      <JobOrderPrintModal
        isOpen={!!printOrder}
        onClose={() => setPrintOrder(null)}
        order={printOrder}
      />

      {/* Toast Feedback */}
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
