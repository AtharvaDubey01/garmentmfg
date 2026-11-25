import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { Link } from 'react-router-dom';
import { LotsOverview } from './LotsOverview';

export const HomePage: React.FC = () => {
  const { user, can } = useAuth();
  const branding = useBranding();

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 0' }}>
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          padding: '36px',
          boxShadow: 'var(--shadow-card)',
          textAlign: 'center',
        }}
      >
        <img
          src={branding.logoUrl}
          alt={branding.displayName}
          style={{ maxHeight: '96px', maxWidth: '100%', objectFit: 'contain', marginBottom: '18px' }}
        />

        {/* only the logo and the company's name: nothing about what the program is */}
        {branding.companyName && (
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 600,
              color: 'var(--text-heading)',
              margin: '0 0 24px 0',
            }}
          >
            {branding.companyName}
          </h1>
        )}

        <div
          style={{
            display: 'inline-block',
            backgroundColor: 'var(--primary-soft)',
            border: '1px solid var(--primary)',
            borderRadius: '20px',
            padding: '6px 16px',
            color: 'var(--primary)',
            fontWeight: 600,
            fontSize: '0.9rem',
            marginBottom: '36px',
          }}
        >
          Logged in as: {user?.name} ({user?.username}){user?.isAdmin ? ' · Admin' : ''}
        </div>

        {/* Quick Shortcuts */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '20px',
            textAlign: 'left',
          }}
        >
          {can('masters.employee', 'view') && <div style={cardStyle}>
            <h3 style={cardTitleStyle}>Masters</h3>
            <p style={cardTextStyle}>Manage Employee Groups, Employees, Units, Products & Operations</p>
            <Link to="/masters/employee" style={cardLinkStyle}>Open Employees →</Link>
          </div>}

          {can('transactions.jobOrder', 'view') && <div style={cardStyle}>
            <h3 style={cardTitleStyle}>Transactions</h3>
            <p style={cardTextStyle}>Job Order Booking, Lot Mapping & Daily Process Entries</p>
            <Link to="/transactions/job-order" style={cardLinkStyle}>Job Orders →</Link>
          </div>}

          {can('reports.salary', 'view') && <div style={cardStyle}>
            <h3 style={cardTitleStyle}>Reports</h3>
            <p style={cardTextStyle}>Process Work, Daily Process, Salary & Lot Group Quantities</p>
            <Link to="/reports/salary" style={cardLinkStyle}>Salary Report →</Link>
          </div>}
        </div>
      </div>

      {/* Open and closed lots (needs View on Job Order Booking) */}
      {can('transactions.jobOrder', 'view') && <LotsOverview />}
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 600,
  color: 'var(--primary)',
  margin: '0 0 8px 0',
};

const cardTextStyle: React.CSSProperties = {
  fontSize: '0.88rem',
  color: 'var(--text-main)',
  margin: '0 0 16px 0',
  lineHeight: 1.4,
};

const cardLinkStyle: React.CSSProperties = {
  color: 'var(--primary)',
  fontWeight: 600,
  fontSize: '0.9rem',
  textDecoration: 'none',
};
