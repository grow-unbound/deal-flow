'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useCaptureEvent } from '@/hooks/useFeatureFlag';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { X, Sparkles } from 'lucide-react';
import { SellerTopbar } from '@/components/layout/SellerTopbar';

function inr(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

const kpis = [
  { label: 'Orders this week', value: '14', delta: '+3', hint: 'vs last week', up: true },
  { label: 'GMV this week',    value: '₹10,84,420', delta: '+12%', hint: 'vs last week', up: true },
  { label: 'Active catalogs',  value: '3', delta: '1 expiring', hint: '', up: false },
  { label: 'Low-stock alerts', value: '7', delta: '−2', hint: 'resolved', up: true },
];

const topBrands = [
  { id: 'wy', initials: 'WY', name: 'WineYard Vintners',  skus: 82, cohorts: 4, trend: '+12%', pct: 82, hue: 'teal'  },
  { id: 'mr', initials: 'MR', name: 'Maison Roussel',     skus: 46, cohorts: 3, trend: '+4%',  pct: 64, hue: 'ember' },
  { id: 'kh', initials: 'KH', name: 'Khanna Brewing Co.', skus: 124, cohorts: 6, trend: '+8%', pct: 58, hue: 'cream' },
  { id: 'ts', initials: 'TS', name: 'Tara Spirits',       skus: 38, cohorts: 2, trend: '−2%',  pct: 41, hue: 'teal'  },
  { id: 'av', initials: 'AV', name: 'Aravalli Vineyards', skus: 67, cohorts: 4, trend: '+18%', pct: 22, hue: 'ember' },
];

const recentOrders = [
  { id: 'DF-2026-00471', buyer: 'Rajan Wine Merchants', items: 3,  status: 'dispatched', total: 84200,  placed: '2h ago',    catalog: 'Summer Pours' },
  { id: 'DF-2026-00470', buyer: 'Verma & Sons',         items: 12, status: 'confirmed',  total: 218500, placed: '5h ago',    catalog: 'Summer Pours' },
  { id: 'DF-2026-00469', buyer: 'Mehta Brothers',       items: 5,  status: 'delivered',  total: 46820,  placed: 'Yesterday', catalog: 'New Arrivals · May' },
  { id: 'DF-2026-00468', buyer: 'Singh Hospitality',    items: 28, status: 'received',   total: 612400, placed: 'Yesterday', catalog: 'Premium Reserve' },
  { id: 'DF-2026-00467', buyer: 'Kapoor Spirits',       items: 4,  status: 'cancelled',  total: 18900,  placed: '2d ago',    catalog: 'Summer Pours' },
];

const statusMeta: Record<string, { label: string; bg: string; fg: string }> = {
  received:   { label: 'Received',   bg: '#E7EEF1', fg: '#2A4B59' },
  confirmed:  { label: 'Confirmed',  bg: '#FBEFE3', fg: '#6B3818' },
  dispatched: { label: 'Dispatched', bg: '#FBF1DC', fg: '#7A5519' },
  delivered:  { label: 'Delivered',  bg: '#ECF3EC', fg: '#2F5733' },
  cancelled:  { label: 'Cancelled',  bg: '#F6E5DF', fg: '#6B2615' },
};

const hueAvatar: Record<string, { bg: string; fg: string; border: string }> = {
  teal:  { bg: '#EAF1EE', fg: '#1F3A34', border: '#C6DAD3' },
  ember: { bg: '#FBEFE3', fg: '#874720', border: '#F5DAB8' },
  cream: { bg: '#F4EFE6', fg: '#1F3A34', border: '#EFE9DF' },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const captureEvent = useCaptureEvent();
  const searchParams = useSearchParams();
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const fromSignup = searchParams.get('first_run') === '1';
    const seen = typeof window !== 'undefined' && localStorage.getItem('df_first_run') === 'seen';
    return fromSignup || !seen;
  });

  useEffect(() => {
    captureEvent('dashboard_viewed', { tenant_id: currentTenant?.id });
  }, [currentTenant, captureEvent]);

  function dismissOnboarding() {
    localStorage.setItem('df_first_run', 'seen');
    setShowOnboarding(false);
  }

  if (!user || !currentTenant) {
    return <p className="text-caption text-cream-600 p-8">Loading...</p>;
  }

  const tenantName = currentTenant.business_name;

  return (
    <>
      <SellerTopbar title="Dashboard" />

      {/* First-run onboarding banner */}
      {showOnboarding && (
        <div
          role="banner"
          className="fixed top-[var(--topbar-h)] left-[var(--sidebar-w)] right-0 z-20
                     bg-teal-500 text-cream-50 px-6 py-3
                     flex items-center gap-3"
          data-testid="onboarding-banner"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <p className="font-sans text-body-sm flex-1">
            <span className="font-semibold">Welcome to DealFlow!</span>{' '}
            Complete your setup to start selling — add your first brand and invite your team.
          </p>
          <a
            href="/settings"
            className="font-sans text-body-sm font-semibold underline underline-offset-2
                       hover:text-cream-200 transition-colors shrink-0"
          >
            Set up now
          </a>
          <button
            onClick={dismissOnboarding}
            aria-label="Dismiss welcome banner"
            className="ml-2 p-1 rounded hover:bg-teal-600 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)', padding: 'calc(var(--topbar-h) + 24px) 32px 40px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>This week</div>
            <h1 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-900)', lineHeight: 1.15 }}>
              Good morning, {user.email?.split('@')[0] ?? 'Phani'}.
            </h1>
            <p style={{ fontSize: 14, color: 'var(--cream-700)', marginTop: 6, maxWidth: 520, lineHeight: 1.5 }}>
              14 orders placed across 5 brands. Two catalogs went out yesterday.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--cream-50)', border: '1px solid var(--border-2)', borderRadius: 8, fontSize: 13, fontWeight: 500, color: 'var(--cream-800)', cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              Last 7 days
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <a href="/catalogs" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--teal-500)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', textDecoration: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
              Go to catalogs
            </a>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(31,58,52,0.06)' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-900)', lineHeight: 1 }}>{k.value}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 600, color: k.up ? '#2F5733' : '#9C3A22' }}>
                  {k.up
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
                  }
                  {k.delta}
                </span>
                {k.hint && <span style={{ fontSize: 12, color: 'var(--cream-600)' }}>{k.hint}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Two-column grid: Brand performance + Latest orders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Brand performance panel */}
          <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream-900)' }}>Brand performance</div>
                <div style={{ fontSize: 12, color: 'var(--cream-600)', marginTop: 2 }}>GMV share this week · across 5 brand principals</div>
              </div>
              <a href="/brands" style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
                All brands
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topBrands.map(b => {
                const av = hueAvatar[b.hue];
                const isDown = b.trend.startsWith('−') || b.trend.startsWith('-');
                return (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: av.bg, border: `1px solid ${av.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: av.fg, flexShrink: 0 }}>{b.initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream-900)', marginBottom: 4 }}>{b.name}</div>
                      <div style={{ height: 6, background: 'var(--cream-200)', borderRadius: 100, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${b.pct}%`, background: 'var(--teal-500)', borderRadius: 100 }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: isDown ? '#9C3A22' : '#2F5733', flexShrink: 0, width: 42, textAlign: 'right' }}>{b.trend}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Latest orders panel */}
          <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream-900)' }}>Latest orders</div>
                <div style={{ fontSize: 12, color: 'var(--cream-600)', marginTop: 2 }}>Across all buyers</div>
              </div>
              <a href="/orders" style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
                All orders
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recentOrders.map(o => {
                const sm = statusMeta[o.status] ?? statusMeta.received;
                return (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-1)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--cream-700)' }}>{o.id}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream-900)', marginTop: 1 }}>{o.buyer}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: sm.bg, color: sm.fg, flexShrink: 0 }}>{sm.label}</span>
                    <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-900)', flexShrink: 0, minWidth: 80, textAlign: 'right' }}>{inr(o.total)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tenant info card */}
        <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, marginTop: 20 }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream-900)' }}>Tenant details · {tenantName}</h2>
          </div>
          <div style={{ padding: '16px 22px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 32px' }}>
            {[
              { label: 'Business name', value: currentTenant.business_name },
              { label: 'Subdomain',     value: `${currentTenant.slug}.dealflow.in` },
              { label: 'GSTIN',         value: currentTenant.gstin ?? '—' },
              { label: 'State',         value: currentTenant.primary_state ?? '—' },
              { label: 'Plan',          value: currentTenant.plan },
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--cream-900)' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
