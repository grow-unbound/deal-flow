'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { useBuyerOrdersInfinite } from '@/hooks/useBuyerOrders';
import { useBuyerEstimatesInfinite } from '@/hooks/useEstimates';
import { useBuyerInvoicesInfinite } from '@/hooks/useBuyerInvoices';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { BuyerStickyPageHeader } from '@/components/buyer/layout/BuyerStickyPageHeader';
import { openBuyerSearch } from '@/components/buyer/layout/BuyerSearchOverlay';
import { BuyerTransactionFilterChips } from '@/components/buyer/orders/BuyerTransactionFilterChips';
import { OrdersTab } from '@/components/buyer/orders/OrdersTab';
import { EnquiriesTab } from '@/components/buyer/orders/EnquiriesTab';
import { InvoicesTab } from '@/components/buyer/orders/InvoicesTab';
import { useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';
import {
  BUYER_ESTIMATE_STATUS_CHIPS,
  BUYER_INVOICE_STATUS_CHIPS,
  BUYER_ORDER_STATUS_CHIPS,
  type BuyerEstimateStatusChip,
  type BuyerInvoiceStatusChip,
  type BuyerOrderStatusChip,
} from '@/lib/buyer-transaction-filters';

type TabId = 'orders' | 'enquiries' | 'invoices';

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
  const tabParam = tabParamRaw === 'inquiries' ? 'enquiries' : (tabParamRaw as TabId | null);
  const { data: buyerMe } = useBuyerMe();
  const orderFeatures = buyerMe?.order_features ?? { enquiries: true, sales_orders: true, invoices: true };
  const highlightId = searchParams.get('highlight');
  const sellerPreview = buyerMe?.seller_preview === true;

  const [search, setSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<BuyerOrderStatusChip>('All');
  const [estimateStatusFilter, setEstimateStatusFilter] = useState<BuyerEstimateStatusChip>('All');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<BuyerInvoiceStatusChip>('All');
  const { updatedEntityIds, markSeen } = useBuyerRealtimeContext();

  const hasUrlTab = Boolean(tabParam);

  const { state: snapshotTab, setState: setSnapshotTab } = useRouteSnapshot<TabId>({
    storageKey: 'buyer-orders-page-tab',
    initialState: tabParam ?? 'orders',
    enabled: !hasUrlTab,
  });

  const [urlDrivenTab, setUrlDrivenTab] = useState<TabId>(tabParam ?? 'orders');
  const activeTab = hasUrlTab ? urlDrivenTab : snapshotTab;

  const setActiveTab = (tab: TabId) => {
    if (hasUrlTab) {
      setUrlDrivenTab(tab);
    }
    setSnapshotTab(tab);
  };

  const ordersQuery = useBuyerOrdersInfinite();
  const estimatesQuery = useBuyerEstimatesInfinite();
  const invoicesQuery = useBuyerInvoicesInfinite();

  useRouteScrollRestoration({
    storageKey: 'buyer-orders-page-tab',
    ready: true,
  });

  useEffect(() => {
    if (tabParam) {
      setUrlDrivenTab(tabParam);
      setSnapshotTab(tabParam);
    }
  }, [setSnapshotTab, tabParam]);

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

  const orderCount = ordersQuery.data?.pages[0]?.total
    ?? ordersQuery.data?.pages.flatMap((p) => p.orders).length
    ?? 0;
  const estimateCount = estimatesQuery.data?.pages[0]?.total
    ?? estimatesQuery.data?.pages.flatMap((p) => p.estimates).length
    ?? 0;
  const invoiceCount = invoicesQuery.data?.pages[0]?.total
    ?? invoicesQuery.data?.pages.flatMap((p) => p.invoices).length
    ?? 0;

  const allTabs: Array<{ id: TabId; label: string; count: number; enabled: boolean }> = [
    { id: 'orders', label: 'Orders', count: typeof orderCount === 'number' ? orderCount : 0, enabled: true },
    { id: 'enquiries', label: 'Enquiries', count: estimateCount, enabled: orderFeatures.enquiries },
    { id: 'invoices', label: 'Invoices', count: invoiceCount, enabled: orderFeatures.invoices },
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

  return (
    <div>
      <BuyerStickyPageHeader
        eyebrow="Activity"
        title="Your orders"
        collapsedTitle="Orders"
        rightSlot={
          <button
            type="button"
            onClick={() => openBuyerSearch()}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-1)] bg-[var(--cream-200)]"
            aria-label="Search"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--cream-700)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        }
      />

      <div className="mx-[22px] mt-3.5 flex rounded-[10px] bg-[var(--cream-200)] p-[3px]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabChange(t.id)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-none px-2 py-1.5 transition"
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
            <span
              className="rounded-full px-1.5 py-px font-mono text-[length:var(--b-text-eyebrow)]"
              style={{
                background: activeTab === t.id ? 'var(--teal-50)' : 'var(--cream-300)',
                color: activeTab === t.id ? 'var(--teal-500)' : 'var(--cream-700)',
              }}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

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
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersPageInner />
    </Suspense>
  );
}
