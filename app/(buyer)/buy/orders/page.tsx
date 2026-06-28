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
import { TransactionCard, type OrderSummary } from '@/components/buyer/orders/TransactionCard';
import { InvoiceCard, type InvoiceSummary } from '@/components/buyer/orders/InvoiceCard';
import { EnquiryCard, type EstimateSummary } from '@/components/buyer/orders/EnquiryCard';


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


function PreviewPlaceholder({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div style={{ padding: '12px 16px 0' }}>
      <div style={{ background: 'white', border: '1px solid var(--border-1)', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
        <p style={{ fontSize: 'var(--b-text-body)', fontWeight: 600, color: 'var(--cream-800)', marginBottom: 4 }}>{title}</p>
        <p style={{ fontSize: 'var(--b-text-sub)', color: 'var(--cream-600)', lineHeight: 1.5 }}>{description}</p>
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

        {/* Sub-tabs — segmented control */}
        <div style={{ display: 'flex', background: 'var(--cream-200)', borderRadius: 10, padding: 3, margin: '14px 22px 0' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setSearch(''); }}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '6px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: activeTab === t.id ? '#fff' : 'transparent',
                boxShadow: activeTab === t.id ? '0 1px 2px rgba(31,58,52,0.06)' : 'none',
                transition: 'background 0.15s, box-shadow 0.15s',
              }}
            >
              <span style={{ fontSize: 'var(--b-text-sub)', fontWeight: 500, color: activeTab === t.id ? 'var(--teal-500)' : 'var(--cream-700)' }}>
                {t.label}
              </span>
              <span style={{
                fontSize: 'var(--b-text-eyebrow)', fontFamily: 'var(--font-mono)',
                padding: '1px 5px', borderRadius: 100,
                background: activeTab === t.id ? 'var(--teal-50)' : 'var(--cream-300)',
                color: activeTab === t.id ? 'var(--teal-500)' : 'var(--cream-700)',
              }}>
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
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--b-text-body)', color: 'var(--cream-900)' }}
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
                  <button key={f} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 100, fontSize: 'var(--b-text-label)', fontWeight: 500, border: '1px solid', background: i === 0 ? 'var(--teal-500)' : 'var(--cream-50)', color: i === 0 ? '#fff' : 'var(--cream-800)', borderColor: i === 0 ? 'var(--teal-500)' : 'var(--cream-400)', cursor: 'pointer' }}>
                    {f}
                  </button>
                ))}
              </div>
            )}

            <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pageState.loading ? (
                <div style={{ background: 'white', border: '1px solid var(--border-1)', borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 'var(--b-text-body)', color: 'var(--cream-600)' }}>Loading orders…</p>
                </div>
              ) : pageState.sellerPreview ? (
                <PreviewPlaceholder icon="📦" title="Order history" description="When a buyer logs in, their complete order history appears here — with real-time status tracking, filters, and search." />
              ) : visibleOrders.length === 0 ? (
                <div style={{ background: 'white', border: '1px solid var(--border-1)', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 'var(--b-text-body)', color: 'var(--cream-600)' }}>
                    {search ? `No orders matching "${search}"` : 'No orders yet.'}
                  </p>
                </div>
              ) : visibleOrders.map((o) => {
                const orderTag = updatedEntityIds.get(o.id);
                const orderSummary: OrderSummary = {
                  id: o.id,
                  order_number: o.order_number,
                  status: o.status,
                  total_amount: o.total_amount,
                  placed_at: o.placed_at,
                  item_count: o.items_count,
                  description: o.catalog_name || 'Order',
                };
                return (
                  <div key={o.id} onClick={() => markSeen(o.id)}>
                    {orderTag && <RealtimeBadge type={orderTag} />}
                    <TransactionCard order={orderSummary} href={`/buy/orders/${o.id}`} />
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
              <p style={{ fontSize: 'var(--b-text-body)', color: 'var(--cream-600)' }}>Loading enquiries…</p>
            </div>
          ) : visibleEstimates.length === 0 ? (
            <div style={{ padding: '12px 16px 0' }}>
              <div style={{ background: 'white', border: '1px solid var(--border-1)', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 'var(--b-text-body)', color: 'var(--cream-600)' }}>
                  {search ? `No enquiries matching "${search}"` : 'No enquiries yet.'}
                </p>
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleEstimates.map((e) => {
                const estimateSummary: EstimateSummary = {
                  id: e.id,
                  estimate_number: e.estimate_number,
                  status: e.status,
                  total_amount: e.total_amount,
                  created_at: e.created_at,
                  notes: e.notes,
                };
                return (
                  <EnquiryCard
                    key={e.id}
                    estimate={estimateSummary}
                    href={`/buy/estimates/${e.id}`}
                    highlighted={activeHighlight === e.id}
                  />
                );
              })}
            </div>
          )
        )}

        {/* ── Invoices tab ── */}
        {activeTab === 'invoices' && (
          pageState.sellerPreview ? (
            <PreviewPlaceholder icon="🧾" title="Invoices" description="Invoices generated for delivered orders appear here, with payment status and due dates." />
          ) : pageState.loading ? (
            <div style={{ padding: '12px 16px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--b-text-body)', color: 'var(--cream-600)' }}>Loading invoices…</p>
            </div>
          ) : visibleInvoices.length === 0 ? (
            <div style={{ padding: '12px 16px 0' }}>
              <div style={{ background: 'white', border: '1px solid var(--border-1)', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 'var(--b-text-body)', color: 'var(--cream-600)' }}>
                  {search ? `No invoices matching "${search}"` : 'No invoices yet.'}
                </p>
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleInvoices.map((inv) => {
                const invoiceSummary: InvoiceSummary = {
                  id: inv.id,
                  invoice_number: inv.invoice_number,
                  status: inv.status,
                  total_amount: inv.total_amount,
                  outstanding_balance: inv.outstanding_balance,
                  invoice_date: inv.invoice_date,
                  due_date: inv.due_date,
                };
                return (
                  <InvoiceCard key={inv.id} invoice={invoiceSummary} href={`/buy/invoices/${inv.id}`} />
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
