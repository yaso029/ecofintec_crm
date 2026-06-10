import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { useT } from '../../i18n/LocaleContext';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = {
  expense_date: today(), description: '', expense_account_id: '', bank_account_id: '',
  supplier_id: '', amount: 0, vat_rate: 5, currency: 'AED', payment_method: 'cash',
  reference: '', notes: '',
};

export default function Expenses() {
  const t = useT();
  const [items, setItems] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [banks, setBanks] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b, c, d] = await Promise.all([
        api.get('/api/accounting/expenses'),
        api.get('/api/accounting/accounts'),
        api.get('/api/accounting/bank-accounts'),
        api.get('/api/accounting/suppliers'),
      ]);
      setItems(a.data); setAccounts(b.data); setBanks(c.data); setSuppliers(d.data);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const expenseAccounts = accounts.filter(a => a.type === 'expense');

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/accounting/expenses', {
        ...form,
        expense_account_id: form.expense_account_id ? parseInt(form.expense_account_id) : null,
        bank_account_id: form.bank_account_id ? parseInt(form.bank_account_id) : null,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        amount: parseFloat(form.amount) || 0,
        vat_rate: parseFloat(form.vat_rate) || 0,
      });
      toast.success('Expense recorded');
      setShowForm(false); setForm(EMPTY); load();
    } catch (e2) { toast.error(e2.response?.data?.detail || 'Failed'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this expense? Its journal entry will be reversed.')) return;
    try { await api.delete(`/api/accounting/expenses/${id}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const totalNet = items.reduce((s, e) => s + (e.amount || 0), 0);
  const totalVat = items.reduce((s, e) => s + (e.vat_amount || 0), 0);
  const totalGross = items.reduce((s, e) => s + (e.total || 0), 0);

  return (
    <div className="p-6 md:p-7">
      <div className="mb-5 flex items-center justify-between">
        <div><h1 className="page-title">{t('Expenses')}</h1><p className="page-subtitle">{t('Direct cash/card spend — auto-posts to the ledger.')}</p></div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>{showForm ? t('Cancel') : t('+ Record Expense')}</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="stat-card"><div className="stat-label">{t('Net')}</div><div className="stat-value">AED {totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
        <div className="stat-card"><div className="stat-label">{t('VAT')}</div><div className="stat-value">AED {totalVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
        <div className="stat-card"><div className="stat-label">{t('Total spend')}</div><div className="stat-value">AED {totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
      </div>

      {showForm && (
        <form onSubmit={save} className="card p-4 mb-5 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><label className="label">Date</label><input className="input" type="date" required value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} /></div>
          <div className="md:col-span-3"><label className="label">Description</label><input className="input" required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div><label className="label">Expense account</label>
            <select className="input" value={form.expense_account_id} onChange={e => setForm({ ...form, expense_account_id: e.target.value })}>
              <option value="">— default Other Expenses —</option>
              {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </div>
          <div><label className="label">Paid from</label>
            <select className="input" value={form.bank_account_id} onChange={e => setForm({ ...form, bank_account_id: e.target.value })}>
              <option value="">— Cash on Hand —</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div><label className="label">Supplier (optional)</label>
            <select className="input" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">—</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="label">Method</label>
            <select className="input" value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
              <option value="cash">Cash</option><option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option>
            </select>
          </div>
          <div><label className="label">Amount (net)</label><input className="input" type="number" step="0.01" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
          <div><label className="label">VAT %</label><input className="input" type="number" step="0.01" value={form.vat_rate} onChange={e => setForm({ ...form, vat_rate: e.target.value })} /></div>
          <div><label className="label">Reference</label><input className="input" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
          <div className="md:col-span-4"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="md:col-span-4 flex justify-end"><button className="btn btn-primary">Save</button></div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr>
            <th className="th">Date</th><th className="th">Description</th><th className="th">Account</th>
            <th className="th">Paid from</th><th className="th text-right">Net</th>
            <th className="th text-right">VAT</th><th className="th text-right">Total</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="td text-center text-[var(--text-muted)]">Loading…</td></tr>
            : items.length === 0 ? <tr><td colSpan={8} className="td text-center text-[var(--text-muted)]">No expenses yet.</td></tr>
            : items.map(e => (
              <tr key={e.id}>
                <td className="td">{e.expense_date}</td>
                <td className="td">{e.description}</td>
                <td className="td text-[var(--text-muted)] text-xs">{e.expense_account_code} {e.expense_account_name}</td>
                <td className="td">{e.bank_account_name || 'Cash'}</td>
                <td className="td text-right font-mono">{(e.amount || 0).toFixed(2)}</td>
                <td className="td text-right font-mono">{(e.vat_amount || 0).toFixed(2)}</td>
                <td className="td text-right font-mono font-semibold">{(e.total || 0).toFixed(2)}</td>
                <td className="td text-right"><button className="btn btn-sm btn-danger" onClick={() => remove(e.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
