import React from 'react';
import { PrinterIcon } from '../../components/common/Icons';
import { printHtmlContent } from '../../utils/exportUtils';
import { useBranding } from '../../context/BrandingContext';

export interface LotOperationPrintData {
  id: number;
  lotno: string;
  custdtl?: string;
  joborderno?: string;
  joborderdate_fmt?: string;
  joborderdate?: string;
  style?: string;
  orderqty?: number | string;
  custorderno?: string;
  custorderdt_fmt?: string;
  prodname?: string;
  proddtl?: string;
  operations?: Array<{
    opname?: string;
    operations?: string | number;
    rate: number | string;
    processname?: string;
    stkcategoryname?: string;
  }>;
}

interface LotOperationPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: LotOperationPrintData | null;
}

export const LotOperationPrintModal: React.FC<LotOperationPrintModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const branding = useBranding(); // company name + logo at the top of the sheet
  if (!isOpen || !data) return null;

  const handlePrint = () => {
    const el = document.getElementById('printable-lot-area');
    if (el) {
      printHtmlContent(`${branding.displayName} - Lot Operation ${data.lotno || ''}`, el.innerHTML);
    } else {
      window.print();
    }
  };

  const ops = data.operations || [];
  const totalRate = ops.reduce((acc, curr) => acc + (parseFloat(String(curr.rate)) || 0), 0);

  // Month-Year string from job order date or current date
  let monthYear = '';
  if (data.joborderdate) {
    const d = new Date(data.joborderdate);
    if (!isNaN(d.getTime())) {
      monthYear = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
  }
  if (!monthYear) {
    monthYear = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '850px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header Controls (hidden on print) */}
        <div
          className="no-print"
          style={{
            padding: '12px 20px',
            backgroundColor: 'var(--primary)',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PrinterIcon size={18} color="#ffffff" />
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>
              Lot Operation Print Preview - Lot #{data.lotno}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                backgroundColor: '#ffffff',
                color: 'var(--primary)',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <PrinterIcon size={14} color="var(--primary)" />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.6)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Scrollable Printable A4 Container */}
        <div
          style={{
            padding: '30px',
            overflowY: 'auto',
            backgroundColor: '#f8f9fa',
            flex: 1,
          }}
        >
          <div
            id="printable-lot-area"
            style={{
              backgroundColor: '#ffffff',
              padding: '36px',
              margin: '0 auto',
              maxWidth: '750px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              fontFamily: 'var(--font-family)',
              color: '#000000',
              lineHeight: 1.4,
            }}
          >
            {/* Report Header matching legacy OpMapLot.aspx.cs: company logo + name (Admin > Company Branding) */}
            {branding.logoDataUrl && (
              <img src={branding.logoDataUrl} alt="" style={{ display: 'block', margin: '0 auto 8px', maxHeight: '60px', maxWidth: '240px', objectFit: 'contain' }} />
            )}
            <h2
              style={{
                textAlign: 'center',
                margin: '0 0 10px 0',
                fontSize: '1.4rem',
                fontWeight: 700,
                letterSpacing: '1px',
              }}
            >
              {branding.displayName.toUpperCase()}
            </h2>
            <hr style={{ border: 'none', borderTop: '1px solid #000000', margin: '10px 0 16px 0' }} />

            {/* Header Details Table */}
            <table style={{ width: '100%', marginBottom: '16px', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 700, padding: '4px 0', width: '60%' }}>
                    BUYER : {data.custdtl || '-'}
                  </td>
                  <td style={{ fontWeight: 700, textAlign: 'right', padding: '4px 0' }}>
                    Date : {data.joborderdate_fmt || data.joborderdate || '-'}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700, padding: '4px 0' }}>
                    STYLE : {data.style || '-'}
                  </td>
                  <td style={{ fontWeight: 700, textAlign: 'right', padding: '4px 0' }}>
                    JOB ORDER NO : {data.joborderno || '-'}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 700, padding: '4px 0' }}>
                    DESCRIPTION : {data.proddtl || data.prodname || '-'}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 700, padding: '4px 0' }}>
                    LOT NO : {data.lotno || '-'}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 700, padding: '4px 0' }}>
                    MONTH : {monthYear}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Operations Grid Table */}
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: '1px solid black',
                fontSize: '0.85rem',
                marginTop: '10px',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f2f2f2' }}>
                  <th
                    style={{
                      border: '1px solid black',
                      padding: '8px',
                      width: '60px',
                      textAlign: 'center',
                      fontWeight: 700,
                    }}
                  >
                    SR.NO.
                  </th>
                  <th
                    style={{
                      border: '1px solid black',
                      padding: '8px',
                      textAlign: 'left',
                      fontWeight: 700,
                    }}
                  >
                    OPERATION
                  </th>
                  <th
                    style={{
                      border: '1px solid black',
                      padding: '8px',
                      width: '120px',
                      textAlign: 'right',
                      fontWeight: 700,
                    }}
                  >
                    Rate (₹)
                  </th>
                </tr>
              </thead>
              <tbody>
                {ops.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      style={{
                        border: '1px solid black',
                        padding: '16px',
                        textAlign: 'center',
                        color: '#666666',
                      }}
                    >
                      No operations mapped for this lot.
                    </td>
                  </tr>
                ) : (
                  ops.map((op, idx) => {
                    const r = parseFloat(String(op.rate)) || 0;
                    return (
                      <tr key={idx}>
                        <td
                          style={{
                            border: '1px solid black',
                            padding: '6px 8px',
                            textAlign: 'center',
                          }}
                        >
                          {idx + 1}
                        </td>
                        <td
                          style={{
                            border: '1px solid black',
                            padding: '6px 8px',
                          }}
                        >
                          {op.opname || op.operations || '-'}
                        </td>
                        <td
                          style={{
                            border: '1px solid black',
                            padding: '6px 8px',
                            textAlign: 'right',
                            fontFamily: 'monospace',
                            fontSize: '0.9rem',
                          }}
                        >
                          {r.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
                {/* Total Rate Row */}
                <tr style={{ backgroundColor: '#fafafa' }}>
                  <th style={{ border: '1px solid black', padding: '8px' }}></th>
                  <th
                    style={{
                      border: '1px solid black',
                      padding: '8px',
                      textAlign: 'right',
                      fontWeight: 700,
                    }}
                  >
                    TOTAL
                  </th>
                  <th
                    style={{
                      border: '1px solid black',
                      padding: '8px',
                      textAlign: 'right',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      fontSize: '0.95rem',
                    }}
                  >
                    {totalRate.toFixed(2)}
                  </th>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Media Print Style Rules */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-lot-area, #printable-lot-area * {
            visibility: visible;
          }
          #printable-lot-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20mm;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
};
