'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-fetch';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { BuyerStickyPageHeader } from '@/components/buyer/layout/BuyerStickyPageHeader';
import { openBuyerSearch } from '@/components/buyer/layout/BuyerSearchOverlay';
import { RealtimeBadge } from '@/components/ui/RealtimeBadge';
import { useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';

function inr(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

interface BuyerOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  placed_at: string;
  catalog_name: string | null;
  items_count: number;
}

interface BuyerEstimate {
  id: string;
  estimate_number: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  notes: string | null;
}

interface BuyerInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  outstanding_balance: number | null;
  invoice_date: string;
  due_date: string | null;
}

const statusColors: Record<string, { bg: string; fg: string }> = {
  received:            { bg: '#E7EEF1', fg: '#2A4B59' },
  confirmed:           { bg: '#FBEFE3', fg: '#6B3818' },
  partially_dispatched:{ bg: '#FBF1DC', fg: '#7A5519' },
  dispatched:          { bg: '#FBF1DC', fg: '#7A5519' },
  delivered:           { bg: '#ECF3EC', fg: '#2F5733' },
  cancelled:           { bg: '#F6E5DF', fg: '#6B2615' },
  draft:               { bg: '#F0EFF9', fg: '#3D3877' },
  pending:             { bg: '#FBEFE3', fg: '#6B3818' },
  paid:                { bg: '#ECF3EC', fg: '#2F5733' },
  due:                 { bg: '#FBEFE3', fg: '#6B3818' },
  overdue:             { bg: '#F6E5DF', fg: '#6B2615' },
};

const statusLabels: Record<string, string> = {
  draft: 'Draft', received: 'Received', confirmed: 'Confirmed',
  partially_dispatched: 'In Transit', dispatched: 'Dispatched',
  delivered: 'Delivered', cancelled: 'Cancelled',
  pending: 'Pending', paid: 'Paid', due: 'Due', overdue: 'Overdue',
};

type TabId = 'orders' | 'enquiries' | 'invoices';

interface PageState {
  orders: BuyerOrder[];
  estimates: BuyerEstimate[];
  invoices: BuyerInvoice[];
  sellerPreview: boolean;
  previewMessage: string | null;
  loading: boolean;
}

interface EnquiryCardProps {
  estimate: BuyerEstimate;
  highlighted: boolean;
}

function EnquiryCard({ estimate, highlighted }: EnquiryCardProps) {
  const sc = statusColors[estimate.status] ?? statusColors.received;
  return (
    <div
      style={{
        background: 'var(--cream-50)',
        border: highlighted ? '2px solid var(--teal-500)' : '1px solid var(--border-1)',
        borderRadius: 12,
        padding: highlighted ? '11px 13px' : '12px 14px',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
        boxShadow: highlighted ? '0 0 0 3px rgba(0,163,163,0.15)' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 'var(--yk-text-base)', fontFamily: 'var(--font-mono)', color: 'var(--cream-700)' }}>
          {estimate.estimate_number ?? estimate.id.slice(0, 8).toUpperCase()}
        </span>
        <span style={{ fontSize: 'var(--yk-text-xs)', fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.fg }}>
          {statusLabels[estimate.status] ?? estimate.status}
        </span>
      </div>
      {estimate.notes && (
        <div style={{ fontSize: 'var(--yk-text-base)', color: 'var(--cream-900)', fontWeight: 500, marginBottom: 4 }}>{estimate.notes}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)' }}>{fmtDate(estimate.created_at)}</span>
        {estimate.total_amount > 0 && (
          <span style={{ fontSize: 'var(--yk-text-base)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-900)' }}>
            {inr(estimate.total_amount)}
          </span>
        )}
      </div>
    </div>
  );
}

function PreviewPlaceholder({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div style={{ padding: '12px 16px 0' }}>
      <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
        <p style={{ fontSize: 'var(--yk-text-base)', fontWeight: 600, color: 'var(--cream-800)', marginBottom: 4 }}>{title}</p>
        <p style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)', lineHeight: 1.5 }}>{description}</p>
      </div>
    </div>
  );
}

