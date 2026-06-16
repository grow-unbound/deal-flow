'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { ErrorState } from '@/components/ui/empty-state';
import { BuyerHomeLandingHeader } from '@/components/buyer/layout/BuyerHomeLandingHeader';
import { BuyerNotificationDrawer } from '@/components/buyer/layout/BuyerNotificationDrawer';
import { RealtimeBadge } from '@/components/ui/RealtimeBadge';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';

function inr(n: number): string {
  const s = Math.round(n).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return '₹' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeData {
  mode?: 'buyer' | 'preview';
  buyer_id: string;
  business_name: string;
  contact_name: string;
  greeting_name?: string | null;
  credit_limit: number;
  credit_used: number;
  open_orders_count: number;
  tenant: { id: string; name: string; slug: string };
  business_policy?: { credit_enabled: boolean; gst_inclusive: boolean };
}

type OrderStatus = 'draft' | 'received' | 'confirmed' | 'partially_dispatched' | 'dispatched' | 'delivered' | 'cancelled';

interface BuyerOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
  placed_at: string;
  catalog_name: string | null;
  items_count: number;
}

interface ReorderItem {
  tenant_product_id: string;
  display_name: string;
  brand_name?: string | null;
  image_urls: string[];
  price: number;
  default_uom?: string | null;
}

interface CatalogItem {
  id: string;
  name: string;
  product_count: number;
  share_token: string;
  valid_until: string | null;
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
  draft: 'Draft', received: 'Received', confirmed: 'Confirmed',
  partially_dispatched: 'In Transit', dispatched: 'Dispatched',
  delivered: 'Delivered', cancelled: 'Cancelled',
};

