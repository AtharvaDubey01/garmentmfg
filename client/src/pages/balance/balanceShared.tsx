import React, { useCallback, useEffect, useState } from 'react';

// Shared by the two Balance Reports (Lot Balance Sheet and Lot Summary):
// the data types, the Year / Month / Process / Lot filters and loading GET /api/balance-reports/lot-balance.

export interface BalanceStep {
  stepno: number | null;
  operation: string;
  process: string;
  rate: number;
  previous: number; // pieces done in all months before the chosen month
  current: number; // pieces done in the chosen month
  balance: number; // cut - (previous + current): still to be done
  amount: number; // (previous + current) x rate: everything earned on this step so far
}

export interface BalanceLot {
  lotno: string;
  details: string;
  cutqty: number;
  closed: boolean;
  steps: BalanceStep[];
  // the lot's operation rows added up (Total Cut stays the lot's cutqty)
  total: {
    previous: number;
    current: number;
    balance: number; // shown in Lot Summary only (left empty on the Lot Balance Sheet total lines)
    rate: number; // full garment rate: all operation rates added up
    amount: number;
  };
}

export interface BalanceData {
  year: number;
  month: string;
  lots: BalanceLot[];
  totals: { cutqty: number; previous: number; current: number; rate: number; amount: number }; // all lots added up
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Filters + data for a Balance Report. Loads the current month when the page opens. */
export function useLotBalance() {
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [month, setMonth] = useState<string>(MONTHS[new Date().getMonth()]);
  const [process, setProcess] = useState<string>(''); // '' = all processes
  const [lot, setLot] = useState<string>(''); // '' = all lots
  const [processes, setProcesses] = useState<{ id: number; name: string }[]>([]);
  const [lots, setLots] = useState<{ lotno: string; details: string }[]>([]);
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetch('/api/balance-reports/processes', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((json) => setProcesses(json))
      .catch((err) => console.error('Failed to load processes:', err));
    fetch('/api/balance-reports/lots', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((json) => setLots(json))
      .catch((err) => console.error('Failed to load lots:', err));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ year: year.trim(), month });
      if (process) params.append('process', process);
      if (lot.trim()) params.append('lot', lot.trim());
      const res = await fetch(`/api/balance-reports/lot-balance?${params.toString()}`, { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `Server returned status ${res.status}`);
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error loading report');
      setData(null);
    } finally {
      setLoading(false);
    }
    // only the Search button reloads (not every key typed in the filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, process, lot]);

  // first load: the current month, all processes
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processName = processes.find((p) => String(p.id) === process)?.name || 'All Processes';

  return { year, setYear, month, setMonth, process, setProcess, lot, setLot, processes, lots, processName, data, loading, error, load };
}

const inputStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '14px',
  border: '1px solid #ced4da',
  borderRadius: '8px',
  outline: 'none',
  backgroundColor: '#ffffff',
};
const labelStyle: React.CSSProperties = { fontWeight: 700, fontSize: '14px', color: '#000000' };

/** Year, Month, Process, Lot (dropdown) and the Search button (same look as the other reports). */
export const BalanceFilters: React.FC<{ f: ReturnType<typeof useLotBalance> }> = ({ f }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <label style={labelStyle}>Year</label>
      <input type="text" value={f.year} onChange={(e) => f.setYear(e.target.value)} style={{ ...inputStyle, width: '80px' }} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <label style={labelStyle}>Month</label>
      <select value={f.month} onChange={(e) => f.setMonth(e.target.value)} style={{ ...inputStyle, width: '135px' }}>
        {MONTHS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <label style={labelStyle}>Process</label>
      <select value={f.process} onChange={(e) => f.setProcess(e.target.value)} style={{ ...inputStyle, width: '170px' }}>
        <option value="">All Processes</option>
        {f.processes.map((p) => (
          <option key={p.id} value={String(p.id)}>{p.name}</option>
        ))}
      </select>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <label style={labelStyle}>Lot No.</label>
      {/* lots from Lot Operation Map; the details show which order it is */}
      <select value={f.lot} onChange={(e) => f.setLot(e.target.value)} style={{ ...inputStyle, width: '200px' }}>
        <option value="">All Lots</option>
        {f.lots.map((l) => (
          <option key={l.lotno} value={l.lotno} title={l.details}>
            {l.details ? `${l.lotno} — ${l.details.replace(/^\[[^\]]*\]\s*/, '')}` : l.lotno}
          </option>
        ))}
      </select>
    </div>
    <button
      type="button"
      onClick={f.load}
      disabled={f.loading}
      style={{ backgroundColor: 'var(--primary)', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '6px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary)')}
    >
      {f.loading ? 'Searching...' : 'Search'}
    </button>
  </div>
);

/** Number with Indian digit grouping: 12,345 / 1,234.50 */
export const fmt = (n: number, decimals = 0) =>
  (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const cardStyle: React.CSSProperties = {
  padding: '24px 28px',
  backgroundColor: '#ffffff',
  color: 'var(--text-heading)',
  border: '1px solid var(--border-color)',
  borderRadius: '16px',
  boxShadow: 'var(--shadow-card)',
  maxWidth: '1400px',
  margin: '0 auto',
};
export const thStyle: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', fontWeight: 'bold', whiteSpace: 'nowrap' };
export const tdStyle: React.CSSProperties = { padding: '7px 10px', color: '#333333' };
export const num: React.CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap' };
