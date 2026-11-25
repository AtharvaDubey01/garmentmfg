import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDownIcon, ChevronRightIcon } from '../common/Icons';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { screenForPath } from '../../utils/screens';

// Left sidebar: company logo card on top, the menu in sections, the logged-in person + Logout at the bottom.
// Each page is shown only if the user may View it (Admin section: admins only).
// Icons are Bootstrap Icons (class names "bi bi-...").

interface MenuItem {
  name: string;
  path: string;
  icon: string;
}

interface MenuGroup {
  id: string;
  title: string;
  icon: string;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    id: 'master',
    title: 'Master',
    icon: 'bi-folder2-open',
    items: [
      { name: 'Company', path: '/masters/company', icon: 'bi-building' },
      { name: 'Employee Group', path: '/masters/employee-group', icon: 'bi-people' },
      { name: 'Employee', path: '/masters/employee', icon: 'bi-person-badge' },
      { name: 'Unit', path: '/masters/unit', icon: 'bi-rulers' },
      { name: 'Product Group', path: '/masters/product-group', icon: 'bi-collection' },
      { name: 'Product', path: '/masters/product', icon: 'bi-box-seam' },
      { name: 'Process Master', path: '/masters/process-master', icon: 'bi-diagram-3' },
      { name: 'Operations', path: '/masters/operations', icon: 'bi-gear-wide-connected' },
    ],
  },
  {
    id: 'transactions',
    title: 'Transactions',
    icon: 'bi-arrow-repeat',
    items: [
      { name: 'Job Order Booking', path: '/transactions/job-order', icon: 'bi-journal-text' },
      { name: 'Lot Operation Map', path: '/transactions/lot-operation-map', icon: 'bi-signpost-split' },
      { name: 'Material Issue', path: '/transactions/material-issue', icon: 'bi-arrow-left-right' },
      { name: 'Daily Process Entry', path: '/transactions/daily-process-entry', icon: 'bi-calendar3' },
      { name: 'Lot Operation Print', path: '/transactions/lot-operation-print', icon: 'bi-printer' },
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    icon: 'bi-bar-chart-line',
    items: [
      { name: 'Process Work Report', path: '/reports/process-work', icon: 'bi-bar-chart' },
      { name: 'Daily Process Report', path: '/reports/daily-process', icon: 'bi-calendar-week' },
      { name: 'Salary Report', path: '/reports/salary', icon: 'bi-cash-coin' },
      { name: 'Lotwise Groupwise Qty Report', path: '/reports/lot-group-qty', icon: 'bi-grid-3x3-gap' },
      // Balance Reports (new section)
      { name: 'Lot Balance Sheet', path: '/balance/lot-balance', icon: 'bi-journal-check' },
      { name: 'Lot Summary', path: '/balance/lot-summary', icon: 'bi-clipboard-data' },
    ],
  },
  {
    id: 'utility',
    title: 'Utility',
    icon: 'bi-tools',
    items: [
      { name: 'Update Attendance', path: '/utility/update-attendance', icon: 'bi-person-check' },
      { name: 'Spine Attendance Excel', path: '/utility/spine-attendance', icon: 'bi-file-earmark-spreadsheet' },
    ],
  },
  {
    id: 'admin',
    title: 'Admin', // admins only
    icon: 'bi-person-gear',
    items: [
      { name: 'Create Login', path: '/admin/logins', icon: 'bi-shield-lock' },
      { name: 'Backups', path: '/admin/backups', icon: 'bi-database-down' },
      { name: 'Company Branding', path: '/admin/branding', icon: 'bi-building' },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, can, logout } = useAuth();
  const branding = useBranding();

  // Only the pages this user may see (View right); the Admin section only for admins.
  const visibleGroups = MENU_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (group.id === 'admin') return !!user?.isAdmin;
      const screen = screenForPath(item.path);
      return !screen || can(screen, 'view');
    }),
  })).filter((group) => group.items.length > 0);

  // Which section is open: the one of the current page (one section open at a time)
  const getInitialOpen = () => {
    const path = location.pathname;
    if (path.startsWith('/masters')) return 'master';
    if (path.startsWith('/transactions')) return 'transactions';
    if (path.startsWith('/reports')) return 'reports';
    if (path.startsWith('/balance')) return 'reports'; // Balance Reports (new section) sit in Reports
    if (path.startsWith('/utility')) return 'utility';
    if (path.startsWith('/admin')) return 'admin';
    return 'master'; // Default expanded group
  };

  const [openGroup, setOpenGroup] = useState<string | null>(getInitialOpen());

  const toggleGroup = (groupId: string) => {
    setOpenGroup(openGroup === groupId ? null : groupId);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = (user?.name || user?.username || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const linkStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    margin: '2px 0',
    borderRadius: '10px',
    fontSize: '0.88rem',
    fontWeight: isActive ? 600 : 500,
    color: isActive ? 'var(--text-heading)' : 'var(--text-main)',
    backgroundColor: isActive ? '#ffffff' : 'transparent',
    border: `1px solid ${isActive ? 'var(--border-color)' : 'transparent'}`,
    boxShadow: isActive ? 'var(--shadow-card)' : 'none',
    textDecoration: 'none',
  });

  return (
    <aside
      style={{
        width: '256px',
        minWidth: '256px',
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 14px',
        backgroundColor: 'var(--bg-light)',
        borderRight: '1px solid var(--border-color)',
      }}
    >
      {/* 1. Company logo card */}
      <NavLink
        to="/"
        style={{
          display: 'block',
          backgroundColor: '#ffffff',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '8px',
          boxShadow: 'var(--shadow-card)',
          marginBottom: '14px',
        }}
        title="Home"
      >
        <img src={branding.logoUrl} alt={branding.displayName} style={{ display: 'block', width: '100%', maxHeight: '110px', objectFit: 'contain' }} />
      </NavLink>

      {/* 2. Menu (scrolls if it's taller than the screen) */}
      <nav style={{ flex: 1, overflowY: 'auto', paddingRight: '2px' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, padding: '6px 12px 4px' }}>Main Menu</div>
        <NavLink to="/" end style={({ isActive }) => linkStyle(isActive)}>
          <i className="bi bi-house" style={iconStyle} />
          Home
        </NavLink>

        {visibleGroups.map((group) => {
          const isOpen = openGroup === group.id;
          return (
            <div key={group.id}>
              {/* Section title (click to open / close): same size and font as the pages under it */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                style={{
                  ...linkStyle(false),
                  width: '100%',
                  background: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: isOpen ? 'var(--primary)' : 'var(--text-main)',
                }}
              >
                <i className={`bi ${group.icon}`} style={iconStyle} />
                <span style={{ flex: 1 }}>{group.title}</span>
                <span style={{ color: isOpen ? 'var(--primary)' : 'var(--text-muted)', display: 'flex' }}>
                  {isOpen ? <ChevronDownIcon size={10} /> : <ChevronRightIcon size={10} />}
                </span>
              </button>

              {/* the section's pages, a little indented with a thin guide line */}
              {isOpen && (
                <div style={{ margin: '2px 0 6px 21px', paddingLeft: '8px', borderLeft: '1px solid var(--border-color)' }}>
                  {group.items.map((item) => (
                    <NavLink key={item.path} to={item.path} style={({ isActive }) => linkStyle(isActive)}>
                      <i className={`bi ${item.icon}`} style={iconStyle} />
                      {item.name}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* 3. Logged-in person + Logout */}
      {user && (
        <div
          style={{
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            padding: '10px 12px',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <span
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-soft)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.85rem',
              flexShrink: 0,
            }}
          >
            {initials}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {user.username}
              {user.isAdmin ? ' · Admin' : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Logout"
            style={{
              background: 'none',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '6px 8px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            <i className="bi bi-box-arrow-right" />
          </button>
        </div>
      )}
    </aside>
  );
};

const iconStyle: React.CSSProperties = { fontSize: '1rem', width: '18px', textAlign: 'center', color: 'inherit' };
