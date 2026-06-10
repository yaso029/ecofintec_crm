import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { useT } from '../../i18n/LocaleContext';

const EMPTY = { name: '', contact_name: '', email: '', phone: '', trn: '', address: '', payment_terms_days: 30, notes: '', is_active: true };

export default function Suppliers() {
  const t = useT();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/accounting/suppliers'); setSuppliers(data); }
    catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/accounting/suppliers', { ...form, payment_terms_days: parseInt(form.payment_terms_days) || 30 });
      toast.success('Supplier added');
      setShowForm(false); setForm(EMPTY); load();
    } catch (e2) { toast.error(e2.response?.data?.detail || 'Failed'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this supplier?')) return;
    try { await api.delete(`/api/accounting/suppliers/${id}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="p-6 md:p-7">
      <div className="mb-5 flex items-center justify-between">
        <div><h1 className="page-title">{t('Suppliers')}</h1><p className="page-subtitle">{suppliers.length} {t('suppliers')}</p></div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>{showForm ? t('Cancel') : t('+ Add Supplier')}</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="card p-4 mb-5 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2"><label className="label">Name</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Contact name</label><input className="input" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
          <div><label className="label">TRN</label><input className="input" value={form.trn} onChange={e => setForm({ ...form, trn: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Payment terms (days)</label><input className="input" type="number" value={form.payment_terms_days} onChange={e => setForm({ ...form, payment_terms_days: e.target.value })} /></div>
          <div className="md:col-span-3"><label className="label">Address</label><input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          <div className="md:col-span-4"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="md:col-span-4 flex justify-end"><button className="btn btn-primary">Save</button></div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr>
            <th className="th">Name</th><th className="th">Contact</th><th className="th">TRN</th>
            <th className="th">Email</th><th className="th">Phone</th><th className="th">Terms</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="td text-center text-[var(--text-muted)]">Loading…</td></tr>
            : suppliers.length === 0 ? <tr><td colSpan={7} className="td text-center text-[var(--text-muted)]">No suppliers yet.</td></tr>
            : suppliers.map(s => (
              <tr key={s.id}>
                <td className="td font-semibold">{s.name}</td>
                <td className="td">{s.contact_name || '—'}</td>
                <td className="td font-mono text-xs">{s.trn || '—'}</td>
                <td className="td">{s.email || '—'}</td>
                <td className="td">{s.phone || '—'}</td>
                <td className="td">{s.payment_terms_days}d</td>
                <td className="td text-right"><button className="btn btn-sm btn-danger" onClick={() => remove(s.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
