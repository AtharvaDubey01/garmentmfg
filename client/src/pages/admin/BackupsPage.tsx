import React, { useState } from 'react';

// Admin > Backups (admins only). The app makes a complete backup by itself every day and keeps
// six months of them on the server. This page is for keeping ONE complete copy in your own hands:
// click "Download full backup" to get a single file with the whole database. Keep it safe, or
// load it into another installation later with "GarmentMFGSupport.exe import".

export const BackupsPage: React.FC = () => {
  const [working, setWorking] = useState(false);

  const downloadFull = () => {
    // the server makes a fresh complete backup and sends it as one file; it can take a few seconds
    setWorking(true);
    window.location.href = '/api/admin/backups/full';
    setTimeout(() => setWorking(false), 6000);
  };

  return (
    <div className="fill-screen" style={{ maxWidth: '720px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Backups</h1>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '6px', marginBottom: '22px' }}>
        GarmentMFG backs up the whole database automatically every day and keeps six months on this PC.
      </div>

      <div style={card}>
        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-heading)' }}>
          <i className="bi bi-shield-check" style={{ color: 'var(--primary)', marginRight: 8 }} />
          Keep a copy of everything
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, margin: '12px 0 20px' }}>
          This makes one complete backup file with all your data and saves it to your computer
          (for example onto a pendrive). It is a single file — keep it somewhere safe. The same file
          can be loaded into a fresh installation later.
        </p>
        <button type="button" onClick={downloadFull} disabled={working} style={primaryBtn}>
          <i className="bi bi-download" /> {working ? 'Preparing the file...' : 'Download full backup'}
        </button>
      </div>
    </div>
  );
};

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid var(--border-color)',
  borderRadius: '16px',
  boxShadow: 'var(--shadow-card)',
  padding: '26px 28px',
};
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: 'var(--primary)',
  color: '#ffffff',
  border: 'none',
  borderRadius: '10px',
  padding: '11px 22px',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(239, 122, 69, 0.35)',
};
