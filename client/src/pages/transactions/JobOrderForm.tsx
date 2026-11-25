import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useScreenRights } from '../../context/AuthContext';
import { Toast } from '../../components/common/Toast';
import { JobOrderPrintModal, type JobOrderPrintData } from './JobOrderPrintModal';

interface CutBalance {
  totalqtypcs: number | null;
  already_cut: number;
  balance: number | null;
  is_new_joborderno: boolean;
}

interface ProductLookup {
  id: number;
  stockitemname: string;
}

export const JobOrderForm: React.FC = () => {
  const canCloseLot = useScreenRights().has('closeLot'); // "Close / reopen lot" right (server checks too)
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  // Lookup data
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const [existingJobOrderNos, setExistingJobOrderNos] = useState<string[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);

  // Phase A: cut balance state
  const [cutBalance, setCutBalance] = useState<CutBalance | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const balanceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // UI state
  const [errorMessage, setErrorMessage] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  // Whether this new form is being used as "add new lot to existing job order"
  const [isExistingJobOrder, setIsExistingJobOrder] = useState(false);
  // Editing: why the order details are locked (null = editable: no lot of this Job Order is used yet)
  // and how many lots the Job Order has (a change to the order details goes to all of them)
  const [orderInUse, setOrderInUse] = useState<string | null>(null);
  const [lotCount, setLotCount] = useState(1);

  // Form Fields
  const [jobOrderNo, setJobOrderNo] = useState('');
  const [jobOrderDate, setJobOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [buyer, setBuyer] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [style, setStyle] = useState('');
  const [totalQtyPcs, setTotalQtyPcs] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [cutQty, setCutQty] = useState('');
  const [productDetails, setProductDetails] = useState('');
  const [custOrderNo, setCustOrderNo] = useState('');
  const [custOrderDate, setCustOrderDate] = useState('');
  const [lotClosed, setLotClosed] = useState('No');
  const [fabricQty, setFabricQty] = useState('0.00');
  const [totalCuttingPcs, setTotalCuttingPcs] = useState('0.00');
  const [avgRequirement, setAvgRequirement] = useState('0.00');

  const isManualProductDetail = useRef(false);

  // Load products + existing job order nos for dropdown
  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const [prodRes, nosRes] = await Promise.all([
          fetch('/api/masters/products', { credentials: 'include' }),
          fetch('/api/transactions/job-orders/unique-nos', { credentials: 'include' }),
        ]);
        if (prodRes.ok) setProducts(await prodRes.json());
        if (nosRes.ok) setExistingJobOrderNos(await nosRes.json());
      } catch (err) {
        console.error('Failed to load lookups:', err);
      } finally {
        setLoadingLookups(false);
      }
    };
    fetchLookups();
  }, []);

  // Load existing Job Order if edit
  useEffect(() => {
    if (!id) return;
    const fetchOrder = async () => {
      setLoadingData(true);
      try {
        const res = await fetch(`/api/transactions/job-orders/${id}`, { credentials: 'include' });
        if (res.ok) {
          const order = await res.json();
          setJobOrderNo(order.joborderno || '');
          setJobOrderDate(order.joborderdate || new Date().toISOString().slice(0, 10));
          setBuyer(order.custdtl || '');
          setLotNo(order.fabriclotno || '');
          setStyle(order.style || '');
          setTotalQtyPcs(order.totalqtypcs != null ? String(order.totalqtypcs) : '');
          setCustomerId(order.customerid ? String(order.customerid) : '');
          setCutQty(order.cutqty != null ? String(Math.round(Number(order.cutqty))) : '');
          setProductDetails(order.fabricdtls || '');
          setCustOrderNo(order.custorderno || '');
          setCustOrderDate(order.custorderdate || '');
          setLotClosed(order.lotclosed || 'No');
          setFabricQty(order.fabricqty != null ? String(order.fabricqty) : '0.00');
          setTotalCuttingPcs(order.totalcuttingpcs != null ? String(order.totalcuttingpcs) : '0.00');
          setAvgRequirement(order.avgrequirement != null ? String(order.avgrequirement) : '0.00');
          isManualProductDetail.current = true;
          setOrderInUse(order.order_in_use ?? null);
          setLotCount(order.lot_count || 1);
          // In edit mode fetch balance excluding self — just to show info, not to block
          fetchCutBalance(order.joborderno, id);
        } else {
          setErrorMessage('Failed to load Job Order details');
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Error loading Job Order');
      } finally {
        setLoadingData(false);
      }
    };
    fetchOrder();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase A: fetch cut balance
  const fetchCutBalance = useCallback(async (joNo: string, excludeId?: string) => {
    if (!joNo.trim()) { setCutBalance(null); return; }
    setLoadingBalance(true);
    try {
      const params = new URLSearchParams({ joborderno: joNo.trim() });
      if (excludeId) params.set('excludeId', excludeId);
      const res = await fetch(`/api/transactions/job-orders/cut-balance?${params}`, { credentials: 'include' });
      if (res.ok) setCutBalance(await res.json());
      else setCutBalance(null);
    } catch { setCutBalance(null); }
    finally { setLoadingBalance(false); }
  }, []);

  // Auto-fill all common fields when user picks an existing Job Order No. from dropdown
  const handleExistingJobOrderSelect = async (joNo: string) => {
    setJobOrderNo(joNo);
    setErrorMessage('');
    if (!joNo) {
      setIsExistingJobOrder(false);
      setCutBalance(null);
      return;
    }
    setIsExistingJobOrder(true);
    // Fetch the details to auto-fill
    try {
      const res = await fetch(
        `/api/transactions/job-orders/by-joborderno?joborderno=${encodeURIComponent(joNo)}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        setBuyer(data.custdtl || '');
        setStyle(data.style || '');
        setTotalQtyPcs(data.totalqtypcs != null ? String(data.totalqtypcs) : '');
        setCustomerId(data.customerid ? String(data.customerid) : '');
        setCustOrderNo(data.custorderno || '');
        setCustOrderDate(data.custorderdate || '');
        setProductDetails(data.fabricdtls || '');
        setJobOrderDate(data.joborderdate || new Date().toISOString().slice(0, 10));
        isManualProductDetail.current = true;
      }
    } catch (e) {
      console.error('Auto-fill failed', e);
    }
    fetchCutBalance(joNo);
  };

  // For new job order no. typed manually (not from dropdown)
  const handleNewJobOrderNoChange = (val: string) => {
    setJobOrderNo(val);
    setIsExistingJobOrder(false);
    setErrorMessage('');
    if (balanceDebounceRef.current) clearTimeout(balanceDebounceRef.current);
    balanceDebounceRef.current = setTimeout(() => {
      fetchCutBalance(val, isEdit ? id : undefined);
    }, 500);
  };

  const productName = (custId: string) => products.find((p) => String(p.id) === String(custId))?.stockitemname || '';
  // Product Details made by the form read "[Lot] Buyer # Style # Product"
  const detailsTail = (b: string, s: string, c: string) => `${b} # ${s} # ${productName(c)}`;
  const updateProductDetail = (newBuyer: string, newStyle: string, newLot: string, newCustId: string) => {
    if (!isManualProductDetail.current) {
      setProductDetails(`[${newLot}] ${detailsTail(newBuyer, newStyle, newCustId)}`);
      return;
    }
    // Editing a saved lot: the details follow along only if they still read that way
    // (same rule the server uses for the Job Order's other lots; details typed by hand are left alone)
    if (!isEdit) return;
    const m = /^(\[[^\]]*\])\s*(.*)$/.exec(productDetails.trim());
    if (m && m[2].trim() === detailsTail(buyer, style, customerId).trim()) {
      const lotPart = m[1] === `[${lotNo}]` ? `[${newLot}]` : m[1];
      setProductDetails(`${lotPart} ${detailsTail(newBuyer, newStyle, newCustId)}`.trim());
    }
  };

  const handleBuyerChange = (val: string) => {
    setBuyer(val);
    setErrorMessage('');
    updateProductDetail(val, style, lotNo, customerId);
  };
  const handleStyleChange = (val: string) => {
    setStyle(val);
    setErrorMessage('');
    updateProductDetail(buyer, val, lotNo, customerId);
  };
  const handleLotChange = (val: string) => {
    setLotNo(val);
    setErrorMessage('');
    updateProductDetail(buyer, style, val, customerId);
  };
  const handleProductChange = (val: string) => {
    setCustomerId(val);
    setErrorMessage('');
    updateProductDetail(buyer, style, lotNo, val);
  };

  const handleClear = () => {
    setJobOrderNo(''); setJobOrderDate(new Date().toISOString().slice(0, 10));
    setBuyer(''); setLotNo(''); setStyle(''); setTotalQtyPcs('');
    setCustomerId(''); setCutQty(''); setProductDetails('');
    setCustOrderNo(''); setCustOrderDate(''); setLotClosed('No');
    setFabricQty('0.00'); setTotalCuttingPcs('0.00'); setAvgRequirement('0.00');
    setErrorMessage(''); setCutBalance(null); setIsExistingJobOrder(false);
    isManualProductDetail.current = false;
  };

  // Order details (Buyer, Style, Total Order Qty, Product Description, Customer Order No. / Date):
  // new lot of an existing Job Order -> copied from it; editing -> locked once a lot of the Job Order is used
  const orderLocked = isEdit ? Boolean(orderInUse) : isExistingJobOrder;
  const lockedBg = orderLocked ? '#f5f5f5' : '#ffffff';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!jobOrderNo.trim() || !jobOrderDate || !customerId || !lotNo.trim() || !style.trim() || !totalQtyPcs.trim() || parseFloat(totalQtyPcs) <= 0) {
      setErrorMessage('Please Enter * Mandatory Fields');
      return;
    }

    // Phase A: frontend cap check (server re-checks on save)
    if (cutQtyOverBalance && balanceNum !== null) {
      setErrorMessage(
        `Cut Qty (${cutQtyNum}) exceeds available balance of ${balanceNum.toFixed(2)} pcs ` +
        `(Total Order Qty: ${totalQtyNum}, Cut in other lots: ${cutBalance?.already_cut ?? 0}).`
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        joborderno: jobOrderNo.trim(),
        joborderdate: jobOrderDate,
        customerid: parseInt(customerId, 10),
        custorderno: custOrderNo.trim(),
        custorderdate: custOrderDate || null,
        totalqtypcs: parseFloat(totalQtyPcs) || 0,
        fabricdtls: productDetails.trim(),
        fabriclotno: lotNo.trim(),
        fabricqty: parseFloat(fabricQty) || 0,
        totalcuttingpcs: parseFloat(totalCuttingPcs) || 0,
        avgrequirement: parseFloat(avgRequirement) || 0,
        style: style.trim(),
        custdtl: buyer.trim(),
        cutqty: parseFloat(cutQty) || 0,
        lotclosed: lotClosed,
      };

      const url = isEdit ? `/api/transactions/job-orders/${id}` : '/api/transactions/job-orders';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok) {
        setToast({ type: 'success', message: 'Data Saved Successfully' });
        setTimeout(() => navigate('/transactions/job-order'), 800);
      } else {
        setErrorMessage(json.message || 'Failed to save Job Order');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred');
    } finally {
      setSaving(false);
    }
  };

  // Derived
  // Balance = Total Order Qty on screen minus what other lots of this Job Order already cut.
  // Applies to the first lot, additional lots and edits alike.
  const cutQtyNum = parseFloat(cutQty) || 0;
  const totalQtyNum = parseFloat(totalQtyPcs) || 0;
  const balanceNum = totalQtyNum > 0 ? Math.max(0, totalQtyNum - (cutBalance?.already_cut ?? 0)) : null;
  const cutQtyOverBalance = balanceNum !== null && cutQtyNum > balanceNum;
  const selectedProduct = products.find((p) => String(p.id) === String(customerId));

  const currentPrintData: JobOrderPrintData = {
    id: id ? parseInt(id, 10) : 0,
    joborderno: jobOrderNo, joborderdate: jobOrderDate,
    customerid: parseInt(customerId, 10) || 0,
    stockitemname: selectedProduct?.stockitemname || '',
    custorderno: custOrderNo, custorderdate: custOrderDate,
    totalqtypcs: totalQtyPcs || '0.00', fabriclotno: lotNo,
    fabricqty: fabricQty, totalcuttingpcs: totalCuttingPcs,
    avgrequirement: avgRequirement, style, custdtl: buyer,
    fabricdtls: productDetails, cutqty: cutQty, lotclosed: lotClosed,
  };

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
      {/* Title and note (same as the other forms) */}
      <div style={{ marginBottom: '18px' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Job Order Booking</h1>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>A job order and its lot: buyer, style, product and cut quantity</div>
      </div>
      <div style={{ padding: '24px 28px', backgroundColor: '#ffffff', color: 'var(--text-heading)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: 'var(--shadow-card)' }}>

        {errorMessage && (
          <div style={{ color: 'var(--danger)', fontWeight: 700, textAlign: 'center', marginBottom: '20px', padding: '10px 14px', backgroundColor: '#fff0f0', border: '1px solid #f8d7da', borderRadius: '8px', fontSize: '0.95rem' }}>
            {errorMessage}
          </div>
        )}

        {isEdit && !loadingData && (orderInUse || lotCount > 1) && (
          <div style={{ marginBottom: '18px', padding: '8px 14px', backgroundColor: orderInUse ? '#f5f5f5' : 'var(--primary-soft)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem', color: '#555555' }}>
            {orderInUse
              ? `🔒 Buyer, Style, Total Order Qty, Product Description and Customer Order can't be changed: ${orderInUse}.`
              : `Changes to Buyer, Style, Total Order Qty, Product Description and Customer Order go to all ${lotCount} lots of this Job Order.`}
          </div>
        )}

        {loadingData || loadingLookups ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading form details...</div>
        ) : (
          <form onSubmit={handleSave}>

            {/* ── Row 1: Job Order No & Date ── */}
            <div style={rowStyle}>
              <div style={colLabelStyle}>
                <label style={labelStyle}>Job Order No. <span style={{ color: 'red' }}>*</span></label>
              </div>
              <div style={colInputStyle}>
                {/* Phase A: Two-mode input — dropdown for existing JO, text for new */}
                {!isEdit ? (
                  <>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {/* Existing job order dropdown */}
                      <select
                        value={isExistingJobOrder ? jobOrderNo : ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            handleExistingJobOrderSelect(e.target.value);
                          } else {
                            setIsExistingJobOrder(false);
                            setJobOrderNo('');
                            setCutBalance(null);
                          }
                        }}
                        style={{ ...selectStyle, flex: '1' }}
                      >
                        <option value="">-- Select existing --</option>
                        {existingJobOrderNos.map((no) => (
                          <option key={no} value={no}>{no}</option>
                        ))}
                      </select>
                      <span style={{ color: '#999', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>or type new:</span>
                      {/* New job order text input */}
                      <input
                        type="text"
                        value={isExistingJobOrder ? '' : jobOrderNo}
                        onChange={(e) => {
                          setIsExistingJobOrder(false);
                          handleNewJobOrderNoChange(e.target.value);
                        }}
                        placeholder="New JO No."
                        style={{ ...inputStyle, flex: '1' }}
                        autoComplete="off"
                      />
                    </div>
                    {/* Balance badge — only for existing job orders */}
                    {loadingBalance && (
                      <span style={{ display: 'block', marginTop: '4px', fontSize: '0.78rem', color: '#888' }}>Checking balance...</span>
                    )}
                    {!loadingBalance && cutBalance && !cutBalance.is_new_joborderno && (
                      <span style={{
                        display: 'block', marginTop: '4px', padding: '3px 8px', borderRadius: '8px',
                        fontSize: '0.78rem', fontWeight: 500,
                        backgroundColor: cutBalance.balance === 0 ? '#ffebe9' : 'var(--primary-soft)',
                        color: cutBalance.balance === 0 ? '#c0392b' : '#1a7a52',
                      }}>
                        ✂️ Already Cut: {cutBalance.already_cut} / {cutBalance.totalqtypcs} &nbsp;|&nbsp;
                        <strong>Balance: {cutBalance.balance} pcs{cutBalance.balance === 0 ? ' — No balance left!' : ''}</strong>
                      </span>
                    )}
                    {!loadingBalance && cutBalance && cutBalance.is_new_joborderno && (
                      <span style={{ display: 'block', marginTop: '4px', fontSize: '0.78rem', color: '#856404' }}>🆕 New Job Order No. — no prior lots</span>
                    )}
                  </>
                ) : (
                  /* Edit mode: just show the value, no balance badge (edit is for fixing data, not adding lots) */
                  <input
                    type="text"
                    value={jobOrderNo}
                    onChange={(e) => { setJobOrderNo(e.target.value); setErrorMessage(''); }}
                    style={inputStyle}
                    required
                    autoComplete="off"
                  />
                )}
              </div>

              <div style={colLabelStyle}>
                <label style={labelStyle}>Job Order Date <span style={{ color: 'red' }}>*</span></label>
              </div>
              <div style={colInputStyle}>
                <input type="date" value={jobOrderDate} onChange={(e) => { setJobOrderDate(e.target.value); setErrorMessage(''); }} style={inputStyle} required />
              </div>
            </div>

            {/* ── Row 2: Buyer & Product Lot No ── */}
            <div style={rowStyle}>
              <div style={colLabelStyle}><label style={labelStyle}>Buyer</label></div>
              <div style={colInputStyle}>
                <input type="text" value={buyer} onChange={(e) => handleBuyerChange(e.target.value)} style={{ ...inputStyle, backgroundColor: lockedBg }} autoComplete="off" readOnly={orderLocked} />
                {!isEdit && isExistingJobOrder && <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>Auto-filled from Job Order</div>}
              </div>
              <div style={colLabelStyle}><label style={labelStyle}>Product Lot No. <span style={{ color: 'red' }}>*</span></label></div>
              <div style={colInputStyle}>
                <input type="text" value={lotNo} onChange={(e) => handleLotChange(e.target.value)} style={inputStyle} autoComplete="off" required placeholder="New lot no. e.g. 03" />
              </div>
            </div>

            {/* ── Row 3: Style & Total Order Qty ── */}
            <div style={rowStyle}>
              <div style={colLabelStyle}><label style={labelStyle}>Style <span style={{ color: 'red' }}>*</span></label></div>
              <div style={colInputStyle}>
                <input type="text" value={style} onChange={(e) => handleStyleChange(e.target.value)} style={{ ...inputStyle, backgroundColor: lockedBg }} autoComplete="off" required readOnly={orderLocked} />
              </div>
              <div style={colLabelStyle}><label style={labelStyle}>Total Order Qty <span style={{ color: 'red' }}>*</span></label></div>
              <div style={colInputStyle}>
                <input type="number" step="0.01" value={totalQtyPcs} onChange={(e) => { setTotalQtyPcs(e.target.value); setErrorMessage(''); }} style={{ ...inputStyle, backgroundColor: lockedBg }} autoComplete="off" required readOnly={orderLocked} />
                {!isEdit && isExistingJobOrder && <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>Fixed for this Job Order</div>}
              </div>
            </div>

            {/* ── Row 4: Product Description & Total Cut Qty ── */}
            <div style={rowStyle}>
              <div style={colLabelStyle}><label style={labelStyle}>Product Description <span style={{ color: 'red' }}>*</span></label></div>
              <div style={colInputStyle}>
                <select value={customerId} onChange={(e) => handleProductChange(e.target.value)} style={{ ...selectStyle, backgroundColor: lockedBg }} required disabled={orderLocked}>
                  <option value="">--Select--</option>
                  {products.map((p) => (<option key={p.id} value={p.id}>{p.stockitemname}</option>))}
                </select>
              </div>
              <div style={colLabelStyle}><label style={labelStyle}>Cut Qty (this lot)</label></div>
              <div style={colInputStyle}>
                <input
                  type="text" inputMode="numeric" value={cutQty}
                  onChange={(e) => { setCutQty(e.target.value.replace(/[^0-9]/g, '')); setErrorMessage(''); }}
                  style={{ ...inputStyle, borderColor: cutQtyOverBalance ? 'var(--danger)' : 'var(--border-color)', backgroundColor: cutQtyOverBalance ? '#fff5f5' : '#ffffff' }}
                  autoComplete="off"
                />
                {cutQtyOverBalance && (
                  <div style={{ color: 'var(--danger)', fontSize: '0.78rem', fontWeight: 600, marginTop: '3px' }}>⚠️ Exceeds balance! Max: {balanceNum} pcs</div>
                )}
                {balanceNum !== null && !cutQtyOverBalance && (
                  <div style={{ color: '#1a7a52', fontSize: '0.78rem', marginTop: '3px' }}>Max allowed: {balanceNum} pcs</div>
                )}
              </div>
            </div>

            {/* ── Row 5: Product Details ── */}
            <div style={rowStyle}>
              <div style={colLabelStyle}><label style={labelStyle}>Product Details</label></div>
              <div style={{ flex: '0 0 82%', padding: '0 8px' }}>
                <input type="text" value={productDetails} onChange={(e) => { isManualProductDetail.current = true; setProductDetails(e.target.value); }} style={inputStyle} autoComplete="off" />
              </div>
            </div>

            {/* ── Row 6: Customer Order No & Date ── */}
            <div style={rowStyle}>
              <div style={colLabelStyle}><label style={labelStyle}>Customer Order No.</label></div>
              <div style={colInputStyle}>
                <input type="text" value={custOrderNo} onChange={(e) => setCustOrderNo(e.target.value)} style={{ ...inputStyle, backgroundColor: lockedBg }} autoComplete="off" readOnly={orderLocked} />
              </div>
              <div style={colLabelStyle}><label style={labelStyle}>Customer Order Date</label></div>
              <div style={colInputStyle}>
                <input type="date" value={custOrderDate} onChange={(e) => setCustOrderDate(e.target.value)} style={{ ...inputStyle, backgroundColor: lockedBg }} readOnly={orderLocked} />
              </div>
            </div>

            {/* ── Row 7: Closed Lot ── */}
            <div style={rowStyle}>
              <div style={colLabelStyle}><label style={labelStyle}>Closed Lot</label></div>
              <div style={colInputStyle}>
                <select
                  value={lotClosed}
                  onChange={(e) => setLotClosed(e.target.value)}
                  disabled={!canCloseLot}
                  title={canCloseLot ? undefined : 'You don\'t have the "Close / reopen lot" right'}
                  style={{ ...selectStyle, backgroundColor: canCloseLot ? '#ffffff' : '#e9ecef' }}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ textAlign: 'center', marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button type="submit" disabled={saving} style={{ ...btnPrimaryStyle, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={handleClear} style={btnSecondaryStyle}>Clear</button>
              <button type="button" onClick={() => navigate('/transactions/job-order')} style={btnSecondaryStyle}>Exit</button>
            </div>
          </form>
        )}
      </div>

      <JobOrderPrintModal isOpen={showPrint} onClose={() => setShowPrint(false)} order={currentPrintData} />
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
};

const rowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '14px' };
const colLabelStyle: React.CSSProperties = { flex: '0 0 18%', padding: '10px 8px 0' };
const colInputStyle: React.CSSProperties = { flex: '0 0 32%', padding: '0 8px' };
const labelStyle: React.CSSProperties = { fontSize: '0.88rem', fontWeight: 700, color: '#333333' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none', backgroundColor: '#ffffff', boxSizing: 'border-box' };
const selectStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none', backgroundColor: '#ffffff', boxSizing: 'border-box' };
const btnPrimaryStyle: React.CSSProperties = { padding: '8px 24px', backgroundColor: 'var(--primary)', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.15s ease' };
const btnSecondaryStyle: React.CSSProperties = { ...btnPrimaryStyle, backgroundColor: '#ffffff', color: 'var(--text-heading)', border: '1px solid var(--border-color)' };
