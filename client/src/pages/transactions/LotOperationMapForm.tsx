import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Toast } from '../../components/common/Toast';
import { useScreenRights } from '../../context/AuthContext';
import { TrashIcon, PlusIcon, PrinterIcon } from '../../components/common/Icons';
import { LotOperationPrintModal, type LotOperationPrintData } from './LotOperationPrintModal';

interface OpenLot {
  id: number;
  fabriclotno: string;
  joborderno: string;
  mapping_id?: number | string | null;
}

interface ProcessMaster {
  id: number;
  stkcategoryname: string;
}

interface OperationItem {
  id: number;
  operations: string;
  oprate: number | string;
  opcode?: string;
  processid: number;
}

interface GridRow {
  id?: number; // DB id in joborder_operations if editing existing row
  stepno: string; // order the lot moves through operations: 1, 2, 3...
  processid: string | number;
  operations: string | number;
  rate: string;
  // Names as saved on the lot, so a step still shows if its operation/process was later deleted in Masters
  savedOpName?: string;
  savedProcessName?: string;
}

export const LotOperationMapForm: React.FC = () => {
  // Without "Change rates" the rate box is read-only: steps use the operation's default rate (server checks too)
  const rights = useScreenRights();
  const canChangeRates = rights.has('changeRates');
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  // Lookups state
  const [openLots, setOpenLots] = useState<OpenLot[]>([]);
  const [processes, setProcesses] = useState<ProcessMaster[]>([]);
  const [allOperations, setAllOperations] = useState<OperationItem[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);

  // Status & toast
  const [errorMessage, setErrorMessage] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Header Fields
  const [selectedLotId, setSelectedLotId] = useState<string>('');
  const [lotNo, setLotNo] = useState<string>('');
  const [buyer, setBuyer] = useState<string>('');
  const [jobOrderNo, setJobOrderNo] = useState<string>('');
  const [jobOrderDate, setJobOrderDate] = useState<string>('');
  const [jobOrderDateFmt, setJobOrderDateFmt] = useState<string>('');
  const [style, setStyle] = useState<string>('');
  const [orderQty, setOrderQty] = useState<string>('');
  const [custOrderNo, setCustOrderNo] = useState<string>('');
  const [custOrderDate, setCustOrderDate] = useState<string>('');
  const [custOrderDateFmt, setCustOrderDateFmt] = useState<string>('');
  const [prodName, setProdName] = useState<string>('');
  const [prodDtl, setProdDtl] = useState<string>('');

  // Dynamic grid rows
  const [rows, setRows] = useState<GridRow[]>([
    { stepno: '1', processid: '', operations: '', rate: '' },
  ]);

  // Load initial lookups (Open Lots, Process Masters, Operations)
  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const [lotsRes, procRes, opsRes] = await Promise.all([
          fetch('/api/transactions/lot-operations/open-lots', { credentials: 'include' }),
          fetch('/api/masters/process-masters', { credentials: 'include' }),
          fetch('/api/masters/operations', { credentials: 'include' }),
        ]);
        if (lotsRes.ok && procRes.ok && opsRes.ok) {
          const lotsData = await lotsRes.json();
          const procData = await procRes.json();
          const opsData = await opsRes.json();
          setOpenLots(lotsData);
          setProcesses(procData);
          setAllOperations(opsData);
        } else {
          setErrorMessage('Failed to load initial form master data');
        }
      } catch (err: any) {
        console.error('Error fetching lookups:', err);
        setErrorMessage('Failed to load initial form master data');
      } finally {
        setLoadingLookups(false);
      }
    };
    fetchLookups();
  }, []);

  // Load existing lot mapping if editing
  useEffect(() => {
    if (!id) return;
    const fetchExistingMapping = async () => {
      setLoadingData(true);
      try {
        const res = await fetch(`/api/transactions/lot-operations/${id}`, { credentials: 'include' });
        if (res.ok) {
          const { header, operations } = await res.json();
          setLotNo(header.lotno || '');
          setBuyer(header.custdtl || '');
          setJobOrderNo(header.joborderno || '');
          setJobOrderDate(header.joborderdate || '');
          setJobOrderDateFmt(header.joborderdate_fmt || '');
          setStyle(header.style || '');
          setOrderQty(header.orderqty ? String(header.orderqty) : '');
          setCustOrderNo(header.custorderno || '');
          setCustOrderDate(header.custorderdt || '');
          setCustOrderDateFmt(header.custorderdt_fmt || '');
          setProdName(header.prodname || '');
          setProdDtl(header.proddtl || '');

          if (operations && operations.length > 0) {
            setRows(
              operations.map((op: any, idx: number) => ({
                id: op.id,
                stepno: String(op.stepno ?? idx + 1),
                processid: String(op.processid || ''),
                operations: String(op.operations || ''),
                rate: String(op.rate || '0.00'),
                savedOpName: op.opname || '',
                savedProcessName: op.processname || '',
              }))
            );
          } else {
            setRows([{ stepno: '1', processid: '', operations: '', rate: '' }]);
          }
        } else {
          setErrorMessage('Failed to load existing lot mapping');
        }
      } catch (err: any) {
        console.error('Error loading mapping:', err);
        setErrorMessage('Failed to load existing lot mapping');
      } finally {
        setLoadingData(false);
      }
    };
    fetchExistingMapping();
  }, [id]);

  // Handle Lot selection change (DropDownList1_SelectedIndexChanged)
  const handleLotSelect = async (lotJobId: string) => {
    setSelectedLotId(lotJobId);
    setErrorMessage('');
    if (!lotJobId || lotJobId === '--Select--') {
      setLotNo('');
      setBuyer('');
      setJobOrderNo('');
      setJobOrderDate('');
      setJobOrderDateFmt('');
      setStyle('');
      setOrderQty('');
      setCustOrderNo('');
      setCustOrderDate('');
      setCustOrderDateFmt('');
      setProdName('');
      setProdDtl('');
      return;
    }

    const lotObj = openLots.find((l) => String(l.id) === String(lotJobId));
    if (lotObj?.mapping_id) {
      setErrorMessage(`Notice: Lot ${lotObj.fabriclotno} is already mapped with ID #${lotObj.mapping_id}. Please edit that mapping instead.`);
    }

    try {
      const res = await fetch(`/api/transactions/lot-operations/lot-details/${lotJobId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const job = await res.json();
        setLotNo(job.fabriclotno || '');
        setBuyer(job.custdtl || '');
        setJobOrderNo(job.joborderno || '');
        setJobOrderDate(job.joborderdate || '');
        setJobOrderDateFmt(job.joborderdate_fmt || '');
        setStyle(job.style || '');
        setOrderQty(job.totalqtypcs ? String(job.totalqtypcs) : '');
        setCustOrderNo(job.custorderno || '');
        setCustOrderDate(job.custorderdate || '');
        setCustOrderDateFmt(job.custorderdate_fmt || '');
        setProdName(job.stockitemname || '');
        setProdDtl(job.fabricdtls || '');
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.message || 'Error fetching lot details');
      }
    } catch (err: any) {
      console.error('Error fetching lot details:', err);
      setErrorMessage(err.message || 'Error fetching lot details');
    }
  };

  // Handle process change in grid row
  const handleRowProcessChange = (index: number, processId: string) => {
    const updated = [...rows];
    updated[index].processid = processId;
    updated[index].operations = '';
    updated[index].rate = '';
    setRows(updated);
  };

  // Handle operation change in grid row -> auto-fill rate
  const handleRowOperationChange = (index: number, operationId: string) => {
    const updated = [...rows];
    updated[index].operations = operationId;

    // Find operation and auto-fill default rate
    const op = allOperations.find((o) => String(o.id) === String(operationId));
    if (op) {
      updated[index].rate = String(op.oprate ?? '0.00');
    } else {
      updated[index].rate = '0.00';
    }
    setRows(updated);
  };

  // Handle rate input change in grid row
  const handleRowRateChange = (index: number, rateVal: string) => {
    const updated = [...rows];
    updated[index].rate = rateVal;
    setRows(updated);
  };

  // Handle Step No. change in grid row
  const handleRowStepChange = (index: number, stepVal: string) => {
    const updated = [...rows];
    updated[index].stepno = stepVal;
    setRows(updated);
  };

  // Add new operation row (ButtonAdd_Click) - next Step No. is the highest so far + 1
  const handleAddRow = () => {
    setRows((prev) => {
      const highestStep = Math.max(0, ...prev.map((r) => parseInt(r.stepno, 10) || 0));
      return [...prev, { stepno: String(highestStep + 1), processid: '', operations: '', rate: '' }];
    });
  };

  // Remove operation row
  const handleRemoveRow = (index: number) => {
    if (rows.length === 1) {
      setRows([{ stepno: '1', processid: '', operations: '', rate: '' }]);
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Live Total Rate calculation
  const totalRate = rows.reduce((sum, r) => {
    const val = parseFloat(r.rate);
    return isNaN(val) ? sum : sum + val;
  }, 0);

  // Clear form fields
  const handleClear = () => {
    if (!isEdit) {
      setSelectedLotId('');
      setLotNo('');
      setBuyer('');
      setJobOrderNo('');
      setJobOrderDate('');
      setJobOrderDateFmt('');
      setStyle('');
      setOrderQty('');
      setCustOrderNo('');
      setCustOrderDate('');
      setCustOrderDateFmt('');
      setProdName('');
      setProdDtl('');
    }
    setRows([{ stepno: '1', processid: '', operations: '', rate: '' }]);
    setErrorMessage('');
  };

  // Exit back to list
  const handleExit = () => {
    navigate('/transactions/lot-operation-map');
  };

  // Save operation map (Button2_Click)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!lotNo || lotNo === '--Select--') {
      setErrorMessage('Please Enter * Mandatory Fields');
      return;
    }

    // Filter valid rows
    const validRows = rows.filter((r) => r.processid && r.operations);
    if (validRows.length === 0) {
      setErrorMessage('Please add at least one Operation with a Process.');
      return;
    }

    setSaving(true);
    const payload = {
      lotno: lotNo,
      custdtl: buyer,
      joborderno: jobOrderNo,
      joborderdate: jobOrderDate,
      style: style,
      orderqty: orderQty,
      custorderno: custOrderNo,
      custorderdt: custOrderDate,
      prodname: prodName,
      proddtl: prodDtl,
      operations: validRows.map((r) => ({
        id: r.id,
        stepno: r.stepno,
        processid: r.processid,
        operations: r.operations,
        rate: parseFloat(r.rate) || 0,
      })),
    };

    try {
      const url = isEdit
        ? `/api/transactions/lot-operations/${id}`
        : '/api/transactions/lot-operations';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setToast({ type: 'success', message: 'Data Saved Successfully' });
        setTimeout(() => navigate('/transactions/lot-operation-map'), 700);
      } else {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson.message || 'Failed to save Lot Operation Mapping';
        setErrorMessage(msg);
        setToast({ type: 'error', message: msg });
      }
    } catch (err: any) {
      console.error('Error saving mapping:', err);
      const msg = err.message || 'Failed to save Lot Operation Mapping';
      setErrorMessage(msg);
      setToast({ type: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  };

  // Print data bundle
  const printModalData: LotOperationPrintData = {
    id: Number(id) || 0,
    lotno: lotNo,
    custdtl: buyer,
    joborderno: jobOrderNo,
    joborderdate_fmt: jobOrderDateFmt || jobOrderDate,
    joborderdate: jobOrderDate,
    style: style,
    orderqty: orderQty,
    custorderno: custOrderNo,
    custorderdt_fmt: custOrderDateFmt || custOrderDate,
    prodname: prodName,
    proddtl: prodDtl,
    // Print in step order
    operations: [...rows].sort((a, b) => (parseInt(a.stepno, 10) || 0) - (parseInt(b.stepno, 10) || 0)).map((r) => {
      const op = allOperations.find((o) => String(o.id) === String(r.operations));
      const proc = processes.find((p) => String(p.id) === String(r.processid));
      const opName = op ? op.operations : r.savedOpName || '';
      const procName = proc ? proc.stkcategoryname : r.savedProcessName || '';
      return {
        opname: opName,
        operations: opName || r.operations,
        rate: r.rate,
        processname: procName,
        stkcategoryname: procName,
      };
    }),
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Title and note (same as the other forms) */}
      <div style={{ marginBottom: '18px' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Mapping Operation With Lot</h1>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>Pick a lot, then list its steps in order with the rate for each</div>
      </div>

      {/* Error / Status message banner matching legacy Label17 */}
      {errorMessage && (
        <div
          style={{
            backgroundColor: '#ffebee',
            color: '#c62828',
            padding: '10px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontWeight: 600,
            fontSize: '0.9rem',
            textAlign: 'center',
            border: '1px solid #ef9a9a',
          }}
        >
          {errorMessage}
        </div>
      )}

      {loadingLookups || loadingData ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading form data...</div>
      ) : (
        <form onSubmit={handleSave}>
          {/* Header Fields Section */}
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '24px',
              marginBottom: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            {/* Row 1: Select Lot * | Buyer */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px', color: '#000000' }}>
                  Select Lot *
                </label>
                {isEdit ? (
                  <input
                    type="text"
                    value={lotNo}
                    disabled
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ced4da',
                      backgroundColor: '#e9ecef',
                      fontWeight: 600,
                    }}
                  />
                ) : (
                  <select
                    value={selectedLotId}
                    onChange={(e) => handleLotSelect(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ced4da',
                      fontSize: '0.95rem',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <option value="">--Select--</option>
                    {openLots.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.fabriclotno} {lot.mapping_id ? `(Already Mapped #${lot.mapping_id})` : ''} {lot.joborderno ? `(JO: ${lot.joborderno})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px', color: '#000000' }}>
                  Buyer
                </label>
                <input
                  type="text"
                  value={buyer}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ced4da',
                    backgroundColor: '#e9ecef',
                    color: '#495057',
                  }}
                />
              </div>
            </div>

            {/* Row 2: Job Order No. | Job Order DT */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px', color: '#000000' }}>
                  Job Order No.
                </label>
                <input
                  type="text"
                  value={jobOrderNo}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ced4da',
                    backgroundColor: '#e9ecef',
                    color: '#495057',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px', color: '#000000' }}>
                  Job Order DT
                </label>
                <input
                  type="text"
                  value={jobOrderDateFmt || jobOrderDate}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ced4da',
                    backgroundColor: '#e9ecef',
                    color: '#495057',
                  }}
                />
              </div>
            </div>

            {/* Row 3: Style | Total Order Qty */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px', color: '#000000' }}>
                  Style
                </label>
                <input
                  type="text"
                  value={style}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ced4da',
                    backgroundColor: '#e9ecef',
                    color: '#495057',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px', color: '#000000' }}>
                  Total Order Qty
                </label>
                <input
                  type="text"
                  value={orderQty}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ced4da',
                    backgroundColor: '#e9ecef',
                    color: '#495057',
                  }}
                />
              </div>
            </div>

            {/* Row 4: Customer Order No. | Customer Order Date */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px', color: '#000000' }}>
                  Customer Order No.
                </label>
                <input
                  type="text"
                  value={custOrderNo}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ced4da',
                    backgroundColor: '#e9ecef',
                    color: '#495057',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px', color: '#000000' }}>
                  Customer Order Date
                </label>
                <input
                  type="text"
                  value={custOrderDateFmt || custOrderDate}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ced4da',
                    backgroundColor: '#e9ecef',
                    color: '#495057',
                  }}
                />
              </div>
            </div>

            {/* Row 5: Product Description | Product Details */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px', color: '#000000' }}>
                  Product Description
                </label>
                <input
                  type="text"
                  value={prodName}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ced4da',
                    backgroundColor: '#e9ecef',
                    color: '#495057',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px', color: '#000000' }}>
                  Product Details
                </label>
                <input
                  type="text"
                  value={prodDtl}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ced4da',
                    backgroundColor: '#e9ecef',
                    color: '#495057',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Dynamic Grid of Operations (GridView1 in legacy) */}
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '20px',
              marginBottom: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h5 style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#333' }}>
                Operations Mapping Grid
              </h5>
              <button
                type="button"
                onClick={handleAddRow}
                style={{
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <PlusIcon size={14} color="#ffffff" />
                Add Row
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--primary)', color: '#ffffff' }}>
                    <th style={{ padding: '10px 12px', width: '90px', textAlign: 'center' }}>Step No.</th>
                    <th style={{ padding: '10px 12px', width: '35%' }}>Process</th>
                    <th style={{ padding: '10px 12px', width: '40%' }}>Operation</th>
                    <th style={{ padding: '10px 12px', width: '15%', textAlign: 'right' }}>Rate (₹)</th>
                    <th style={{ padding: '10px 12px', width: '10%', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    // Filter operations for selected process in this row
                    const filteredOps = allOperations.filter(
                      (op) => String(op.processid) === String(row.processid)
                    );

                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid #e9ecef',
                          backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8f9fa',
                        }}
                      >
                        {/* Step No. */}
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={row.stepno}
                            onChange={(e) => handleRowStepChange(idx, e.target.value)}
                            style={{
                              width: '64px',
                              padding: '6px 8px',
                              borderRadius: '8px',
                              border: '1px solid #ced4da',
                              textAlign: 'center',
                              fontSize: '0.88rem',
                              fontWeight: 600,
                            }}
                          />
                        </td>

                        {/* Process dropdown */}
                        <td style={{ padding: '8px 12px' }}>
                          <select
                            value={row.processid}
                            onChange={(e) => handleRowProcessChange(idx, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid #ced4da',
                              fontSize: '0.88rem',
                              backgroundColor: '#ffffff',
                            }}
                          >
                            <option value="">--Select Process--</option>
                            {processes.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.stkcategoryname}
                              </option>
                            ))}
                            {row.processid && row.savedProcessName && !processes.some((p) => String(p.id) === String(row.processid)) && (
                              <option value={row.processid}>{row.savedProcessName} (deleted in Masters)</option>
                            )}
                          </select>
                        </td>

                        {/* Operation dropdown */}
                        <td style={{ padding: '8px 12px' }}>
                          <select
                            value={row.operations}
                            onChange={(e) => handleRowOperationChange(idx, e.target.value)}
                            disabled={!row.processid}
                            style={{
                              width: '100%',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid #ced4da',
                              fontSize: '0.88rem',
                              backgroundColor: row.processid ? '#ffffff' : '#e9ecef',
                            }}
                          >
                            <option value="">--Select Operation--</option>
                            {filteredOps.map((op) => (
                              <option key={op.id} value={op.id}>
                                {op.operations} {op.opcode ? `(${op.opcode})` : ''}
                              </option>
                            ))}
                            {row.operations && row.savedOpName && !allOperations.some((o) => String(o.id) === String(row.operations)) && (
                              <option value={row.operations}>{row.savedOpName} (deleted in Masters)</option>
                            )}
                          </select>
                        </td>

                        {/* Rate input */}
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={row.rate}
                            onChange={(e) => handleRowRateChange(idx, e.target.value)}
                            readOnly={!canChangeRates}
                            title={canChangeRates ? undefined : 'You don\'t have the "Change rates" right'}
                            placeholder="0.00"
                            style={{
                              backgroundColor: canChangeRates ? '#ffffff' : '#e9ecef',
                              width: '110px',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid #ced4da',
                              textAlign: 'right',
                              fontSize: '0.88rem',
                              fontFamily: 'monospace',
                            }}
                          />
                        </td>

                        {/* Remove Action */}
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(idx)}
                            title="Remove Row"
                            style={{
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: 'var(--danger)',
                              cursor: 'pointer',
                              padding: '4px',
                            }}
                          >
                            <TrashIcon size={16} color="var(--danger)" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total Rate Display Row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '12px',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid #dee2e6',
              }}
            >
              <label style={{ fontWeight: 700, fontSize: '0.95rem', color: '#000000' }}>
                Total Rate :
              </label>
              <input
                id="txtTotalQty"
                type="text"
                readOnly
                value={totalRate.toFixed(2)}
                style={{
                  width: '120px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #ced4da',
                  backgroundColor: '#e9ecef',
                  fontWeight: 700,
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontSize: '1rem',
                  color: '#2e7d32',
                }}
              />
            </div>
          </div>

          {/* Form Action Buttons (centered, matching Bootswatch Minty buttons) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 0',
              flexWrap: 'wrap',
            }}
          >
            {/* Save Button */}
            <button
              type="submit"
              disabled={saving}
              style={{
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 24px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                minWidth: '90px',
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>

            {/* Clear Button */}
            <button
              type="button"
              onClick={handleClear}
              style={{
                backgroundColor: '#ffffff',
                color: 'var(--text-heading)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '9px 24px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                minWidth: '90px',
              }}
            >
              Clear
            </button>

            {/* Exit Button */}
            <button
              type="button"
              onClick={handleExit}
              style={{
                backgroundColor: '#ffffff',
                color: 'var(--text-heading)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '9px 24px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                minWidth: '90px',
              }}
            >
              Exit
            </button>

            {/* Print Button */}
            {rights.print && <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              disabled={!lotNo}
              style={{
                backgroundColor: '#ffffff',
                color: 'var(--text-heading)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '9px 20px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: !lotNo ? 'not-allowed' : 'pointer',
                opacity: !lotNo ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <PrinterIcon size={16} color="var(--text-heading)" />
              Print
            </button>}

            {/* Show Total Button */}
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('txtTotalQty');
                if (el) el.focus();
              }}
              style={{
                backgroundColor: '#ffffff',
                color: 'var(--text-heading)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '9px 20px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              Show Total
            </button>
          </div>
        </form>
      )}

      {/* Print Preview Modal */}
      <LotOperationPrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        data={printModalData}
      />

      {/* Toast Notification */}
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
