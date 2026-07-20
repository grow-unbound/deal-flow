'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { clearClientAuthSnapshot, getClientAccessToken, setClientAuthSnapshot } from '@/lib/auth-client-store';

type CachedAuth = {
  token: string;
  expiresAtMs: number;
};

let authCache: CachedAuth | null = null;
let browserClient: ReturnType<typeof createClientComponentClient<Database>> | null = null;

function getBrowserClient() {
  if (!browserClient) {
    browserClient = createClientComponentClient<Database>();
  }
  return browserClient;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const now = Date.now();
  if (authCache && now < authCache.expiresAtMs) {
    return { Authorization: `Bearer ${authCache.token}` };
  }

  const cachedToken = getClientAccessToken();
  if (cachedToken) {
    authCache = {
      token: cachedToken,
      expiresAtMs: now + 25_000,
    };
    return { Authorization: `Bearer ${cachedToken}` };
  }

  const supabase = getBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    authCache = null;
    clearClientAuthSnapshot();
    return {};
  }

  const expiresAtMs = (session.expires_at ? session.expires_at * 1000 : now + 30_000) - 5_000;
  authCache = {
    token: session.access_token,
    expiresAtMs,
  };
  setClientAuthSnapshot({ accessToken: session.access_token });

  return { Authorization: `Bearer ${session.access_token}` };
}

export type ApiFetchInit = RequestInit & {
  /** Bypass browser HTTP cache — use for auth-gated detail views that must reflect latest status. */
  fresh?: boolean;
};

export async function apiFetch(url: string, init?: ApiFetchInit): Promise<Response> {
  const { fresh, ...requestInit } = init ?? {};
  const authHeaders = await getAuthHeaders();
  return fetch(url, {
    ...requestInit,
    cache: fresh ? 'no-store' : requestInit.cache,
    headers: {
      ...authHeaders,
      ...requestInit.headers,
    },
  });
}

export async function apiPost<T>(url: string, body: T, init?: RequestInit): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  return fetch(url, {
    method: 'POST',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...init?.headers,
    },
    body: JSON.stringify(body),
  });
}

export async function apiPatch<T>(url: string, body: T, init?: RequestInit): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  return fetch(url, {
    method: 'PATCH',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...init?.headers,
    },
    body: JSON.stringify(body),
  });
}

export async function apiDelete(url: string, init?: RequestInit): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  return fetch(url, {
    method: 'DELETE',
    ...init,
    headers: {
      ...authHeaders,
      ...init?.headers,
    },
  });
}
