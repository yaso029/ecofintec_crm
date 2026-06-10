import { useEffect, useState } from 'react';
import api from '../../api';
import { useT } from '../../i18n/LocaleContext';

const startOfYear = () => `${new Date().getFullYear()}-01-01`;
const today = () => new Date().toISOString().slice(0, 10);

function fmt(n) { return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function Reports() {
  const t = useT();
  const [tab, setTab] = useState('pl');
  const [start, setStart] = useState(startOfYear());
  const [end, setEnd] = useState(today());
  const [pl, setPl] = useState(null);
  const [bs, setBs] = useState(null);
  const [cf, setCf] = useState(null);
  const [vat, setVat] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'pl') {
        const { data } = await api.get(`/api/accounting/reports/profit-loss?start=${start}&end=${end}`);
        setPl(data);
      } else if (tab === 'bs') {
        const { data } = await api.get(`/api/accounting/reports/balance-sheet?as_of=${end}`);
        setBs(data);
      } else if (tab === 'cf') {
        const { data } = await api.get(`/api/accounting/reports/cash-flow?start=${start}&end=${end}`);
        setCf(data);
      } else if (tab === 'vat') {
        const { data } = await api.get(`/api/accounting/reports/vat-return?start=${start}&end=${end}`);
        setVat(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, start, end]);

  return (
    <div className="p-6 md:p-7">
      <h1 className="page-title">{t('Reports')}</h1>
      <p className="page-subtitle mb-5">{t('Computed live from posted journal entries.')}</p>

      <div className="card p-3 mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <div className="flex gap-1">
            {[
              { key: 'pl', label: t('Profit & Loss') },
              { key: 'bs', label: t('Balance Sheet') },
              { key: 'cf', label: t('Cash Flow') },
              { key: 'vat', label: t('VAT Return') },
            ].map(tab2 => (
              <button key={tab2.key} onClick={() => setTab(tab2.key)}
                className={'btn btn-sm ' + (tab === tab2.key ? 'btn-primary' : 'btn-ghost')}>{tab2.label}</button>
            ))}
          </div>
        </div>
        {tab !== 'bs' && (
          <div><label className="label">{t('From')}</label><input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
        )}
        <div><label className="label">{tab === 'bs' ? t('As of') : t('To')}</label><input className="input" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
      </div>

      {loading && <div className="text-[var(--text-muted)] text-sm">Loading…</div>}

      {tab === 'pl' && pl && (
        <div className="card p-5 max-w-3xl">
          <div className="text-sm text-[var(--text-muted)] mb-4">Period {pl.period.start} → {pl.period.end}</div>
          <Section title="Income" rows={pl.income} total={pl.total_income} />
          <Section title="Expenses" rows={pl.expenses} total={pl.total_expenses} />
          <div className="border-t border-[var(--border)] mt-3 pt-3 flex justify-between text-base font-bold">
            <div>Net profit</div>
            <div className={pl.net_profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700'}>AED {fmt(pl.net_profit)}</div>
          </div>
        </div>
      )}

      {tab === 'bs' && bs && (
        <div className="card p-5 max-w-3xl">
          <div className="text-sm text-[var(--text-muted)] mb-4">As of {bs.as_of} {bs.is_balanced ? '· Balanced ✓' : '· ⚠ Not balanced'}</div>
          <Section title="Assets" rows={bs.assets} total={bs.total_assets} />
          <Section title="Liabilities" rows={bs.liabilities} total={bs.total_liabilities} />
          <Section title="Equity" rows={bs.equity} total={bs.total_equity} />
          <div className="border-t border-[var(--border)] mt-3 pt-3 flex justify-between text-base font-bold">
            <div>Liabilities + Equity</div><div>AED {fmt(bs.liabilities_plus_equity)}</div>
          </div>
        </div>
      )}

      {tab === 'cf' && cf && (
        <div className="card p-5 max-w-3xl">
          <div className="text-sm text-[var(--text-muted)] mb-4">Period {cf.period.start} → {cf.period.end}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Bucket label="Operating" amount={cf.operating} />
            <Bucket label="Investing" amount={cf.investing} />
            <Bucket label="Financing" amount={cf.financing} />
          </div>
          <div className="border-t border-[var(--border)] pt-3 flex justify-between text-base font-bold">
            <div>Net cash change</div><div>AED {fmt(cf.net_cash_change)}</div>
          </div>
          {cf.movements?.length > 0 && (
            <>
              <div className="field-section mt-5">Cash movements</div>
              <table className="data-table">
                <thead><tr><th className="th">Date</th><th className="th">Entry</th><th className="th">Memo</th><th className="th text-right">Cash Δ</th></tr></thead>
                <tbody>{cf.movements.map(m => (
                  <tr key={m.entry_id}>
                    <td className="td">{m.entry_date}</td>
                    <td className="td font-mono">{m.entry_number}</td>
                    <td className="td">{m.memo || '—'}</td>
                    <td className={'td text-right font-mono ' + (m.cash_delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700')}>{fmt(m.cash_delta)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === 'vat' && vat && (
        <div className="card p-5 max-w-3xl">
          <div className="text-sm text-[var(--text-muted)] mb-4">Period {vat.period.start} → {vat.period.end} · UAE FTA-style</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="stat-card">
              <div className="stat-label">Sales (taxable base)</div>
              <div className="stat-value">AED {fmt(vat.sales_base)}</div>
              <div className="text-[11px] text-[var(--text-muted)]">net revenue posted in period</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Purchases (taxable base)</div>
              <div className="stat-value">AED {fmt(vat.purchases_base)}</div>
              <div className="text-[11px] text-[var(--text-muted)]">net expenses posted in period</div>
            </div>
          </div>

          <table className="w-full text-sm mb-3">
            <tbody>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2">Output VAT (on sales)</td>
                <td className="py-2 text-right font-mono">AED {fmt(vat.output_vat)}</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2">Input VAT (on purchases)</td>
                <td className="py-2 text-right font-mono">− AED {fmt(vat.input_vat)}</td>
              </tr>
            </tbody>
          </table>

          <div className={'border-t border-[var(--border)] pt-3 flex items-center justify-between text-base font-bold ' +
            (vat.direction === 'due_to_fta' ? 'text-red-700' : vat.direction === 'refundable' ? 'text-emerald-700 dark:text-emerald-400' : '')}>
            <div>
              {vat.direction === 'due_to_fta' && 'Net VAT due to FTA'}
              {vat.direction === 'refundable' && 'Net VAT refundable'}
              {vat.direction === 'nil' && 'Net VAT (nil)'}
            </div>
            <div className="font-mono">AED {fmt(Math.abs(vat.net_vat_payable))}</div>
          </div>

          <div className="mt-4 text-[12px] text-[var(--text-muted)]">
            Output VAT comes from the <b>VAT Payable</b> account (2120) — credited when an invoice is sent.
            Input VAT comes from the <b>VAT Recoverable</b> account (1140) — debited on expenses and supplier bills.
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, rows, total }) {
  return (
    <div className="mb-4">
      <div className="field-section">{title}</div>
      {rows.length === 0 ? <div className="text-[12px] text-[var(--text-muted)] py-2">No activity.</div>
      : <table className="w-full text-sm">
          <tbody>{rows.map(r => (
            <tr key={(r.id || r.code) + r.code} className="border-b border-[var(--border)] last:border-0">
              <td className="py-1.5 pr-2 font-mono text-xs text-[var(--text-muted)]">{r.code}</td>
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-right font-mono">{fmt(r.amount)}</td>
            </tr>
          ))}</tbody>
        </table>}
      <div className="flex justify-between font-semibold mt-2 text-sm">
        <div>Total {title}</div><div className="font-mono">AED {fmt(total)}</div>
      </div>
    </div>
  );
}

function Bucket({ label, amount }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={'stat-value ' + (amount >= 0 ? '' : 'text-red-700')}>AED {fmt(amount)}</div>
    </div>
  );
}