function OrdersPageInner() {
  const searchParams = useSearchParams();
  const tabParamRaw = searchParams.get('tab');
  const tabParam = tabParamRaw === 'inquiries' ? 'enquiries' : (tabParamRaw as TabId | null);
  const { data: buyerMe } = useBuyerMe();
  const orderFeatures = buyerMe?.order_features ?? { enquiries: true, sales_orders: true, invoices: true };
  const highlightId = searchParams.get('highlight');

  const [search, setSearch] = useState('');
  const { updatedEntityIds, markSeen } = useBuyerRealtimeContext();

  const { state: pageState, setState: setPageState } = useRouteSnapshot<PageState>({
    storageKey: 'buyer-orders-page-data',
    initialState: {
      orders: [],
      estimates: [],
      invoices: [],
      sellerPreview: false,
      previewMessage: null,
      loading: true,
    },
  });

  const { state: activeTab, setState: setActiveTab } = useRouteSnapshot<TabId>({
    storageKey: 'buyer-orders-page-tab',
    initialState: tabParam ?? 'orders',
  });

  useRouteScrollRestoration({
    storageKey: 'buyer-orders-page-tab',
    ready: true,
  });

  useEffect(() => {
    if (tabParam) setActiveTab(tabParam);
  }, [setActiveTab, tabParam]);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        const [ordersRes, estimatesRes, invoicesRes] = await Promise.all([
          apiFetch('/api/buyer/orders'),
          apiFetch('/api/buyer/estimates'),
          apiFetch('/api/buyer/invoices'),
        ]);

        const ordersData = ordersRes.ok ? await ordersRes.json() : { orders: [] };
        const estimatesData = estimatesRes.ok ? await estimatesRes.json() : { estimates: [] };
        const invoicesData = invoicesRes.ok ? await invoicesRes.json() : { invoices: [] };

        if (cancelled) return;

        setPageState({
          orders: ordersData.orders ?? [],
          estimates: estimatesData.estimates ?? [],
          invoices: invoicesData.invoices ?? [],
          sellerPreview: ordersData.seller_preview === true,
          previewMessage: ordersData.preview_message ?? null,
          loading: false,
        });
      } catch {
        if (!cancelled) setPageState((s) => ({ ...s, loading: false }));
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  }, [setPageState]);

  // Highlight the newly-submitted enquiry for 1.5 s
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId || activeTab !== 'enquiries') return;
    const delay = setTimeout(() => {
      setActiveHighlight(highlightId);
      highlightTimerRef.current = setTimeout(() => setActiveHighlight(null), 1500);
    }, 300);
    return () => {
      clearTimeout(delay);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, [highlightId, activeTab]);

  // Client-side search filtering
  const q = search.toLowerCase();
  const visibleOrders = q
    ? pageState.orders.filter((o) =>
        o.order_number.toLowerCase().includes(q) ||
        (o.catalog_name ?? '').toLowerCase().includes(q) ||
        (statusLabels[o.status] ?? o.status).toLowerCase().includes(q)
      )
    : pageState.orders;

  // Prepend the newly-submitted enquiry if it's not yet in the list
  const allEstimates =
    highlightId && !pageState.estimates.find((e) => e.id === highlightId)
      ? [
          { id: highlightId, estimate_number: null, status: 'received', total_amount: 0, created_at: new Date().toISOString(), notes: 'New inquiry submitted' },
          ...pageState.estimates,
        ]
      : pageState.estimates;

  const visibleEstimates = q
    ? allEstimates.filter((e) =>
        (e.estimate_number ?? '').toLowerCase().includes(q) ||
        (e.notes ?? '').toLowerCase().includes(q) ||
        (statusLabels[e.status] ?? e.status).toLowerCase().includes(q)
      )
    : allEstimates;

  const visibleInvoices = q
    ? pageState.invoices.filter((inv) =>
        inv.invoice_number.toLowerCase().includes(q) ||
        (statusLabels[inv.status] ?? inv.status).toLowerCase().includes(q)
      )
    : pageState.invoices;

  const allTabs: Array<{ id: TabId; label: string; count: number; enabled: boolean }> = [
    { id: 'orders',    label: 'Orders',    count: pageState.orders.length,    enabled: true },
    { id: 'enquiries', label: 'Enquiries', count: allEstimates.length,        enabled: orderFeatures.enquiries },
    { id: 'invoices',  label: 'Invoices',  count: pageState.invoices.length,  enabled: orderFeatures.invoices },
  ];
  const tabs = allTabs.filter((t) => t.enabled);

  const searchPlaceholder =
    activeTab === 'orders' ? 'Search orders…' :
    activeTab === 'enquiries' ? 'Search enquiries…' : 'Search invoices…';

  return (
    <>
      <div>
        <BuyerStickyPageHeader
          eyebrow="Activity"
          title="Your orders"
          collapsedTitle="Orders"
          rightSlot={
            <button
              type="button"
              onClick={() => openBuyerSearch()}
              style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'var(--cream-200)', border: '1px solid var(--border-1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
              aria-label="Search"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--cream-700)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          }
        />

        {/* Sub-tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-1)', margin: '14px 0 0', padding: '0 16px' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setSearch(''); }}
              style={{
                paddingBottom: 10, paddingRight: 18, marginBottom: -1,
                background: 'none', border: 'none',
                borderBottom: activeTab === t.id ? '2px solid var(--teal-500)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 'var(--yk-text-base)', fontWeight: activeTab === t.id ? 600 : 400, color: activeTab === t.id ? 'var(--teal-500)' : 'var(--cream-700)' }}>
                {t.label}
              </span>
              <span style={{ marginLeft: 6, fontSize: 'var(--yk-text-base)', fontFamily: 'var(--font-mono)', color: 'var(--cream-600)', background: 'var(--cream-200)', padding: '1px 6px', borderRadius: 100 }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Inline search */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--cream-50)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 14px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-600)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--yk-text-base)', color: 'var(--cream-900)' }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-500)', lineHeight: 1, padding: 0 }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* ── Orders tab ── */}
        {activeTab === 'orders' && (
          <>
            {!pageState.sellerPreview && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px 0', scrollbarWidth: 'none' }}>
                {['All', 'Received', 'Confirmed', 'Dispatched', 'Delivered'].map((f, i) => (
                  <button key={f} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 100, fontSize: 'var(--yk-text-base)', fontWeight: 500, border: '1px solid', background: i === 0 ? 'var(--teal-500)' : 'var(--cream-50)', color: i === 0 ? '#fff' : 'var(--cream-800)', borderColor: i === 0 ? 'var(--teal-500)' : 'var(--border-2)', cursor: 'pointer' }}>
                    {f}
                  </button>
                ))}
              </div>
            )}

            <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pageState.loading ? (
                <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 'var(--yk-text-base)', color: 'var(--cream-600)' }}>Loading orders…</p>
                </div>
              ) : pageState.sellerPreview ? (
                <PreviewPlaceholder icon="📦" title="Order history" description="When a buyer logs in, their complete order history appears here — with real-time status tracking, filters, and search." />
              ) : visibleOrders.length === 0 ? (
                <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 'var(--yk-text-base)', color: 'var(--cream-600)' }}>
                    {search ? `No orders matching "${search}"` : 'No orders yet.'}
                  </p>
                </div>
              ) : visibleOrders.map((o) => {
                const sc = statusColors[o.status] ?? statusColors.received;
                const orderTag = updatedEntityIds.get(o.id);
                return (
                  <div key={o.id} onClick={() => markSeen(o.id)} style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 'var(--yk-text-base)', fontFamily: 'var(--font-mono)', color: 'var(--cream-700)' }}>{o.order_number}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {orderTag && <RealtimeBadge type={orderTag} />}
                        <span style={{ fontSize: 'var(--yk-text-xs)', fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.fg }}>{statusLabels[o.status] ?? o.status}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 'var(--yk-text-base)', color: 'var(--cream-800)', marginBottom: 6 }}>{o.catalog_name ?? 'Order'}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)' }}>
                        {o.items_count} products · {new Date(o.placed_at).toLocaleDateString('en-IN')}
                      </span>
                      <span style={{ fontSize: 'var(--yk-text-base)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-900)' }}>{inr(o.total_amount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── Enquiries tab ── */}
        {activeTab === 'enquiries' && (
          pageState.sellerPreview ? (
            <PreviewPlaceholder icon="📋" title="Enquiries" description="Buyers can raise enquiries for custom pricing or bulk orders. Their enquiries and status updates appear here." />
          ) : pageState.loading ? (
            <div style={{ padding: '12px 16px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--yk-text-base)', color: 'var(--cream-600)' }}>Loading enquiries…</p>
            </div>
          ) : visibleEstimates.length === 0 ? (
            <div style={{ padding: '12px 16px 0' }}>
              <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 'var(--yk-text-base)', color: 'var(--cream-600)' }}>
                  {search ? `No enquiries matching "${search}"` : 'No enquiries yet.'}
                </p>
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleEstimates.map((e) => (
                <EnquiryCard key={e.id} estimate={e} highlighted={activeHighlight === e.id} />
              ))}
            </div>
          )
        )}

        {/* ── Invoices tab ── */}
        {activeTab === 'invoices' && (
          pageState.sellerPreview ? (
            <PreviewPlaceholder icon="🧾" title="Invoices" description="Invoices generated for delivered orders appear here, with payment status and due dates." />
          ) : pageState.loading ? (
            <div style={{ padding: '12px 16px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--yk-text-base)', color: 'var(--cream-600)' }}>Loading invoices…</p>
            </div>
          ) : visibleInvoices.length === 0 ? (
            <div style={{ padding: '12px 16px 0' }}>
              <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 'var(--yk-text-base)', color: 'var(--cream-600)' }}>
                  {search ? `No invoices matching "${search}"` : 'No invoices yet.'}
                </p>
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleInvoices.map((inv) => {
                const sc = statusColors[inv.status] ?? statusColors.due;
                return (
                  <div key={inv.id} style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 'var(--yk-text-base)', fontFamily: 'var(--font-mono)', color: 'var(--cream-700)' }}>{inv.invoice_number}</span>
                      <span style={{ fontSize: 'var(--yk-text-xs)', fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.fg }}>
                        {statusLabels[inv.status] ?? inv.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)' }}>
                        {fmtDate(inv.invoice_date)}
                        {inv.due_date ? ` · Due ${fmtDate(inv.due_date)}` : ''}
                      </span>
                      <span style={{ fontSize: 'var(--yk-text-base)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-900)' }}>
                        {inr(inv.total_amount)}
                      </span>
                    </div>
                    {inv.outstanding_balance != null && inv.outstanding_balance > 0 && (
                      <div style={{ marginTop: 4, fontSize: 'var(--yk-text-xs)', color: statusColors.overdue.fg }}>
                        Outstanding: {inr(inv.outstanding_balance)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersPageInner />
    </Suspense>
  );
}
