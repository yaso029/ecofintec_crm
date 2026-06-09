import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [form, setForm] = useState({ code: '', name: '', type: 'expense', sub_type: '', parent_id: '', currency: 'AED' });

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/accounting/accounts'); setAccounts(data); }
    catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/accounting/accounts', { ...form, parent_id: form.parent_id || null });
      toast.success('Account added');
      setShowForm(false);
      setForm({ code: '', name: '', type: 'expense', sub_type: '', parent_id: '', currency: 'AED' });
      load();
    } catch (e2) {
      toast.error(e2.response?.data?.detail || 'Failed');
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this account?')) return;
    try { await api.delete(`/api/accounting/accounts/${id}`); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const filtered = accounts.filter(a =>
    (!filter || a.code.toLowerCase().includes(filter.toLowerCase()) || a.name.toLowerCase().includes(filter.toLowerCase())) &&
    (!typeFilter || a.type === typeFilter)
  );

  return (
    <div className="p-6 md:p-7">
      <div className="mb-5 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="page-title">Chart of Accounts</h1>
          <p className="page-subtitle">{accounts.length} accounts</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Add Account'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={save} className="card p-4 mb-5 grid grid-cols-1 md:grid-cols-6 gap-3">
          <div><label className="label">Code</label><input className="input" required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label">Name</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Type</label>
            <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Sub-type</label><input className="input" value={form.sub_type} onChange={e => setForm({ ...form, sub_type: e.target.value })} placeholder="optional" /></div>
          <div><label className="label">Parent</label>
            <select className="input" value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })}>
              <option value="">— none —</option>
              {accounts.filter(a => a.type === form.type).map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-6 flex justify-end"><button type="submit" className="btn btn-primary">Save</button></div>
        </form>
      )}

      <div className="mb-3 flex gap-2 flex-wrap">
        <input className="input max-w-xs" placeholder="Search code or name…" value={filter} onChange={e => setFilter(e.target.value)} />
        <select className="input max-w-[180px]" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr>
            <th className="th">Code</th><th className="th">Name</th><th className="th">Type</th>
            <th className="th">Sub-type</th><th className="th text-right">Balance</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="td text-center text-[var(--text-muted)]">Loading…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={6} className="td text-center text-[var(--text-muted)]">No accounts. Click "Seed default chart" on the Accounting Dashboard to bootstrap.</td></tr>
            : filtered.map(a => (
              <tr key={a.id}>
                <td className="td font-mono">{a.code}</td>
                <td className="td">{a.name}</td>
                <td className="td"><span className="badge badge-neutral capitalize">{a.type}</span></td>
                <td className="td text-[var(--text-muted)]">{a.sub_type || '—'}</td>
                <td className="td text-right font-mono">{(a.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="td text-right"><button className="btn btn-sm btn-danger" onClick={() => remove(a.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
