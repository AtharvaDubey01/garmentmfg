import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { screenForPath } from '../../utils/screens';

/**
 * Is this page allowed for the logged-in user?
 *   Admin pages: admins only. A screen's page: needs View; its "/new" page also needs Create.
 * (The server checks every save/delete too; this just keeps people off pages they can't use.)
 */
function usePageAllowed(): boolean {
  const { user, can } = useAuth();
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin')) return !!user?.isAdmin;
  const screen = screenForPath(pathname);
  if (!screen) return true;
  if (!can(screen, 'view')) return false;
  if (pathname.endsWith('/new') && !can(screen, 'create')) return false;
  return true;
}

export const AppLayout: React.FC = () => {
  const allowed = usePageAllowed();
  const { displayName } = useBranding();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: 'var(--bg-light)' }}>
      {/* Sidebar: logo, menu, logged-in person + Logout */}
      <Sidebar />

      {/* Page content */}
      <main style={{ flex: 1, minWidth: 0, padding: '24px 28px 16px', overflowX: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>
          {allowed ? (
            <Outlet />
          ) : (
            <div
              style={{
                maxWidth: '520px',
                margin: '60px auto',
                textAlign: 'center',
                color: 'var(--text-muted)',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                padding: '36px 28px',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <i className="bi bi-lock" style={{ fontSize: '2rem', color: 'var(--primary)' }} />
              <h3 style={{ color: 'var(--text-heading)', margin: '10px 0 8px' }}>No access</h3>
              <p style={{ margin: 0 }}>You don't have the right to open this page. Ask an admin if you need it.</p>
            </div>
          )}
        </div>
        {/* 36px tall: counted in --page-chrome (index.css) */}
        <footer style={{ height: '36px', textAlign: 'right', fontSize: '0.78rem', lineHeight: '18px', color: 'var(--text-muted)', paddingTop: '18px' }}>
          © {displayName}. All Rights Reserved.
        </footer>
      </main>
    </div>
  );
};
