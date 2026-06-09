import { Link } from 'react-router-dom';

export default function InvoicesLink() {
  return (
    <div className="p-6 md:p-7">
      <h1 className="page-title">Invoices & Receipts</h1>
      <p className="page-subtitle mb-6">Customer invoices and recorded receipts are managed in the existing Billing module.</p>
      <div className="card p-6 max-w-xl">
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Outgoing invoices to clients (with VAT, line items, payments) live under <b>Billing</b>.
          Auto-postings to your chart of accounts will flow through to the Accounting reports once configured.
        </p>
        <Link to="/billing" className="btn btn-primary">Open Billing → Invoices</Link>
      </div>
    </div>
  );
}
