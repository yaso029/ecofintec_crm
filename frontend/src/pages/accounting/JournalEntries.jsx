import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { useT } from '../../i18n/LocaleContext';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { entry_date: today(), memo: '', reference: '', lines: [
  { account_id: '', description: '', debit: 0, credit: 0 },
  { account_id: '', description: '', debit: 0, credit: 0 },
]};

export default function JournalEntries() {
  const t = useT();
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [sourceFilter, setSourceFilter] = useState('');
  const [openEntry, setOpenEntry] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        api.get('/api/accounting/journal-entries' + (sourceFilter ? `?source_type=${sourceFilter}` : '')),
        api.get('/api/accounting/accounts'),
      ]);
      setEntries(a.data); setAccounts(b.data);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, [sourceFilter]);

  const addLine = () => setForm({ ...form, lines: [...form.lines, { account_id: '', description: '', debit: 0, credit: 0 }] });
  const removeLine = (i) => setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) });
  const updateLine = (i, patch) => setForm({ ...form, lines: form.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l) });

  const totalDebit = form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const save = async (e) => {
    e.preventDefault();
    if (!balanced) { toast.error('Entry must be balanced'); return; }
    try {
      await api.post('/api/accounting/journal-entries', {
        entry_date: form.entry_date,
        memo: form.memo, reference: form.reference,
        lines: form.lines.map(l => ({
          account_id: parseInt(l.account_id),
          description: l.description,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
        })),
      });
      toast.success('Entry posted');
      setShowForm(false); setForm(EMPTY); load();
    } catch (e2) { toast.error(e2.response?.data?.detail || 'Failed'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this journal entry?')) return;
    try { await api.delete(`/api/accounting/journal-entries/${id}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="p-6 md:p-7">
      <div className="mb-5 flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="page-title">{t('Journal Entries')}</h1><p className="page-subtitle">{entries.length} {t('entries · the general ledger.')}</p></div>
        <div className="flex gap-2">
          <select className="input max-w-[180px]" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            <option value="">All sources</option>
            <option value="manual">Manual</option>
            <option value="invoice">Sales invoice</option>
            <option value="customer_receipt">Customer receipt</option>
            <option value="expense">Expense</option>
            <option value="bill">Bill</option>
            <option value="supplier_payment">Supplier payment</option>
            <option value="bank_transaction">Bank transaction</option>
            <option value="bank_account_opening">Opening balance</option>
          </select>
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>{showForm ? t('Cancel') : t('+ New Entry')}</button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={save} className="card p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div><label className="label">Date</label><input className="input" type="date" required value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} /></div>
            <div className="md:col-span-2"><label className="label">Memo</label><input className="input" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="Description of the entry" /></div>
            <div><label className="label">Reference</label><input className="input" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
          </div>

          <div className="field-section">Lines (debits must equal credits)</div>
          <div className="space-y-2 mb-3">
            {form.lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <select className="input col-span-4" required value={l.account_id} onChange={e => updateLine(i, { account_id: e.target.value })}>
                  <option value="">— account —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
                <input className="input col-span-3" placeholder="Description" value={l.description} onChange={e => updateLine(i, { description: e.target.value })} />
                <input className="input col-span-2" type="number" step="0.01" placeholder="Debit" value={l.debit} onChange={e => updateLine(i, { debit: e.target.value, credit: e.target.value > 0 ? 0 : l.credit })} />
                <input className="input col-span-2" type="number" step="0.01" placeholder="Credit" value={l.credit} onChange={e => updateLine(i, { credit: e.target.value, debit: e.target.value > 0 ? 0 : l.debit })} />
                <button type="button" className="btn btn-sm btn-danger col-span-1" onClick={() => removeLine(i)}>×</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addLine} className="btn btn-outline btn-sm mb-4">+ Add line</button>

          <div className="flex items-center justify-end gap-4 text-sm font-mono">
            <div>Debits: <b>{totalDebit.toFixed(2)}</b></div>
            <div>Credits: <b>{totalCredit.toFixed(2)}</b></div>
            <div className={balanced ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700'}>
              {balanced ? 'Balanced ✓' : `Out by ${(totalDebit - totalCredit).toFixed(2)}`}
            </div>
            <button className="btn btn-primary" disabled={!balanced}>Post Entry</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr>
            <th className="th">Number</th><th className="th">Date</th><th className="th">Memo</th>
            <th className="th">Source</th><th className="th text-right">Debit</th><th className="th text-right">Credit</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="td text-center text-[var(--text-muted)]">Loading…</td></tr>
            : entries.length === 0 ? <tr><td colSpan={7} className="td text-center text-[var(--text-muted)]">No journal entries yet.</td></tr>
            : entries.map(je => (
              <tr key={je.id}>
                <td className="td font-mono"><button onClick={() => setOpenEntry(je)} className="hover:underline">{je.entry_number}</button></td>
                <td className="td">{je.entry_date}</td>
                <td className="td">{je.memo || '—'}</td>
                <td className="td"><span className="badge badge-neutral">{je.source_type}</span></td>
                <td className="td text-right font-mono">{je.total_debit.toFixed(2)}</td>
                <td className="td text-right font-mono">{je.total_credit.toFixed(2)}</td>
                <td className="td text-right">
                  {je.source_type === 'manual' && <button className="btn btn-sm btn-danger" onClick={() => remove(je.id)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openEntry && (
        <div className="modal-overlay" onClick={() => setOpenEntry(null)}>
          <div onClick={e => e.stopPropagation()} className="modal p-5 w-full max-w-2xl">
            <div className="font-semibold mb-1">{openEntry.entry_number} · {openEntry.entry_date}</div>
            <div className="text-sm text-[var(--text-muted)] mb-4">{openEntry.memo}</div>
            <table className="data-table">
              <thead><tr><th className="th">Account</th><th className="th">Description</th><th className="th text-right">Debit</th><th className="th text-right">Credit</th></tr></thead>
              <tbody>
                {openEntry.lines.map(l => (
                  <tr key={l.id}>
                    <td className="td font-mono text-xs">{l.account_code} {l.account_name}</td>
                    <td className="td">{l.description || '—'}</td>
                    <td className="td text-right font-mono">{(l.debit || 0).toFixed(2)}</td>
                    <td className="td text-right font-mono">{(l.credit || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex justify-end"><button className="btn btn-ghost" onClick={() => setOpenEntry(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
