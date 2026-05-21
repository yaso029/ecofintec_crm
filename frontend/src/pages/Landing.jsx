import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useState, useEffect } from 'react';
import api from '../api';
import useIsMobile from '../hooks/useIsMobile';

const MODULES = [
  { key: 'crm', icon: '📋', title: 'CRM', subtitle: 'Inquiries & Pipeline', desc: 'Manage client inquiries, track engagements through the pipeline, assign accountants and monitor your team.', bg: 'linear-gradient(135deg, #0f5132 0%, #0a3a24 100%)', type: 'active', path: '/crm' },
  { key: 'partnerships', icon: '🤝', title: 'Partnerships', subtitle: 'Referral Outreach', desc: 'Manage referral partners, run WhatsApp & Email campaigns and track commission payouts.', bg: 'linear-gradient(135deg, #1F7A59 0%, #145740 100%)', type: 'restricted', path: '/partnerships' },
  { key: 'clients', icon: '🏢', title: 'Clients', subtitle: 'Companies & Services', desc: 'UAE company profiles, TRN/CT/trade license, service engagements (Bookkeeping, VAT, CT, Payroll), tasks and deadlines.', bg: 'linear-gradient(135deg, #134e4a 0%, #0c3a36 100%)', type: 'active', path: '/clients' },
  { key: 'agents', icon: '🧮', title: 'Accountants', subtitle: 'Team Workspace', desc: 'Accountant-facing dashboard for client services, deadlines and engagement work.', bg: 'linear-gradient(135deg, #14532d 0%, #0f3f24 100%)', type: 'active', path: '/agents' },
  { key: 'hr', icon: '👥', title: 'HR', subtitle: 'Human Resources', desc: 'Employee records, documents and identity management.', bg: 'linear-gradient(135deg, #1c3a3a 0%, #112e2e 100%)', type: 'restricted', path: '/hr' },
  { key: 'calendar', icon: '📅', title: 'Calendar', subtitle: 'Events & Deadlines', desc: 'Team events, client appointments and filing deadlines.', bg: 'linear-gradient(135deg, #155e63 0%, #0d4448 100%)', type: 'active', path: '/calendar' },
  { key: 'ecards', icon: '💳', title: 'E-Business Cards', subtitle: 'Digital Cards & QR', desc: 'View and share digital business cards for the whole team.', bg: 'linear-gradient(135deg, #166534 0%, #0f4a25 100%)', type: 'active', path: '/ecards' },
  { key: 'settings', icon: '⚙️', title: 'Settings', subtitle: 'Account & Management', desc: 'View your account details, change your password, and manage system users.', bg: 'linear-gradient(135deg, #1e3a34 0%, #122620 100%)', type: 'active', path: '/settings' },
  { key: 'services', icon: '📂', title: 'Client Services', subtitle: 'Bookkeeping, VAT, Tax', desc: 'Practice-wide view of every engagement — bookkeeping, VAT filing, corporate tax, payroll and audit — filterable by type, status and recurrence.', bg: 'linear-gradient(135deg, #1a3a1a 0%, #112811 100%)', type: 'active', path: '/services' },
  { key: 'documents', icon: '📑', title: 'Documents', subtitle: 'Secure Client Files', desc: 'Client document vault — upload, search, download via signed links and review access audit trails, scoped to the clients you can see.', bg: 'linear-gradient(135deg, #1f3d2e 0%, #14291f 100%)', type: 'active', path: '/documents' },
  { key: 'billing', icon: '💰', title: 'Billing', subtitle: 'Invoices & Retainers', desc: 'UAE VAT invoices, payment tracking, recurring retainers and revenue/aging reports.', bg: 'linear-gradient(135deg, #15803d 0%, #0e5a2b 100%)', type: 'active', path: '/billing' },
];

const ROLE_LABELS = {
  admin: 'Administrator',
  senior_accountant: 'Senior Accountant',
  accountant: 'Accountant',
  auditor: 'Auditor',
  payroll_specialist: 'Payroll Specialist',
  tax_consultant: 'Tax Consultant',
  hr_admin: 'HR Admin',
};

