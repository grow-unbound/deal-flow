'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabaseBrowser } from '@/lib/supabase-browser';

export interface Tenant {
  id: string;
  slug: string;
  business_name: string;
  gstin?: string;
  primary_state?: string;
  subdomain?: string;
  plan: 'starter' | 'growth' | 'scale';
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
  const { currentTenantId, session } = useAuth();
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch tenants for current user
  useEffect(() => {
    const fetchTenants = async () => {
      if (!session?.user) {
        setTenants([]);
        setCurrentTenant(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setIsError(false);
        setError(null);

        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setTenants([]);
          setCurrentTenant(null);
          setIsLoading(false);
          return;
        }

        const res = await fetch('/api/tenant/current', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          setTenants([]);
          setCurrentTenant(null);
          setIsLoading(false);
          return;
        }

        const { tenant } = await res.json() as { tenant: Tenant };
        setTenants([tenant]);
        setCurrentTenant(tenant);
      } catch (err) {
        setIsError(true);
        setError(err instanceof Error ? err : new Error('Failed to fetch tenants'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchTenants();
  }, [session?.user?.id, currentTenantId]);

  const switchTenant = async (tenantId: string) => {
    const tenant = tenants.find((t) => t.id === tenantId);
    if (tenant) {
      setCurrentTenant(tenant);
    } else {
      throw new Error('Tenant not found');
    }
  };

  const value: TenantContextType = {
    currentTenant,
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
