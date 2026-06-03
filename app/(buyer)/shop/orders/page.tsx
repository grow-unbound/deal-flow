'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function inr(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

const orders = [
  { id: 'DF-2026-00471', status: 'dispatched', total: 84200,  items: 3,  placed: '2 hours ago',  catalog: 'Summer Pours' },
  { id: 'DF-2026-00466', status: 'delivered',  total: 124300, items: 9,  placed: '2 days ago',   catalog: 'Premium Reserve' },
  { id: 'DF-2026-00451', status: 'delivered',  total: 46500,  items: 4,  placed: 'Last week',    catalog: 'New Arrivals · May' },
  { id: 'DF-2026-00444', status: 'confirmed',  total: 218500, items: 12, placed: '8 days ago',   catalog: 'Summer Pours' },
  { id: 'DF-2026-00432', status: 'delivered',  total: 92800,  items: 6,  placed: '12 days ago',  catalog: 'Premium Reserve' },
  { id: 'DF-2026-00412', status: 'cancelled',  total: 12800,  items: 1,  placed: '24 days ago',  catalog: 'Summer Pours' },
];

const enquiries: Array<{ id: string; subject: string; status: string; distributor: string; placed: string }> = [
  { id: 'ENQ-2026-0042', subject: 'Bulk pricing on Cabernet Franc',   status: 'received',  distributor: 'Phani Distribution', placed: '3 hours ago' },
  { id: 'ENQ-2026-0041', subject: 'Stock check · Single Malt 12',     status: 'confirmed', distributor: 'Kohli & Sons',       placed: 'Yesterday' },
  { id: 'ENQ-2026-0039', subject: 'New cohort catalog · Diwali range', status: 'delivered', distributor: 'Phani Distribution', placed: '4 days ago' },
];

const invoices = [
  { id: 'INV-2026-00128', amount: 124300, status: 'paid',    issued: '2 days ago',  due: '—' },
  { id: 'INV-2026-00121', amount: 46500,  status: 'paid',    issued: 'Last week',   due: '—' },
  { id: 'INV-2026-00118', amount: 218500, status: 'due',     issued: '8 days ago',  due: 'In 22 days' },
  { id: 'INV-2026-00114', amount: 38400,  status: 'overdue', issued: '18 days ago', due: '−4 days' },
];

const statusColors: Record<string, { bg: string; fg: string }> = {
  received:   { bg: '#E7EEF1', fg: '#2A4B59' },
  confirmed:  { bg: '#FBEFE3', fg: '#6B3818' },
  dispatched: { bg: '#FBF1DC', fg: '#7A5519' },
  delivered:  { bg: '#ECF3EC', fg: '#2F5733' },
  cancelled:  { bg: '#F6E5DF', fg: '#6B2615' },
  paid:       { bg: '#ECF3EC', fg: '#2F5733' },
  due:        { bg: '#FBEFE3', fg: '#6B3818' },
  overdue:    { bg: '#F6E5DF', fg: '#6B2615' },
};

const statusLabels: Record<string, string> = {
  received: 'Received', confirmed: 'Confirmed', dispatched: 'Dispatched',
  delivered: 'Delivered', cancelled: 'Cancelled',
  paid: 'Paid', due: 'Due', overdue: 'Overdue',
};

type TabId = 'orders' | 'enquiries' | 'invoices';

interface EnquiryCardProps {
  enquiry: { id: string; subject: string; status: string; distributor: string; placed: string };
  highlighted: boolean;
}

function EnquiryCard({ enquiry, highlighted }: EnquiryCardProps) {
  const sc = statusColors[enquiry.status] ?? statusColors.received;
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
        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--cream-700)' }}>{enquiry.id}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.fg }}>
          {statusLabels[enquiry.status]}
        </span>
      </div>
      <div style={{ fontSize: 14, color: 'var(--cream-900)', fontWeight: 500, marginBottom: 4 }}>{enquiry.subject}</div>
      <div style={{ fontSize: 12, color: 'var(--cream-600)' }}>{enquiry.distributor} · {enquiry.placed}</div>
    </div>
  );
}

interface EnquiriesTabProps {
  highlightId: string | null;
}

