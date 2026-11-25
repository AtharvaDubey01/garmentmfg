import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormPage } from '../../components/common/FormPage';
import { Toast } from '../../components/common/Toast';

export const EmployeeGroupForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id && id !== 'new');
  const navigate = useNavigate();

  const [groupName, setGroupName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isEdit && id) {
      setLoading(true);
      fetch(`/api/masters/employee-groups/${id}`, { credentials: 'include' })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load group details');
          return res.json();
        })
        .then((data) => {
          setGroupName(data.ledgrpname || '');
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

    if (!groupName.trim()) {
      setErrorMessage('Please Enter * Mandatory Fields');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const url = isEdit
        ? `/api/masters/employee-groups/${id}`
        : '/api/masters/employee-groups';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ledgrpname: groupName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Error saving record');
        return;
      }

      navigate('/masters/employee-group');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setGroupName('');
    setErrorMessage('');
  };

  return (
    <div>
      <FormPage
        title="Employee Group Master"
        onSubmit={handleSubmit}
        onClear={handleClear}
        exitPath="/masters/employee-group"
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
              htmlFor="groupName"
              style={{
                display: 'block',
                fontWeight: 'bold',
                color: '#000000',
                marginBottom: '6px',
                fontSize: '0.9rem',
              }}
            >
              Group Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="groupName"
              type="text"
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
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
