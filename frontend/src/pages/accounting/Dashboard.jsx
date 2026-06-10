import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { useT } from '../../i18n/LocaleContext';

export default function AccountingDashboard() {
  const t = useT();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/accounting/reports/dashboard');
      setStats(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const bootstrap = async () => {
    setBootstrapping(true);
    try {
      const { data } = await api.post('/api/accounting/chart/bootstrap');
      toast.success(`Seeded ${data.created_accounts} accounts, ${data.created_tax_rates} tax rates.`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Bootstrap failed');
    }
    setBootstrapping(false);
  };

  const cards = stats ? [
    { label: t('Open Bills'),        value: stats.open_bills,         sub: t('awaiting payment') },
    { label: t('Total Payables'),    value: `AED ${stats.total_payables?.toLocaleString()}`, sub: t('outstanding to suppliers') },
    { label: t('Cash on Hand'),      value: `AED ${stats.cash_on_hand?.toLocaleString()}`,   sub: t('across all bank/cash accounts') },
    { label: t('Suppliers'),         value: stats.suppliers_count,    sub: t('active') },
    { label: t('Recorded Expenses'), value: stats.expenses_count,     sub: t('lifetime') },
    { label: t('Bank Accounts'),     value: stats.bank_accounts_count, sub: t('active') },
  ] : [];

  return (
    <div className="p-6 md:p-7">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">{t('Accounting')}</h1>
          <p className="page-subtitle">{t('Core bookkeeping — chart of accounts, expenses, bills, bank, journals & reports.')}</p>
        </div>
        <button onClick={bootstrap} disabled={bootstrapping} className="btn btn-outline">
          {bootstrapping ? t('Setting up…') : t('Seed default chart + VAT')}
        </button>
      </div>

      {loading ? (
        <div className="text-[var(--text-muted)] text-sm">{t('Loading…')}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(c => (
            <div key={c.label} className="stat-card">
              <div className="stat-label">{c.label}</div>
              <div className="stat-value">{c.value}</div>
              <div className="text-[11px] text-[var(--text-muted)]">{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 card p-5">
        <div className="text-sm font-semibold mb-2">{t('Getting started')}</div>
        <ol className="text-[13px] list-decimal ps-5 space-y-1 text-[var(--text-muted)]">
          <li>{t('Step 1: click "Seed default chart + VAT" above to create a UAE chart of accounts.')}</li>
          <li>{t('Step 2: add your Bank & Cash accounts with opening balances.')}</li>
          <li>{t('Step 3: add Suppliers and record Bills + payments, or quick Expenses for cash spends.')}</li>
          <li>{t('Step 4: review the Reports page — P&L, Balance Sheet, Cash Flow — anytime.')}</li>
        </ol>
      </div>
    </div>
  );
}
