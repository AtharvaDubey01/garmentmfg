import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';

export const Login: React.FC = () => {
  const branding = useBranding(); // company name + logo (Admin > Company Branding)
  const [code, setCode] = useState(''); // username = Employee Code
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect target after successful login
  const from = (location.state as any)?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim() || !password.trim()) {
      setErrorMessage('Please enter your Employee Code and Password');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    const res = await login(code, password);

    if (res.success) {
      navigate(from, { replace: true });
    } else {
      setErrorMessage(res.message || 'Enter Correct Employee Code or Password');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 15% 20%, #ffe3d3 0%, rgba(255, 227, 211, 0) 45%), radial-gradient(circle at 85% 85%, #ffe9dd 0%, rgba(255, 233, 221, 0) 40%), var(--bg-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'var(--font-family)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '900px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '32px',
          alignItems: 'center',
        }}
      >
        {/* Left Side: Brand Logo */}
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <img
            src={branding.logoUrl}
            alt={branding.displayName}
            style={{ width: '100%', maxWidth: '340px', maxHeight: '180px', objectFit: 'contain', marginBottom: '20px' }}
          />
          {/* only the logo and the company's name: nothing about what the program is */}
          {branding.companyName && (
            <h2 style={{ color: 'var(--text-heading)', fontWeight: 700, fontSize: '1.6rem', margin: '8px 0' }}>{branding.companyName}</h2>
          )}
        </div>

        {/* Right Side: Login Card (Faithful to Login.aspx) */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '36px 32px',
            boxShadow: '0 10px 30px rgba(16, 24, 40, 0.08)',
            border: '1px solid var(--border-color)',
          }}
        >
          <h3
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              color: 'var(--text-heading)',
              margin: '0 0 24px 0',
              textAlign: 'center',
            }}
          >
            Sign In
          </h3>

          <form onSubmit={handleSubmit}>
            {/* Employee Code field (the username) */}
            <div style={{ marginBottom: '20px' }}>
              <label
                htmlFor="code"
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  marginBottom: '6px',
                }}
              >
                Employee Code
              </label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setErrorMessage('');
                }}
                placeholder="e.g. 101"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.95rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>

            {/* Password field */}
            <div style={{ marginBottom: '24px' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  marginBottom: '6px',
                }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage('');
                }}
                placeholder="Password"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.95rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>

            {/* Error Message Display matching Login.aspx */}
            {errorMessage && (
              <div
                className="has-danger"
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!submitting) (e.target as HTMLElement).style.backgroundColor = 'var(--primary-hover)';
              }}
              onMouseLeave={(e) => {
                if (!submitting) (e.target as HTMLElement).style.backgroundColor = 'var(--primary)';
              }}
            >
              {submitting ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
