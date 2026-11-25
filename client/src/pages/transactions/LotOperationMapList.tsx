import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListPage, type Column } from '../../components/common/ListPage';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Toast } from '../../components/common/Toast';
import { LotOperationPrintModal, type LotOperationPrintData } from './LotOperationPrintModal';

interface LotOperationRow {
  id: number;
  joborderno: string;
  stkcategoryname: string;
  lotno: string;
  style: string;
  prodname: string;
  operations: string | number;
  rate: string | number;
  processid?: number;
  custdtl?: string;
  joborderdate_fmt?: string;
}

export const LotOperationMapList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<LotOperationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<LotOperationRow | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [printData, setPrintData] = useState<LotOperationPrintData | null>(null);

  const fetchLotMappings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/transactions/lot-operations', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setToast({ type: 'error', message: errJson.message || 'Failed to load Lot Operations' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to load Lot Operations' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLotMappings();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/transactions/lot-operations/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setToast({ type: 'success', message: 'Record deleted successfully' });
        setData((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      } else {
        const errJson = await res.json().catch(() => ({}));
        setToast({ type: 'error', message: errJson.message || 'Delete failed' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Delete failed' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handlePrint = async (row: LotOperationRow) => {
    try {
      const res = await fetch(`/api/transactions/lot-operations/by-lot/${encodeURIComponent(row.lotno)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const ops = await res.json();
        if (ops.length > 0) {
          setPrintData({
            id: row.id,
            lotno: row.lotno,
            custdtl: row.custdtl || ops[0].custdtl,
            joborderno: row.joborderno,
            joborderdate_fmt: row.joborderdate_fmt || ops[0].joborderdate_fmt,
            style: row.style,
            prodname: row.prodname,
            proddtl: ops[0].proddtl,
            operations: ops.map((o: any) => ({
              opname: o.opname,
              operations: o.opname,
              rate: o.rate,
              processname: o.stkcategoryname,
              stkcategoryname: o.stkcategoryname,
            })),
          });
          return;
        }
      }
      // Fallback
      setPrintData({
        id: row.id,
        lotno: row.lotno,
        custdtl: row.custdtl,
        joborderno: row.joborderno,
        joborderdate_fmt: row.joborderdate_fmt,
        style: row.style,
        prodname: row.prodname,
        operations: [],
      });
    } catch (err) {
      console.error('Error fetching print details:', err);
      setToast({ type: 'error', message: 'Could not fetch print details' });
    }
  };

  const columns: Column<LotOperationRow>[] = [
    { key: 'id', header: 'ID', width: '60px' },
    { key: 'joborderno', header: 'Job Order No.' },
    {
      key: 'stkcategoryname',
      header: 'Process',
      render: (row) => (
        <span
          title={row.stkcategoryname || 'All'}
          style={{
            display: 'inline-block',
            maxWidth: '180px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            verticalAlign: 'middle',
            backgroundColor: 'var(--primary-soft)',
            color: 'var(--primary-hover)',
            padding: '2px 10px',
            borderRadius: '999px',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          {row.stkcategoryname || 'All'}
        </span>
      ),
    },
    { key: 'lotno', header: 'Lot No.' },
    { key: 'style', header: 'Style' },
    { key: 'prodname', header: 'Product Name' },
    {
      key: 'operations',
      header: 'Total No. of Operations',
      render: (row) => <span style={{ fontWeight: 600 }}>{row.operations}</span>,
    },
    {
      key: 'rate',
      header: 'Total Rate',
      render: (row) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {parseFloat(String(row.rate || 0)).toFixed(2)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <ListPage<LotOperationRow>
        title="Lot Operation Map"
        subtitle="The steps each lot goes through, in order, with rates"
        newPath="/transactions/lot-operation-map/new"
        columns={columns}
        data={data}
        loading={loading}
        onEdit={(row) => navigate(`/transactions/lot-operation-map/${row.id}`)}
        onDelete={(row) => setDeleteTarget(row)}
        onPrint={(row) => handlePrint(row)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Confirm Deletion"
        message={`Are you sure you want to delete Lot Mapping #${deleteTarget?.id} for Lot No: ${deleteTarget?.lotno}?`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Printable Lot Operation Modal */}
      <LotOperationPrintModal
        isOpen={!!printData}
        onClose={() => setPrintData(null)}
        data={printData}
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
