// Edge-Runtime-safe: cookie/header constants, signing, and encode/decode helpers
// only. No posthog-node import here — middleware.ts (Edge-only) imports from this
// file. The actual PostHog/Supabase resolve lives in tenant-flags-resolve.ts
// (Node-only) and must never be imported from here or from middleware.ts.
import { createSignedToken, verifySignedToken } from '@/lib/server/signed-token';

export const TENANT_FLAGS_COOKIE = 'df_flags';
export const TENANT_FLAGS_HEADER = 'x-verified-feature-flags';
export const TENANT_FLAGS_TOKEN_VERSION = 'tenant_flags_v1';
/** Long TTL — flags change rarely; a stale cookie just means a refresh on next inactive-session visit. */
export const TENANT_FLAGS_TTL_SECONDS = 24 * 60 * 60;

export interface TenantCreateFlags {
  create_enquiries: boolean;
  create_sales_orders: boolean;
  create_invoices: boolean;
}

export interface TenantFlagsData {
  flags: Record<string, boolean>;
  createFlags: TenantCreateFlags;
}

export interface TenantFlagsPayload extends TenantFlagsData {
  typ: typeof TENANT_FLAGS_TOKEN_VERSION;
  tenant_id: string;
  iat: number;
  exp: number;
}

function getTenantFlagsSecret(): string {
  return (
    process.env.TENANT_FLAGS_TOKEN_SECRET
    ?? process.env.SUPABASE_SERVICE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? 'yukti-tenant-flags-dev-secret'
  );
}

export async function createTenantFlagsToken(
  tenantId: string,
  data: TenantFlagsData,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: TenantFlagsPayload = {
    typ: TENANT_FLAGS_TOKEN_VERSION,
    tenant_id: tenantId,
    flags: data.flags,
    createFlags: data.createFlags,
    iat: now,
    exp: now + TENANT_FLAGS_TTL_SECONDS,
  };
  return createSignedToken(getTenantFlagsSecret(), payload);
}

export async function verifyTenantFlagsToken(
  token: string,
  tenantId: string,
  now = Math.floor(Date.now() / 1000),
): Promise<TenantFlagsPayload | null> {
  const payload = await verifySignedToken(getTenantFlagsSecret(), token) as TenantFlagsPayload | null;
  if (!payload) return null;
  if (payload.typ !== TENANT_FLAGS_TOKEN_VERSION) return null;
  if (payload.tenant_id !== tenantId) return null;
  if (!payload.exp || payload.exp <= now) return null;
  return payload;
}

/** Encodes flags for the internal (server-to-server, same-request) trust-boundary header — no signature needed, the caller already verified/resolved it. */
export function encodeTenantFlagsHeader(data: TenantFlagsData): string {
  return JSON.stringify(data);
}

export function decodeTenantFlagsHeader(raw: string): TenantFlagsData | null {
  try {
    const parsed = JSON.parse(raw) as { flags?: unknown; createFlags?: unknown };
    if (!parsed || typeof parsed !== 'object' || !parsed.flags || !parsed.createFlags) return null;
    return parsed as TenantFlagsData;
  } catch {
    return null;
  }
}
