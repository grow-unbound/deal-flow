import { supabaseAdmin } from '@/lib/supabase';
import { resolveUserDisplayName } from '@/lib/user-display-name';

// Team membership is small and stable — these ids are almost always the same handful
// of tenant_users per tenant across consecutive page loads (invoices/estimates/orders/
// price-lists/cohorts list routes all call these on every load). A short TTL cache
// avoids re-hitting the Auth Admin API for the same user on every page load; team
// changes (name/email edits) show up within the TTL.
const DISPLAY_CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const emailCache = new Map<string, CacheEntry<string>>();
const displayNameCache = new Map<string, CacheEntry<string>>();

function readCache<T>(cache: Map<string, CacheEntry<T>>, id: string, now: number): T | undefined {
  const entry = cache.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    cache.delete(id);
    return undefined;
  }
  return entry.value;
}

export async function getAuthUserEmailMap(userIds: string[]): Promise<Map<string, string>> {
  const distinctIds = Array.from(new Set(userIds.filter(Boolean)));
  const userMap = new Map<string, string>();

  if (distinctIds.length === 0 || !supabaseAdmin) {
    return userMap;
  }

  const admin = supabaseAdmin;
  const now = Date.now();
  const toFetch: string[] = [];

  for (const id of distinctIds) {
    const cached = readCache(emailCache, id, now);
    if (cached !== undefined) {
      userMap.set(id, cached);
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length === 0) {
    return userMap;
  }

  const results = await Promise.allSettled(
    toFetch.map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        throw error;
      }

      return {
        id: userId,
        email: data.user?.email ?? 'Team member',
      };
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      userMap.set(result.value.id, result.value.email);
      emailCache.set(result.value.id, { value: result.value.email, expiresAt: now + DISPLAY_CACHE_TTL_MS });
      continue;
    }

    console.error('[auth-user-directory] Failed to fetch auth user:', result.reason);
  }

  return userMap;
}

export async function getAuthUserDisplayNameMap(userIds: string[]): Promise<Map<string, string>> {
  const distinctIds = Array.from(new Set(userIds.filter(Boolean)));
  const userMap = new Map<string, string>();

  if (distinctIds.length === 0 || !supabaseAdmin) {
    return userMap;
  }

  const admin = supabaseAdmin;
  const now = Date.now();
  const toFetch: string[] = [];

  for (const id of distinctIds) {
    const cached = readCache(displayNameCache, id, now);
    if (cached !== undefined) {
      userMap.set(id, cached);
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length === 0) {
    return userMap;
  }

  const results = await Promise.allSettled(
    toFetch.map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        throw error;
      }

      return {
        id: userId,
        displayName: resolveUserDisplayName(
          data.user?.user_metadata as Record<string, unknown> | undefined,
          data.user?.email,
          'Team member',
        ),
      };
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      userMap.set(result.value.id, result.value.displayName);
      displayNameCache.set(result.value.id, { value: result.value.displayName, expiresAt: now + DISPLAY_CACHE_TTL_MS });
      continue;
    }

    console.error('[auth-user-directory] Failed to fetch auth user display name:', result.reason);
  }

  return userMap;
}
