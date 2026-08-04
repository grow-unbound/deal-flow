'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { BuyerStickyPageHeader } from '@/components/buyer/layout/BuyerStickyPageHeader';
import { BuyerTransactionFilterChips } from '@/components/buyer/orders/BuyerTransactionFilterChips';
import { OrdersLandingSkeleton, OrdersTabBarSkeleton } from '@/components/buyer/orders/OrdersLandingSkeleton';
import { BuyerTransactionCardSkeleton } from '@/components/buyer/orders/BuyerTransactionCardSkeleton';
import { OrdersTab } from '@/components/buyer/orders/OrdersTab';
import { EnquiriesTab } from '@/components/buyer/orders/EnquiriesTab';
import { InvoicesTab } from '@/components/buyer/orders/InvoicesTab';
import { useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';
import { useBuyerScrollRoot } from '@/contexts/BuyerScrollContext';
import {
  BUYER_ESTIMATE_STATUS_CHIPS,
  BUYER_INVOICE_STATUS_CHIPS,
  BUYER_ORDER_STATUS_CHIPS,
  type BuyerEstimateStatusChip,
  type BuyerInvoiceStatusChip,
  type BuyerOrderStatusChip,
} from '@/lib/buyer-transaction-filters';
import {
  BUYER_ORDERS_DEFAULT_TAB,
  isBuyerOrdersTabId,
  resolveBuyerOrdersDefaultTab,
  resolveBuyerOrdersTabVisibility,
  type BuyerOrdersTabId,
} from '@/lib/buyer-orders-tabs';

type TabId = BuyerOrdersTabId;

function parseInvoiceStatusFromUrl(status: string | null): BuyerInvoiceStatusChip {
  if (status === 'Due' || status === 'Overdue' || status === 'Paid' || status === 'Void') {
    return status;
  }
  return 'All';
}

function PreviewPlaceholder({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="px-4 pt-3">
      <div className="rounded-[12px] border border-[var(--border-1)] bg-white px-4 py-5 text-center">
        <div className="mb-2 text-[28px]">{icon}</div>
        <p className="text-[var(--b-text-body)] font-semibold text-[var(--cream-800)]">{title}</p>
        <p className="mt-1 text-[var(--b-text-sub)] text-[var(--cream-600)]">{description}</p>
      </div>
    </div>
  );
}

function OrdersPageInner() {
  const searchParams = useSearchParams();
  const tabParamRaw = searchParams.get('tab');
  const tabParamNormalized = tabParamRaw === 'inquiries' ? 'enquiries' : tabParamRaw;
  const tabParam = isBuyerOrdersTabId(tabParamNormalized) ? tabParamNormalized : null;
  const { data: buyerMe } = useBuyerMe();
  const salesOrdersFlag = useFlagState('SALES_ORDERS');
  const estimatesFlag = useFlagState('ESTIMATES');
  const invoicesFlag = useFlagState('INVOICES');
  const visibility = resolveBuyerOrdersTabVisibility({
    orderFeatures: buyerMe?.order_features,
    salesOrdersFlag,
    estimatesFlag,
    invoicesFlag,
  });
  const highlightId = searchParams.get('highlight');
  const statusParam = searchParams.get('status');
  const sellerPreview = buyerMe?.seller_preview === true;
  const hasUrlTab = Boolean(tabParam);
  const hasDeepLink = hasUrlTab || Boolean(statusParam);
  const scrollContext = useBuyerScrollRoot();

  const [search, setSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<BuyerOrderStatusChip>('All');
  const [estimateStatusFilter, setEstimateStatusFilter] = useState<BuyerEstimateStatusChip>('All');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<BuyerInvoiceStatusChip>(() => (
    tabParam === 'invoices' || (!tabParam && BUYER_ORDERS_DEFAULT_TAB === 'invoices')
      ? parseInvoiceStatusFromUrl(statusParam)
      : 'All'
  ));
  const { updatedEntityIds, markSeen } = useBuyerRealtimeContext();

  const { state: snapshotTab, setState: setSnapshotTab } = useRouteSnapshot<TabId>({
    storageKey: 'buyer-orders-page-tab',
    initialState: tabParam ?? BUYER_ORDERS_DEFAULT_TAB,
    enabled: !hasUrlTab,
  });

  const [urlDrivenTab, setUrlDrivenTab] = useState<TabId>(tabParam ?? BUYER_ORDERS_DEFAULT_TAB);
  const requestedTab = hasUrlTab ? urlDrivenTab : snapshotTab;

  const setActiveTab = (tab: TabId) => {
    if (hasUrlTab) {
      setUrlDrivenTab(tab);
    }
    setSnapshotTab(tab);
  };

  const fallbackTab = resolveBuyerOrdersDefaultTab(visibility, BUYER_ORDERS_DEFAULT_TAB);
  const activeTab: TabId =
    visibility.ready && visibility[requestedTab]
      ? requestedTab
      : (fallbackTab ?? BUYER_ORDERS_DEFAULT_TAB);

  // Deep links from home KPIs must land at the top — do not restore a prior scrollY.
  useRouteScrollRestoration({
    storageKey: 'buyer-orders-page-tab',
    ready: true,
    enabled: !hasDeepLink,
  });

  useEffect(() => {
    if (!hasDeepLink) return;
    const root = scrollContext?.scrollRoot;
    if (root) {
      root.scrollTo({ top: 0, behavior: 'auto' });
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [hasDeepLink, scrollContext?.scrollRoot, statusParam, tabParam]);

  useEffect(() => {
    if (tabParam) {
      setUrlDrivenTab(tabParam);
      setSnapshotTab(tabParam);
    }
  }, [setSnapshotTab, tabParam]);

  useEffect(() => {
    if (!visibility.ready) return;
    if (visibility[requestedTab]) return;
    if (fallbackTab && fallbackTab !== requestedTab) {
      setActiveTab(fallbackTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only snap when visibility/request mismatch
  }, [visibility.ready, visibility.orders, visibility.enquiries, visibility.invoices, requestedTab, fallbackTab]);

  useEffect(() => {
    if (activeTab !== 'invoices') return;
    if (tabParam === 'invoices' || (!tabParam && statusParam)) {
      setInvoiceStatusFilter(parseInvoiceStatusFromUrl(statusParam));
    }
  }, [statusParam, tabParam, activeTab]);

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

  const allTabs: Array<{ id: TabId; label: string; enabled: boolean }> = [
    { id: 'orders', label: 'Orders', enabled: visibility.orders },
    { id: 'enquiries', label: 'Enquiries', enabled: visibility.enquiries },
    { id: 'invoices', label: 'Invoices', enabled: visibility.invoices },
  ];
  const tabs = allTabs.filter((t) => t.enabled);

  const searchPlaceholder =
    activeTab === 'orders' ? 'Search orders…' :
    activeTab === 'enquiries' ? 'Search enquiries…' : 'Search invoices…';

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    setSearch('');
    setOrderStatusFilter('All');
    setEstimateStatusFilter('All');
    setInvoiceStatusFilter('All');
  }

  const tabsReady = visibility.ready;

  return (
    <div>
      <BuyerStickyPageHeader
        eyebrow="Activity"
        title="Your orders"
        collapsedTitle="Orders"
      />

      {!tabsReady ? (
        <OrdersTabBarSkeleton />
      ) : tabs.length === 0 ? null : tabs.length > 1 ? (
        <div className="mx-[22px] mt-3.5 flex rounded-[10px] bg-[var(--cream-200)] p-[3px]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              className="flex h-8 flex-1 items-center justify-center rounded-lg border-none px-2 transition"
              style={{
                background: activeTab === t.id ? '#fff' : 'transparent',
                boxShadow: activeTab === t.id ? '0 1px 2px rgba(31,58,52,0.06)' : 'none',
                cursor: 'pointer',
              }}
            >
              <span
                className="text-[length:var(--b-text-sub)] font-medium"
                style={{ color: activeTab === t.id ? 'var(--teal-500)' : 'var(--cream-700)' }}
              >
                {t.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {!tabsReady ? (
        <>
          <div className="px-4 pt-3">
            <div className="flex h-[42px] items-center gap-2.5 rounded-[10px] border border-[var(--border-2)] bg-[var(--cream-50)] px-3.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-600)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="text-[length:var(--b-text-body)] text-[var(--cream-500)]">
                Search invoices…
              </span>
            </div>
          </div>
          <div className="flex gap-2 overflow-hidden px-4 pt-3 pb-1">
            {BUYER_INVOICE_STATUS_CHIPS.map((chip, index) => (
              <span
                key={chip}
                className={
                  index === 0
                    ? 'shrink-0 rounded-full border border-[var(--teal-500)] bg-[var(--teal-500)] px-3.5 py-1.5 text-[length:var(--b-text-label)] font-medium text-white'
                    : 'shrink-0 rounded-full border border-[var(--cream-400)] bg-[var(--cream-50)] px-3.5 py-1.5 text-[length:var(--b-text-label)] font-medium text-[var(--cream-800)]'
                }
              >
                {chip}
              </span>
            ))}
          </div>
          <BuyerTransactionCardSkeleton count={5} />
        </>
      ) : tabs.length === 0 ? (
        <div className="px-4 pt-6">
          <div className="rounded-[12px] border border-[var(--border-1)] bg-white px-4 py-5 text-center">
            <p className="text-[var(--b-text-body)] font-semibold text-[var(--cream-800)]">
              Orders are unavailable
            </p>
            <p className="mt-1 text-[var(--b-text-sub)] text-[var(--cream-600)]">
              Your distributor has not enabled document tracking for this account yet.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2.5 rounded-[10px] border border-[var(--border-2)] bg-[var(--cream-50)] px-3.5 py-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-600)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="flex-1 border-none bg-transparent text-[length:var(--b-text-body)] text-[var(--cream-900)] outline-none"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="border-none bg-transparent p-0 text-[var(--cream-500)]"
                  aria-label="Clear search"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>

          {activeTab === 'orders' && !sellerPreview ? (
            <BuyerTransactionFilterChips
              chips={BUYER_ORDER_STATUS_CHIPS}
              active={orderStatusFilter}
              onChange={setOrderStatusFilter}
            />
          ) : null}

          {activeTab === 'enquiries' && !sellerPreview ? (
            <BuyerTransactionFilterChips
              chips={BUYER_ESTIMATE_STATUS_CHIPS}
              active={estimateStatusFilter}
              onChange={setEstimateStatusFilter}
            />
          ) : null}

          {activeTab === 'invoices' && !sellerPreview ? (
            <BuyerTransactionFilterChips
              chips={BUYER_INVOICE_STATUS_CHIPS}
              active={invoiceStatusFilter}
              onChange={setInvoiceStatusFilter}
            />
          ) : null}

          {activeTab === 'orders' && sellerPreview ? (
            <PreviewPlaceholder
              icon="📦"
              title="Order history"
              description="When a buyer logs in, their complete order history appears here — with real-time status tracking, filters, and search."
            />
          ) : activeTab === 'orders' ? (
            <OrdersTab
              search={search}
              statusFilter={orderStatusFilter}
              updatedEntityIds={updatedEntityIds}
              onMarkSeen={markSeen}
            />
          ) : null}

          {activeTab === 'enquiries' && sellerPreview ? (
            <PreviewPlaceholder
              icon="📋"
              title="Enquiries"
              description="Buyers can raise enquiries for custom pricing or bulk orders. Their enquiries and status updates appear here."
            />
          ) : activeTab === 'enquiries' ? (
            <EnquiriesTab
              search={search}
              statusFilter={estimateStatusFilter}
              highlightId={activeHighlight}
            />
          ) : null}

          {activeTab === 'invoices' && sellerPreview ? (
            <PreviewPlaceholder
              icon="🧾"
              title="Invoices"
              description="Invoices generated for delivered orders appear here, with payment status and due dates."
            />
          ) : activeTab === 'invoices' ? (
            <InvoicesTab search={search} statusFilter={invoiceStatusFilter} />
          ) : null}
        </>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersLandingSkeleton />}>
      <OrdersPageInner />
    </Suspense>
  );
}
