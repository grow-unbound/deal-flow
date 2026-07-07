import type { NextRequest } from 'next/server';
import { supabase, supabaseAdmin } from './supabase';
import {
  BUYER_PREVIEW_HEADER,
  type BuyerPreviewTokenPayload,
  verifyBuyerPreviewToken,
} from './buyer-preview';
import { SELLER_ROLES } from '@/constants';
import { normalizeLocationIds } from '@/lib/server/seller-location-access';

export interface JWTClaims {
  sub: string | null;
  tenant_id: string | null;
  role: string | null;
  buyer_id: string | null;
  location_ids: string[] | null;
}

export interface BuyerAppContext extends JWTClaims {
  mode: 'buyer' | 'preview';
  share_token: string | null;
  preview: BuyerPreviewTokenPayload | null;
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Decodes the payload section of a JWT without signature verification.
 * Safe to call after Supabase's getUser() has already validated the token.
 */
export function decodeJWTPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('Malformed JWT: missing payload segment');
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  const json = (() => {
    // Edge-safe path (middleware/runtime environments where Buffer may be unavailable)
    if (typeof atob === 'function') {
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(padded, 'base64').toString('utf-8');
  })();

  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Reads the verified JWT claims that middleware injected as request headers.
 * Never call this with raw client-supplied headers — only headers set by middleware.ts.
 */
export function extractVerifiedClaims(request: NextRequest): JWTClaims {
  const rawLocationIds = request.headers.get('x-verified-location-ids');
  const locationIds = (() => {
    if (!rawLocationIds) return null;
    try {
      return normalizeLocationIds(JSON.parse(rawLocationIds) as unknown);
    } catch {
      return null;
    }
  })();

  return {
    sub: request.headers.get('x-verified-user-id'),
    tenant_id: request.headers.get('x-verified-tenant-id'),
    role: request.headers.get('x-verified-role'),
    buyer_id: request.headers.get('x-verified-buyer-id'),
    location_ids: locationIds,
  };
}

/**
 * Returns verified claims — fast path reads middleware-injected headers, falls back to
 * Bearer token + RPC when JWT custom claims aren't present (e.g. hook not configured).
 */
export async function getVerifiedClaims(request: NextRequest): Promise<JWTClaims> {
  const claims = extractVerifiedClaims(request);
  if (claims.tenant_id) return claims;

  // Fallback: verify the Bearer token and look up workspace via RPC
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return claims;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return claims;

  const db = supabaseAdmin ?? supabase;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (db as any).rpc('get_user_workspace', { p_user_id: user.id });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ws = (rows as any[] | null)?.[0] ?? null;

  return {
    sub: user.id,
    tenant_id: (ws?.tenant_id as string) ?? null,
    role: (ws?.role as string) ?? null,
    buyer_id: (ws?.buyer_id as string) ?? null,
    location_ids: normalizeLocationIds(ws?.location_ids),
  };
}

function isSellerRole(role: string | null): boolean {
  return role !== null && (SELLER_ROLES as readonly string[]).includes(role);
}

export async function getBuyerAppContext(request: NextRequest): Promise<BuyerAppContext> {
  const claims = await getVerifiedClaims(request);
  if (claims.tenant_id && claims.buyer_id) {
    return {
      ...claims,
      mode: 'buyer',
      share_token: null,
      preview: null,
    };
  }

  const previewToken = request.headers.get(BUYER_PREVIEW_HEADER);
  const preview = previewToken ? await verifyBuyerPreviewToken(previewToken) : null;
  const previewActivated = Boolean(
    preview
    && claims.tenant_id
    && claims.tenant_id === preview.tenant_id
    && isSellerRole(claims.role),
  );
  if (previewActivated && preview) {
    return {
      ...claims,
      role: preview.role,
      buyer_id: preview.buyer_id ?? null,
      mode: 'preview',
      share_token: preview.share_token,
      preview,
    };
  }

  return {
    ...claims,
    mode: 'buyer',
    share_token: null,
    preview: null,
  };
}

/**
 * Asserts that claims contain a valid tenant_id, optionally matching expectedTenantId.
 * Throws AuthorizationError on any mismatch — callers should return 403.
 */
export function assertTenantClaim(
  claims: JWTClaims,
  expectedTenantId?: string,
): void {
  if (!claims.tenant_id) {
    throw new AuthorizationError('JWT missing tenant_id claim');
  }
  if (expectedTenantId && claims.tenant_id !== expectedTenantId) {
    throw new AuthorizationError(
      `Tenant mismatch: expected ${expectedTenantId}, got ${claims.tenant_id}`,
    );
  }
}
