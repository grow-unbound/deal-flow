import { ROLES } from '@/constants';
import { createSignedToken, verifySignedToken } from '@/lib/server/signed-token';

export const BUYER_PREVIEW_HEADER = 'x-buyer-preview';
export const BUYER_PREVIEW_TOKEN_VERSION = 'buyer_preview_v1';
export const BUYER_PREVIEW_CONFIRMATION_COOKIE = 'buyer_preview_needs_confirmation';
/** Close preview after this much idle time (no pointer/keyboard/scroll activity). */
export const BUYER_PREVIEW_INACTIVITY_SECONDS = 60 * 60;
/** Signed preview token lifetime — slightly longer than inactivity so active sessions can refresh. */
export const BUYER_PREVIEW_TTL_SECONDS = BUYER_PREVIEW_INACTIVITY_SECONDS + 5 * 60;
/** Refresh the server token when activity resumes and less than this remains. */
export const BUYER_PREVIEW_ACTIVITY_REFRESH_BUFFER_SECONDS = 5 * 60;
export const BUYER_PREVIEW_MAX_WIDTH = 1440;

export interface BuyerPreviewTokenPayload {
  typ: typeof BUYER_PREVIEW_TOKEN_VERSION;
  tenant_id: string;
  role: typeof ROLES.BUYER_ADMIN;
  share_token: string | null;
  buyer_id?: string | null;
  iat: number;
  exp: number;
}

function getBuyerPreviewSecret(): string {
  return (
    process.env.BUYER_PREVIEW_TOKEN_SECRET
    ?? process.env.SUPABASE_SERVICE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? 'yukti-buyer-preview-dev-secret'
  );
}

export async function createBuyerPreviewToken(input: {
  tenantId: string;
  shareToken?: string | null;
  buyerId?: string | null;
  now?: number;
}): Promise<string> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const payload: BuyerPreviewTokenPayload = {
    typ: BUYER_PREVIEW_TOKEN_VERSION,
    tenant_id: input.tenantId,
    role: ROLES.BUYER_ADMIN,
    share_token: input.shareToken ?? null,
    buyer_id: input.buyerId ?? null,
    iat: now,
    exp: now + BUYER_PREVIEW_TTL_SECONDS,
  };

  return createSignedToken(getBuyerPreviewSecret(), payload);
}

export async function verifyBuyerPreviewToken(
  token: string,
  now = Math.floor(Date.now() / 1000),
): Promise<BuyerPreviewTokenPayload | null> {
  const payload = await verifySignedToken(getBuyerPreviewSecret(), token) as BuyerPreviewTokenPayload | null;
  if (!payload) return null;

  if (payload.typ !== BUYER_PREVIEW_TOKEN_VERSION) return null;
  if (payload.role !== ROLES.BUYER_ADMIN) return null;
  if (!payload.tenant_id) return null;
  if (!payload.exp || payload.exp <= now) return null;
  return payload;
}
