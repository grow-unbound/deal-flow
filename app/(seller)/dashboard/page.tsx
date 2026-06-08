import Link from 'next/link';
import { headers } from 'next/headers';
import { DashboardOnboardingBanner } from '@/components/seller/dashboard/DashboardOnboardingBanner';
import { getSellerDashboardData } from '@/lib/server/seller-dashboard';

function inr(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return `₹${s}`;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${grouped},${last3}`;
}

function deltaText(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

const statusMeta: Record<string, { label: string; bg: string; fg: string }> = {
  received: { label: 'Received', bg: '#E7EEF1', fg: '#2A4B59' },
  confirmed: { label: 'Confirmed', bg: '#FBEFE3', fg: '#6B3818' },
  dispatched: { label: 'Dispatched', bg: '#FBF1DC', fg: '#7A5519' },
  delivered: { label: 'Delivered', bg: '#ECF3EC', fg: '#2F5733' },
  cancelled: { label: 'Cancelled', bg: '#F6E5DF', fg: '#6B2615' },
};

const hueAvatar: Record<string, { bg: string; fg: string; border: string }> = {
  teal: { bg: '#EAF1EE', fg: '#1F3A34', border: '#C6DAD3' },
  ember: { bg: '#FBEFE3', fg: '#874720', border: '#F5DAB8' },
  cream: { bg: '#F4EFE6', fg: '#1F3A34', border: '#EFE9DF' },
};

export default async function DashboardPage() {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  const tenantSlug = h.get('x-tenant-subdomain') || 'tenant';
  const dashboard = tenantId ? await getSellerDashboardData(tenantId) : null;

  const kpis = [
    {
      label: 'Orders this week',
      value: String(dashboard?.kpi.ordersThisWeek ?? 0),
      delta: deltaText(dashboard?.kpi.ordersDelta ?? 0),
      hint: 'vs last week',
      up: (dashboard?.kpi.ordersDelta ?? 0) >= 0,
    },
    {
      label: 'GMV this week',
      value: inr(dashboard?.kpi.gmvThisWeek ?? 0),
      delta: `${Math.round(dashboard?.kpi.gmvDeltaPct ?? 0)}%`,
      hint: 'vs last week',
      up: (dashboard?.kpi.gmvDeltaPct ?? 0) >= 0,
    },
    {
      label: 'Active catalogs',
      value: String(dashboard?.kpi.activeCatalogs ?? 0),
      delta: `${dashboard?.kpi.expiringCatalogs ?? 0} expiring`,
      hint: '',
      up: true,
    },
    {
      label: 'Low-stock alerts',
      value: String(dashboard?.kpi.lowStockAlerts ?? 0),
      delta: deltaText(dashboard?.kpi.lowStockDelta ?? 0),
      hint: 'vs yesterday',
      up: (dashboard?.kpi.lowStockDelta ?? 0) <= 0,
    },
  ];

  const topBrands = dashboard?.topBrands ?? [];
  const recentOrders = dashboard?.recentOrders ?? [];

  return (
    <>
      <DashboardOnboardingBanner tenantId={tenantId} />
      <div style={{ padding: '24px 32px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>This week</div>
            <h1 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-900)', lineHeight: 1.15 }}>
              Good morning.
            </h1>
            <p style={{ fontSize: 14, color: 'var(--cream-700)', marginTop: 6, maxWidth: 520, lineHeight: 1.5 }}>
              Live KPI summaries are now served from aggregate tables for faster load.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--cream-50)', border: '1px solid var(--border-2)', borderRadius: 8, fontSize: 13, fontWeight: 500, color: 'var(--cream-800)', cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              Last 7 days
            </button>
            <Link href="/catalogs" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--teal-500)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', textDecoration: 'none' }}>
              Go to catalogs
            </Link>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {kpis.map((k) => (
            <div key={k.label} style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(31,58,52,0.06)' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-900)', lineHeight: 1 }}>{k.value}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 600, color: k.up ? '#2F5733' : '#9C3A22' }}>{k.delta}</span>
                {k.hint && <span style={{ fontSize: 12, color: 'var(--cream-600)' }}>{k.hint}</span>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream-900)' }}>Brand performance</div>
                <div style={{ fontSize: 12, color: 'var(--cream-600)', marginTop: 2 }}>MTD revenue share</div>
              </div>
              <Link href="/brands" style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 600, textDecoration: 'none' }}>All brands</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topBrands.map((b) => {
                const av = hueAvatar[b.hue];
                const isDown = b.trend.startsWith('-');
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
              {topBrands.length === 0 && <p style={{ fontSize: 13, color: 'var(--cream-600)' }}>No brand data yet.</p>}
            </div>
          </div>

          <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream-900)' }}>Latest orders</div>
                <div style={{ fontSize: 12, color: 'var(--cream-600)', marginTop: 2 }}>Across all buyers</div>
              </div>
              <Link href="/sales-orders" style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 600, textDecoration: 'none' }}>All orders</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recentOrders.map((o) => {
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
              {recentOrders.length === 0 && <p style={{ fontSize: 13, color: 'var(--cream-600)' }}>No recent orders.</p>}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, marginTop: 20 }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream-900)' }}>Tenant details</h2>
          </div>
          <div style={{ padding: '16px 22px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 32px' }}>
            {[
              { label: 'Tenant ID', value: tenantId ?? '-' },
              { label: 'Subdomain', value: `${tenantSlug}.dealflow.in` },
              { label: 'Plan', value: 'starter' },
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
