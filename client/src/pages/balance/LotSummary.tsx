import React, { useMemo, useState } from 'react';
import { ExportButtons } from '../../components/common/ExportButtons';
import type { ExportColumn } from '../../utils/exportUtils';
import { sumOf } from '../../utils/reportTotals';
import { BalanceFilters, cardStyle, fmt, num, tdStyle, thStyle, useLotBalance } from './balanceShared';

// Lot Summary (Balance Reports): one line per lot = the lot's total line from the Lot Balance Sheet
// (its operation rows added up; Total Cut = the lot's cut; Amount = (Previous + This Month) x Rate).
// The Total line adds up all lots (Balance left empty there).

export const LotSummary: React.FC = () => {
  const f = useLotBalance();
  const [search, setSearch] = useState('');

  const lots = useMemo(() => {
    const all = f.data?.lots || [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((l) => l.lotno.toLowerCase().includes(q) || l.details.toLowerCase().includes(q));
  }, [f.data, search]);

  const total = {
    cutqty: sumOf(lots, (l) => l.cutqty),
    previous: sumOf(lots, (l) => l.total.previous),
    current: sumOf(lots, (l) => l.total.current),
    rate: sumOf(lots, (l) => l.total.rate),
    amount: sumOf(lots, (l) => l.total.amount),
  };

  const exportRows = lots.map((l) => ({
    lotno: l.lotno, details: l.details, cutqty: String(l.cutqty),
    previous: String(l.total.previous), current: String(l.total.current), balance: String(l.total.balance),
    rate: l.total.rate.toFixed(2), amount: l.total.amount.toFixed(2),
  }));
  const exportColumns: ExportColumn[] = [
    { header: 'Lot No.', key: 'lotno', align: 'left' },
    { header: 'Product Details', key: 'details' },
    { header: 'Total Cut', key: 'cutqty', align: 'right' },
    { header: 'Previous', key: 'previous', align: 'right' },
    { header: 'This Month', key: 'current', align: 'right' },
    { header: 'Balance', key: 'balance', align: 'right' },
    { header: 'Full Rate', key: 'rate', align: 'right' },
    { header: 'Amount', key: 'amount', align: 'right' },
  ];
  const exportTotal = {
    lotno: 'Total', details: `${lots.length} lot${lots.length === 1 ? '' : 's'}`, cutqty: String(total.cutqty),
    previous: String(total.previous), current: String(total.current), balance: '',
    rate: total.rate.toFixed(2), amount: total.amount.toFixed(2),
  };

  return (
    <div className="fill-screen" style={cardStyle}>
      <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 20px' }}>Lot Summary</h2>

      {f.error && (
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: '8px', marginBottom: '14px', fontSize: '14px' }}>
          {f.error}
        </div>
      )}

      <BalanceFilters f={f} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
        <ExportButtons
          reportName="Lot Summary"
          subtitle={`${f.data?.month || ''} ${f.data?.year || ''} · ${f.processName}`.trim()}
          filename={`Lot_Summary_${f.data?.year || ''}_${f.data?.month || ''}`}
          columns={exportColumns}
          data={exportRows}
          totalRow={exportRows.length ? exportTotal : undefined}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', color: '#555555' }}>Search:</label>
          <input
            type="text"
            value={search}
            placeholder="Lot or style"
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '8px', width: '180px', outline: 'none' }}
          />
        </div>
      </div>

      <div className="table-box" style={{ width: '100%', overflowX: 'auto', borderBottom: '1px solid #dee2e6' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={thStyle}>Lot No.</th>
              <th style={thStyle}>Product Details</th>
              <th style={{ ...thStyle, ...num }}>Total Cut</th>
              <th style={{ ...thStyle, ...num }}>Previous</th>
              <th style={{ ...thStyle, ...num }}>This Month</th>
              <th style={{ ...thStyle, ...num }}>Balance</th>
              <th style={{ ...thStyle, ...num }} title="All operation rates of the lot added up">Full Rate</th>
              <th style={{ ...thStyle, ...num }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {f.loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>Loading Lot Summary...</td>
              </tr>
            ) : lots.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>
                  {search.trim() ? 'No matching lots' : 'No lots with work or pieces left for this month'}
                </td>
              </tr>
            ) : (
              lots.map((l, idx) => (
                <tr key={l.lotno} style={{ backgroundColor: idx % 2 === 1 ? '#f9f9f9' : '#ffffff', borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{l.lotno}</td>
                  <td style={tdStyle}>{l.details}</td>
                  <td style={{ ...tdStyle, ...num }}>{fmt(l.cutqty)}</td>
                  <td style={{ ...tdStyle, ...num }}>{fmt(l.total.previous)}</td>
                  <td style={{ ...tdStyle, ...num, fontWeight: 600 }}>{fmt(l.total.current)}</td>
                  <td style={{ ...tdStyle, ...num }}>{fmt(l.total.balance)}</td>
                  <td style={{ ...tdStyle, ...num }}>{l.total.rate.toFixed(2)}</td>
                  <td style={{ ...tdStyle, ...num }}>{fmt(l.total.amount, 2)}</td>
                </tr>
              ))
            )}
          </tbody>
          {!f.loading && lots.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2} style={tdStyle}>Total · {lots.length} lot{lots.length === 1 ? '' : 's'}</td>
                <td style={{ ...tdStyle, ...num }}>{fmt(total.cutqty)}</td>
                <td style={{ ...tdStyle, ...num }}>{fmt(total.previous)}</td>
                <td style={{ ...tdStyle, ...num }}>{fmt(total.current)}</td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, ...num }}>{total.rate.toFixed(2)}</td>
                <td style={{ ...tdStyle, ...num }}>{fmt(total.amount, 2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
