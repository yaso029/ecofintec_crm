import { Link } from 'react-router-dom';
import { useT } from '../../i18n/LocaleContext';

export default function InvoicesLink() {
  const t = useT();
  return (
    <div className="p-6 md:p-7">
      <h1 className="page-title">{t('Invoices & Receipts')}</h1>
      <p className="page-subtitle mb-6">{t('Customer invoices and recorded receipts are managed in the existing Billing module.')}</p>
      <div className="card p-6 max-w-xl">
        <p className="text-sm text-[var(--text-muted)] mb-4">
          {t('Outgoing invoices to clients (with VAT, line items, payments) live under the Billing module. Auto-postings to your chart of accounts flow through to the Accounting reports.')}
        </p>
        <Link to="/billing" className="btn btn-primary">{t('Open Billing → Invoices')}</Link>
      </div>
    </div>
  );
}
