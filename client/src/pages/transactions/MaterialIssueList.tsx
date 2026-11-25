import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Toast } from '../../components/common/Toast';
import { PencilIcon, TrashIcon, SearchIcon } from '../../components/common/Icons';
import { useScreenRights } from '../../context/AuthContext';

// Material Issue = pieces moving from one step of a lot to the next.
// Each slip says "Step X sent N pcs ahead". All the numbers (Received / Done by Workers / Sent Ahead / Can Send Now)
// come from the server (getLotSteps in transactions.js); this screen only shows them.

interface SlipRow {
  id: number;
  issue_no: string;
  issue_date: string;
  lotno: string;
  joborderno: string;
  stepno: number | null;
  operation_name: string;
  process_name: string;
  qty: number | string;
  remark?: string;
}

interface ActiveLot {
  id: number;
  fabriclotno: string;
  joborderno: string;
  style?: string;
  cutqty: number | string;
}

interface LotDetails {
  id: number;
  fabriclotno: string;
  joborderno: string;
  joborderdate: string;
  custorderno?: string;
  custorderdate?: string;
  totalqtypcs: number | string;
  cutqty: number | string;
}

interface StepRow {
  stepno: number;
  operation_id: number;
  operation_name: string;
  process_name: string;
  received: number;
  done: number; // pieces logged on this step in Daily Process Entry
  sent: number;
  available: number; // done - sent: what this step can send ahead now
}

