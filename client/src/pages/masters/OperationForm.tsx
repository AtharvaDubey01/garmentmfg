import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormPage } from '../../components/common/FormPage';
import { Toast } from '../../components/common/Toast';

interface Process {
  id: number;
  stkcategoryname: string;
}

export const OperationForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id && id !== 'new');
  const navigate = useNavigate();

  const [operations, setOperations] = useState('');
  const [opcode, setOpcode] = useState('');
  const [oprate, setOprate] = useState('');
  const [processid, setProcessid] = useState<string>('');

  const [processes, setProcesses] = useState<Process[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    // 1. Fetch Process Master for dropdown
    fetch('/api/masters/process-masters', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setProcesses(data))
      .catch((err) => console.error('Error fetching processes:', err));

    // 2. If editing, fetch Operation details
    if (isEdit && id) {
      setLoading(true);
      fetch(`/api/masters/operations/${id}`, { credentials: 'include' })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load operation details');
          return res.json();
        })
        .then((data) => {
          setOperations(data.operations || '');
          setOpcode(data.opcode || '');
          setOprate(data.oprate !== undefined ? String(data.oprate) : '');
          setProcessid(data.processid ? String(data.processid) : '');
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

    if (!operations.trim() || !opcode.trim() || !processid) {
      setErrorMessage('Please Enter * Mandatory Fields');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const url = isEdit ? `/api/masters/operations/${id}` : '/api/masters/operations';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          operations,
          opcode,
          oprate: oprate ? parseFloat(oprate) : 0,
          processid,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Error saving operation');
        return;
      }

      navigate('/masters/operations');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setOperations('');
    setOpcode('');
    setOprate('');
    setProcessid('');
    setErrorMessage('');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ced4da',
    borderRadius: '8px',
    fontSize: '0.9rem',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: '6px',
    fontSize: '0.9rem',
  };

  return (
    <div>
      <FormPage
        title="Operation Master"
        onSubmit={handleSubmit}
        onClear={handleClear}
        exitPath="/masters/operations"
        loading={loading}
        isEdit={isEdit}
      >
        <div style={{ gridColumn: 'span 3', maxWidth: '420px', margin: '0 auto', width: '100%' }}>
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

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>
              Process <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              value={processid}
              onChange={(e) => setProcessid(e.target.value)}
              style={inputStyle}
              autoFocus
            >
              <option value="">--Select--</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.stkcategoryname}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>
              Operation Code <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={opcode}
              onChange={(e) => setOpcode(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>
              Operation <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={operations}
              onChange={(e) => setOperations(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Rate</label>
            <input
              type="number"
              step="0.01"
              value={oprate}
              onChange={(e) => setOprate(e.target.value)}
              style={inputStyle}
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
