import React from 'react';
import { useLocation } from 'react-router-dom';

export const PlaceholderPage: React.FC<{ title?: string; phase?: string }> = ({
  title,
  phase,
}) => {
  const location = useLocation();
  const pageName = title || location.pathname.split('/').pop()?.replace(/-/g, ' ').toUpperCase() || 'Page';

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 0' }}>
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          padding: '40px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 500,
            color: 'var(--text-main)',
            margin: '0 0 12px 0',
          }}
        >
          {pageName}
        </h1>
        <p style={{ color: '#888', fontSize: '1rem', marginBottom: '24px' }}>
          This screen is scheduled for implementation in {phase || 'upcoming phases'}.
        </p>
        <div
          style={{
            display: 'inline-block',
            backgroundColor: '#f8f9fa',
            border: '1px solid var(--border-color)',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            color: '#666',
          }}
        >
          Route: <code>{location.pathname}</code>
        </div>
      </div>
    </div>
  );
};
