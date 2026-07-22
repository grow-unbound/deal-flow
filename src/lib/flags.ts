import { headers } from 'next/headers';
import { FEATURE_FLAGS } from '@/constants';
import { TENANT_FLAGS_HEADER, decodeTenantFlagsHeader } from '@/lib/server/tenant-flags-token';
import { resolveTenantFlags } from '@/lib/server/tenant-flags-resolve';

export { FEATURE_FLAGS as FLAGS };

type CachedFlag = {
  value: boolean;
  expiresAtMs: number;
};

const FLAG_TTL_MS = 30_000;
const flagCache = new Map<string, CachedFlag>();

export async function getFlag(flagName: string, tenantId: string): Promise<boolean> {
  // Fast path: middleware already resolved + forwarded flags for this request
  // (from its long-TTL signed cookie, or fresh if the cookie was cold) — no
  // network call needed at all.
  try {
    const h = await headers();
    const raw = h.get(TENANT_FLAGS_HEADER);
    const forwarded = raw ? decodeTenantFlagsHeader(raw) : null;
    if (forwarded && flagName in forwarded.flags) {
      return forwarded.flags[flagName];
    }
  } catch {
    // headers() unavailable outside a request context (e.g. some test setups) — fall through
  }

  // Defensive fallback: same-process short cache, then a direct resolve.
  const cacheKey = `${tenantId}:${flagName}`;
  const now = Date.now();
  const cached = flagCache.get(cacheKey);
  if (cached && now < cached.expiresAtMs) {
    return cached.value;
  }

  const { flags } = await resolveTenantFlags(tenantId);
  const value = flags[flagName] ?? true;
  flagCache.set(cacheKey, { value, expiresAtMs: now + FLAG_TTL_MS });
  return value;
}
