import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { name: '', account_type: 'bank', bank_name: '', account_number: '', iban: '', currency: 'AED', opening_balance: 0, is_active: true, notes: '' };
const EMPTY_TXN = { txn_date: today(), description: '', amount: 0, reference: '', counterparty_account_id: '' };

export default function BankAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [coa, setCoa] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [openAccount, setOpenAccount] = useState(null);
  const [txns, setTxns] = useState([]);
  const [txnForm, setTxnForm] = useState(EMPTY_TXN);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        api.get('/api/accounting/bank-accounts'),
        api.get('/api/accounting/accounts'),
      ]);
      setAccounts(a.data); setCoa(b.data);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openTxns = async (acc) => {
    setOpenAccount(acc);
    try {
      const { data } = await api.get(`/api/accounting/bank-accounts/${acc.id}/transactions`);
      setTxns(data);
    } catch { setTxns([]); }
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/accounting/bank-accounts', { ...form, opening_balance: parseFloat(form.opening_balance) || 0 });
      toast.success('Account added');
      setShowForm(false); setForm(EMPTY); load();
    } catch (e2) { toast.error(e2.response?.data?.detail || 'Failed'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this account?')) return;
    try { await api.delete(`/api/accounting/bank-accounts/${id}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const addTxn = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/accounting/bank-transactions', {
        ...txnForm,
        bank_account_id: openAccount.id,
        amount: parseFloat(txnForm.amount) || 0,
        counterparty_account_id: txnForm.counterparty_account_id ? parseInt(txnForm.counterparty_account_id) : null,
      });
      toast.success('Transaction added');
      setTxnForm(EMPTY_TXN);
      openTxns(openAccount); load();
    } catch (e2) { toast.error(e2.response?.data?.detail || 'Failed'); }
  };

  const deleteTxn = async (id) => {
    if (!confirm('Delete transaction?')) return;
    try { await api.delete(`/api/accounting/bank-transactions/${id}`); openTxns(openAccount); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="p-6 md:p-7">
      <div className="mb-5 flex items-center justify-between">
        <div><h1 className="page-title">Bank & Cash Accounts</h1><p className="page-subtitle">Each account auto-mirrors a CoA asset account.</p></div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Add Account'}</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="card p-4 mb-5 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2"><label className="label">Name</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Type</label>
            <select className="input" value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })}>
              <option value="bank">Bank</option><option value="cash">Cash</option><option value="credit_card">Credit card</option>
            </select>
          </div>
          <div><label className="label">Currency</label><input className="input" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} /></div>
          <div><label className="label">Bank name</label><input className="input" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} /></div>
          <div><label className="label">Account number</label><input className="input" value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} /></div>
          <div><label className="label">IBAN</label><input className="input" value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value })} /></div>
          <div><label className="label">Opening balance</label><input className="input" type="number" step="0.01" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value })} /></div>
          <div className="md:col-span-4"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="md:col-span-4 flex justify-end"><button className="btn btn-primary">Save</button></div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? <div className="text-[var(--text-muted)] text-sm">Loading…</div>
        : accounts.length === 0 ? <div className="text-[var(--text-muted)] text-sm">No accounts yet.</div>
        : accounts.map(b => (
          <div key={b.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-base font-semibold">{b.name}</div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{b.account_type} · {b.bank_name || ''}</div>
              </div>
              <span className="badge badge-neutral">{b.currency}</span>
            </div>
            <div className="text-2xl font-bold mt-2">AED {(b.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <div className="text-[11px] text-[var(--text-muted)]">CoA {b.coa_account_code} · {b.coa_account_name}</div>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-sm btn-outline" onClick={() => openTxns(b)}>Transactions</button>
              <button className="btn btn-sm btn-danger" onClick={() => remove(b.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {openAccount && (
        <div className="modal-overlay" onClick={() => setOpenAccount(null)}>
          <div onClick={e => e.stopPropagation()} className="modal p-5 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-lg font-bold">{openAccount.name}</div>
                <div className="text-[12px] text-[var(--text-muted)]">{openAccount.account_type} · current balance AED {(openAccount.current_balance || 0).toFixed(2)}</div>
              </div>
              <button onClick={() => setOpenAccount(null)} className="btn btn-ghost btn-sm">×</button>
            </div>

            <form onSubmit={addTxn} className="card p-3 mb-4 grid grid-cols-1 md:grid-cols-5 gap-2">
              <input className="input" type="date" value={txnForm.txn_date} onChange={e => setTxnForm({ ...txnForm, txn_date: e.target.value })} />
              <input className="input md:col-span-2" placeholder="Description" value={txnForm.description} onChange={e => setTxnForm({ ...txnForm, description: e.target.value })} />
              <input className="input" type="number" step="0.01" placeholder="Amount ± (+deposit/-withdrawal)" required value={txnForm.amount} onChange={e => setTxnForm({ ...txnForm, amount: e.target.value })} />
              <select className="input" value={txnForm.counterparty_account_id} onChange={e => setTxnForm({ ...txnForm, counterparty_account_id: e.target.value })}>
                <option value="">— auto category —</option>
                {coa.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </select>
              <div className="md:col-span-5 flex justify-end"><button className="btn btn-primary btn-sm">Add transaction</button></div>
            </form>

            <table className="data-table">
              <thead><tr>
                <th className="th">Date</th><th className="th">Description</th><th className="th">Category</th>
                <th className="th text-right">Amount</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {txns.length === 0 ? <tr><td colSpan={5} className="td text-center text-[var(--text-muted)]">No transactions yet.</td></tr>
                : txns.map(t => (
                  <tr key={t.id}>
                    <td className="td">{t.txn_date}</td>
                    <td className="td">{t.description || '—'}</td>
                    <td className="td text-[var(--text-muted)] text-xs">{t.counterparty_code} {t.counterparty_name}</td>
                    <td className={'td text-right font-mono ' + (t.amount >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>{t.amount.toFixed(2)}</td>
                    <td className="td text-right"><button className="btn btn-sm btn-danger" onClick={() => deleteTxn(t.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
