import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormPage } from '../../components/common/FormPage';

// Admin > Create Login > New / Edit
// Give an employee a login (username = their Employee Code), set the password,
// Admin / Active, and tick what they may do on each screen.
// The screens and rights come from the server (server/src/permissions.js).

interface Screen {
  key: string;
  group: string;
  name: string;
  actions: string[]; // view / create / edit / delete / print
  special?: { key: string; name: string }[];
}

interface EmployeeOption {
  id: number;
  empcode: string;
  operatorname: string;
  ledgrpname: string;
}

interface LoginOption {
  id: number;
  empcode: string;
  operatorname: string;
  rights: Rights;
}

type Rights = Record<string, string[]>; // { screenKey: ['view', 'create', ...] }

const ACTION_COLUMNS = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
  { key: 'print', label: 'Print / Export' },
];

/** Every right a screen has (normal actions + its special rights). */
const allRightsOf = (screen: Screen) => [...screen.actions, ...(screen.special || []).map((s) => s.key)];

export const LoginForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id && id !== 'new');
  const navigate = useNavigate();

  const [screens, setScreens] = useState<Screen[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [otherLogins, setOtherLogins] = useState<LoginOption[]>([]);

  const [empid, setEmpid] = useState('');
  const [employeeLabel, setEmployeeLabel] = useState(''); // shown when editing
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [rights, setRights] = useState<Rights>({});

  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Load the screens, the other logins (for "Copy rights from"), and either the login or the employees
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [screensRes, loginsRes] = await Promise.all([
          fetch('/api/admin/screens', { credentials: 'include' }),
          fetch('/api/admin/logins', { credentials: 'include' }),
        ]);
        setScreens(await screensRes.json());
        const logins: LoginOption[] = await loginsRes.json();
        setOtherLogins(logins.filter((l) => String(l.id) !== String(id)));

        if (isEdit) {
          const res = await fetch(`/api/admin/logins/${id}`, { credentials: 'include' });
          const login = await res.json();
          if (!res.ok) throw new Error(login.message || 'Failed to load login');
          setEmployeeLabel(`${login.operatorname} (${login.empcode}) — ${login.ledgrpname || ''}`);
          setPassword(login.password || '');
          setIsAdmin(login.isadmin === 'YES');
          setIsActive(login.isactive === 'YES');
          setRights(login.rights || {});
        } else {
          const res = await fetch('/api/admin/employees-without-login', { credentials: 'include' });
          setEmployees(await res.json());
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isEdit]);

  const has = (screenKey: string, right: string) => (rights[screenKey] || []).includes(right);

  /** Tick / untick one right. Any right needs View; removing View clears the whole row. */
  const toggle = (screen: Screen, right: string) => {
    setRights((prev) => {
      const current = new Set(prev[screen.key] || []);
      if (current.has(right)) {
        if (right === 'view') current.clear();
        else current.delete(right);
      } else {
        current.add(right);
        current.add('view');
      }
      return { ...prev, [screen.key]: allRightsOf(screen).filter((r) => current.has(r)) };
    });
    setErrorMessage('');
  };

  /** Tick / untick a whole row (every right of one screen). */
  const toggleRow = (screen: Screen) => {
    const all = allRightsOf(screen);
    const rowFull = all.every((r) => has(screen.key, r));
    setRights((prev) => ({ ...prev, [screen.key]: rowFull ? [] : all }));
  };

  /** Tick / untick a whole column (one action on every screen that has it). */
  const toggleColumn = (action: string) => {
    const withAction = screens.filter((s) => s.actions.includes(action));
    const columnFull = withAction.every((s) => has(s.key, action));
    setRights((prev) => {
      const next = { ...prev };
      for (const s of withAction) {
        const current = new Set(next[s.key] || []);
        if (columnFull) {
          if (action === 'view') current.clear();
          else current.delete(action);
        } else {
          current.add(action);
          current.add('view');
        }
        next[s.key] = allRightsOf(s).filter((r) => current.has(r));
      }
      return next;
    });
  };

  const copyFrom = (loginId: string) => {
    const source = otherLogins.find((l) => String(l.id) === loginId);
    if (source) setRights({ ...(source.rights || {}) });
  };

  const groups = useMemo(() => [...new Set(screens.map((s) => s.group))], [screens]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!isEdit && !empid) || !password.trim()) {
      setErrorMessage('Please Enter * Mandatory Fields');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch(isEdit ? `/api/admin/logins/${id}` : '/api/admin/logins', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ empid, password, isadmin: isAdmin, isactive: isActive, rights }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.message || 'Error saving login');
        return;
      }
      navigate('/admin/logins');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    if (!isEdit) setEmpid('');
    setPassword('');
    setIsAdmin(false);
    setIsActive(true);
    setRights({});
    setErrorMessage('');
  };

  return (
    <FormPage
      title="Create Login"
      onSubmit={handleSubmit}
      onClear={handleClear}
      exitPath="/admin/logins"
      loading={loading}
      isEdit={isEdit}
    >
      {errorMessage && (
        <div style={{ gridColumn: '1 / -1', color: 'var(--danger)', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center' }}>
          {errorMessage}
        </div>
      )}

      {/* Employee */}
      <div>
        <label style={labelStyle}>
          Employee <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        {isEdit ? (
          <input type="text" value={employeeLabel} disabled style={{ ...inputStyle, backgroundColor: '#e9ecef' }} />
        ) : (
          <select value={empid} onChange={(e) => { setEmpid(e.target.value); setErrorMessage(''); }} style={inputStyle}>
            <option value="">--Select Employee--</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.operatorname} ({emp.empcode}) — {emp.ledgrpname}
              </option>
            ))}
          </select>
        )}
        <small style={{ color: '#888' }}>Username = the employee's code. Only employees without a login are listed.</small>
      </div>

      {/* Password */}
      <div>
        <label style={labelStyle}>
          Password <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <input
          type="text"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErrorMessage(''); }}
          style={inputStyle}
          autoComplete="off"
        />
        <small style={{ color: '#888' }}>Visible to admins. Change it here if it leaks.</small>
      </div>

      {/* Admin / Active */}
      <div>
        <label style={labelStyle}>Login Type</label>
        <label style={checkLabelStyle}>
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> Admin (can do everything and manage logins)
        </label>
        <label style={checkLabelStyle}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active (untick when the person leaves)
        </label>
      </div>

      {/* Rights grid */}
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#333' }}>Rights</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Copy rights from</label>
            <select
              value=""
              onChange={(e) => copyFrom(e.target.value)}
              disabled={isAdmin}
              style={{ ...inputStyle, width: '240px', padding: '6px 10px' }}
            >
              <option value="">--Select Login--</option>
              {otherLogins.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.operatorname} ({l.empcode})
                </option>
              ))}
            </select>
          </div>
        </div>

        {isAdmin && (
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--primary-soft)', color: 'var(--primary-hover)', borderRadius: '8px', fontWeight: 600, fontSize: '0.88rem', marginBottom: '10px' }}>
            Admins can do everything, so the ticks below don't apply while "Admin" is ticked.
          </div>
        )}

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', opacity: isAdmin ? 0.5 : 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--info)', color: '#ffffff' }}>
                <th style={{ ...thStyle, textAlign: 'left' }}>Screen</th>
                {ACTION_COLUMNS.map((col) => (
                  <th key={col.key} style={thStyle}>
                    <button type="button" disabled={isAdmin} onClick={() => toggleColumn(col.key)} style={headerBtnStyle} title={`Tick / untick ${col.label} on every screen`}>
                      {col.label}
                    </button>
                  </th>
                ))}
                <th style={{ ...thStyle, textAlign: 'left' }}>Special</th>
                <th style={thStyle}>All</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <React.Fragment key={group}>
                  <tr>
                    <td colSpan={ACTION_COLUMNS.length + 3} style={{ padding: '8px 12px', fontWeight: 700, backgroundColor: '#f1f3f5', color: '#333' }}>
                      {group}
                    </td>
                  </tr>
                  {screens.filter((s) => s.group === group).map((screen) => (
                    <tr key={screen.key} style={{ borderBottom: '1px solid #e9ecef' }}>
                      <td style={{ padding: '7px 12px', paddingLeft: '24px' }}>{screen.name}</td>
                      {ACTION_COLUMNS.map((col) => (
                        <td key={col.key} style={{ textAlign: 'center' }}>
                          {screen.actions.includes(col.key) ? (
                            <input
                              type="checkbox"
                              disabled={isAdmin}
                              checked={has(screen.key, col.key)}
                              onChange={() => toggle(screen, col.key)}
                            />
                          ) : (
                            <span style={{ color: '#ccc' }}>–</span>
                          )}
                        </td>
                      ))}
                      <td style={{ padding: '7px 12px' }}>
                        {(screen.special || []).map((sp) => (
                          <label key={sp.key} style={{ display: 'block', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              disabled={isAdmin}
                              checked={has(screen.key, sp.key)}
                              onChange={() => toggle(screen, sp.key)}
                            />{' '}
                            {sp.name}
                          </label>
                        ))}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          disabled={isAdmin}
                          checked={allRightsOf(screen).every((r) => has(screen.key, r))}
                          onChange={() => toggleRow(screen)}
                          title="Tick / untick every right on this screen"
                        />
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <small style={{ color: '#888' }}>
          No View = the screen is hidden for this person. Ticking any other right also ticks View. Click a column title to tick it on every screen.
        </small>
      </div>
    </FormPage>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 'bold',
  color: '#000000',
  marginBottom: '6px',
  fontSize: '0.9rem',
};

const checkLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.88rem',
  marginBottom: '6px',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  fontSize: '0.95rem',
  outline: 'none',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
};

const thStyle: React.CSSProperties = {
  padding: '9px 10px',
  fontWeight: 600,
  textAlign: 'center',
};

const headerBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.88rem',
  textDecoration: 'underline dotted',
};
