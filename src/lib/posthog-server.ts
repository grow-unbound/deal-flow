import { PostHog } from 'posthog-node';
import { FEATURE_FLAGS } from '@/constants';

export { FEATURE_FLAGS as FLAGS };

type TenantFeatureFlagKey = Exclude<keyof typeof FEATURE_FLAGS, 'TENANT_ONBOARDING'>;
type TenantFeatureFlagName = Exclude<(typeof FEATURE_FLAGS)[TenantFeatureFlagKey], 'df_tenant_onboarding'>;

type CachedFlag = {
  value: boolean;
  expiresAtMs: number;
};

const FLAG_TTL_MS = 30_000;
const flagCache = new Map<string, CachedFlag>();
let posthogClient: PostHog | null = null;

export type TenantFeatureFlags = Partial<Record<TenantFeatureFlagName, boolean>>;

export function buildDefaultTenantFeatureFlags(): Record<TenantFeatureFlagName, boolean> {
  return Object.fromEntries(
    Object.entries(FEATURE_FLAGS)
      .filter(([key]) => key !== 'TENANT_ONBOARDING')
      .map(([, value]) => [value, false]),
  ) as Record<TenantFeatureFlagName, boolean>;
}

export function getPostHogClient(): PostHog {
  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

export function getPostHogQueryClient(): { query: (payload: Record<string, unknown>) => Promise<unknown> } {
  return getPostHogClient() as unknown as { query: (payload: Record<string, unknown>) => Promise<unknown> };
}

export async function getFlag(flagName: string, tenantId: string): Promise<boolean> {
  const cacheKey = `${tenantId}:${flagName}`;
  const now = Date.now();
  const cached = flagCache.get(cacheKey);
  if (cached && now < cached.expiresAtMs) {
    return cached.value;
  }

  const client = createClient();
  if (!client) return false;

  try {
    const flags = await client.evaluateFlags(tenantId);
    const value = flags.isEnabled(flagName) === true;
    flagCache.set(cacheKey, {
      value,
      expiresAtMs: now + FLAG_TTL_MS,
    });
    return value;
  } catch {
    return false;
  }
}

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

export async function syncTenantFeatureFlags(tenantId: string, flags: TenantFeatureFlags): Promise<void> {
  try {
    const client = getPostHogClient();
    client.groupIdentify({ groupType: 'tenant', groupKey: tenantId, properties: flags });
    await client.flush();
  } catch {
    console.error('[posthog-server] syncTenantFeatureFlags failed silently', flags);
  }
}

export async function seedTenantFeatureFlags(tenantId: string): Promise<void> {
  await syncTenantFeatureFlags(tenantId, buildDefaultTenantFeatureFlags());
}
