import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormPage } from '../../components/common/FormPage';
import { Toast } from '../../components/common/Toast';

export const ProcessMasterForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id && id !== 'new');
  const navigate = useNavigate();

  const [processName, setProcessName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isEdit && id) {
      setLoading(true);
      fetch(`/api/masters/process-masters/${id}`, { credentials: 'include' })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load process details');
          return res.json();
        })
        .then((data) => {
          setProcessName(data.stkcategoryname || '');
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

    if (!processName.trim()) {
      setErrorMessage('Please Enter * Mandatory Fields');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const url = isEdit
        ? `/api/masters/process-masters/${id}`
        : '/api/masters/process-masters';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stkcategoryname: processName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Error saving record');
        return;
      }

      navigate('/masters/process-master');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setProcessName('');
    setErrorMessage('');
  };

  return (
    <div>
      <FormPage
        title="Process Master"
        onSubmit={handleSubmit}
        onClear={handleClear}
        exitPath="/masters/process-master"
        loading={loading}
        isEdit={isEdit}
      >
        <div style={{ gridColumn: 'span 3', maxWidth: '400px', margin: '0 auto', width: '100%' }}>
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

          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="processName"
              style={{
                display: 'block',
                fontWeight: 'bold',
                color: '#000000',
                marginBottom: '6px',
                fontSize: '0.9rem',
              }}
            >
              Process Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="processName"
              type="text"
              value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              placeholder=""
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ced4da',
                borderRadius: '8px',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
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