export const MaterialIssueList: React.FC = () => {
  const rights = useScreenRights(); // Create = Send, Edit / Delete = slips (Admin > Create Login)
  // Top table: all slips
  const [records, setRecords] = useState<SlipRow[]>([]);
  const [loadingRecords, setLoadingRecords] = useState<boolean>(true);
  const [searchLot, setSearchLot] = useState<string>('');

  // Editing a slip's qty right in the top table
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState<string>('');

  // Bottom section: send pieces ahead
  const [activeLots, setActiveLots] = useState<ActiveLot[]>([]);
  const [selectedLotNo, setSelectedLotNo] = useState<string>('');
  const [lotDetails, setLotDetails] = useState<LotDetails | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [sendQty, setSendQty] = useState<Record<number, string>>({}); // operation_id -> qty typed
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState<string>('');
  const [loadingLotDetails, setLoadingLotDetails] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Modals & notifications
  const [deleteTarget, setDeleteTarget] = useState<SlipRow | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 1. Load all slips for the top table
  const fetchRecords = useCallback(async () => {
    try {
      setLoadingRecords(true);
      const res = await fetch('/api/transactions/material-issue/list?limit=500', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setRecords(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching slips:', err);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  // 2. Load open lots for the dropdown
  const fetchActiveLots = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions/material-issue/active-lots', { credentials: 'include' });
      if (res.ok) setActiveLots(await res.json());
    } catch (err) {
      console.error('Error fetching active lots:', err);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
    fetchActiveLots();
  }, [fetchRecords, fetchActiveLots]);

  // 3. Load a lot's steps with Received / Done by Workers / Sent Ahead / Can Send Now
  const loadLot = useCallback(async (lotNo: string) => {
    setSelectedLotNo(lotNo);
    setSendQty({});
    if (!lotNo) {
      setLotDetails(null);
      setSteps([]);
      return;
    }
    try {
      setLoadingLotDetails(true);
      const res = await fetch(`/api/transactions/material-issue/lot-details/${encodeURIComponent(lotNo)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setLotDetails(data.lot);
        setSteps(data.steps || []);
      } else {
        setLotDetails(null);
        setSteps([]);
      }
    } catch (err) {
      console.error('Error loading lot:', err);
    } finally {
      setLoadingLotDetails(false);
    }
  }, []);

  // After any change, refresh the slips table and the open lot's numbers
  const refreshAll = () => {
    fetchRecords();
    if (selectedLotNo) loadLot(selectedLotNo);
  };

  // Save one slip: this step sends pieces ahead
  const handleSend = async (step: StepRow) => {
    const qty = parseFloat(sendQty[step.operation_id]) || 0;
    if (qty <= 0) {
      setToast({ type: 'error', message: 'Please enter how many pieces to send ahead.' });
      return;
    }
    try {
      setSaving(true);
      const res = await fetch('/api/transactions/material-issue/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lotNo: selectedLotNo, operationId: step.operation_id, qty, issueDate, remark }),
      });
      const json = await res.json();
      if (res.ok) {
        setToast({ type: 'success', message: json.message || 'Slip saved' });
        setRemark('');
        refreshAll();
      } else {
        setToast({ type: 'error', message: json.message || 'Failed to save slip' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error saving slip' });
    } finally {
      setSaving(false);
    }
  };

  // Save an edited slip qty from the top table
  const handleSaveEdit = async (row: SlipRow) => {
    try {
      const res = await fetch(`/api/transactions/material-issue/item/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ qty: parseFloat(editQty) || 0 }),
      });
      const json = await res.json();
      if (res.ok) {
        setToast({ type: 'success', message: json.message || 'Slip updated' });
        setEditingId(null);
        refreshAll();
      } else {
        setToast({ type: 'error', message: json.message || 'Update failed' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error on update' });
    }
  };

  // Delete a slip from the top table
  const handleDeleteRow = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/transactions/material-issue/item/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (res.ok) {
        setToast({ type: 'success', message: json.message || 'Slip deleted' });
        refreshAll();
      } else {
        setToast({ type: 'error', message: json.message || 'Delete failed' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Network error on delete' });
    } finally {
      setDeleteTarget(null);
    }
  };

  // Filter slips by search text
  const filteredRecords = useMemo(() => {
    if (!searchLot.trim()) return records;
    const term = searchLot.trim().toLowerCase();
    return records.filter(
      (r) =>
        r.lotno.toLowerCase().includes(term) ||
        (r.joborderno && r.joborderno.toLowerCase().includes(term)) ||
        (r.operation_name && r.operation_name.toLowerCase().includes(term))
    );
  }, [records, searchLot]);

  const formatDate = (val?: string) => {
    if (!val) return '-';
    const [y, m, d] = val.slice(0, 10).split('-');
    return d && m && y ? `${d}/${m}/${y}` : val;
  };

  // Pieces sent ahead by the last step are finished
  const finishedQty = steps.length > 0 ? steps[steps.length - 1].sent : 0;

  return (
    <div style={{ maxWidth: '1250px', margin: '20px auto', padding: '0 20px', fontFamily: 'inherit' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <ConfirmModal
          isOpen={true}
          title="Delete Material Issue Slip"
          message={`Delete slip ${deleteTarget.issue_no}: Lot ${deleteTarget.lotno}, Step ${deleteTarget.stepno ?? '-'} "${deleteTarget.operation_name}" sent ${deleteTarget.qty} pcs?`}
          confirmLabel="Delete"
          onConfirm={handleDeleteRow}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Page Title */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Material Issue</h2>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: All slips                                                      */}
      {/* ========================================================================= */}
      <div style={cardStyle}>
        <div style={{ marginBottom: '14px' }}>
          <div style={{ color: 'var(--text-heading)', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.2px' }}>
            Display All Record which are added in Table
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, marginTop: '2px' }}>
            Each slip = pieces a step sent ahead to the next step
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{ position: 'relative', width: '300px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              value={searchLot}
              onChange={(e) => setSearchLot(e.target.value)}
              placeholder="Search by lot..."
              style={{
                width: '100%',
                padding: '6px 10px 6px 32px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {searchLot && (
            <button type="button" onClick={() => setSearchLot('')} style={smallGreyButtonStyle}>
              Clear
            </button>
          )}
          <span style={{ fontSize: '0.82rem', color: '#64748b', marginLeft: 'auto' }}>
            Total Records: <strong>{filteredRecords.length}</strong>
          </span>
        </div>

        {/* Slips Table */}
        <div className="table-box" style={{ maxHeight: '520px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--primary)', color: '#ffffff' }}>
                <th style={{ ...excelThStyle, textAlign: 'left', width: '110px' }}>Slip No.</th>
                <th style={{ ...excelThStyle, textAlign: 'left', width: '100px' }}>Date</th>
                <th style={{ ...excelThStyle, textAlign: 'left', width: '90px' }}>Lot No.</th>
                <th style={{ ...excelThStyle, textAlign: 'left', width: '120px' }}>Job Order No.</th>
                <th style={{ ...excelThStyle, textAlign: 'center', width: '60px' }}>Step</th>
                <th style={{ ...excelThStyle, textAlign: 'left' }}>Operation (sent from)</th>
                <th style={{ ...excelThStyle, textAlign: 'right', width: '110px' }}>Qty Sent</th>
                <th style={{ ...excelThStyle, textAlign: 'center', width: '170px' }}>Allow to Edit & Delete</th>
              </tr>
            </thead>
            <tbody>
              {loadingRecords ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                    Loading records...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '28px', color: '#94a3b8' }}>
                    {searchLot ? `No slips found matching "${searchLot}".` : 'No slips yet. Use the section below to send pieces ahead.'}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((row, idx) => {
                  const isEditingRow = editingId === row.id;
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                      <td style={{ ...excelTdStyle, color: '#475569', whiteSpace: 'nowrap' }}>{row.issue_no}</td>
                      <td style={{ ...excelTdStyle, color: '#475569', whiteSpace: 'nowrap' }}>{formatDate(row.issue_date)}</td>
                      <td style={{ ...excelTdStyle, fontWeight: 700, color: '#1e293b' }}>{row.lotno}</td>
                      <td style={{ ...excelTdStyle, color: '#475569' }}>{row.joborderno || '-'}</td>
                      <td style={{ ...excelTdStyle, textAlign: 'center', fontWeight: 700 }}>{row.stepno ?? '-'}</td>
                      <td style={{ ...excelTdStyle, fontWeight: 600, color: '#334155' }}>
                        {row.operation_name}
                        {row.process_name && <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: '#64748b' }}>({row.process_name})</span>}
                      </td>
                      <td style={{ ...excelTdStyle, textAlign: 'right', fontWeight: 800, color: 'var(--primary-hover)' }}>
                        {isEditingRow ? (
                          <input
                            type="text"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value.replace(/[^0-9]/g, ''))}
                            style={{ ...qtyInputStyle, width: '80px' }}
                            autoFocus
                          />
                        ) : (
                          row.qty
                        )}
                      </td>
                      <td style={{ ...excelTdStyle, textAlign: 'center' }}>
                        {isEditingRow ? (
                          <>
                            <button type="button" onClick={() => handleSaveEdit(row)} style={{ ...editButtonStyle, marginRight: '6px' }}>
                              Save
                            </button>
                            <button type="button" onClick={() => setEditingId(null)} style={smallGreyButtonStyle}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {rights.edit && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(row.id);
                                  setEditQty(String(row.qty));
                                }}
                                title="Edit qty of this slip"
                                style={{ ...editButtonStyle, marginRight: '6px' }}
                              >
                                <PencilIcon size={12} /> Edit
                              </button>
                            )}
                            {rights.delete && (
                              <button type="button" onClick={() => setDeleteTarget(row)} title="Delete this slip" style={deleteButtonStyle}>
                                <TrashIcon size={12} /> Delete
                              </button>
                            )}
                            {!rights.edit && !rights.delete && <span style={{ color: '#94a3b8' }}>–</span>}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: Send pieces ahead                                              */}
      {/* ========================================================================= */}
      <div style={{ ...cardStyle, marginBottom: 0 }}>
        <h3 style={{ color: 'var(--text-heading)', fontWeight: 700, fontSize: '1.15rem', margin: '0 0 16px' }}>To Add New Record</h3>

        {/* Select Lot / Date / Remarks */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '18px' }}>
          <div>
            <label style={labelStyle}>
              Select Lot <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <select value={selectedLotNo} onChange={(e) => loadLot(e.target.value)} style={{ ...fieldStyle, fontWeight: 600 }}>
              <option value="">--Select Lot--</option>
              {activeLots.map((lot) => (
                <option key={lot.id} value={lot.fabriclotno}>
                  Lot {lot.fabriclotno} — {lot.style || 'Job ' + lot.joborderno} ({lot.cutqty} pcs cut)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Remarks</label>
            <input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Optional"
              style={fieldStyle}
            />
          </div>
        </div>

        {/* Display Following */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ color: 'var(--text-heading)', fontWeight: 700, fontSize: '0.92rem', marginBottom: '8px' }}>Display Following</div>

          {loadingLotDetails ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>Loading lot...</div>
          ) : lotDetails ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1px',
                backgroundColor: '#cbd5e1',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              <div style={gridCellStyle}>
                <span style={gridLabelStyle}>Job Order No.</span>
                <span style={gridValueStyle}>{lotDetails.joborderno || '-'}</span>
              </div>
              <div style={gridCellStyle}>
                <span style={gridLabelStyle}>Job Order Date</span>
                <span style={gridValueStyle}>{formatDate(lotDetails.joborderdate)}</span>
              </div>
              <div style={gridCellStyle}>
                <span style={gridLabelStyle}>Order No.</span>
                <span style={gridValueStyle}>{lotDetails.custorderno || '-'}</span>
              </div>
              <div style={gridCellStyle}>
                <span style={gridLabelStyle}>Order Dt.</span>
                <span style={gridValueStyle}>{formatDate(lotDetails.custorderdate)}</span>
              </div>
              <div style={gridCellStyle}>
                <span style={gridLabelStyle}>Order Qty.</span>
                <span style={gridValueStyle}>{lotDetails.totalqtypcs} pcs</span>
              </div>
              <div style={{ ...gridCellStyle, backgroundColor: '#f0fdf4' }}>
                <span style={{ ...gridLabelStyle, color: '#166534', fontWeight: 700 }}>Cut Qty.</span>
                <span style={{ ...gridValueStyle, color: '#15803d', fontWeight: 800 }}>{lotDetails.cutqty} pcs</span>
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
              Select a Lot above to see its steps.
            </div>
          )}
        </div>

        {/* Steps of the lot */}
        {lotDetails && (
          <div>
            <div style={{ color: 'var(--text-heading)', fontWeight: 700, fontSize: '0.92rem', marginBottom: '8px' }}>
              Steps of Lot {selectedLotNo} (from Lot Operation Map)
            </div>

            {steps.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                No operations are mapped to Lot {selectedLotNo}. Please map operations in Lot Operation Map first.
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--primary)', color: '#ffffff' }}>
                        <th style={{ ...excelThStyle, textAlign: 'center', width: '60px' }}>Step</th>
                        <th style={{ ...excelThStyle, textAlign: 'left' }}>Operation</th>
                        <th style={{ ...excelThStyle, textAlign: 'left', width: '130px' }}>Process</th>
                        <th style={{ ...excelThStyle, textAlign: 'right', width: '90px' }}>Received</th>
                        <th
                          style={{ ...excelThStyle, textAlign: 'right', width: '110px' }}
                          title="Pieces logged on this step in Daily Process Entry"
                        >
                          Done by Workers
                        </th>
                        <th style={{ ...excelThStyle, textAlign: 'right', width: '90px' }}>Sent Ahead</th>
                        <th
                          style={{ ...excelThStyle, textAlign: 'right', width: '100px' }}
                          title="Done by Workers - Sent Ahead"
                        >
                          Can Send Now
                        </th>
                        <th style={{ ...excelThStyle, textAlign: 'center', width: '200px', backgroundColor: 'var(--primary-hover)' }}>Send Now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {steps.map((step, idx) => {
                        const typed = sendQty[step.operation_id] || '';
                        const isOverLimit = (parseFloat(typed) || 0) > step.available;
                        // no Create right = nothing can be sent from this screen
                        const nothingAvailable = step.available <= 0 || !rights.create;
                        return (
                          <tr
                            key={step.operation_id}
                            style={{
                              borderBottom: '1px solid #e2e8f0',
                              backgroundColor: isOverLimit ? '#fef2f2' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                            }}
                          >
                            <td style={{ ...excelTdStyle, textAlign: 'center', fontWeight: 700 }}>{step.stepno}</td>
                            <td style={{ ...excelTdStyle, fontWeight: 600, color: '#1e293b' }}>{step.operation_name}</td>
                            <td style={{ ...excelTdStyle, color: '#64748b' }}>{step.process_name || '-'}</td>
                            <td style={{ ...excelTdStyle, textAlign: 'right' }}>{step.received}</td>
                            <td style={{ ...excelTdStyle, textAlign: 'right' }}>{step.done}</td>
                            <td style={{ ...excelTdStyle, textAlign: 'right' }}>{step.sent}</td>
                            <td style={{ ...excelTdStyle, textAlign: 'right', fontWeight: 800, color: nothingAvailable ? '#94a3b8' : '#15803d' }}>
                              {step.available}
                            </td>
                            <td style={{ ...excelTdStyle, textAlign: 'center' }}>
                              <input
                                type="text"
                                value={typed}
                                disabled={nothingAvailable}
                                onChange={(e) =>
                                  setSendQty((prev) => ({ ...prev, [step.operation_id]: e.target.value.replace(/[^0-9]/g, '') }))
                                }
                                placeholder={nothingAvailable ? '0' : `max ${step.available}`}
                                style={{
                                  ...qtyInputStyle,
                                  border: isOverLimit ? '2px solid #ef4444' : '1px solid #cbd5e1',
                                  backgroundColor: nothingAvailable ? '#f1f5f9' : '#ffffff',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleSend(step)}
                                disabled={saving || nothingAvailable || isOverLimit || !typed}
                                style={{
                                  marginLeft: '6px',
                                  padding: '4px 12px',
                                  backgroundColor: saving || nothingAvailable || isOverLimit || !typed ? '#94a3b8' : 'var(--primary)',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '8px',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  cursor: saving || nothingAvailable || isOverLimit || !typed ? 'not-allowed' : 'pointer',
                                }}
                              >
                                Send
                              </button>
                              {isOverLimit && (
                                <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600, marginTop: '2px' }}>
                                  Max: {step.available}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Finished pieces = sent ahead by the last step */}
                <div
                  style={{
                    marginTop: '14px',
                    padding: '10px 14px',
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.88rem',
                  }}
                >
                  <span style={{ color: '#166534', fontWeight: 600 }}>Finished (sent ahead by the last step)</span>
                  <strong style={{ color: '#15803d' }}>
                    {finishedQty} / {lotDetails.cutqty} pcs
                  </strong>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Styling Constants
const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  padding: '20px',
  marginBottom: '28px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.88rem',
  fontWeight: 700,
  color: '#1e293b',
  marginBottom: '6px',
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '0.9rem',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  outline: 'none',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
};

const qtyInputStyle: React.CSSProperties = {
  width: '90px',
  padding: '4px 8px',
  textAlign: 'right',
  fontSize: '0.9rem',
  fontWeight: 700,
  borderRadius: '8px',
  outline: 'none',
  border: '1px solid #cbd5e1',
};

const excelThStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontWeight: 700,
  fontSize: '0.83rem',
  letterSpacing: '0.2px',
};

const excelTdStyle: React.CSSProperties = {
  padding: '8px 10px',
  verticalAlign: 'middle',
};

const smallGreyButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '0.78rem',
  backgroundColor: '#f1f5f9',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  cursor: 'pointer',
  color: '#64748b',
};

const editButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '0.78rem',
  fontWeight: 600,
  backgroundColor: '#ffffff',
  color: 'var(--text-heading)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  cursor: 'pointer',
};

const deleteButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '0.78rem',
  fontWeight: 600,
  backgroundColor: '#ffffff',
  color: 'var(--danger)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  cursor: 'pointer',
};

const gridCellStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  padding: '10px 14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const gridLabelStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#475569',
};

const gridValueStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 700,
  color: '#1e293b',
};
