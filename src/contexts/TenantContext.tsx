'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';

export interface Tenant {
  id: string;
  slug: string;
  business_name: string;
  gstin?: string;
  primary_state?: string;
  subdomain?: string;
  plan: 'lite' | 'starter' | 'growth' | 'scale';
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TenantContextType {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  switchTenant: (tenantId: string) => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { currentTenantId, session, tenantProfile } = useAuth();
  const tenant = useMemo<Tenant | null>(() => {
    if (!session?.user) return null;
    const tenantId = tenantProfile?.tenant_id ?? currentTenantId;
    if (!tenantId) return null;

    return {
      id: tenantId,
      slug: tenantProfile?.tenant_slug ?? tenantId,
      business_name: tenantProfile?.tenant_name ?? 'My Business',
      subdomain: `${tenantProfile?.tenant_slug ?? tenantId}.yukti.so`,
      plan: 'starter',
      gstin: undefined,
      primary_state: undefined,
      settings: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }, [session?.user?.id, currentTenantId, tenantProfile?.tenant_id, tenantProfile?.tenant_name, tenantProfile?.tenant_slug]);

  const tenants = useMemo(() => (tenant ? [tenant] : []), [tenant]);

  const isLoading = false;
  const isError = false;
  const error = null;

  const switchTenant = async (tenantId: string) => {
    const tenant = tenants.find((t) => t.id === tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }
  };

  const value: TenantContextType = {
    currentTenant: tenant,
    tenants,
    isLoading,
    isError,
    error,
    switchTenant,
  };

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
