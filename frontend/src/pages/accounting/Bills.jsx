import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = {
  supplier_id: '', supplier_reference: '', status: 'open', currency: 'AED',
  issue_date: today(), due_date: '', vat_rate: 5, notes: '',
  line_items: [{ description: '', expense_account_id: '', quantity: 1, unit_price: 0 }],
};

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [payFor, setPayFor] = useState(null);
  const [payForm, setPayForm] = useState({ amount: 0, method: 'bank_transfer', bank_account_id: '', reference: '', paid_at: today() });

  const load = async () => {
    setLoading(true);
    try {
      const [a, b, c, d] = await Promise.all([
        api.get('/api/accounting/bills'),
        api.get('/api/accounting/suppliers'),
        api.get('/api/accounting/accounts'),
        api.get('/api/accounting/bank-accounts'),
      ]);
      setBills(a.data); setSuppliers(b.data); setAccounts(c.data); setBanks(d.data);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const expenseAccounts = accounts.filter(a => a.type === 'expense');

  const addLine = () => setForm({ ...form, line_items: [...form.line_items, { description: '', expense_account_id: '', quantity: 1, unit_price: 0 }] });
  const removeLine = (i) => setForm({ ...form, line_items: form.line_items.filter((_, idx) => idx !== i) });
  const updateLine = (i, patch) => setForm({ ...form, line_items: form.line_items.map((li, idx) => idx === i ? { ...li, ...patch } : li) });

  const subtotal = form.line_items.reduce((s, li) => s + (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0), 0);
  const vat = subtotal * (parseFloat(form.vat_rate) || 0) / 100;
  const total = subtotal + vat;

  const save = async (e) => {
    e.preventDefault();
    if (!form.supplier_id) { toast.error('Pick a supplier'); return; }
    try {
      await api.post('/api/accounting/bills', {
        ...form,
        supplier_id: parseInt(form.supplier_id),
        vat_rate: parseFloat(form.vat_rate) || 0,
        line_items: form.line_items.map(li => ({
          description: li.description,
          expense_account_id: li.expense_account_id ? parseInt(li.expense_account_id) : null,
          quantity: parseFloat(li.quantity) || 0,
          unit_price: parseFloat(li.unit_price) || 0,
        })),
      });
      toast.success('Bill saved');
      setShowForm(false); setForm(EMPTY); load();
    } catch (e2) { toast.error(e2.response?.data?.detail || 'Failed'); }
  };

  const recordPayment = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/api/accounting/bills/${payFor.id}/payments`, {
        ...payForm,
        amount: parseFloat(payForm.amount) || 0,
        bank_account_id: payForm.bank_account_id ? parseInt(payForm.bank_account_id) : null,
      });
      toast.success('Payment recorded');
      setPayFor(null); setPayForm({ amount: 0, method: 'bank_transfer', bank_account_id: '', reference: '', paid_at: today() });
      load();
    } catch (e2) { toast.error(e2.response?.data?.detail || 'Failed'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this bill and its payments? Journal entries will be reversed.')) return;
    try { await api.delete(`/api/accounting/bills/${id}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="p-6 md:p-7">
      <div className="mb-5 flex items-center justify-between">
        <div><h1 className="page-title">Bills</h1><p className="page-subtitle">{bills.length} bills · supplier invoices (AP).</p></div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New Bill'}</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="card p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div><label className="label">Supplier</label>
              <select className="input" required value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">— pick —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label className="label">Supplier ref</label><input className="input" value={form.supplier_reference} onChange={e => setForm({ ...form, supplier_reference: e.target.value })} /></div>
            <div><label className="label">Issue date</label><input className="input" type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} /></div>
            <div><label className="label">Due date</label><input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
            <div><label className="label">VAT %</label><input className="input" type="number" step="0.01" value={form.vat_rate} onChange={e => setForm({ ...form, vat_rate: e.target.value })} /></div>
            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="draft">Draft</option><option value="open">Open</option>
              </select>
            </div>
          </div>

          <div className="field-section">Line items</div>
          <div className="space-y-2 mb-3">
            {form.line_items.map((li, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <input className="input col-span-4" placeholder="Description" required value={li.description} onChange={e => updateLine(i, { description: e.target.value })} />
                <select className="input col-span-3" value={li.expense_account_id} onChange={e => updateLine(i, { expense_account_id: e.target.value })}>
                  <option value="">— default —</option>
                  {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
                <input className="input col-span-2" type="number" step="0.01" placeholder="Qty" value={li.quantity} onChange={e => updateLine(i, { quantity: e.target.value })} />
                <input className="input col-span-2" type="number" step="0.01" placeholder="Unit price" value={li.unit_price} onChange={e => updateLine(i, { unit_price: e.target.value })} />
                <button type="button" className="btn btn-sm btn-danger col-span-1" onClick={() => removeLine(i)}>×</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addLine} className="btn btn-outline btn-sm mb-4">+ Add line</button>

          <div className="grid grid-cols-3 gap-3 text-right text-sm font-mono mb-3">
            <div>Subtotal: <b>{subtotal.toFixed(2)}</b></div>
            <div>VAT: <b>{vat.toFixed(2)}</b></div>
            <div>Total: <b>{total.toFixed(2)}</b></div>
          </div>

          <div className="mb-3"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end"><button className="btn btn-primary">Save Bill</button></div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr>
            <th className="th">Number</th><th className="th">Supplier</th><th className="th">Issue</th>
            <th className="th">Due</th><th className="th">Status</th>
            <th className="th text-right">Total</th><th className="th text-right">Paid</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="td text-center text-[var(--text-muted)]">Loading…</td></tr>
            : bills.length === 0 ? <tr><td colSpan={8} className="td text-center text-[var(--text-muted)]">No bills yet.</td></tr>
            : bills.map(b => (
              <tr key={b.id}>
                <td className="td font-mono">{b.bill_number}</td>
                <td className="td">{b.supplier_name}</td>
                <td className="td">{b.issue_date}</td>
                <td className="td">{b.due_date || '—'}</td>
                <td className="td"><span className={'badge ' + (b.status === 'paid' ? 'badge-success' : b.status === 'partially_paid' ? 'badge-warning' : 'badge-neutral')}>{b.status}</span></td>
                <td className="td text-right font-mono">{(b.total || 0).toFixed(2)}</td>
                <td className="td text-right font-mono">{(b.amount_paid || 0).toFixed(2)}</td>
                <td className="td text-right">
                  {b.status !== 'paid' && <button className="btn btn-sm btn-outline mr-1" onClick={() => { setPayFor(b); setPayForm({ ...payForm, amount: (b.total - b.amount_paid).toFixed(2) }); }}>Pay</button>}
                  <button className="btn btn-sm btn-danger" onClick={() => remove(b.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {payFor && (
        <div className="modal-overlay" onClick={() => setPayFor(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={recordPayment} className="modal p-5 w-full max-w-md">
            <div className="font-semibold mb-1">Record payment</div>
            <div className="text-sm text-[var(--text-muted)] mb-4">{payFor.bill_number} · {payFor.supplier_name} · Outstanding {(payFor.total - payFor.amount_paid).toFixed(2)}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Amount</label><input className="input" type="number" step="0.01" required value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></div>
              <div><label className="label">Date</label><input className="input" type="date" value={payForm.paid_at} onChange={e => setPayForm({ ...payForm, paid_at: e.target.value })} /></div>
              <div><label className="label">Method</label>
                <select className="input" value={payForm.method} onChange={e => setPayForm({ ...payForm, method: e.target.value })}>
                  <option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option>
                  <option value="cheque">Cheque</option><option value="card">Card</option><option value="other">Other</option>
                </select>
              </div>
              <div><label className="label">Bank/Cash account</label>
                <select className="input" value={payForm.bank_account_id} onChange={e => setPayForm({ ...payForm, bank_account_id: e.target.value })}>
                  <option value="">— Cash on Hand —</option>
                  {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className="label">Reference</label><input className="input" value={payForm.reference} onChange={e => setPayForm({ ...payForm, reference: e.target.value })} /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setPayFor(null)}>Cancel</button>
              <button className="btn btn-primary">Record</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
