import React from 'react';
import { PrinterIcon } from '../../components/common/Icons';
import { printHtmlContent } from '../../utils/exportUtils';
import { useBranding } from '../../context/BrandingContext';

export interface JobOrderPrintData {
  id: number;
  joborderno: string;
  joborderdate_fmt?: string;
  joborderdate?: string;
  customerid: number;
  stockitemname: string;
  custorderno?: string;
  custorderdate_fmt?: string;
  custorderdate?: string;
  totalqtypcs: number | string;
  fabriclotno: string;
  fabricqty?: number | string;
  totalcuttingpcs?: number | string;
  avgrequirement?: number | string;
  style: string;
  custdtl: string;
  fabricdtls: string;
  cutqty?: number | string;
  lotclosed: string;
}

interface JobOrderPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: JobOrderPrintData | null;
}

export const JobOrderPrintModal: React.FC<JobOrderPrintModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const branding = useBranding(); // company name + logo at the top of the sheet
  if (!isOpen || !order) return null;

  const handlePrint = () => {
    const el = document.getElementById('job-order-printable');
    if (el) {
      printHtmlContent(`${branding.displayName} - Job Order ${order.joborderno || order.id}`, el.innerHTML);
    } else {
      window.print();
    }
  };

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
        {/* Modal Controls Header (hidden during print) */}
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
              Job Order Print Preview - #{order.joborderno || order.id}
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
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <PrinterIcon size={14} color="var(--primary)" /> Print
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div
          id="job-order-printable"
          style={{
            padding: '36px 40px',
            overflowY: 'auto',
            backgroundColor: '#ffffff',
            color: '#222222',
            fontFamily: 'var(--font-family)',
          }}
        >
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #job-order-printable, #job-order-printable * {
                visibility: visible;
              }
              #job-order-printable {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 20mm;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>

          {/* Company logo + name (Admin > Company Branding) */}
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            {branding.logoDataUrl && (
              <img src={branding.logoDataUrl} alt="" style={{ display: 'block', margin: '0 auto 8px', maxHeight: '60px', maxWidth: '240px', objectFit: 'contain' }} />
            )}
            <h2 style={{ margin: '0 0 4px 0', fontSize: '1.6rem', fontWeight: 700, color: '#333' }}>
              {branding.displayName}
            </h2>
            <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--primary)', letterSpacing: '1px' }}>
              JOB ORDER BOOKING
            </div>
            <div style={{ width: '100%', height: '2px', backgroundColor: '#333', margin: '14px 0 20px 0' }} />
          </div>

          {/* Header Info Grid */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginBottom: '20px',
              fontSize: '0.92rem',
            }}
          >
            <tbody>
              <tr>
                <td style={{ padding: '8px 10px', width: '22%', fontWeight: 700, color: '#555' }}>
                  Job Order No.:
                </td>
                <td style={{ padding: '8px 10px', width: '28%', fontWeight: 600 }}>
                  {order.joborderno || '-'}
                </td>
                <td style={{ padding: '8px 10px', width: '22%', fontWeight: 700, color: '#555' }}>
                  Job Order Date:
                </td>
                <td style={{ padding: '8px 10px', width: '28%' }}>
                  {order.joborderdate_fmt || order.joborderdate || '-'}
                </td>
              </tr>
              <tr style={{ backgroundColor: '#fcfcfc' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#555' }}>
                  Buyer / Cust Details:
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                  {order.custdtl || '-'}
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#555' }}>
                  Product Lot No.:
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--primary)' }}>
                  {order.fabriclotno || '-'}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#555' }}>
                  Product Description:
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                  {order.stockitemname || '-'}
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#555' }}>
                  Style:
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                  {order.style || '-'}
                </td>
              </tr>
              <tr style={{ backgroundColor: '#fcfcfc' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#555' }}>
                  Customer Order No.:
                </td>
                <td style={{ padding: '8px 10px' }}>
                  {order.custorderno || '-'}
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#555' }}>
                  Customer Order Date:
                </td>
                <td style={{ padding: '8px 10px' }}>
                  {order.custorderdate_fmt || order.custorderdate || '-'}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#555' }}>
                  Total Order Qty (Pcs):
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 700, fontSize: '1rem', color: 'var(--primary)' }}>
                  {order.totalqtypcs}
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#555' }}>
                  Total Cut Qty:
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                  {order.cutqty || '0.00'}
                </td>
              </tr>
              <tr style={{ backgroundColor: '#fcfcfc' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#555' }}>
                  Product Details:
                </td>
                <td colSpan={3} style={{ padding: '8px 10px', fontStyle: 'italic' }}>
                  {order.fabricdtls || '-'}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#555' }}>
                  Lot Status:
                </td>
                <td colSpan={3} style={{ padding: '8px 10px' }}>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      backgroundColor: order.lotclosed === 'Yes' ? '#ffebe9' : 'var(--primary-soft)',
                      color: order.lotclosed === 'Yes' ? 'var(--danger)' : 'var(--primary)',
                    }}
                  >
                    {order.lotclosed === 'Yes' ? 'Closed' : 'Open (Active)'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
