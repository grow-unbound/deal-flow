'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { ErrorState } from '@/components/ui/empty-state';

// INR formatter with Indian lakh grouping
function inr(n: number): string {
  const s = Math.round(n).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return '₹' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
}

// ─── API response types ───────────────────────────────────────────────────────

interface MeData {
  mode?: 'buyer' | 'preview';
  buyer_id: string;
  business_name: string;
  contact_name: string;
  credit_limit: number;
  credit_used: number;
  open_orders_count: number;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
}

type OrderStatus =
  | 'draft'
  | 'received'
  | 'confirmed'
  | 'partially_dispatched'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

interface BuyerOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
  placed_at: string;
  catalog_name: string | null;
  items_count: number;
}

interface OrdersData {
  mode?: 'buyer' | 'preview';
  orders: BuyerOrder[];
  preview_message?: string;
}

interface CatalogItem {
  id: string;
  name: string;
  product_count: number;
  share_token: string;
  valid_until: string | null;
}

interface CatalogsData {
  catalogs: CatalogItem[];
}

// ─── Display constants ────────────────────────────────────────────────────────

const statusColors: Record<string, { bg: string; fg: string }> = {
  draft:                { bg: '#EAF1EE', fg: '#142823' },
  received:             { bg: '#E7EEF1', fg: '#2A4B59' },
  confirmed:            { bg: '#FBEFE3', fg: '#6B3818' },
  partially_dispatched: { bg: '#FBF1DC', fg: '#7A5519' },
  dispatched:           { bg: '#FBF1DC', fg: '#7A5519' },
  delivered:            { bg: '#ECF3EC', fg: '#2F5733' },
  cancelled:            { bg: '#F6E5DF', fg: '#6B2615' },
};

const statusLabels: Record<string, string> = {
  draft:                'Draft',
  received:             'Received',
  confirmed:            'Confirmed',
  partially_dispatched: 'In Transit',
  dispatched:           'Dispatched',
  delivered:            'Delivered',
  cancelled:            'Cancelled',
};

const hueGradients: Record<string, string> = {
  teal:  'linear-gradient(135deg, #1F3A34 0%, #2D5549 100%)',
  ember: 'linear-gradient(135deg, #874720 0%, #C26E3A 100%)',
  cream: 'linear-gradient(135deg, #6B6760 0%, #3D3A35 100%)',
};

