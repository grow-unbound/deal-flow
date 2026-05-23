'use client';

import { useAuth } from '@/contexts/AuthContext';

import { useTenant } from '@/contexts/TenantContext';
import { useCaptureEvent } from '@/hooks/useFeatureFlag';
import { useEffect } from 'react';
import { SellerTopbar } from '@/components/layout/SellerTopbar';

export default function DashboardPage() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const captureEvent = useCaptureEvent();

  useEffect(() => {
    captureEvent('dashboard_viewed', { tenant_id: currentTenant?.id });
  }, [currentTenant, captureEvent]);

  if (!user || !currentTenant) {
    return <p className="text-caption text-cream-600 p-8">Loading...</p>;
  }

  return (
    <>
      <SellerTopbar title="Dashboard" />
      <div className="px-8 py-6 space-y-6" style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>

        {/* KPI Strip */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Active buyers',      value: '—',  sub: 'across all cohorts' },
            { label: 'Published catalogs', value: '—',  sub: 'this month' },
            { label: 'Open orders',        value: '—',  sub: 'awaiting action' },
            { label: 'Revenue (MTD)',      value: '₹—', sub: 'month to date' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-cream-300 rounded-lg p-5 shadow-xs">
              <p className="eyebrow mb-2">{kpi.label}</p>
              <p className="text-h2 font-display font-medium text-cream-900 tabular">{kpi.value}</p>
              <p className="text-caption text-cream-600 mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Tenant info */}
        <div className="bg-white border border-cream-300 rounded-lg shadow-xs">
          <div className="px-6 py-4 border-b border-cream-200">
            <h2 className="text-h4 font-sans font-semibold text-cream-900">Tenant details</h2>
          </div>
          <div className="px-6 py-5 grid grid-cols-3 gap-x-8 gap-y-5">
            {[
              { label: 'Business name', value: currentTenant.business_name },
              { label: 'Subdomain',     value: `${currentTenant.slug}.dealflow.in` },
              { label: 'GSTIN',         value: currentTenant.gstin ?? '—' },
              { label: 'State',         value: currentTenant.primary_state ?? '—' },
              { label: 'Plan',          value: currentTenant.plan },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="eyebrow mb-1">{label}</p>
                <p className="text-body font-medium text-cream-900">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Getting started */}
        <div className="bg-teal-50 border border-teal-100 rounded-lg px-6 py-5">
          <h2 className="text-h4 font-sans font-semibold text-teal-700 mb-3">Getting started</h2>
          <ul className="space-y-2">
            {[
              'Go to Brands to add your brand catalog',
              'Add Products and set base pricing',
              'Create Buyers and organize them into Cohorts',
              'Set up Price lists and publish Catalogs',
              'Track Orders from your buyers',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-body-sm text-teal-800">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-teal-200 flex items-center justify-center shrink-0 text-caption font-semibold text-teal-700">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ul>
        </div>

      </div>
    </>
  );
}
