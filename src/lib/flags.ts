import { PostHog } from 'posthog-node';
import { FEATURE_FLAGS } from '@/constants';

export { FEATURE_FLAGS as FLAGS };

function createClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  return new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  });
}

export async function getFlag(flagName: string, tenantId: string): Promise<boolean> {
  const client = createClient();
  if (!client) return false;
  try {
    const flags = await client.evaluateFlags(tenantId);
    return flags.isEnabled(flagName);
  } catch {
    return false;
  } finally {
    await client.shutdown();
  }
}
