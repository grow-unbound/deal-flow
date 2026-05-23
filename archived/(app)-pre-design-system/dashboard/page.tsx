'use client';

import { useAuthContext } from '@/contexts/AuthContext';
import { useTenantContext } from '@/contexts/TenantContext';
import { useCaptureEvent } from '@/hooks/useFeatureFlag';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { session } = useAuthContext();
  const { currentTenant } = useTenantContext();
  const captureEvent = useCaptureEvent();

  useEffect(() => {
    captureEvent('dashboard_viewed', {
      tenant_id: currentTenant?.id,
    });
  }, [currentTenant, captureEvent]);

  if (!session || !currentTenant) {
    return <div className="text-slate-400">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">
          Welcome to {currentTenant.business_name}
        </h1>
        <p className="text-slate-400">
          Subdomain: <span className="text-slate-300">{currentTenant.subdomain}.dealflow.in</span>
        </p>
      </div>

      {/* Tenant Info */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Tenant Information</h2>
        <div className="grid grid-cols-2 gap-4 text-slate-300">
          <div>
            <p className="text-slate-400 text-sm">Business Name</p>
            <p className="text-white font-medium">{currentTenant.business_name}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">GST Number</p>
            <p className="text-white font-medium">{currentTenant.gst_number}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Location</p>
            <p className="text-white font-medium">{currentTenant.city}, {currentTenant.state}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Contact Email</p>
            <p className="text-white font-medium">{currentTenant.contact_email}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Contact Phone</p>
            <p className="text-white font-medium">{currentTenant.contact_phone}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Tenant ID</p>
            <p className="text-white font-medium text-xs font-mono">{currentTenant.id}</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Your Account</h2>
        <div className="grid grid-cols-2 gap-4 text-slate-300">
          <div>
            <p className="text-slate-400 text-sm">Email</p>
            <p className="text-white font-medium">{session.user.email}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">User ID</p>
            <p className="text-white font-medium text-xs font-mono">{session.user.id}</p>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-blue-200 mb-4">Next Steps</h2>
        <ul className="space-y-2 text-blue-100 list-disc list-inside">
          <li>Go to <strong>Brands</strong> to manage your brand catalog</li>
          <li>Add <strong>Products</strong> and set pricing</li>
          <li>Create <strong>Buyers</strong> and organize them into <strong>Cohorts</strong></li>
          <li>Set up <strong>Price Lists</strong> and publish <strong>Catalogs</strong></li>
          <li>Track <strong>Orders</strong> from your buyers</li>
        </ul>
      </div>
    </div>
  );
}
