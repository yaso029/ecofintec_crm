import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

export default function TaxRates() {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', rate: 0, type: 'both', is_active: true });

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/accounting/tax-rates'); setRates(data); }
    catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/accounting/tax-rates', { ...form, rate: parseFloat(form.rate) || 0 });
      toast.success('Saved');
      setShowForm(false);
      setForm({ code: '', name: '', rate: 0, type: 'both', is_active: true });
      load();
    } catch (e2) { toast.error(e2.response?.data?.detail || 'Failed'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this tax rate?')) return;
    try { await api.delete(`/api/accounting/tax-rates/${id}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="p-6 md:p-7">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="page-title">Tax Rates</h1>
          <p className="page-subtitle">VAT and other tax codes used on invoices, bills and expenses.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Add Tax Rate'}</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="card p-4 mb-5 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div><label className="label">Code</label><input className="input" required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="VAT5" /></div>
          <div className="md:col-span-2"><label className="label">Name</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Rate (%)</label><input className="input" type="number" step="0.01" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} /></div>
          <div><label className="label">Applies to</label>
            <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="both">Both</option><option value="output">Sales (output)</option><option value="input">Purchases (input)</option>
            </select>
          </div>
          <div className="md:col-span-5 flex justify-end"><button className="btn btn-primary">Save</button></div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th className="th">Code</th><th className="th">Name</th><th className="th text-right">Rate</th><th className="th">Applies to</th><th className="th"></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="td text-center text-[var(--text-muted)]">Loading…</td></tr>
            : rates.length === 0 ? <tr><td colSpan={5} className="td text-center text-[var(--text-muted)]">No tax rates yet.</td></tr>
            : rates.map(r => (
              <tr key={r.id}>
                <td className="td font-mono">{r.code}</td>
                <td className="td">{r.name}</td>
                <td className="td text-right">{r.rate}%</td>
                <td className="td capitalize">{r.type}</td>
                <td className="td text-right"><button className="btn btn-sm btn-danger" onClick={() => remove(r.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