function EnquiriesTab({ highlightId }: EnquiriesTabProps) {
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!highlightId) return;

    const delay = setTimeout(() => {
      setActiveHighlight(highlightId);
      timerRef.current = setTimeout(() => {
        setActiveHighlight(null);
      }, 1500);
    }, 300);

    return () => {
      clearTimeout(delay);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [highlightId]);

  // Merge real enquiries with any newly submitted one
  const allEnquiries = highlightId && !enquiries.find(e => e.id === highlightId)
    ? [
        { id: highlightId, subject: 'New inquiry submitted', status: 'received', distributor: 'Your distributor', placed: 'Just now' },
        ...enquiries,
      ]
    : enquiries;

  return (
    <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {allEnquiries.map(e => (
        <EnquiryCard key={e.id} enquiry={e} highlighted={activeHighlight === e.id} />
      ))}
    </div>
  );
}

function OrdersPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId | null;
  const highlightId = searchParams.get('highlight');

  const [activeTab, setActiveTab] = useState<TabId>(tabParam ?? 'orders');

  // Sync tab from URL param on mount
  useEffect(() => {
    if (tabParam) setActiveTab(tabParam);
  }, [tabParam]);

  const tabs: Array<{ id: TabId; label: string; count: number }> = [
    { id: 'orders',    label: 'Orders',    count: orders.length },
    { id: 'enquiries', label: 'Enquiries', count: enquiries.length },
    { id: 'invoices',  label: 'Invoices',  count: invoices.length },
  ];

  return (
    <>
      <div>
        {/* Page head */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px 18px 0' }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-700)', fontFamily: 'var(--font-mono)' }}>Activity</p>
            <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--cream-900)', lineHeight: 1.2, marginTop: 2 }}>Your orders</h1>
          </div>
          <button style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--cream-200)', border: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--cream-700)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-1)', margin: '14px 0 0', padding: '0 16px' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                paddingBottom: 10,
                paddingRight: 18,
                marginBottom: -1,
                background: 'none',
                border: 'none',
                borderBottom: activeTab === t.id ? '2px solid var(--teal-500)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: activeTab === t.id ? 600 : 400, color: activeTab === t.id ? 'var(--teal-500)' : 'var(--cream-700)' }}>
                {t.label}
              </span>
              <span style={{ marginLeft: 6, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--cream-600)', background: 'var(--cream-200)', padding: '1px 6px', borderRadius: 100 }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--cream-50)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 14px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-600)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <span style={{ fontSize: 14, color: 'var(--cream-500)' }}>
              {activeTab === 'orders' ? 'Search orders…' : activeTab === 'enquiries' ? 'Search enquiries…' : 'Search invoices…'}
            </span>
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'orders' && (
          <>
            {/* Status filter chips */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px 0', scrollbarWidth: 'none' }}>
              {['All', 'Received', 'Confirmed', 'Dispatched', 'Delivered'].map((f, i) => (
                <button key={f} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 100, fontSize: 13, fontWeight: 500, border: '1px solid', background: i === 0 ? 'var(--teal-500)' : 'var(--cream-50)', color: i === 0 ? '#fff' : 'var(--cream-800)', borderColor: i === 0 ? 'var(--teal-500)' : 'var(--border-2)', cursor: 'pointer' }}>
                  {f}
                </button>
              ))}
            </div>

            {/* Orders list */}
            <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {orders.map(o => {
                const sc = statusColors[o.status] ?? statusColors.received;
                return (
                  <div key={o.id} style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--cream-700)' }}>{o.id}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.fg }}>{statusLabels[o.status]}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--cream-800)', marginBottom: 6 }}>{o.catalog}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--cream-600)' }}>{o.items} products · {o.placed}</span>
                      <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-900)' }}>{inr(o.total)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {activeTab === 'enquiries' && (
          <EnquiriesTab highlightId={activeTab === 'enquiries' ? highlightId : null} />
        )}

        {activeTab === 'invoices' && (
          <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invoices.map(inv => {
              const sc = statusColors[inv.status] ?? statusColors.due;
              return (
                <div key={inv.id} style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--cream-700)' }}>{inv.id}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.fg }}>{statusLabels[inv.status]}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--cream-600)' }}>Issued {inv.issued} · Due: {inv.due}</span>
                    <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-900)' }}>{inr(inv.amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
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
