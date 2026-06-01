'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { OrdersTab } from '@/components/buyer/orders/OrdersTab';
import { EnquiriesTab } from '@/components/buyer/orders/EnquiriesTab';

type TabId = 'orders' | 'inquiries' | 'invoices';

const TABS: { id: TabId; label: string }[] = [
  { id: 'orders',    label: 'Orders' },
  { id: 'inquiries', label: 'Inquiries' },
  { id: 'invoices',  label: 'Invoices' },
];

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId | null) ?? 'orders';
  const [activeTab, setActiveTab] = React.useState<TabId>(
    TABS.some((t) => t.id === initialTab) ? initialTab : 'orders'
  );

  return (
    <>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '16px 18px 0',
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--fg-3)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Activity
          </p>
          <h1
            style={{
              fontSize: 26,
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              color: 'var(--fg-1)',
              lineHeight: 1.2,
              marginTop: 2,
            }}
          >
            Your orders
          </h1>
        </div>
      </div>

      {/* Sub-tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-1)',
          margin: '14px 0 0',
          padding: '0 16px',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                paddingBottom: 10,
                paddingRight: 18,
                borderBottom: isActive
                  ? '2px solid var(--teal-500)'
                  : '2px solid transparent',
                marginBottom: -1,
                background: 'none',
                border: 'none',
                borderBottomStyle: 'solid',
                borderBottomWidth: 2,
                borderBottomColor: isActive ? 'var(--teal-500)' : 'transparent',
                cursor: 'pointer',
                padding: `0 18px 10px 0`,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--teal-500)' : 'var(--fg-3)',
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'orders' && <OrdersTab />}
      {activeTab === 'inquiries' && <EnquiriesTab />}
      {activeTab === 'invoices' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '40vh',
            padding: '40px 16px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-1)', margin: '0 0 6px' }}>
            Invoice history coming soon
          </p>
          <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: 0 }}>
            Your invoices will be available here.
          </p>
        </div>
      )}
    </>
  );
}
