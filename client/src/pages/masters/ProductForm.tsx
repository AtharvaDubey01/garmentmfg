import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormPage } from '../../components/common/FormPage';
import { Toast } from '../../components/common/Toast';

interface LookupItem {
  id: number;
  name: string;
}

export const ProductForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id && id !== 'new');
  const navigate = useNavigate();

  // Header State
  const [stockitemname, setStockitemname] = useState('');
  const [stockgroup, setStockgroup] = useState<string>('');
  const [stkcode, setStkcode] = useState('');
  const [stkdescription, setStkdescription] = useState('');
  const [unit, setUnit] = useState<string>('');

  // Lookups
  const [groups, setGroups] = useState<LookupItem[]>([]);
  const [units, setUnits] = useState<LookupItem[]>([]);

  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch Lookups
  useEffect(() => {
    // 1. Product Groups
    fetch('/api/masters/product-groups', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setGroups(data.map((g: any) => ({ id: g.id, name: g.stkgrpname }))))
      .catch((err) => console.error(err));

    // 2. Units
    fetch('/api/masters/units', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setUnits(data.map((u: any) => ({ id: u.id, name: u.unitname }))))
      .catch((err) => console.error(err));

    // 3. If editing, fetch Product details
    if (isEdit && id) {
      setLoading(true);
      fetch(`/api/masters/products/${id}`, { credentials: 'include' })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load product details');
          return res.json();
        })
        .then((data) => {
          setStockitemname(data.stockitemname || '');
          setStockgroup(data.stockgroup ? String(data.stockgroup) : '');
          setStkcode(data.stkcode || '');
          setStkdescription(data.stkdescription || '');
          setUnit(data.unit ? String(data.unit) : '');
        })
        .catch((err) => setToast({ type: 'error', message: err.message }))
        .finally(() => setLoading(false));
    }
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stockitemname.trim() || !stockgroup || !unit) {
      setErrorMessage('Please Enter * Mandatory Fields');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const url = isEdit ? `/api/masters/products/${id}` : '/api/masters/products';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          stockitemname,
          stockgroup,
          stkcode,
          stkdescription,
          unit,
          alternateunit: 0,
          conversion: 0,
          openingStock: [],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Error saving product');
        return;
      }

      navigate('/masters/product');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setStockitemname('');
    setStockgroup('');
    setStkcode('');
    setStkdescription('');
    setUnit('');
    setErrorMessage('');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid #ced4da',
    borderRadius: '8px',
    fontSize: '0.88rem',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: '4px',
    fontSize: '0.85rem',
  };

  return (
    <div>
      <FormPage
        title="Product Master"
        onSubmit={handleSubmit}
        onClear={handleClear}
        exitPath="/masters/product"
        loading={loading}
        isEdit={isEdit}
      >
        <div style={{ gridColumn: 'span 3', width: '100%', maxWidth: '900px', margin: '0 auto' }}>
          {errorMessage && (
            <div
              style={{
                color: 'var(--danger)',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Row 1: Product Name, Product Group */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>
                Product Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                value={stockitemname}
                onChange={(e) => setStockitemname(e.target.value)}
                autoFocus
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>
                Product Group <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                value={stockgroup}
                onChange={(e) => setStockgroup(e.target.value)}
                style={inputStyle}
              >
                <option value="">--Select--</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Product Code, Description */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Product Code</label>
              <input
                type="text"
                value={stkcode}
                onChange={(e) => setStkcode(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input
                type="text"
                value={stkdescription}
                onChange={(e) => setStkdescription(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Row 3: Unit */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div>
              <label style={labelStyle}>
                Unit <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={inputStyle}
              >
                <option value="">--Select--</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div></div>
          </div>
        </div>
      </FormPage>

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
