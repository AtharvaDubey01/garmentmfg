import React, { useMemo, useState } from 'react';
import { ExportButtons } from '../../components/common/ExportButtons';
import type { ExportColumn } from '../../utils/exportUtils';
import { sumOf } from '../../utils/reportTotals';
import { BalanceFilters, cardStyle, fmt, num, tdStyle, thStyle, useLotBalance } from './balanceShared';

// Lot Balance Sheet (Balance Reports): like the process BALANCE sheets in Excel.
// One block per lot: each operation with Previous months / This month / Balance / Rate /
// Amount = (Previous + This month) x Rate,
// then the lot's total line (its operation rows added up; Total Cut = the lot's cut, Balance left empty),
// then the grand total (all lots' total lines added up).

export const LotBalanceSheet: React.FC = () => {
  const f = useLotBalance();
  const [search, setSearch] = useState('');

  // Search: lot no., lot details or an operation name (the whole lot stays together)
  const lots = useMemo(() => {
    const all = f.data?.lots || [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (l) => l.lotno.toLowerCase().includes(q) || l.details.toLowerCase().includes(q) || l.steps.some((s) => s.operation.toLowerCase().includes(q))
    );
  }, [f.data, search]);

  // Grand total: every lot's total line added up (only the lots shown after the search)
  const grand = {
    cutqty: sumOf(lots, (l) => l.cutqty),
    previous: sumOf(lots, (l) => l.total.previous),
    current: sumOf(lots, (l) => l.total.current),
    rate: sumOf(lots, (l) => l.total.rate),
    amount: sumOf(lots, (l) => l.total.amount),
  };

  // Exports: every operation row, then the lot's total line, then the grand total (like the Excel sheet)
  const exportRows = lots.flatMap((l) => [
    ...l.steps.map((s) => ({
      lotno: l.lotno, details: l.details, stepno: s.stepno ?? '', operation: s.operation, cutqty: String(l.cutqty),
      previous: String(s.previous), current: String(s.current), balance: String(s.balance), rate: s.rate.toFixed(2), amount: s.amount.toFixed(2),
    })),
    {
      lotno: l.lotno, details: '', stepno: '', operation: 'LOT TOTAL', cutqty: String(l.cutqty),
      previous: String(l.total.previous), current: String(l.total.current), balance: '',
      rate: l.total.rate.toFixed(2), amount: l.total.amount.toFixed(2),
    },
  ]);
  const exportColumns: ExportColumn[] = [
    { header: 'Lot No.', key: 'lotno', align: 'left' },
    { header: 'Product Details', key: 'details' },
    { header: 'Step', key: 'stepno', align: 'left' },
    { header: 'Operation', key: 'operation' },
    { header: 'Total Cut', key: 'cutqty', align: 'right' },
    { header: 'Previous', key: 'previous', align: 'right' },
    { header: 'This Month', key: 'current', align: 'right' },
    { header: 'Balance', key: 'balance', align: 'right' },
    { header: 'Rate', key: 'rate', align: 'right' },
    { header: 'Amount', key: 'amount', align: 'right' },
  ];
  const exportTotal = {
    lotno: 'Total', details: `${lots.length} lot${lots.length === 1 ? '' : 's'}`, stepno: '', operation: '',
    cutqty: String(grand.cutqty), previous: String(grand.previous), current: String(grand.current), balance: '',
    rate: grand.rate.toFixed(2), amount: grand.amount.toFixed(2),
  };

  const balanceCell = (b: number) =>
    b === 0 ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>0 ✓</span> : <span style={{ color: b < 0 ? 'var(--danger)' : undefined }}>{fmt(b)}</span>;

  return (
    <div className="fill-screen" style={cardStyle}>
      <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 20px' }}>Lot Balance Sheet</h2>

      {f.error && (
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: '8px', marginBottom: '14px', fontSize: '14px' }}>
          {f.error}
        </div>
      )}

      <BalanceFilters f={f} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
        <ExportButtons
          reportName="Lot Balance Sheet"
          subtitle={`${f.data?.month || ''} ${f.data?.year || ''} · ${f.processName}`.trim()}
          filename={`Lot_Balance_Sheet_${f.data?.year || ''}_${f.data?.month || ''}`}
          columns={exportColumns}
          data={exportRows}
          totalRow={exportRows.length ? exportTotal : undefined}
          orientation="landscape"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', color: '#555555' }}>Search:</label>
          <input
            type="text"
            value={search}
            placeholder="Lot, style or operation"
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '8px', width: '200px', outline: 'none' }}
          />
        </div>
      </div>

      <div className="table-box" style={{ width: '100%', overflowX: 'auto', borderBottom: '1px solid #dee2e6' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={thStyle}>Lot No.</th>
              <th style={thStyle}>Product Details</th>
              <th style={thStyle}>Step</th>
              <th style={thStyle}>Operation</th>
              <th style={{ ...thStyle, ...num }}>Total Cut</th>
              <th style={{ ...thStyle, ...num }}>Previous</th>
              <th style={{ ...thStyle, ...num }}>This Month</th>
              <th style={{ ...thStyle, ...num }}>Balance</th>
              <th style={{ ...thStyle, ...num }}>Rate</th>
              <th style={{ ...thStyle, ...num }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {f.loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>Loading Lot Balance Sheet...</td>
              </tr>
            ) : lots.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: '#777777' }}>
                  {search.trim() ? 'No matching lots' : 'No lots with work or pieces left for this month'}
                </td>
              </tr>
            ) : (
              lots.map((l) => (
                <React.Fragment key={l.lotno}>
                  {l.steps.map((s, i) => (
                    <tr key={`${l.lotno}-${i}`} style={{ borderTop: i === 0 ? '2px solid #dee2e6' : '1px solid #f0f1f3' }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{i === 0 ? l.lotno : ''}</td>
                      <td style={{ ...tdStyle, maxWidth: '260px' }}>{i === 0 ? l.details : ''}</td>
                      <td style={tdStyle}>{s.stepno ?? ''}</td>
                      <td style={tdStyle}>{s.operation}</td>
                      <td style={{ ...tdStyle, ...num }}>{fmt(l.cutqty)}</td>
                      <td style={{ ...tdStyle, ...num }}>{fmt(s.previous)}</td>
                      <td style={{ ...tdStyle, ...num, fontWeight: s.current > 0 ? 600 : 400 }}>{fmt(s.current)}</td>
                      <td style={{ ...tdStyle, ...num }}>{balanceCell(s.balance)}</td>
                      <td style={{ ...tdStyle, ...num }}>{s.rate.toFixed(2)}</td>
                      <td style={{ ...tdStyle, ...num }}>{fmt(s.amount, 2)}</td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: 'var(--primary-soft)', fontWeight: 700 }}>
                    <td colSpan={4} style={tdStyle}>Lot {l.lotno} total</td>
                    <td style={{ ...tdStyle, ...num }}>{fmt(l.cutqty)}</td>
                    <td style={{ ...tdStyle, ...num }}>{fmt(l.total.previous)}</td>
                    <td style={{ ...tdStyle, ...num }}>{fmt(l.total.current)}</td>
                    <td style={tdStyle}></td>
                    <td style={{ ...tdStyle, ...num }}>{l.total.rate.toFixed(2)}</td>
                    <td style={{ ...tdStyle, ...num }}>{fmt(l.total.amount, 2)}</td>
                  </tr>
                </React.Fragment>
              ))
            )}
          </tbody>
          {!f.loading && lots.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} style={tdStyle}>
                  Total · {lots.length} lot{lots.length === 1 ? '' : 's'}
                </td>
                <td style={{ ...tdStyle, ...num }}>{fmt(grand.cutqty)}</td>
                <td style={{ ...tdStyle, ...num }}>{fmt(grand.previous)}</td>
                <td style={{ ...tdStyle, ...num }}>{fmt(grand.current)}</td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, ...num }}>{grand.rate.toFixed(2)}</td>
                <td style={{ ...tdStyle, ...num }}>{fmt(grand.amount, 2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
