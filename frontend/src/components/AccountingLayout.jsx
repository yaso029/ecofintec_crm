import ModuleShell from './ModuleShell';

const navItems = [
  { to: '/accounting',            label: 'Dashboard',           icon: '▦', exact: true },
  { to: '/accounting/chart',      label: 'Chart of Accounts',   icon: '🧾' },
  { to: '/accounting/invoices',   label: 'Invoices & Receipts', icon: '📄' },
  { to: '/accounting/expenses',   label: 'Expenses',            icon: '💸' },
  { to: '/accounting/bills',      label: 'Bills',               icon: '🧾' },
  { to: '/accounting/suppliers',  label: 'Suppliers',           icon: '🏭' },
  { to: '/accounting/bank',       label: 'Bank & Cash',         icon: '🏦' },
  { to: '/accounting/journal',    label: 'Journal Entries',     icon: '📒' },
  { to: '/accounting/tax-rates',  label: 'Tax Rates',           icon: '🧮' },
  { to: '/accounting/reports',    label: 'Reports',             icon: '📊' },
];

export default function AccountingLayout() {
  return <ModuleShell moduleLabel="Accounting" navItems={navItems} />;
}
