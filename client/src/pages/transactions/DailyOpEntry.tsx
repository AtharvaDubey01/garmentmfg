import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Toast } from '../../components/common/Toast';
import { useScreenRights } from '../../context/AuthContext';

interface GroupOption {
  id: string | number;
  ledgrpname: string;
}

interface OperatorOption {
  id: string | number;
  operatorname: string;
  empcode: string;
}

interface LotOption {
  lotno: string;
}

interface OperationOption {
  stepno?: number;
  processid: string | number;
  processname: string;
  opcode: string;
  rate: string | number;
  processcategory?: string;
}

// From the server (getDailyQuota): how many pieces can still be logged on this step
interface OperationQuota {
  mapped: boolean;
  stepno?: number;
  received: number; // what this step received in Material Issue (first step = Cut Qty)
  loggedByOthers: number; // pieces already logged on this step in other rows
  remainingAllowed: number; // received - loggedByOthers
}

interface MatrixRow {
  id: number; // 0 for new row, or monthentrydetail.id
  lotNo: string;
  processId: string | number;
  processName: string;
  opCode: string;
  rate: number;
  days: Record<number, string>; // 1..31
  remark: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DailyOpEntry: React.FC = () => {
  // Create = new rows, Edit = change saved rows, Delete = remove saved rows (the server checks each)
  const rights = useScreenRights();
  const navigate = useNavigate();
  const { id: routeHeaderId } = useParams<{ id?: string }>();
  const isEdit = Boolean(routeHeaderId && routeHeaderId !== 'new');

  // Header State
  const [headerId, setHeaderId] = useState<number>(isEdit ? parseInt(routeHeaderId!, 10) : 0);
  const [monthName, setMonthName] = useState<string>(MONTHS[new Date().getMonth()]);
  const [yearName, setYearName] = useState<string>(new Date().getFullYear().toString());
  const [groupId, setGroupId] = useState<string>('');
  const [empId, setEmpId] = useState<string>('');
  const [empCode, setEmpCode] = useState<string>('');
  const [empName, setEmpName] = useState<string>('');

  // Dropdown Lookups
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [lots, setLots] = useState<LotOption[]>([]);
  // Cache of operations per lot: lotNo -> OperationOption[]
  const [lotOpsCache, setLotOpsCache] = useState<Record<string, OperationOption[]>>({});
  // Quotas per row: key `${lotNo}||${processId}||${rowId}` -> OperationQuota
  const [quotas, setQuotas] = useState<Record<string, OperationQuota>>({});

  // Matrix Rows
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [deletedRowIds, setDeletedRowIds] = useState<number[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // View Mode: 'all' (1-31), 'first' (1-15), 'second' (16-31)
  const [viewMode, setViewMode] = useState<'all' | 'first' | 'second'>('all');

  // Helper to fetch ceiling / remaining quota for an operation
  const fetchQuota = useCallback(async (lot: string, processId: string | number, detailId: number = 0) => {
    if (!lot || lot === '--Select--' || !processId || processId === '--Select--') return;
    const key = `${lot}||${processId}||${detailId}`;
    try {
      const res = await fetch(
        `/api/transactions/daily-entry/operation-quota/${encodeURIComponent(lot)}/${encodeURIComponent(processId)}?excludeDetailId=${detailId}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const q: OperationQuota = await res.json();
        setQuotas((prev) => ({ ...prev, [key]: q }));
      }
    } catch (err) {
      console.error('Error fetching quota:', err);
    }
  }, []);

  // Helper to create a blank row
  const createEmptyRow = (customLot = ''): MatrixRow => {
    const emptyDays: Record<number, string> = {};
    for (let d = 1; d <= 31; d++) emptyDays[d] = '';
    return {
      id: 0,
      lotNo: customLot,
      processId: '',
      processName: '',
      opCode: '',
      rate: 0,
      days: emptyDays,
      remark: '',
    };
  };

  // 1. Initial Load: Groups & Open Lots
  useEffect(() => {
    fetch('/api/transactions/daily-entry/groups', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setGroups(data))
      .catch((err) => console.error('Error loading groups:', err));

    fetch('/api/transactions/daily-entry/open-lots', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLots(data))
      .catch((err) => console.error('Error loading lots:', err));
  }, []);

  // Fetch operations for a lot and cache them
  const fetchOperationsForLot = useCallback(async (lot: string): Promise<OperationOption[]> => {
    if (!lot || lot === '--Select--') return [];
    if (lotOpsCache[lot]) return lotOpsCache[lot];
    try {
      const res = await fetch(`/api/transactions/daily-entry/operations-by-lot/${encodeURIComponent(lot)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const ops: OperationOption[] = await res.json();
        setLotOpsCache((prev) => ({ ...prev, [lot]: ops }));
        return ops;
      }
    } catch (err) {
      console.error(`Error loading ops for lot ${lot}:`, err);
    }
    return [];
  }, [lotOpsCache]);

  // 2. Load Existing Entry if Editing
  useEffect(() => {
    if (!isEdit) {
      setRows([createEmptyRow()]);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        // Load Header
        const hRes = await fetch(`/api/transactions/daily-entry/headers/${routeHeaderId}`, {
          credentials: 'include',
        });
        if (!hRes.ok) throw new Error('Header not found');
        const hData = await hRes.json();
        setHeaderId(hData.id);
        setMonthName(hData.monthname);
        setYearName(String(hData.yearname));
        setGroupId(String(hData.ledgrpid));
        setEmpId(String(hData.empid));
        setEmpCode(hData.empcode);
        setEmpName(hData.operatorname);

        // Load Operators for group
        fetch(`/api/transactions/daily-entry/operators-by-group/${hData.ledgrpid}`, { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : []))
          .then((ops) => setOperators(ops));

        // Load Details
        const dRes = await fetch(`/api/transactions/daily-entry/details-by-header/${routeHeaderId}`, {
          credentials: 'include',
        });
        if (dRes.ok) {
          const details = await dRes.json();
          // Pre-fetch operations for all distinct lots
          const distinctLots = Array.from(new Set(details.map((d: any) => d.lotno).filter(Boolean))) as string[];
          await Promise.all(distinctLots.map((l) => fetchOperationsForLot(l)));

          const mappedRows: MatrixRow[] = details.map((d: any) => {
            const dayRecord: Record<number, string> = {};
            for (let i = 1; i <= 31; i++) {
              const val = Number(d[`d${i}`]);
              dayRecord[i] = val > 0 ? String(Math.round(val)) : '';
            }
            return {
              id: Number(d.id),
              lotNo: d.lotno || '',
              processId: String(d.processid),
              processName: d.processname || '',
              opCode: '', // will be populated from cache
              rate: parseFloat(String(d.rate)) || 0,
              days: dayRecord,
              remark: d.remark || '',
            };
          });

          if (mappedRows.length === 0) {
            mappedRows.push(createEmptyRow());
          }
          setRows(mappedRows);

          // Fetch quota ceilings for each existing detail
          details.forEach((d: any) => {
            if (d.lotno && d.processid) {
              fetchQuota(d.lotno, d.processid, Number(d.id));
            }
          });
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Error loading entry data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [routeHeaderId, isEdit]);

  // Group changed
  const handleGroupChange = async (newGroupId: string) => {
    setGroupId(newGroupId);
    setEmpId('');
    setEmpCode('');
    setEmpName('');
    setOperators([]);
    setErrorMessage('');
    if (!newGroupId || newGroupId === '--Select--') return;

    try {
      const res = await fetch(`/api/transactions/daily-entry/operators-by-group/${newGroupId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setOperators(data);
      }
    } catch (err) {
      console.error('Error loading operators:', err);
    }
  };

  // Employee changed
  const handleOperatorChange = (newEmpId: string) => {
    setEmpId(newEmpId);
    setErrorMessage('');
    const op = operators.find((o) => String(o.id) === String(newEmpId));
    if (op) {
      setEmpCode(op.empcode);
      setEmpName(op.operatorname);
    } else {
      setEmpCode('');
      setEmpName('');
    }
  };

  // Row Field Handlers
  const handleRowLotChange = async (index: number, newLot: string) => {
    const updated = [...rows];
    updated[index].lotNo = newLot;
    updated[index].processId = '';
    updated[index].processName = '';
    updated[index].opCode = '';
    updated[index].rate = 0;
    setRows(updated);

    if (newLot && newLot !== '--Select--') {
      await fetchOperationsForLot(newLot);
    }
  };

  const handleRowOperationChange = (index: number, selectedProcessId: string) => {
    const updated = [...rows];
    const currentRow = updated[index];
    currentRow.processId = selectedProcessId;

    const lotOps = lotOpsCache[currentRow.lotNo] || [];
    const matched = lotOps.find((o) => String(o.processid) === String(selectedProcessId));
    if (matched) {
      currentRow.processName = matched.processname;
      currentRow.opCode = matched.opcode || '';
      currentRow.rate = parseFloat(String(matched.rate)) || 0;
      fetchQuota(currentRow.lotNo, selectedProcessId, currentRow.id);
    } else {
      currentRow.processName = '';
      currentRow.opCode = '';
      currentRow.rate = 0;
    }
    setRows(updated);
  };

  const handleDayValueChange = (rowIndex: number, dayNum: number, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex] = {
        ...next[rowIndex],
        days: {
          ...next[rowIndex].days,
          [dayNum]: cleaned,
        },
      };
      return next;
    });
  };

  const handleRowRemarkChange = (rowIndex: number, text: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex].remark = text;
      return next;
    });
  };

  const handleAddRow = () => {
    // Default new row with the lot from previous row for convenience
    const lastLot = rows.length > 0 ? rows[rows.length - 1].lotNo : '';
    setRows((prev) => [...prev, createEmptyRow(lastLot)]);
    if (lastLot) fetchOperationsForLot(lastLot);
  };

  const handleDeleteRow = (index: number) => {
    const target = rows[index];
    if (target.id > 0) {
      setDeletedRowIds((prev) => [...prev, target.id]);
      setToast({
        type: 'success',
        message: `Row ID ${target.id} removed. Click 'Save' to delete it in the database.`,
      });
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Live Calculations per row
  const rowCalculations = useMemo(() => {
    return rows.map((r) => {
      let totalQty = 0;
      for (let d = 1; d <= 31; d++) {
        const val = parseInt(r.days[d] || '0', 10);
        if (!isNaN(val)) totalQty += val;
      }
      const amount = totalQty * (r.rate || 0);
      return { totalQty, amount };
    });
  }, [rows]);

  // Live Column Totals for Days 1..31 and Grand Totals
  const summaryTotals = useMemo(() => {
    const dayTotals: Record<number, number> = {};
    for (let d = 1; d <= 31; d++) dayTotals[d] = 0;

    let grandTotalPieces = 0;
    let grandTotalAmount = 0;

    rows.forEach((r, idx) => {
      const { totalQty, amount } = rowCalculations[idx] || { totalQty: 0, amount: 0 };
      grandTotalPieces += totalQty;
      grandTotalAmount += amount;

      for (let d = 1; d <= 31; d++) {
        const val = parseInt(r.days[d] || '0', 10);
        if (!isNaN(val)) dayTotals[d] += val;
      }
    });

    return { dayTotals, grandTotalPieces, grandTotalAmount };
  }, [rows, rowCalculations]);

  // Save full matrix
  const handleSaveAll = async () => {
    setErrorMessage('');
    if (!monthName || monthName === '--Select--' || !yearName || !groupId || !empId) {
      setErrorMessage('Please Enter * Mandatory Fields');
      return;
    }

    const validRows = rows.filter((r) => r.lotNo && r.processId && r.lotNo !== '--Select--' && r.processId !== '--Select--');
    if (validRows.length === 0) {
      setErrorMessage('Please add at least one valid Operation with Lot and Operation selected');
      return;
    }

    // Client-side Ceiling / Remaining Quota validation
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      const qKey = `${r.lotNo}||${r.processId}||${r.id || 0}`;
      const quota = quotas[qKey];
      const originalIndex = rows.findIndex((row) => row === r);
      const { totalQty } = rowCalculations[originalIndex] || { totalQty: 0 };
      if (quota && totalQty > quota.remainingAllowed) {
        setErrorMessage(
          `Row ${originalIndex + 1} (${r.processName || 'Operation'}): Step ${quota.stepno ?? ''} received ${quota.received} pcs; ${quota.loggedByOthers} are already logged, so max ${quota.remainingAllowed} pcs here (you entered ${totalQty}).`
        );
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        headerId,
        monthName,
        yearName: parseInt(yearName, 10),
        empId: parseInt(empId, 10),
        ledGrpId: parseInt(groupId, 10),
        rows: validRows.map((r) => {
          const rowPayload: any = {
            id: r.id,
            lotNo: r.lotNo,
            processId: r.processId,
            processName: r.processName,
            remark: r.remark || '',
          };
          for (let d = 1; d <= 31; d++) {
            rowPayload[`d${d}`] = parseInt(r.days[d] || '0', 10) || 0;
          }
          return rowPayload;
        }),
        deletedRowIds,
      };

      const res = await fetch('/api/transactions/daily-entry/save-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok) {
        setToast({
          type: 'success',
          message: deletedRowIds.length > 0
            ? `Data Saved Successfully (Deleted DB ID: ${deletedRowIds.join(', ')})`
            : 'Data Saved Successfully',
        });
        // Redirect to Process Entry Report matching legacy DailyOpEntry.aspx
        setTimeout(() => {
          navigate('/transactions/daily-process-entry');
        }, 800);
      } else {
        setErrorMessage(json.message || 'Failed to save daily entry matrix');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred');
    } finally {
      setSaving(false);
    }
  };

  // Determine which days to display based on viewMode
  const displayedDays = useMemo(() => {
    if (viewMode === 'first') {
      return Array.from({ length: 15 }, (_, i) => i + 1); // 1..15
    }
    if (viewMode === 'second') {
      return Array.from({ length: 16 }, (_, i) => i + 16); // 16..31
    }
    return Array.from({ length: 31 }, (_, i) => i + 1); // 1..31
  }, [viewMode]);

  return (
    <div style={{ maxWidth: '100%', margin: '15px auto', padding: '0 20px' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Page Title (Matching Legacy: Daily Process Work Done Entry) */}
      <h3
        id="forms"
        style={{
          fontSize: '1.6rem',
          fontWeight: 600,
          color: 'var(--text-heading)',
          margin: '0 0 20px 0',
        }}
      >
        Daily Process Work Done Entry
      </h3>

      {/* Validation / Error Message */}
      {errorMessage && (
        <div
          style={{
            color: 'red',
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: '16px',
            fontSize: '1rem',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Header Fields Section */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          padding: '16px 24px',
          border: '1px solid #e2e8f0',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px 24px' }}>
          {/* Select Month * */}
          <div>
            <label style={labelStyle}>
              Select Month <span style={{ color: 'red' }}>*</span>
            </label>
            <select
              value={monthName}
              onChange={(e) => setMonthName(e.target.value)}
              style={selectStyle}
              required
            >
              <option value="">--Select--</option>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label style={labelStyle}>
              Year <span style={{ color: 'red' }}>*</span>
            </label>
            <input
              type="text"
              value={yearName}
              onChange={(e) => setYearName(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          {/* Select Group * */}
          <div>
            <label style={labelStyle}>
              Select Group <span style={{ color: 'red' }}>*</span>
            </label>
            <select
              value={groupId}
              onChange={(e) => handleGroupChange(e.target.value)}
              style={selectStyle}
              required
            >
              <option value="">--Select--</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.ledgrpname}
                </option>
              ))}
            </select>
          </div>

          {/* Select Employee Code * */}
          <div>
            <label style={labelStyle}>
              Select Employee Code <span style={{ color: 'red' }}>*</span>
            </label>
            <select
              value={empId}
              onChange={(e) => handleOperatorChange(e.target.value)}
              disabled={!groupId || operators.length === 0}
              style={selectStyle}
              required
            >
              <option value="">{operators.length === 0 ? '--No Employees in Group--' : '--Select--'}</option>
              {operators.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.empcode}
                </option>
              ))}
            </select>
          </div>

          {/* Employee Name */}
          <div>
            <label style={labelStyle}>Employee Name</label>
            <input
              type="text"
              value={empName}
              title={empCode ? `Employee Code: ${empCode}` : ''}
              readOnly
              style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#334155' }}
            />
          </div>
        </div>
      </div>

      {/* Grid Toolbar & View Mode Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#334155' }}>
            Operation Matrix ({rows.length} {rows.length === 1 ? 'operation' : 'operations'})
          </span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              backgroundColor: 'var(--primary-soft)',
              color: 'var(--primary-hover)',
            }}
          >
            Total: {summaryTotals.grandTotalPieces.toLocaleString()} pcs
          </span>
        </div>

        {/* View Range Toggle (All 31 Days / Days 1-15 / Days 16-31) */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: '#e2e8f0', padding: '3px', borderRadius: '10px' }}>
          <button
            type="button"
            onClick={() => setViewMode('all')}
            style={{
              padding: '4px 12px',
              fontSize: '0.82rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '8px',
              backgroundColor: viewMode === 'all' ? '#ffffff' : 'transparent',
              color: viewMode === 'all' ? 'var(--primary-hover)' : '#475569',
              boxShadow: viewMode === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
            }}
          >
            All 31 Days
          </button>
          <button
            type="button"
            onClick={() => setViewMode('first')}
            style={{
              padding: '4px 12px',
              fontSize: '0.82rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '8px',
              backgroundColor: viewMode === 'first' ? '#ffffff' : 'transparent',
              color: viewMode === 'first' ? 'var(--primary-hover)' : '#475569',
              boxShadow: viewMode === 'first' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
            }}
          >
            Days 1 – 15
          </button>
          <button
            type="button"
            onClick={() => setViewMode('second')}
            style={{
              padding: '4px 12px',
              fontSize: '0.82rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '8px',
              backgroundColor: viewMode === 'second' ? '#ffffff' : 'transparent',
              color: viewMode === 'second' ? 'var(--primary-hover)' : '#475569',
              boxShadow: viewMode === 'second' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
            }}
          >
            Days 16 – 31
          </button>
        </div>
      </div>

      {/* Main Multi-Row Matrix Table with Sticky Columns */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #cbd5e1',
          overflowX: 'auto',
          maxHeight: '620px',
          position: 'relative',
        }}
      >
        <table
          style={{
            width: 'max-content',
            minWidth: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.85rem',
          }}
        >
          {/* Table Header (table-info style) */}
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--primary-soft)' }}>
            <tr>
              {/* Sticky Columns Left */}
              <th style={{ ...stickyThStyle, left: 0, width: '40px', textAlign: 'center' }}>No.</th>
              <th style={{ ...stickyThStyle, left: '40px', width: '65px', textAlign: 'center' }} title="Database monthentrydetail.id">
                ID
              </th>
              <th style={{ ...stickyThStyle, left: '105px', width: '105px' }}>Lot No</th>
              <th style={{ ...stickyThStyle, left: '210px', width: '240px' }}>Select Operation</th>
              <th style={{ ...stickyThStyle, left: '450px', width: '80px', textAlign: 'center' }}>Op Code</th>

              {/* Day Columns */}
              {displayedDays.map((d) => (
                <th
                  key={d}
                  style={{
                    padding: '8px 4px',
                    textAlign: 'center',
                    minWidth: '38px',
                    width: '38px',
                    fontWeight: 700,
                    color: 'var(--text-heading)',
                    borderRight: '1px solid #abdde5',
                    fontSize: '0.82rem',
                  }}
                >
                  {d}
                </th>
              ))}

              {/* Summary Columns */}
              <th style={{ padding: '8px 8px', textAlign: 'right', minWidth: '70px', fontWeight: 700, color: 'var(--text-heading)' }}>
                Total
              </th>
              <th style={{ padding: '8px 8px', textAlign: 'right', minWidth: '65px', fontWeight: 700, color: 'var(--text-heading)' }}>
                Rate
              </th>
              <th style={{ padding: '8px 8px', textAlign: 'right', minWidth: '85px', fontWeight: 700, color: 'var(--text-heading)' }}>
                Amount
              </th>
              <th style={{ padding: '8px 8px', textAlign: 'left', minWidth: '120px', fontWeight: 700, color: 'var(--text-heading)' }}>
                Remarks
              </th>
              <th style={{ padding: '8px 6px', textAlign: 'center', width: '45px', fontWeight: 700, color: 'var(--text-heading)' }}>
                Del
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={40} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  Loading operation matrix...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={40} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  No operations recorded yet. Click "+ Add Row" below to begin.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const { totalQty, amount } = rowCalculations[index] || { totalQty: 0, amount: 0 };
                const lotOps = lotOpsCache[row.lotNo] || [];

                return (
                  <tr
                    key={index}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                    }}
                  >
                    {/* Sticky Column: No. */}
                    <td
                      style={{
                        ...stickyTdStyle,
                        left: 0,
                        textAlign: 'center',
                        fontWeight: 600,
                        color: '#64748b',
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      {index + 1}
                    </td>

                    {/* Sticky Column: ID (monthentrydetail.id) */}
                    <td
                      style={{
                        ...stickyTdStyle,
                        left: '40px',
                        textAlign: 'center',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        fontWeight: row.id > 0 ? 600 : 400,
                        color: row.id > 0 ? 'var(--primary-hover)' : '#94a3b8',
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                      title={row.id > 0 ? `Database monthentrydetail.id: ${row.id}` : 'Unsaved new row'}
                    >
                      {row.id > 0 ? (
                        row.id
                      ) : (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '1px 5px',
                            borderRadius: '6px',
                            backgroundColor: '#e2e8f0',
                            color: '#64748b',
                          }}
                        >
                          New
                        </span>
                      )}
                    </td>

                    {/* Sticky Column: Lot No */}
                    <td
                      style={{
                        ...stickyTdStyle,
                        left: '105px',
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      <select
                        value={row.lotNo}
                        onChange={(e) => handleRowLotChange(index, e.target.value)}
                        style={gridSelectStyle}
                      >
                        <option value="">--Select--</option>
                        {lots.map((l) => (
                          <option key={l.lotno} value={l.lotno}>
                            {l.lotno}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Sticky Column: Select Operation */}
                    <td
                      style={{
                        ...stickyTdStyle,
                        left: '210px',
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      <select
                        value={row.processId}
                        onChange={(e) => handleRowOperationChange(index, e.target.value)}
                        disabled={!row.lotNo}
                        style={gridSelectStyle}
                      >
                        <option value="">{lotOps.length === 0 ? '--Select Lot First--' : '--Select Operation--'}</option>
                        {lotOps.map((op) => (
                          <option key={op.processid} value={op.processid}>
                            {op.stepno != null ? `Step ${op.stepno} · ` : ''}{op.processname}
                          </option>
                        ))}
                      </select>
                      {(() => {
                        const qKey = `${row.lotNo}||${row.processId}||${row.id || 0}`;
                        const quota = quotas[qKey];
                        if (!quota || !quota.mapped) return null;
                        const currentEntered = rowCalculations[index]?.totalQty || 0;
                        const netRemaining = quota.remainingAllowed - currentEntered;
                        return (
                          <div style={{ fontSize: '0.72rem', marginTop: '3px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                            <span
                              style={{
                                padding: '1px 5px',
                                borderRadius: '6px',
                                backgroundColor: 'var(--primary-soft)',
                                color: 'var(--primary-hover)',
                                fontWeight: 600,
                              }}
                              title="Pieces this step received in Material Issue (first step: Cut Qty)"
                            >
                              Received: {quota.received.toLocaleString()}
                            </span>
                            <span
                              style={{
                                padding: '1px 5px',
                                borderRadius: '6px',
                                backgroundColor: netRemaining < 0 ? '#fee2e2' : netRemaining === 0 ? '#f1f5f9' : '#dcfce7',
                                color: netRemaining < 0 ? '#991b1b' : netRemaining === 0 ? '#475569' : '#166534',
                                fontWeight: 600,
                              }}
                              title={`Received: ${quota.received} | Logged in other rows: ${quota.loggedByOthers} | This row: ${currentEntered} | Still available: ${netRemaining}`}
                            >
                              Avail: {netRemaining.toLocaleString()}
                            </span>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Sticky Column: Op Code */}
                    <td
                      style={{
                        ...stickyTdStyle,
                        left: '450px',
                        textAlign: 'center',
                        color: '#64748b',
                        fontSize: '0.82rem',
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      {row.opCode || '-'}
                    </td>

                    {/* Day Columns 1..31 */}
                    {displayedDays.map((d) => {
                      const val = row.days[d] || '';
                      const isPositive = Number(val) > 0;

                      return (
                        <td
                          key={d}
                          style={{
                            padding: '3px 2px',
                            textAlign: 'center',
                            borderRight: '1px solid #f1f5f9',
                            backgroundColor: isPositive ? '#f0fdf4' : 'transparent',
                          }}
                        >
                          <input
                            type="text"
                            inputMode="numeric"
                            value={val}
                            onChange={(e) => handleDayValueChange(index, d, e.target.value)}
                            style={{
                              width: '34px',
                              height: '26px',
                              textAlign: 'center',
                              fontSize: '0.82rem',
                              border: isPositive ? '1px solid #86efac' : '1px solid #cbd5e1',
                              borderRadius: '6px',
                              backgroundColor: isPositive ? '#dcfce7' : '#ffffff',
                              fontWeight: isPositive ? 700 : 400,
                              color: isPositive ? '#166534' : '#1e293b',
                              outline: 'none',
                              padding: 0,
                            }}
                          />
                        </td>
                      );
                    })}

                    {/* Total Quantity */}
                    {(() => {
                      const qKey = `${row.lotNo}||${row.processId}||${row.id || 0}`;
                      const quota = quotas[qKey];
                      const isExceeded = quota && totalQty > quota.remainingAllowed;

                      return (
                        <td
                          style={{
                            padding: '6px 8px',
                            textAlign: 'right',
                            fontWeight: 700,
                            backgroundColor: isExceeded ? '#fef2f2' : (index % 2 === 0 ? '#ffffff' : '#f8fafc'),
                            color: isExceeded ? '#b91c1c' : (totalQty > 0 ? 'var(--primary-hover)' : '#94a3b8'),
                            borderRight: '1px solid #e2e8f0',
                          }}
                          title={isExceeded ? `Exceeds available quota (${quota.remainingAllowed}) by ${totalQty - quota.remainingAllowed} pcs!` : undefined}
                        >
                          {isExceeded && <span style={{ marginRight: '3px' }}>⚠️</span>}
                          {totalQty > 0 ? totalQty.toLocaleString() : '0'}
                          {isExceeded && (
                            <div style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 700, marginTop: '1px' }}>
                              +{totalQty - quota.remainingAllowed} over!
                            </div>
                          )}
                        </td>
                      );
                    })()}

                    {/* Rate */}
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#475569' }}>
                      ₹{row.rate.toFixed(2)}
                    </td>

                    {/* Amount */}
                    <td
                      style={{
                        padding: '6px 8px',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: amount > 0 ? '#047857' : '#94a3b8',
                      }}
                    >
                      {amount > 0
                        ? `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '₹0.00'}
                    </td>

                    {/* Remarks */}
                    <td style={{ padding: '4px 6px' }}>
                      <input
                        type="text"
                        value={row.remark}
                        onChange={(e) => handleRowRemarkChange(index, e.target.value)}
                        placeholder="Notes"
                        style={{
                          width: '100%',
                          height: '26px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '0 6px',
                          fontSize: '0.8rem',
                          outline: 'none',
                        }}
                      />
                    </td>

                    {/* Delete Row Button */}
                    <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                      {(row.id === 0 || rights.delete) && <button
                        type="button"
                        onClick={() => handleDeleteRow(index)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '2px',
                          fontSize: '0.9rem',
                        }}
                        title="Delete Row"
                      >
                        ✕
                      </button>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Table Footer: Column Day Totals */}
          {rows.length > 0 && (
            <tfoot
              style={{
                position: 'sticky',
                bottom: 0,
                zIndex: 10,
                backgroundColor: '#f1f5f9',
                borderTop: '2px solid #cbd5e1',
                fontWeight: 700,
              }}
            >
              <tr>
                <td style={{ ...stickyTdStyle, left: 0, backgroundColor: '#f1f5f9' }}></td>
                <td style={{ ...stickyTdStyle, left: '40px', backgroundColor: '#f1f5f9' }}></td>
                <td style={{ ...stickyTdStyle, left: '105px', backgroundColor: '#f1f5f9' }}></td>
                <td
                  style={{
                    ...stickyTdStyle,
                    left: '210px',
                    textAlign: 'right',
                    paddingRight: '12px',
                    backgroundColor: '#f1f5f9',
                    color: '#1e293b',
                  }}
                >
                  Day Totals:
                </td>
                <td style={{ ...stickyTdStyle, left: '450px', backgroundColor: '#f1f5f9' }}></td>

                {/* Day Sums */}
                {displayedDays.map((d) => {
                  const daySum = summaryTotals.dayTotals[d] || 0;
                  return (
                    <td
                      key={d}
                      style={{
                        padding: '6px 2px',
                        textAlign: 'center',
                        fontSize: '0.78rem',
                        color: daySum > 0 ? 'var(--primary-hover)' : '#94a3b8',
                        fontWeight: daySum > 0 ? 700 : 400,
                      }}
                    >
                      {daySum > 0 ? daySum : '-'}
                    </td>
                  );
                })}

                {/* Grand Total Quantity */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--primary-hover)', fontSize: '0.9rem' }}>
                  {summaryTotals.grandTotalPieces.toLocaleString()}
                </td>

                <td></td>

                {/* Grand Total Amount */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#047857', fontSize: '0.9rem' }}>
                  ₹
                  {summaryTotals.grandTotalAmount.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>

                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Add Row Button at bottom-right of the table (Matching Legacy) */}
      <div style={{ textAlign: 'right', marginTop: '12px', marginBottom: '24px' }}>
        {rights.create && <button
          type="button"
          onClick={handleAddRow}
          style={{
            padding: '6px 16px',
            backgroundColor: 'var(--primary)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.88rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Add Row
        </button>}
      </div>

      {/* Month summary for this worker (like the Excel "Production Entry" sheet) */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '24px' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.88rem', minWidth: '320px', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
          <tbody>
            {[
              ['Employee Name', empName || '-'],
              ['Month', monthName && yearName ? `${monthName} ${yearName}` : '-'],
              ['Total Pcs', summaryTotals.grandTotalPieces.toLocaleString()],
              [
                'Total Value',
                `₹${summaryTotals.grandTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              ],
            ].map(([label, value]) => (
              <tr key={label} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 14px', fontWeight: 600, color: 'var(--text-muted)', backgroundColor: '#f9fafb', width: '140px', borderBottom: '1px solid var(--border-color)' }}>
                  {label}
                </td>
                <td style={{ padding: '8px 14px', fontWeight: 700, color: 'var(--text-heading)', borderBottom: '1px solid var(--border-color)' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action Buttons: Save, Clear, Exit (Matching Legacy) */}
      <div
        style={{
          textAlign: 'center',
          marginTop: '20px',
          display: 'flex',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        {(rights.create || rights.edit || rights.delete) && <button
          type="button"
          onClick={handleSaveAll}
          disabled={saving}
          style={{
            ...btnStyle,
            opacity: saving ? 0.7 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>}

        <button
          type="button"
          onClick={() => {
            if (window.confirm('Are you sure you want to clear current inputs?')) {
              setRows([createEmptyRow()]);
            }
          }}
          style={btnSecondaryStyle}
        >
          Clear
        </button>

        <button
          type="button"
          onClick={() => navigate('/transactions/daily-process-entry')}
          style={btnSecondaryStyle}
        >
          Exit
        </button>
      </div>
    </div>
  );
};

// Styles
const labelStyle: React.CSSProperties = {
  fontSize: '0.88rem',
  fontWeight: 700,
  color: '#333333',
  display: 'block',
  marginBottom: '4px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  outline: 'none',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  outline: 'none',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
};

const gridSelectStyle: React.CSSProperties = {
  width: '100%',
  padding: '3px 6px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  fontSize: '0.8rem',
  fontFamily: 'inherit',
  outline: 'none',
  backgroundColor: '#ffffff',
};

const stickyThStyle: React.CSSProperties = {
  position: 'sticky',
  zIndex: 11,
  backgroundColor: 'var(--primary-soft)',
  padding: '8px 6px',
  fontWeight: 700,
  color: 'var(--text-heading)',
  borderRight: '1px solid #abdde5',
};

const stickyTdStyle: React.CSSProperties = {
  position: 'sticky',
  zIndex: 2,
  padding: '4px 6px',
  borderRight: '1px solid #e2e8f0',
};

const btnStyle: React.CSSProperties = {
  padding: '8px 24px',
  backgroundColor: 'var(--primary)',
  color: '#ffffff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 0.15s ease',
};

const btnSecondaryStyle: React.CSSProperties = {
  ...btnStyle,
  backgroundColor: '#ffffff',
  color: 'var(--text-heading)',
  border: '1px solid var(--border-color)',
};
