import { PostHog } from 'posthog-node';

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!_client) {
    _client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      // Disable queuing for server-side flag checks
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return _client;
}

/**
 * Server-side feature flag evaluator.
 * Falls back to false on any error so a missing key never breaks the app.
 *
 * @param flagKey  PostHog flag key (e.g. 'df_tenant_onboarding')
 * @param distinctId  User or tenant identifier; use 'anonymous' for pre-auth contexts
 */
export async function getFlag(
  flagKey: string,
  distinctId: string
): Promise<boolean> {
  try {
    const client = getClient();
    if (!client) return false;
    const value = await client.isFeatureEnabled(flagKey, distinctId);
    return value === true;
  } catch {
    return false;
  }
}
