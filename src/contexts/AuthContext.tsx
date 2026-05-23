'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { ROLES, type Role } from '@/constants';

export interface AuthUser {
  id: string;
  email: string;
  phone?: string;
}

export interface TenantProfile {
  id: string;
  tenant_id: string;
  user_id: string;
  role: Role;
  is_active: boolean;
}

export interface BuyerProfile {
  id: string;
  buyer_id: string;
  user_id: string;
  role: 'buyer_admin' | 'buyer_assistant';
  is_active: boolean;
}

export interface AuthContextType {
  session: Session | null;
  user: AuthUser | null;
  tenantProfile: TenantProfile | null;
  buyerProfiles: BuyerProfile[];
  currentTenantId: string | null;
  currentBuyerId: string | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  signOut: () => Promise<void>;
  switchTenant: (tenantId: string) => void;
  switchBuyer: (buyerId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenantProfile, setTenantProfile] = useState<TenantProfile | null>(null);
  const [buyerProfiles, setBuyerProfiles] = useState<BuyerProfile[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [currentBuyerId, setCurrentBuyerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize auth session
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        const {
          data: { session: currentSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        setSession(currentSession);

        if (currentSession?.user) {
          setUser({
            id: currentSession.user.id,
            email: currentSession.user.email || '',
            phone: currentSession.user.phone,
          });

          // Fetch tenant profile (cast until Supabase types are generated)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabase as any;
          const tenantId = currentSession.user.user_metadata?.tenant_id;
          if (tenantId) {
            const { data: profile, error: profileError } = await db
              .from('tenant_users')
              .select('*')
              .eq('user_id', currentSession.user.id)
              .eq('tenant_id', tenantId)
              .single() as { data: TenantProfile | null; error: unknown };

            if (!profileError && profile) {
              setTenantProfile(profile);
              setCurrentTenantId(profile.tenant_id);
            }
          }

          // Fetch buyer profiles
          const { data: buyers, error: buyersError } = await db
            .from('buyer_users')
            .select('*')
            .eq('user_id', currentSession.user.id) as { data: BuyerProfile[] | null; error: unknown };

          if (!buyersError && buyers) {
            setBuyerProfiles(buyers);
            if (buyers.length > 0) {
              setCurrentBuyerId(buyers[0].buyer_id);
            }
          }
        }
      } catch (err) {
        setIsError(true);
        setError(err instanceof Error ? err : new Error('Auth initialization failed'));
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setUser({
          id: newSession.user.id,
          email: newSession.user.email || '',
          phone: newSession.user.phone,
        });
      } else {
        setUser(null);
        setTenantProfile(null);
        setBuyerProfiles([]);
        setCurrentTenantId(null);
        setCurrentBuyerId(null);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setTenantProfile(null);
    setBuyerProfiles([]);
    setCurrentTenantId(null);
    setCurrentBuyerId(null);
  };

  const switchTenant = (tenantId: string) => {
    setCurrentTenantId(tenantId);
  };

  const switchBuyer = (buyerId: string) => {
    setCurrentBuyerId(buyerId);
  };

  const value: AuthContextType = {
    session,
    user,
    tenantProfile,
    buyerProfiles,
    currentTenantId,
    currentBuyerId,
    isLoading,
    isError,
    error,
    signOut,
    switchTenant,
    switchBuyer,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
