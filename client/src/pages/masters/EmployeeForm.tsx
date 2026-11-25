import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormPage } from '../../components/common/FormPage';
import { Toast } from '../../components/common/Toast';

interface EmployeeGroup {
  id: number;
  ledgrpname: string;
}

export const EmployeeForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id && id !== 'new');
  const navigate = useNavigate();

  const [operatorname, setOperatorname] = useState('');
  const [empcode, setEmpcode] = useState('');
  const [empgrp, setEmpgrp] = useState<string>('');
  const [contactno, setContactno] = useState('');
  const [addharno, setAddharno] = useState('');

  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    // 1. Fetch Employee Groups for dropdown
    fetch('/api/masters/employee-groups', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setGroups(data))
      .catch((err) => console.error('Error fetching groups:', err));

    // 2. If editing, fetch Employee details
    if (isEdit && id) {
      setLoading(true);
      fetch(`/api/masters/employees/${id}`, { credentials: 'include' })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load employee details');
          return res.json();
        })
        .then((data) => {
          setOperatorname(data.operatorname || '');
          setEmpcode(data.empcode || '');
          setEmpgrp(data.empgrp ? String(data.empgrp) : '');
          setContactno(data.contactno || '');
          setAddharno(data.addharno || '');
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

    if (!operatorname.trim() || !empcode.trim() || !contactno.trim() || !empgrp) {
      setErrorMessage('Please Enter * Mandatory Fields');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const url = isEdit ? `/api/masters/employees/${id}` : '/api/masters/employees';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          operatorname,
          empcode,
          empgrp,
          contactno,
          addharno,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Error saving employee');
        return;
      }

      navigate('/masters/employee');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setOperatorname('');
    setEmpcode('');
    setEmpgrp('');
    setContactno('');
    setAddharno('');
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
        title="Employee Master"
        onSubmit={handleSubmit}
        onClear={handleClear}
        exitPath="/masters/employee"
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
              Employee Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={operatorname}
              onChange={(e) => setOperatorname(e.target.value)}
              autoFocus
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>
              Employee Code <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={empcode}
              onChange={(e) => setEmpcode(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>
              Employee Group <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              value={empgrp}
              onChange={(e) => setEmpgrp(e.target.value)}
              style={inputStyle}
            >
              <option value="">--Select--</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.ledgrpname}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>
              Contact No. <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={contactno}
              onChange={(e) => setContactno(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Aadhar No.</label>
            <input
              type="text"
              value={addharno}
              onChange={(e) => setAddharno(e.target.value)}
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
