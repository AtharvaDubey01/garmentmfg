import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormPage } from '../../components/common/FormPage';
import { Toast } from '../../components/common/Toast';

export const UnitForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id && id !== 'new');
  const navigate = useNavigate();

  const [unitType, setUnitType] = useState('Simple');
  const [unitName, setUnitName] = useState('');
  const [decimalPlaces, setDecimalPlaces] = useState('0');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isEdit && id) {
      setLoading(true);
      fetch(`/api/masters/units/${id}`, { credentials: 'include' })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load unit details');
          return res.json();
        })
        .then((data) => {
          setUnitType(data.unittype || 'Simple');
          setUnitName(data.unitname || '');
          setDecimalPlaces(String(data.decimalplaces ?? 0));
        })
        .catch((err) => {
          setToast({ type: 'error', message: err.message });
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!unitName.trim() || decimalPlaces.trim() === '') {
      setErrorMessage('Please Enter * Mandatory Fields');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const url = isEdit ? `/api/masters/units/${id}` : '/api/masters/units';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          unittype: unitType,
          unitname: unitName,
          decimalplaces: parseInt(decimalPlaces, 10) || 0,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Error saving record');
        return;
      }

      navigate('/masters/unit');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setUnitType('Simple');
    setUnitName('');
    setDecimalPlaces('0');
    setErrorMessage('');
  };

  return (
    <div>
      <FormPage
        title="Unit Master"
        onSubmit={handleSubmit}
        onClear={handleClear}
        exitPath="/masters/unit"
        loading={loading}
        isEdit={isEdit}
      >
        {errorMessage && (
          <div
            style={{
              gridColumn: 'span 3',
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

        {/* 1. Unit Type */}
        <div>
          <label
            htmlFor="unitType"
            style={{ display: 'block', fontWeight: 'bold', color: '#000', marginBottom: '6px', fontSize: '0.9rem' }}
          >
            Unit Type
          </label>
          <select
            id="unitType"
            value={unitType}
            onChange={(e) => setUnitType(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              fontSize: '0.95rem',
              outline: 'none',
              backgroundColor: '#ffffff',
            }}
          >
            <option value="Simple">Simple</option>
            <option value="Compound">Compound</option>
          </select>
        </div>

        {/* 2. Unit Name */}
        <div>
          <label
            htmlFor="unitName"
            style={{ display: 'block', fontWeight: 'bold', color: '#000', marginBottom: '6px', fontSize: '0.9rem' }}
          >
            Unit Name <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            id="unitName"
            type="text"
            value={unitName}
            onChange={(e) => {
              setUnitName(e.target.value);
              setErrorMessage('');
            }}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              fontSize: '0.95rem',
              outline: 'none',
            }}
            autoFocus
          />
        </div>

        {/* 3. DecimalPlaces */}
        <div>
          <label
            htmlFor="decimalPlaces"
            style={{ display: 'block', fontWeight: 'bold', color: '#000', marginBottom: '6px', fontSize: '0.9rem' }}
          >
            DecimalPlaces <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            id="decimalPlaces"
            type="number"
            min="0"
            max="4"
            value={decimalPlaces}
            onChange={(e) => {
              setDecimalPlaces(e.target.value);
              setErrorMessage('');
            }}
            style={{
              width: '100%',
              maxWidth: '8rem',
              textAlign: 'right',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              fontSize: '0.95rem',
              outline: 'none',
            }}
          />
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
