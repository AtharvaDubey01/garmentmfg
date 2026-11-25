import React, { useState, useEffect } from 'react';
import { PrinterIcon } from '../../components/common/Icons';
import { useScreenRights } from '../../context/AuthContext';
import { LotOperationPrintModal, type LotOperationPrintData } from './LotOperationPrintModal';

interface LotOption {
  id: number;
  fabriclotno: string;
  joborderno?: string;
}

interface OperationRow {
  id: number;
  joborderno: string;
  proddtl: string;
  stkcategoryname: string;
  opname: string;
  rate: number | string;
  lotno: string;
  custdtl: string;
  style: string;
  joborderdate_fmt: string;
  joborderdate: string;
  prodname: string;
}

export const LotOperationPrint: React.FC = () => {
  const canPrint = useScreenRights().print; // Print right on Lot Operation Print
  const [lotOptions, setLotOptions] = useState<LotOption[]>([]);
  const [selectedLot, setSelectedLot] = useState<string>('');
  const [rows, setRows] = useState<OperationRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);

  // Fetch all lots (both open lots and lots mapped)
  useEffect(() => {
    fetchLots();
  }, []);

  const fetchLots = async () => {
    try {
      const res = await fetch('/api/transactions/lot-operations/open-lots', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setLotOptions(json);
      } else {
        setError('Failed to load lot list');
      }
    } catch (err: any) {
      console.error('Error fetching lot numbers:', err);
      setError('Failed to load lot list');
    }
  };

  const handleLotChange = async (lotNo: string) => {
    setSelectedLot(lotNo);
    setError('');
    if (!lotNo || lotNo === '--Select--') {
      setRows([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/transactions/lot-operations/by-lot/${encodeURIComponent(lotNo)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        setRows(json);
        if (json.length === 0) {
          setError(`No mapped operations found for Lot ${lotNo}`);
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.message || 'Error fetching lot operations');
        setRows([]);
      }
    } catch (err: any) {
      console.error('Error fetching lot operations:', err);
      setError(err.message || 'Error fetching lot operations');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const totalRate = rows.reduce((acc, curr) => acc + (parseFloat(String(curr.rate)) || 0), 0);

  // Format data for modal print view
  const modalPrintData: LotOperationPrintData | null = rows.length > 0 ? {
    id: rows[0].id,
    lotno: selectedLot,
    custdtl: rows[0].custdtl,
    joborderno: rows[0].joborderno,
    joborderdate_fmt: rows[0].joborderdate_fmt,
    joborderdate: rows[0].joborderdate,
    style: rows[0].style,
    prodname: rows[0].prodname,
    proddtl: rows[0].proddtl,
    operations: rows.map(r => ({
      opname: r.opname,
      operations: r.opname,
      rate: r.rate,
      processname: r.stkcategoryname,
      stkcategoryname: r.stkcategoryname,
    })),
  } : null;

  return (
    <div style={{ padding: '24px 30px' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: 'var(--text-heading)', fontSize: '1.6rem', fontWeight: 600, margin: 0 }}>
          Lot Operation Print
        </h2>
        {rows.length > 0 && canPrint && (
          <button
            type="button"
            onClick={() => setPrintModalOpen(true)}
            style={{
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <PrinterIcon size={16} color="#ffffff" />
            Print Report
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: '14px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Lot Selection Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '20px',
          maxWidth: '650px',
          marginBottom: '25px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <label style={{ fontWeight: 600, fontSize: '0.95rem', minWidth: '80px', color: '#000000' }}>
            Lot No. :
          </label>
          <select
            value={selectedLot}
            onChange={(e) => handleLotChange(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #ced4da',
              fontSize: '0.95rem',
              backgroundColor: '#ffffff',
            }}
          >
            <option value="">--Select--</option>
            {lotOptions.map((lot) => (
              <option key={lot.id} value={lot.fabriclotno}>
                {lot.fabriclotno} {lot.joborderno ? `(JO: ${lot.joborderno})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Operations Table */}
      {loading ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#666' }}>Loading operations...</div>
      ) : rows.length > 0 ? (
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--primary)', color: '#ffffff' }}>
                  <th style={{ padding: '12px 14px', fontWeight: 600 }}>Job Order No.</th>
                  <th style={{ padding: '12px 14px', fontWeight: 600 }}>Product Details</th>
                  <th style={{ padding: '12px 14px', fontWeight: 600 }}>Process</th>
                  <th style={{ padding: '12px 14px', fontWeight: 600 }}>Operations</th>
                  <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>Rate (₹)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid #e9ecef',
                      backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8f9fa',
                    }}
                  >
                    <td style={{ padding: '10px 14px' }}>{row.joborderno}</td>
                    <td style={{ padding: '10px 14px' }}>{row.proddtl || row.prodname}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          backgroundColor: 'var(--primary-soft)',
                          color: 'var(--primary-hover)',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                        }}
                      >
                        {row.stkcategoryname}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{row.opname}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {parseFloat(String(row.rate)).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {/* Total Rate Row */}
                <tr style={{ backgroundColor: '#e9ecef', fontWeight: 700 }}>
                  <td colSpan={4} style={{ padding: '12px 14px', textAlign: 'right' }}>
                    Total Rate:
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: '1rem' }}>
                    {totalRate.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : selectedLot && !loading ? (
        <div
          style={{
            padding: '30px',
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            textAlign: 'center',
            color: '#777',
          }}
        >
          No mapped operations found for Lot {selectedLot}.
        </div>
      ) : null}

      {/* Print Modal */}
      {modalPrintData && (
        <LotOperationPrintModal
          isOpen={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          data={modalPrintData}
        />
      )}
    </div>
  );
};
