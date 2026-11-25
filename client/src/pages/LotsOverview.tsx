import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Home page: how many lots are open and how many are closed.
// Clicking a number opens Job Order Booking showing only those lots (?status=open / ?status=closed).

export const LotsOverview: React.FC = () => {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<{ open: number; closed: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/transactions/job-orders', { credentials: 'include' })
      .then(async (res) => {
        const lots = await res.json();
        if (!res.ok) throw new Error(lots.message || 'Failed to load lots');
        const closed = lots.filter((l: any) => String(l.lotclosed || 'No').toLowerCase() === 'yes').length;
        setCounts({ open: lots.length - closed, closed });
      })
      .catch((err) => setError(err.message));
  }, []);

  const tile = (label: string, value: number | undefined, status: 'open' | 'closed') => (
    <button
      type="button"
      onClick={() => navigate(`/transactions/job-order?status=${status}`)}
      title={`Show ${status} lots in Job Order Booking`}
      style={{
        flex: '1 1 220px',
        padding: '22px',
        borderRadius: '12px',
        border: `1px solid ${status === 'open' ? '#fbd3bf' : '#e2e8f0'}`,
        borderLeft: `6px solid ${status === 'open' ? 'var(--primary)' : '#94a3b8'}`,
        backgroundColor: '#ffffff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: '2.4rem', fontWeight: 700, color: status === 'open' ? 'var(--primary)' : '#475569', lineHeight: 1.2 }}>
        {value ?? '…'}
      </div>
      <div style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 600 }}>View in Job Order Booking →</div>
    </button>
  );

  if (error) {
    return <div style={{ marginTop: '24px', textAlign: 'center', color: 'var(--danger)' }}>{error}</div>;
  }

  return (
    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '24px' }}>
      {tile('Open Lots', counts?.open, 'open')}
      {tile('Closed Lots', counts?.closed, 'closed')}
    </div>
  );
};