const catalogHues = [
  'linear-gradient(135deg, #1F3A34 0%, #2D5549 100%)',
  'linear-gradient(135deg, #874720 0%, #C26E3A 100%)',
  'linear-gradient(135deg, #6B6760 0%, #3D3A35 100%)',
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

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

function Skel({ w, h, r = 8 }: { w?: string | number; h: number; r?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{ width: w ?? '100%', height: h, borderRadius: r, background: 'var(--bg-recessed, #e5e0d8)' }}
    />
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionRow({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px 10px' }}>
      <h3 style={{ fontSize: 'var(--yk-text-md)', fontWeight: 600, color: 'var(--cream-900)' }}>{title}</h3>
      {href && (
        <Link href={href} style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--teal-500)', fontWeight: 500, textDecoration: 'none' }}>
          {linkLabel ?? 'See all'}
        </Link>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [notifOpen, setNotifOpen] = useState(false);
  const { unreadCount, updatedEntityIds, markSeen, setRefreshFn } = useBuyerRealtimeContext();
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'buyer-home-page',
    initialState: {
      meData: null as MeData | null,
      ordersData: null as { orders: BuyerOrder[]; preview_message?: string } | null,
      catalogsData: null as { catalogs: CatalogItem[] } | null,
      reorderData: null as { items: ReorderItem[] } | null,
    },
  });
  const meData = routeState.meData;
  const ordersData = routeState.ordersData;
  const catalogsData = routeState.catalogsData;
  const reorderData = routeState.reorderData;
  const [loading, setLoading] = useState(!meData && !ordersData && !catalogsData);
  const [loadFailed, setLoadFailed] = useState(false);
  useRouteScrollRestoration({ storageKey: 'buyer-home-page', ready: !loading });

  async function loadAll() {
    try {
      setLoadFailed(false);
      const [meRes, ordersRes, catalogsRes, reorderRes] = await Promise.all([
        apiFetch('/api/buyer/me'),
        apiFetch('/api/buyer/orders'),
        apiFetch('/api/buyer/catalogs'),
        apiFetch('/api/buyer/reorder'),
      ]);
      const [me, orders, catalogs, reorder] = await Promise.all([
        meRes.ok ? (meRes.json() as Promise<MeData>) : Promise.resolve(null),
        ordersRes.ok ? (ordersRes.json() as Promise<{ orders: BuyerOrder[] }>) : Promise.resolve({ orders: [] }),
        catalogsRes.ok ? (catalogsRes.json() as Promise<{ catalogs: CatalogItem[] }>) : Promise.resolve({ catalogs: [] }),
        reorderRes.ok ? (reorderRes.json() as Promise<{ items: ReorderItem[] }>) : Promise.resolve({ items: [] }),
      ]);
      setRouteState((c) => ({ ...c, meData: me, ordersData: orders, catalogsData: catalogs, reorderData: reorder }));
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setRefreshFn(() => loadAll);
    return () => setRefreshFn(null);
  }, [setRefreshFn]);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      try {
        setLoadFailed(false);
        const [meRes, ordersRes, catalogsRes, reorderRes] = await Promise.all([
          apiFetch('/api/buyer/me'),
          apiFetch('/api/buyer/orders'),
          apiFetch('/api/buyer/catalogs'),
          apiFetch('/api/buyer/reorder'),
        ]);
        if (cancelled) return;
        const [me, orders, catalogs, reorder] = await Promise.all([
          meRes.ok ? (meRes.json() as Promise<MeData>) : Promise.resolve(null),
          ordersRes.ok ? (ordersRes.json() as Promise<{ orders: BuyerOrder[] }>) : Promise.resolve({ orders: [] }),
          catalogsRes.ok ? (catalogsRes.json() as Promise<{ catalogs: CatalogItem[] }>) : Promise.resolve({ catalogs: [] }),
          reorderRes.ok ? (reorderRes.json() as Promise<{ items: ReorderItem[] }>) : Promise.resolve({ items: [] }),
        ]);
        if (!cancelled) {
          setRouteState((c) => ({ ...c, meData: me, ordersData: orders, catalogsData: catalogs, reorderData: reorder }));
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setLoadFailed(true); setLoading(false); }
      }
    }
    void go();
    return () => { cancelled = true; };
  }, []);

  if (loadFailed) {
    return (
      <div className="px-4 py-8">
        <ErrorState heading="Couldn't load home" description="Check your connection and try again." onRetry={() => { setLoading(true); void loadAll(); }} />
      </div>
    );
  }

  const recentOrders = (ordersData?.orders ?? []).slice(0, 3);
  const catalogs = catalogsData?.catalogs ?? [];
  const reorderItems = reorderData?.items ?? [];
  const availableCredit = (meData?.credit_limit ?? 0) - (meData?.credit_used ?? 0);
  const creditEnabled = meData?.business_policy?.credit_enabled ?? true;
  const firstName = meData?.greeting_name || meData?.contact_name?.split(' ')[0] || meData?.business_name || 'there';

  return (
    <div style={{ paddingBottom: 24 }}>

      <BuyerHomeLandingHeader
        greetingLine={loading ? 'Welcome' : `${getGreeting()}, ${firstName}`}
        title="Your shelf, this month."
        previewNote={meData?.mode === 'preview' ? 'Preview mode — buyer-specific numbers show as 0.' : null}
        rightSlot={
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--cream-100)', border: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}
            aria-label="Notifications"
          >
            <Bell size={17} strokeWidth={1.75} style={{ color: 'var(--cream-700)' }} />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: 'var(--ember-500, #B5642F)' }} />
            )}
          </button>
        }
      />

      {/* ── KPI grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 16px 0' }}>
        {creditEnabled ? (
          <div style={{ gridColumn: '1 / -1', background: 'var(--teal-500)', borderRadius: 14, padding: '16px 18px' }}>
            {loading ? (
              <>
                <Skel h={11} w="50%" r={4} />
                <div style={{ marginTop: 4 }}><Skel h={28} w="60%" r={6} /></div>
                <div style={{ marginTop: 4 }}><Skel h={12} w="80%" r={4} /></div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(253,251,247,0.7)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>Credit limit</p>
                <p style={{ fontSize: 'var(--yk-text-2xl)', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-50)', lineHeight: 1.1, marginTop: 4 }}>{inr(meData?.credit_limit ?? 0)}</p>
                <p style={{ fontSize: 'var(--yk-text-sm)', color: 'rgba(253,251,247,0.6)', marginTop: 4 }}>
                  <span className="tabular-inline">{inr(availableCredit)}</span> available · <span className="tabular-inline">{inr(meData?.credit_used ?? 0)}</span> used
                </p>
              </>
            )}
          </div>
        ) : null}

        <div style={{ gridColumn: creditEnabled ? undefined : '1 / -1', background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, padding: '14px 16px' }}>
          {loading ? (<><Skel h={11} w="70%" r={4} /><div style={{ marginTop: 4 }}><Skel h={28} w="40%" r={6} /></div><div style={{ marginTop: 4 }}><Skel h={12} w="90%" r={4} /></div></>) : (
            <>
              <p style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>Open orders</p>
              <p style={{ fontSize: 'var(--yk-text-2xl)', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-900)', lineHeight: 1.1, marginTop: 4 }}>{meData?.open_orders_count ?? 0}</p>
              <p style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)', marginTop: 4 }}>In progress</p>
            </>
          )}
        </div>

        {creditEnabled ? (
          <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, padding: '14px 16px' }}>
            {loading ? (<><Skel h={11} w="70%" r={4} /><div style={{ marginTop: 4 }}><Skel h={22} w="80%" r={6} /></div><div style={{ marginTop: 4 }}><Skel h={12} w="90%" r={4} /></div></>) : (
              <>
                <p style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>Available</p>
                <p style={{ fontSize: 'var(--yk-text-xl)', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-900)', lineHeight: 1.1, marginTop: 4 }}>{inr(availableCredit)}</p>
                <p style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)', marginTop: 4 }}>of <span className="tabular-inline">{inr(meData?.credit_limit ?? 0)}</span></p>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* ── Distributor list ── */}
      {(loading || meData?.tenant) ? (
        <div style={{ padding: '20px 0 0' }}>
          <SectionRow title="Your distributor" />
          <div style={{ padding: '0 16px' }}>
            <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, overflow: 'hidden' }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px' }}>
                  <Skel w={40} h={40} r={999} />
                  <div style={{ flex: 1 }}><Skel h={13} w="60%" r={4} /><div style={{ marginTop: 4 }}><Skel h={11} w="40%" r={4} /></div></div>
                  <Skel w={60} h={18} r={4} />
                </div>
              ) : meData?.tenant ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--teal-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 'var(--yk-text-sm)', fontWeight: 700, color: '#fff' }}>
                      {meData.tenant.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--yk-text-base)', fontWeight: 600, color: 'var(--cream-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meData.tenant.name}</div>
                    <div style={{ fontSize: 'var(--yk-text-xs)', color: 'var(--cream-600)', marginTop: 1 }}>{meData.open_orders_count} open order{meData.open_orders_count !== 1 ? 's' : ''}</div>
                  </div>
                  {creditEnabled && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 'var(--yk-text-sm)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-900)' }}>{inr(meData.credit_used)}</div>
                      <div style={{ fontSize: 'var(--yk-text-xs)', color: 'var(--cream-500)', marginTop: 1 }}>spent</div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Order again carousel ── */}
      <div style={{ padding: '20px 0 0' }}>
        <SectionRow title="Order again" href="/buy/catalog" linkLabel="Browse catalog" />
        <div style={{ overflowX: 'auto', display: 'flex', gap: 10, padding: '0 16px 4px', scrollbarWidth: 'none' }}>
          {loading ? (
            [0, 1, 2].map((i) => (
              <div key={i} style={{ flexShrink: 0, width: 144, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-1)' }}>
                <Skel h={160} r={0} />
                <div style={{ background: 'var(--cream-50)', padding: '8px 10px' }}>
                  <Skel h={12} w="80%" r={4} /><div style={{ marginTop: 4 }}><Skel h={13} w="50%" r={4} /></div>
                </div>
              </div>
            ))
          ) : reorderItems.length === 0 ? (
            <div style={{ padding: '0 2px' }}>
              <p style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)' }}>No previous orders yet.</p>
            </div>
          ) : (
            reorderItems.slice(0, 8).map((item) => (
              <Link
                key={item.tenant_product_id}
                href={`/buy/product/${item.tenant_product_id}`}
                onClick={() => markBuyerNavigationForward()}
                style={{ flexShrink: 0, width: 144, borderRadius: 12, overflow: 'hidden', textDecoration: 'none', border: '1px solid var(--border-1)' }}
              >
                <div style={{ height: 160, background: 'var(--cream-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {item.image_urls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_urls[0]} alt={item.display_name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12 }} />
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--cream-400)" strokeWidth="1.5"><path d="M20 7H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM16 3H8v4h8V3z" /></svg>
                  )}
                </div>
                <div style={{ background: 'var(--cream-50)', padding: '8px 10px' }}>
                  {item.brand_name && <p style={{ fontSize: 'var(--yk-text-xs)', color: 'var(--cream-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{item.brand_name}</p>}
                  <p style={{ fontSize: 'var(--yk-text-sm)', fontWeight: 600, color: 'var(--cream-900)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.display_name}</p>
                  <p style={{ fontSize: 'var(--yk-text-sm)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--teal-600)', marginTop: 4 }}>{inr(item.price)}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* ── New catalogs ── */}
      <div style={{ padding: '20px 0 0' }}>
        <SectionRow title="New catalogs" href="/buy/catalog" linkLabel="See all" />
        <div style={{ overflowX: 'auto', display: 'flex', gap: 10, padding: '0 16px 4px', scrollbarWidth: 'none' }}>
          {loading ? (
            [0, 1, 2].map((i) => (
              <div key={i} style={{ flexShrink: 0, width: 160, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-1)' }}>
                <Skel h={90} r={0} /><div style={{ background: 'var(--cream-50)', padding: '8px 12px' }}><Skel h={12} w="70%" r={4} /><div style={{ marginTop: 4 }}><Skel h={11} w="50%" r={4} /></div></div>
              </div>
            ))
          ) : catalogs.length === 0 ? (
            <p style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)', padding: '0 2px' }}>No published catalogs yet.</p>
          ) : (
            catalogs.map((c, i) => (
              <Link
                key={c.id}
                href={`/buy/catalog?share_token=${encodeURIComponent(c.share_token)}`}
                onClick={() => { markBuyerNavigationForward(); markSeen(c.id); }}
                style={{ flexShrink: 0, width: 200, borderRadius: 12, overflow: 'hidden', textDecoration: 'none', border: '1px solid var(--border-1)' }}
              >
                <div style={{ height: 90, background: catalogHues[i % catalogHues.length], display: 'flex', alignItems: 'flex-end', padding: '12px 14px', position: 'relative' }}>
                  {updatedEntityIds.has(c.id) && (
                    <span style={{ position: 'absolute', top: 8, right: 8 }}>
                      <RealtimeBadge type="new" />
                    </span>
                  )}
                  <h4 style={{ fontSize: 'var(--yk-text-base)', fontFamily: 'var(--font-display)', fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{c.name}</h4>
                </div>
                <div style={{ background: 'var(--cream-50)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-700)' }}><strong style={{ color: 'var(--cream-900)', fontWeight: 500 }}>{c.product_count}</strong> products</span>
                  <span style={{ fontSize: 'var(--yk-text-xs)', color: 'var(--cream-500)' }}>{formatValidUntil(c.valid_until)}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* ── Recent activity ── */}
      <div style={{ padding: '20px 16px 0' }}>
        <SectionRow title="Recent activity" href="/buy/orders" linkLabel="See orders" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            [0, 1].map((i) => (
              <div key={i} style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><Skel h={13} w="45%" r={4} /><Skel h={13} w="20%" r={100} /></div>
                <Skel h={13} w="55%" r={4} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}><Skel h={12} w="40%" r={4} /><Skel h={14} w="25%" r={4} /></div>
              </div>
            ))
          ) : recentOrders.length === 0 ? (
            <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)' }}>{ordersData?.preview_message ?? 'No orders yet.'}</p>
            </div>
          ) : (
            recentOrders.map((o) => {
              const sc = statusColors[o.status] ?? statusColors.received;
              const orderTag = updatedEntityIds.get(o.id);
              return (
                <Link key={o.id} href="/buy/orders" onClick={() => markSeen(o.id)} style={{ display: 'block', background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '12px 14px', textDecoration: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 'var(--yk-text-base)', fontFamily: 'var(--font-mono)', color: 'var(--cream-700)' }}>{o.order_number}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {orderTag && <RealtimeBadge type={orderTag} />}
                      <span style={{ fontSize: 'var(--yk-text-xs)', fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.fg }}>{statusLabels[o.status] ?? o.status}</span>
                    </div>
                  </div>
                  {o.catalog_name && <div style={{ fontSize: 'var(--yk-text-base)', color: 'var(--cream-800)', marginBottom: 6 }}>{o.catalog_name}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)' }}><span className="tabular-inline">{o.items_count}</span> {o.items_count === 1 ? 'product' : 'products'} · <span className="tabular-inline">{formatRelativeTime(o.placed_at)}</span></span>
                    <span style={{ fontSize: 'var(--yk-text-base)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-900)' }}>{inr(o.total_amount)}</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      <BuyerNotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
