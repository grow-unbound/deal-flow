import type { JWTClaims } from '@/lib/auth';
import { findBuyerLoginCandidates } from '@/lib/server/buyer-access';
import { resolveSwitchLookupPhone, restrictCandidatesToAuthenticatedUser } from '@/lib/server/auth-switch-phone';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Every buyer account a phone has at one tenant, with where each stands — shown on /pending so a
 * buyer whose phone matches several accounts can open an enabled one, ask for access on a disabled
 * one, or finish what an in-progress one is waiting for, instead of being forced into one account.
 */
export type AccessAccountState =
  | 'active'
  | 'can_request'
  | 'requested'
  | 'awaiting_approval'
  | 'needs_more_info'
  | 'needs_intake'
  | 'declined';

export interface AccessAccount {
  buyer_id: string;
  business_name: string;
  contact_name: string | null;
  state: AccessAccountState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export const EXISTING_BUYER_ACCESS_REQUEST_KIND = 'existing_buyer_access';

/** True while an existing-buyer access request for this buyer is still open (entry not resolved). */
export async function hasOpenExistingBuyerAccessRequest(
  db: DbClient,
  tenantId: string,
  buyerId: string,
): Promise<boolean> {
  const open = await listBuyersWithOpenAccessRequest(db, tenantId, [buyerId]);
  return open.has(buyerId);
}

async function listBuyersWithOpenAccessRequest(
  db: DbClient,
  tenantId: string,
  buyerIds: string[],
): Promise<Set<string>> {
  if (buyerIds.length === 0) return new Set();
  const { data, error } = await db
    .schema('app')
    .from('entries')
    .select('source_entity_id')
    .eq('tenant_id', tenantId)
    .eq('source_entity_type', 'buyer')
    .in('source_entity_id', buyerIds)
    .eq('metadata->>request_kind', EXISTING_BUYER_ACCESS_REQUEST_KIND)
    .neq('status', 'resolved')
    .is('deleted_at', null)
    .limit(buyerIds.length * 2);
  if (error) {
    console.error('[buyer-access-accounts] open access-request lookup failed', error);
    return new Set();
  }
  return new Set(((data ?? []) as Array<{ source_entity_id: string }>).map((row) => row.source_entity_id));
}

export interface AccessAccountSource {
  buyer_app_enabled: boolean | null;
  onboarding_status: string | null;
  custom_fields: Record<string, unknown> | null;
}

export function classifyAccessAccount(row: AccessAccountSource, hasOpenRequest: boolean): AccessAccountState {
  if (row.buyer_app_enabled !== false) return 'active';
  if (row.onboarding_status === 'declined') return 'declined';
  if (row.onboarding_status === 'needs_more_info') return 'needs_more_info';
  const customFields = row.custom_fields ?? {};
  const selfRegistered = customFields.storefront_self_registered === true;
  const intakeSubmitted = Boolean(customFields.intake_submitted_at);
  if (selfRegistered && !intakeSubmitted) return 'needs_intake';
  if (hasOpenRequest) return 'requested';
  if (intakeSubmitted) return 'awaiting_approval';
  return 'can_request';
}

export type AccessAccountClaims = Pick<JWTClaims, 'sub' | 'tenant_id' | 'buyer_id'>;

export interface AccessAccountsResult {
  accounts: AccessAccount[];
  /** 'otp_verified' when the phone came from a real OTP check; 'session_only' when it could not be resolved. */
  source: 'otp_verified' | 'authenticated_identity' | 'session_only';
}

/**
 * The caller's accounts at their session tenant. SECURITY: same phone-trust rules as
 * /api/buyer/siblings and /api/auth/switch-buyer — prefer the OTP-verified phone; fall back to the
 * auth identity only for rows already linked to the caller's own auth user; never a mutable
 * app.buyers.phone column. With no usable phone this degrades to just the session's own buyer.
 */
export async function loadAccessAccounts(claims: AccessAccountClaims): Promise<AccessAccountsResult> {
  if (!supabaseAdmin || !claims.sub || !claims.tenant_id) return { accounts: [], source: 'session_only' };
  const db: DbClient = supabaseAdmin;
  const tenantId = claims.tenant_id;

  const buyerIds = new Set<string>();
  let source: AccessAccountsResult['source'] = 'session_only';

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(claims.sub);
  const lookup = userData?.user ? resolveSwitchLookupPhone(userData.user) : null;
  if (lookup) {
    const candidates = restrictCandidatesToAuthenticatedUser(
      await findBuyerLoginCandidates(lookup.phone),
      claims,
      lookup,
    );
    for (const candidate of candidates) {
      if (candidate.tenant_id === tenantId && candidate.buyer_id) buyerIds.add(candidate.buyer_id);
    }
    source = lookup.source;
  }
  // The session's own buyer is always part of the picture, even when the phone lookup misses it.
  if (claims.buyer_id) buyerIds.add(claims.buyer_id);
  if (buyerIds.size === 0) return { accounts: [], source };

  const ids = Array.from(buyerIds);
  const { data: rows, error } = await db
    .schema('app')
    .from('buyers')
    .select('id, business_name, contact_name, buyer_app_enabled, onboarding_status, custom_fields')
    .eq('tenant_id', tenantId)
    .in('id', ids)
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(ids.length);
  if (error) {
    console.error('[buyer-access-accounts] buyer lookup failed', error);
    return { accounts: [], source };
  }

  const open = await listBuyersWithOpenAccessRequest(db, tenantId, ids);
  const accounts = ((rows ?? []) as Array<AccessAccountSource & { id: string; business_name: string; contact_name: string | null }>)
    .map((row): AccessAccount => ({
      buyer_id: row.id,
      business_name: row.business_name,
      contact_name: row.contact_name?.trim() || null,
      state: classifyAccessAccount(row, open.has(row.id)),
    }));

  // Stable, scannable order: usable accounts first, then by name.
  const rank: Record<AccessAccountState, number> = {
    active: 0, can_request: 1, needs_more_info: 2, needs_intake: 3, requested: 4, awaiting_approval: 5, declined: 6,
  };
  accounts.sort((a, b) => rank[a.state] - rank[b.state] || a.business_name.localeCompare(b.business_name));
  return { accounts, source };
}
