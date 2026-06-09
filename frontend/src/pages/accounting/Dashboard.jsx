import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

export default function AccountingDashboard() {
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
    { label: 'Open Bills',         value: stats.open_bills,         sub: 'awaiting payment' },
    { label: 'Total Payables',     value: `AED ${stats.total_payables?.toLocaleString()}`, sub: 'outstanding to suppliers' },
    { label: 'Cash on Hand',       value: `AED ${stats.cash_on_hand?.toLocaleString()}`,   sub: 'across all bank/cash accounts' },
    { label: 'Suppliers',          value: stats.suppliers_count,    sub: 'active' },
    { label: 'Recorded Expenses',  value: stats.expenses_count,     sub: 'lifetime' },
    { label: 'Bank Accounts',      value: stats.bank_accounts_count, sub: 'active' },
  ] : [];

  return (
    <div className="p-6 md:p-7">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Accounting</h1>
          <p className="page-subtitle">Core bookkeeping — chart of accounts, expenses, bills, bank, journals & reports.</p>
        </div>
        <button onClick={bootstrap} disabled={bootstrapping} className="btn btn-outline">
          {bootstrapping ? 'Setting up…' : 'Seed default chart + VAT'}
        </button>
      </div>

      {loading ? (
        <div className="text-[var(--text-muted)] text-sm">Loading…</div>
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
        <div className="text-sm font-semibold mb-2">Getting started</div>
        <ol className="text-[13px] list-decimal pl-5 space-y-1 text-[var(--text-muted)]">
          <li>Click <b>Seed default chart + VAT</b> above to create a UAE chart of accounts.</li>
          <li>Add your <b>Bank & Cash</b> accounts with opening balances.</li>
          <li>Add <b>Suppliers</b> and record <b>Bills</b> + payments, or quick <b>Expenses</b> for cash spends.</li>
          <li>Review the <b>Reports</b> page — P&amp;L, Balance Sheet, Cash Flow — anytime.</li>
        </ol>
      </div>
    </div>
  );
}