const catalogHues = ['teal', 'ember', 'cream'];

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function formatValidUntil(iso: string | null): string {
  if (!iso) return 'No end date';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Skeleton helpers ─────────────────────────────────────────────────────────

function SkeletonBox({ w, h, radius = 8 }: { w?: string | number; h: number; radius?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{
        width: w ?? '100%',
        height: h,
        borderRadius: radius,
        background: 'var(--bg-recessed, #e5e0d8)',
      }}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'buyer-home-page',
    initialState: {
      meData: null as MeData | null,
      ordersData: null as OrdersData | null,
      catalogsData: null as CatalogsData | null,
    },
  });
  const meData = routeState.meData;
  const ordersData = routeState.ordersData;
  const catalogsData = routeState.catalogsData;
  const [loading, setLoading] = useState(!meData && !ordersData && !catalogsData);
  const [loadFailed, setLoadFailed] = useState(false);
  useRouteScrollRestoration({
    storageKey: 'buyer-home-page',
    ready: !loading,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        setLoadFailed(false);
        const [meRes, ordersRes, catalogsRes] = await Promise.all([
          apiFetch('/api/buyer/me'),
          apiFetch('/api/buyer/orders'),
          apiFetch('/api/buyer/catalogs'),
        ]);

        if (cancelled) return;

        const [me, orders, catalogs] = await Promise.all([
          meRes.ok ? (meRes.json() as Promise<MeData>) : Promise.resolve(null),
          ordersRes.ok ? (ordersRes.json() as Promise<OrdersData>) : Promise.resolve({ orders: [] }),
          catalogsRes.ok ? (catalogsRes.json() as Promise<CatalogsData>) : Promise.resolve({ catalogs: [] }),
        ]);

        if (!cancelled) {
          setRouteState((current) => ({
            ...current,
            meData: me,
            ordersData: orders,
            catalogsData: catalogs,
          }));
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          setLoading(false);
        }
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  }, []);

  if (loadFailed) {
    return (
      <div className="px-4 py-8">
        <ErrorState
          heading="Couldn't load home"
          description="Check your connection and try again."
          onRetry={() => {
            setLoading(true);
            void (async () => {
              try {
                setLoadFailed(false);
                const [meRes, ordersRes, catalogsRes] = await Promise.all([
                  apiFetch('/api/buyer/me'),
                  apiFetch('/api/buyer/orders'),
                  apiFetch('/api/buyer/catalogs'),
                ]);
                const [me, orders, catalogs] = await Promise.all([
                  meRes.ok ? (meRes.json() as Promise<MeData>) : Promise.resolve(null),
                  ordersRes.ok ? (ordersRes.json() as Promise<OrdersData>) : Promise.resolve({ orders: [] }),
                  catalogsRes.ok ? (catalogsRes.json() as Promise<CatalogsData>) : Promise.resolve({ catalogs: [] }),
                ]);
                setRouteState((current) => ({
                  ...current,
                  meData: me,
                  ordersData: orders,
                  catalogsData: catalogs,
                }));
              } catch {
                setLoadFailed(true);
              } finally {
                setLoading(false);
              }
            })();
          }}
        />
      </div>
    );
  }

  const recentOrders = (ordersData?.orders ?? []).slice(0, 3);
  const catalogs = catalogsData?.catalogs ?? [];
  const availableCredit = (meData?.credit_limit ?? 0) - (meData?.credit_used ?? 0);

  return (
    <>
      <div>

        {/* Page head */}
        <div className="flex items-start justify-between px-5 pt-4 pb-2">
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-700)', fontFamily: 'var(--font-mono)' }}>
              {loading ? 'Loading…' : `Welcome back, ${meData?.contact_name || meData?.business_name || 'there'}`}
            </p>
            <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--cream-900)', lineHeight: 1.2, marginTop: 2 }}>
              {loading ? 'Your shelf, this month.' : `${meData?.tenant.name ?? 'Your distributor'}`}
            </h1>
            {!loading && meData?.mode === 'preview' ? (
              <p style={{ fontSize: 12, color: 'var(--cream-600)', marginTop: 6 }}>
                Buyer app preview is using tenant-wide access. Buyer-specific numbers show as 0.
              </p>
            ) : null}
          </div>
          <button style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--cream-200)', border: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--cream-700)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
        </div>

        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 16px' }}>
          {/* Credit limit card */}
          <div style={{ gridColumn: '1 / -1', background: 'var(--teal-500)', borderRadius: 14, padding: '16px 18px' }}>
            {loading ? (
              <>
                <SkeletonBox h={11} w="50%" radius={4} />
                <div style={{ marginTop: 4 }}><SkeletonBox h={28} w="60%" radius={6} /></div>
                <div style={{ marginTop: 4 }}><SkeletonBox h={12} w="80%" radius={4} /></div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(253,251,247,0.7)', fontFamily: 'var(--font-mono)' }}>Credit limit</p>
                <p style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-50)', lineHeight: 1.1, marginTop: 4 }}>
                  {inr(meData?.credit_limit ?? 0)}
                </p>
                <p style={{ fontSize: 12, color: 'rgba(253,251,247,0.6)', marginTop: 4 }}>
                  {inr(availableCredit)} available · {inr(meData?.credit_used ?? 0)} used
                </p>
              </>
            )}
          </div>

          {/* Open orders */}
          <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, padding: '14px 16px' }}>
            {loading ? (
              <>
                <SkeletonBox h={11} w="70%" radius={4} />
                <div style={{ marginTop: 4 }}><SkeletonBox h={28} w="40%" radius={6} /></div>
                <div style={{ marginTop: 4 }}><SkeletonBox h={12} w="90%" radius={4} /></div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>Open orders</p>
                <p style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-900)', lineHeight: 1.1, marginTop: 4 }}>
                  {meData?.open_orders_count ?? 0}
                </p>
                <p style={{ fontSize: 12, color: 'var(--cream-600)', marginTop: 4 }}>In progress</p>
              </>
            )}
          </div>

          {/* Available credit */}
          <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, padding: '14px 16px' }}>
            {loading ? (
              <>
                <SkeletonBox h={11} w="70%" radius={4} />
                <div style={{ marginTop: 4 }}><SkeletonBox h={22} w="80%" radius={6} /></div>
                <div style={{ marginTop: 4 }}><SkeletonBox h={12} w="90%" radius={4} /></div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>Available credit</p>
                <p style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-900)', lineHeight: 1.1, marginTop: 4 }}>
                  {inr(availableCredit)}
                </p>
                <p style={{ fontSize: 12, color: 'var(--cream-600)', marginTop: 4 }}>of {inr(meData?.credit_limit ?? 0)} limit</p>
              </>
            )}
          </div>
        </div>

        {/* Your distributors — single tenant shown */}
        <div style={{ padding: '16px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px 10px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>Your distributor</h3>
          </div>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {loading ? (
              <div style={{ padding: '11px 12px', background: 'var(--cream-50)', borderRadius: 10, border: '1px solid var(--border-1)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <SkeletonBox w={38} h={38} radius={10} />
                  <div style={{ flex: 1 }}>
                    <SkeletonBox h={14} w="60%" radius={4} />
                    <div style={{ marginTop: 4 }}><SkeletonBox h={12} w="40%" radius={4} /></div>
                  </div>
                </div>
              </div>
            ) : meData ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', background: 'var(--cream-50)', borderRadius: 10, border: '1px solid var(--border-1)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--teal-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--teal-700)', flexShrink: 0 }}>
                  {meData.tenant.name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cream-900)' }}>{meData.tenant.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--cream-600)', marginTop: 1 }}>{meData.tenant.slug}.dealflow.in</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Order again — static placeholder */}
        <div style={{ padding: '20px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px 10px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>Order again</h3>
            <Link href="/shop/catalog" style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 500 }}>Browse all</Link>
          </div>
          <div style={{ padding: '0 16px' }}>
            <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--cream-600)' }}>Coming soon — reorder from past purchases</p>
            </div>
          </div>
        </div>

        {/* New catalogs */}
        <div style={{ padding: '20px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px 10px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>New catalogs</h3>
            <Link href="/shop/catalog" style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 500 }}>See all</Link>
          </div>
          <div style={{ overflowX: 'auto', display: 'flex', gap: 10, padding: '0 16px 4px', scrollbarWidth: 'none' }}>
            {loading ? (
              [0, 1, 2].map((i) => (
                <div key={i} style={{ flexShrink: 0, width: 160, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-1)' }}>
                  <SkeletonBox h={90} radius={0} />
                  <div style={{ background: 'var(--cream-50)', padding: '8px 12px' }}>
                    <SkeletonBox h={12} w="70%" radius={4} />
                    <div style={{ marginTop: 4 }}><SkeletonBox h={11} w="50%" radius={4} /></div>
                  </div>
                </div>
              ))
            ) : catalogs.length === 0 ? (
              <div style={{ padding: '0 2px' }}>
                <p style={{ fontSize: 13, color: 'var(--cream-600)' }}>No published catalogs yet.</p>
              </div>
            ) : (
              catalogs.map((c, i) => {
                const hue = catalogHues[i % catalogHues.length] ?? 'teal';
                return (
                  <Link
                    key={c.id}
                    href={`/shop/catalog?share_token=${encodeURIComponent(c.share_token)}`}
                    style={{ flexShrink: 0, width: 160, borderRadius: 12, overflow: 'hidden', textDecoration: 'none', border: '1px solid var(--border-1)' }}
                  >
                    <div style={{ height: 90, background: hueGradients[hue], display: 'flex', alignItems: 'flex-end', padding: '12px 14px' }}>
                      <h4 style={{ fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{c.name}</h4>
                    </div>
                    <div style={{ background: 'var(--cream-50)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--cream-700)' }}>
                        <strong style={{ color: 'var(--cream-900)', fontWeight: 500 }}>{c.product_count}</strong> products
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>
                        {formatValidUntil(c.valid_until)}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>Recent activity</h3>
            <Link href="/shop/orders" style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 500 }}>See orders</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading ? (
              [0, 1].map((i) => (
                <div key={i} style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <SkeletonBox h={13} w="45%" radius={4} />
                    <SkeletonBox h={13} w="20%" radius={100} />
                  </div>
                  <SkeletonBox h={13} w="55%" radius={4} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <SkeletonBox h={12} w="40%" radius={4} />
                    <SkeletonBox h={14} w="25%" radius={4} />
                  </div>
                </div>
              ))
            ) : recentOrders.length === 0 ? (
              <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--cream-600)' }}>
                  {ordersData?.preview_message ?? 'No orders yet.'}
                </p>
              </div>
            ) : (
              recentOrders.map((o) => {
                const sc = statusColors[o.status] ?? statusColors.received;
                return (
                  <Link
                    key={o.id}
                    href="/shop/orders"
                    style={{ display: 'block', background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '12px 14px', textDecoration: 'none' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--cream-700)' }}>{o.order_number}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.fg }}>
                        {statusLabels[o.status] ?? o.status}
                      </span>
                    </div>
                    {o.catalog_name && (
                      <div style={{ fontSize: 13, color: 'var(--cream-800)', marginBottom: 6 }}>{o.catalog_name}</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--cream-600)' }}>
                        {o.items_count} {o.items_count === 1 ? 'product' : 'products'} · {formatRelativeTime(o.placed_at)}
                      </span>
                      <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-900)' }}>
                        {inr(o.total_amount)}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

      </div>
    </>
  );
}
