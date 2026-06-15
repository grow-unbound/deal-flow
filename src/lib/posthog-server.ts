import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

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

export interface TenantFeatureFlags {
  df_order_enquiries?: boolean;
  df_order_sales_orders?: boolean;
  df_order_invoices?: boolean;
  df_cohorts?: boolean;
  df_catalog_publishing?: boolean;
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
