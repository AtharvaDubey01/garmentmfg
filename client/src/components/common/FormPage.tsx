import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface FormPageProps {
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  exitPath?: string;
  loading?: boolean;
  isEdit?: boolean;
  children: React.ReactNode;
}

export const FormPage: React.FC<FormPageProps> = ({
  title,
  onSubmit,
  onClear,
  exitPath,
  loading = false,
  isEdit = false,
  children,
}) => {
  const navigate = useNavigate();

  const handleExit = () => {
    if (exitPath) {
      navigate(exitPath);
    } else {
      navigate(-1);
    }
  };

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
      {/* Title and note */}
      <div style={{ marginBottom: '18px' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
          {title}
        </h1>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
          {isEdit ? 'Edit the details and click Update' : 'Fill in the details and click Save'} · fields marked{' '}
          <span style={{ color: 'var(--danger)' }}>*</span> are required
        </div>
      </div>

      {/* Form card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          padding: '28px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <form onSubmit={onSubmit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '20px',
              marginBottom: '28px',
            }}
          >
            {children}
          </div>

          {/* Buttons: Save (main), Clear, Exit */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              paddingTop: '18px',
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <button
              type="button"
              disabled={loading}
              onClick={handleExit}
              style={secondaryBtnStyle}
            >
              Exit
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onClear}
              style={secondaryBtnStyle}
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ ...actionBtnStyle, backgroundColor: 'var(--primary)', color: '#ffffff', border: 'none', opacity: loading ? 0.7 : 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary)')}
            >
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const actionBtnStyle: React.CSSProperties = {
  minWidth: '100px',
  padding: '9px 22px',
  fontSize: '0.92rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  ...actionBtnStyle,
  backgroundColor: '#ffffff',
  color: 'var(--text-heading)',
  border: '1px solid var(--border-color)',
};
