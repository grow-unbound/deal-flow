import { PostHog } from 'posthog-node';
import { FEATURE_FLAGS } from '@/constants';

export { FEATURE_FLAGS as FLAGS };

type CachedFlag = {
  value: boolean;
  expiresAtMs: number;
};

const FLAG_TTL_MS = 30_000;
const flagCache = new Map<string, CachedFlag>();
let posthogClient: PostHog | null = null;

function createClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (posthogClient) return posthogClient;

  posthogClient = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  });

  return posthogClient;
}

export async function getFlag(flagName: string, tenantId: string): Promise<boolean> {
  const cacheKey = `${tenantId}:${flagName}`;
  const now = Date.now();
  const cached = flagCache.get(cacheKey);
  if (cached && now < cached.expiresAtMs) {
    return cached.value;
  }

  const client = createClient();
  // PostHog unavailable = not blocking; DB toggles in tenant_settings are the authority.
  // Only an explicit PostHog `false` acts as a global kill-switch.
  if (!client) return true;

  try {
    const flags = await client.evaluateFlags(tenantId);
    const value = flags.isEnabled(flagName) === true;
    flagCache.set(cacheKey, {
      value,
      expiresAtMs: now + FLAG_TTL_MS,
    });
    return value;
  } catch {
    return true;
  }
}
