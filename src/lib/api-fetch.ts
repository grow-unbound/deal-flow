'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { BUYER_PREVIEW_HEADER } from '@/lib/buyer-preview';
import { getStoredBuyerPreviewToken } from '@/lib/auth-session';

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
    return withPreviewHeader({ Authorization: `Bearer ${authCache.token}` });
  }

  const supabase = getBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    authCache = null;
    return withPreviewHeader({});
  }

  const expiresAtMs = (session.expires_at ? session.expires_at * 1000 : now + 30_000) - 5_000;
  authCache = {
    token: session.access_token,
    expiresAtMs,
  };

  return withPreviewHeader({ Authorization: `Bearer ${session.access_token}` });
}

function withPreviewHeader(headers: Record<string, string>): Record<string, string> {
  const previewToken = getStoredBuyerPreviewToken();
  if (!previewToken) return headers;

  return {
    ...headers,
    [BUYER_PREVIEW_HEADER]: previewToken,
  };
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  return fetch(url, {
    ...init,
    headers: {
      ...authHeaders,
      ...init?.headers,
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