function Modal({ title, message, color, onClose }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div onClick={e => e.stopPropagation()} className="max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-12 py-10 text-center shadow-2xl"
        style={{ borderTop: `4px solid ${color}` }}>
        <div className="mb-4 text-[44px]">{title === 'No Permission' ? '🔒' : '🚧'}</div>
        <div className="mb-2.5 text-xl font-extrabold text-[var(--text)]">{title}</div>
        <div className="mb-7 text-sm leading-relaxed text-[var(--text-muted)]">{message}</div>
        <button onClick={onClose} className="rounded-lg px-8 py-2.5 text-sm font-bold text-white" style={{ background: color }}>
          Got it
        </button>
      </div>
    </div>
  );
}

const signOut = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login'; };

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [modal, setModal] = useState(null);
  const [stats, setStats] = useState({ leads: '—', partners: '—', team: '—' });

  useEffect(() => {
    Promise.allSettled([
      api.get('/api/dashboard/stats'),
      api.get('/api/partners'),
      api.get('/api/users'),
    ]).then(([dash, partners, users]) => {
      setStats({
        leads: dash.status === 'fulfilled' ? (dash.value.data?.total_leads ?? '—') : '—',
        partners: partners.status === 'fulfilled' ? (partners.value.data?.length ?? '—') : '—',
        team: users.status === 'fulfilled' ? (users.value.data?.length ?? '—') : '—',
      });
    });
  }, []);

  const handleClick = (mod) => {
    if (mod.type === 'active') { navigate(mod.path); return; }
    if (mod.type === 'restricted') {
      if (user?.role === 'admin') { navigate(mod.path); return; }
      if (user?.role === 'hr_admin' && mod.key === 'hr') { navigate(mod.path); return; }
      setModal({ title: 'No Permission', message: "You don't have permission to access this module. Contact your administrator.", color: '#1F7A59' });
      return;
    }
    if (mod.type === 'coming_soon') {
      setModal({ title: 'Under Development', message: `The ${mod.title} module is currently being built and will be available soon.`, color: '#5C6B64' });
    }
  };

  const statItems = [
    { label: 'Active Inquiries', value: stats.leads, fill: '#3FB389', pct: '70%' },
    { label: 'Referral Partners', value: stats.partners, fill: '#2E9B72', pct: '55%' },
    { label: 'Team Members', value: stats.team, fill: '#1F7A59', pct: '40%' },
  ];

  const roleBadge = (
    <span className="inline-block rounded-full border border-accent-light/30 bg-accent-light/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-light">
      {ROLE_LABELS[user?.role] || user?.role}
    </span>
  );

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-page dark:bg-surface-dark">
        {modal && <Modal {...modal} onClose={() => setModal(null)} />}

        <div className="sticky top-0 z-50 border-b border-white/[0.06] bg-gradient-to-b from-primary to-primary-dark px-5 pb-4 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent-light to-accent text-base font-black text-white">E</div>
              <div>
                <div className="text-base font-black tracking-tight text-white">Ecofintec Accounting</div>
                <div className="text-[8px] uppercase tracking-[2px] text-accent-light">Accounting Firm CRM</div>
              </div>
            </div>
            <button onClick={signOut} className="rounded-lg border border-white/12 bg-white/[0.07] px-3 py-1.5 text-xs text-white/50">Sign out</button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="mb-0.5 text-[13px] text-white/40">Welcome back</div>
              <div className="text-xl font-extrabold text-white">{user?.full_name}</div>
            </div>
            {roleBadge}
          </div>

          <div className="mt-3.5 flex gap-2.5">
            {[{ label: 'Inquiries', value: stats.leads, color: '#7CD9B0' }, { label: 'Partners', value: stats.partners, color: '#5BC79A' }, { label: 'Team', value: stats.team, color: '#9FE7C6' }].map(s => (
              <div key={s.label} className="flex-1 rounded-xl border border-white/[0.07] bg-white/5 px-2 py-2.5 text-center">
                <div className="text-lg font-black" style={{ color: s.color }}>{s.value}</div>
                <div className="mt-0.5 text-[10px] text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[2px] text-[var(--text-muted)]">Select a module</div>
          <div className="flex flex-col gap-3">
            {MODULES.map(mod => {
              const isComingSoon = mod.type === 'coming_soon';
              const isLocked = mod.type === 'restricted' && user?.role !== 'admin' && !(user?.role === 'hr_admin' && mod.key === 'hr');
              return (
                <div key={mod.key} onClick={() => handleClick(mod)}
                  className={`flex min-h-20 items-center gap-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 shadow-soft ${isComingSoon ? 'cursor-default opacity-60' : 'cursor-pointer'}`}>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl shadow-sm" style={{ background: mod.bg }}>{mod.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-black tracking-tight text-[var(--text)]">{mod.title}</div>
                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">{mod.subtitle}</div>
                  </div>
                  {isComingSoon ? (
                    <div className="shrink-0 rounded-[10px] bg-[var(--surface-2)] px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">Soon</div>
                  ) : isLocked ? (
                    <div className="shrink-0 text-base">🔒</div>
                  ) : (
                    <div className="shrink-0 text-lg text-[var(--text-muted)]">›</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-page dark:bg-surface-dark">
      {modal && <Modal {...modal} onClose={() => setModal(null)} />}

      <aside className="sticky top-0 flex h-screen w-[300px] shrink-0 flex-col bg-gradient-to-b from-primary to-primary-dark px-8 py-11">
        <div className="mb-1.5 flex items-center gap-3">
          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-gradient-to-br from-accent-light to-accent text-lg font-black text-white shadow-lg shadow-accent/30">E</div>
          <div className="text-xl font-black tracking-tight text-white">Ecofintec Accounting</div>
        </div>
        <div className="mb-9 pl-[54px] text-[9px] uppercase tracking-[3px] text-accent-light">Accounting Firm CRM</div>

        <div className="mb-7 h-0.5 w-8 rounded bg-accent-light/40" />

        <div className="mb-1.5 text-[11px] uppercase tracking-[2px] text-white/35">Logged in as</div>
        <div className="mb-2.5 text-2xl font-extrabold tracking-tight text-white">{user?.full_name}</div>
        <div className="mb-9">{roleBadge}</div>

        <div className="mb-auto">
          {statItems.map(s => (
            <div key={s.label} className="mb-5">
              <div className="mb-1.5 flex justify-between">
                <span className="text-[11px] text-white/35">{s.label}</span>
                <span className="text-[15px] font-extrabold text-white">{s.value}</span>
              </div>
              <div className="h-[3px] overflow-hidden rounded bg-white/[0.07]">
                <div className="h-full rounded transition-all duration-700" style={{ width: s.pct, background: s.fill }} />
              </div>
            </div>
          ))}
        </div>

        <button onClick={signOut} className="w-full rounded-xl border border-white/[0.09] bg-white/[0.04] py-3 text-[13px] text-white/40 transition hover:bg-white/[0.08] hover:text-white/70">
          ← Sign out
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto px-10 py-11">
        <div className="mb-8">
          <div className="mb-1.5 text-xs font-bold uppercase tracking-[2px] text-accent">Operations Hub</div>
          <div className="text-[28px] font-black tracking-tight text-[var(--text)]">Select a module</div>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {MODULES.map(mod => {
            const isComingSoon = mod.type === 'coming_soon';
            const isLocked = mod.type === 'restricted' && user?.role !== 'admin' && !(user?.role === 'hr_admin' && mod.key === 'hr');
            return (
              <div key={mod.key} onClick={() => handleClick(mod)}
                className={`group relative flex min-h-[210px] flex-col overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-6 py-7 shadow-soft transition ${isComingSoon ? 'cursor-default opacity-60' : 'cursor-pointer hover:-translate-y-1 hover:shadow-card'}`}>
                {isComingSoon && (
                  <div className="absolute right-4 top-4 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">Coming Soon</div>
                )}
                {isLocked && !isComingSoon && (
                  <div className="absolute right-4 top-4 rounded-full bg-accent-soft px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide text-accent">🔒 Admin Only</div>
                )}

                <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl text-2xl shadow-sm" style={{ background: mod.bg }}>{mod.icon}</div>
                <div className="mb-1 text-lg font-black tracking-tight text-[var(--text)]">{mod.title}</div>
                <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-accent">{mod.subtitle}</div>
                <div className="mb-5 flex-1 text-[13px] leading-relaxed text-[var(--text-muted)]">{mod.desc}</div>
                <div className={`self-start rounded-lg px-4 py-2 text-xs font-extrabold ${isComingSoon ? 'bg-[var(--surface-2)] text-[var(--text-muted)]' : 'bg-accent-soft text-accent'}`}>
                  {isComingSoon ? 'Coming Soon' : `Open ${mod.title} →`}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
