'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabaseBrowser as supabase } from '@/lib/supabase-browser';
import { clearAuthClientStorage, getSessionExpiredRedirectPath } from '@/lib/auth-session';
import { type Role } from '@/constants';
import posthog from 'posthog-js';
import { resolveUserDisplayName } from '@/lib/user-display-name';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
}

export interface TenantProfile {
  id: string;
  tenant_id: string;
  user_id: string;
  role: Role;
  tenant_name?: string | null;
  tenant_slug?: string | null;
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

function decodeJwtPayloadClient(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

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
  const manualSignOutRef = React.useRef(false);

  const resetAuthState = () => {
    clearAuthClientStorage();
    setSession(null);
    setUser(null);
    setTenantProfile(null);
    setBuyerProfiles([]);
    setCurrentTenantId(null);
    setCurrentBuyerId(null);
  };

  const hydrateWorkspace = async (activeSession: Session) => {
    const { data: wsRows, error: wsError } = await (supabase as any).rpc('get_user_workspace', {
      p_user_id: activeSession.user.id,
    });

    if (wsError) {
      throw wsError;
    }

    const ws = (wsRows as any[] | null)?.[0] ?? null;
    if (!ws?.tenant_id) {
      setTenantProfile(null);
      setCurrentTenantId(null);
      return;
    }

    setTenantProfile({
      id: ws.tenant_id, // using tenant_id as profile id (row id not available from RPC)
      tenant_id: ws.tenant_id,
      user_id: activeSession.user.id,
      role: ws.role as Role,
      tenant_name: (ws.tenant_name as string | null) ?? null,
      tenant_slug: (ws.tenant_slug as string | null) ?? null,
      is_active: true,
    });
    setCurrentTenantId(ws.tenant_id);

    if (activeSession.user.id) {
      posthog.identify(activeSession.user.id, {
        email: activeSession.user.email,
        tenant_id: ws.tenant_id,
        role: ws.role,
      });
      posthog.reloadFeatureFlags();
    }
  };

  // Initialize auth session
  useEffect(() => {
    const primeWorkspaceFromToken = (activeSession: Session) => {
      const claims = decodeJwtPayloadClient(activeSession.access_token);
      const claimTenantId = typeof claims?.tenant_id === 'string' ? claims.tenant_id : null;
      const claimRole = typeof claims?.role === 'string' ? claims.role : null;

      if (!claimTenantId) return;

      setCurrentTenantId(claimTenantId);
      if (claimRole) {
        setTenantProfile((prev) => ({
          id: prev?.id ?? claimTenantId,
          tenant_id: claimTenantId,
          user_id: activeSession.user.id,
          role: claimRole as Role,
          tenant_name: prev?.tenant_name ?? null,
          tenant_slug: prev?.tenant_slug ?? null,
          is_active: true,
        }));
      }
    };

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
          displayName: resolveUserDisplayName(
            currentSession.user.user_metadata as Record<string, unknown> | undefined,
            currentSession.user.email,
            currentSession.user.email || 'Team member',
          ),
          phone: currentSession.user.phone,
        });
          primeWorkspaceFromToken(currentSession);

          // Do not block first render on workspace hydration.
          void hydrateWorkspace(currentSession).catch((err) => {
            setIsError(true);
            setError(err instanceof Error ? err : new Error('Workspace initialization failed'));
          });
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
          displayName: resolveUserDisplayName(
            newSession.user.user_metadata as Record<string, unknown> | undefined,
            newSession.user.email,
            newSession.user.email || 'Team member',
          ),
          phone: newSession.user.phone,
        });
        primeWorkspaceFromToken(newSession);
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setIsError(false);
          setError(null);
          void hydrateWorkspace(newSession).catch((err) => {
            setIsError(true);
            setError(err instanceof Error ? err : new Error('Workspace initialization failed'));
          });
        }
      } else {
        resetAuthState();
        const wasManualSignOut = manualSignOutRef.current;
        manualSignOutRef.current = false;

        if (
          event === 'SIGNED_OUT' &&
          !wasManualSignOut &&
          typeof window !== 'undefined'
        ) {
          window.location.assign(getSessionExpiredRedirectPath(window.location.pathname));
        }
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  const signOut = async () => {
    manualSignOutRef.current = true;
    const { error } = await supabase.auth.signOut();
    if (error) {
      // GoTrue rejected the token (e.g. already expired) — clear local cookies only.
      // This avoids a 403 blocking the logout flow.
      await supabase.auth.signOut({ scope: 'local' } as any);
    }
    resetAuthState();
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
