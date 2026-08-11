import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { Session, User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getBuyerAppContext, type BuyerAppContext } from '@/lib/auth';
import { isoDateInTimeZone } from '@/lib/date-utils';
import { DEFAULT_TENANT_SETTINGS_STORED } from '@/lib/tenant-settings/defaults';
import { firstNameFromValue, normalizeIndianPhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase';
import type { LoginOtpCandidate } from '@/lib/server/buyer-otp-store';

export interface BuyerLoginCandidate {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_whatsapp_number: string | null;
  tenant_whatsapp_display_name: string | null;
  buyer_id: string;
  role: 'buyer_admin' | 'buyer_assistant';
  principal_type: 'buyer' | 'delegate';
  user_id: string | null;
  buyer_user_id: string | null;
  phone: string;
  business_name: string;
  contact_name: string | null;
  buyer_app_enabled: boolean;
  tenant_app_enabled: boolean;
}

interface TenantSettingsRow {
  tenant_id: string;
  settings: Record<string, unknown> | null;
}

interface TenantBuyerAppMetadata {
  enabled: boolean;
  whatsapp_number: string | null;
  whatsapp_display_name: string | null;
}

interface BuyerRow {
  id: string;
  tenant_id: string;
  business_name: string;
  contact_name: string | null;
  credit_limit: number | null;
  phone: string | null;
  gstin: string | null;
  buyer_app_enabled: boolean | null;
  geography?: { state?: string; city?: string; zone?: string } | null;
  whatsapp_consent_at?: string | null;
  whatsapp_opt_out_at?: string | null;
}

interface TenantRow {
  id: string;
  business_name: string;
  slug: string;
  settings?: Record<string, unknown> | null;
}

export interface BuyerAccessProfile {
  context: BuyerAppContext;
  buyer: BuyerRow | null;
  tenant: TenantRow | null;
  greeting_name: string | null;
}

export interface BuyerVisibleCatalog {
  id: string;
  tenant_id: string;
  name: string;
  share_token: string;
  valid_to: string | null;
  message: string | null;
  created_at: string;
  scope_type: 'cohort' | 'buyer' | 'geography' | 'all';
  scope_value: Record<string, unknown> | null;
  hero_image_url: string | null;
}

const BUYER_SESSION_PASSWORD_LENGTH = 32;

function buyerAppMetadataFromSettings(settings: Record<string, unknown> | null | undefined): TenantBuyerAppMetadata {
  const buyerApp = settings?.buyer_app;
  if (buyerApp && typeof buyerApp === 'object' && 'enabled' in buyerApp) {
    const typedBuyerApp = buyerApp as {
      enabled?: unknown;
      whatsapp_number?: unknown;
      whatsapp_display_name?: unknown;
    };

    return {
      enabled: Boolean(typedBuyerApp.enabled),
      whatsapp_number:
        typeof typedBuyerApp.whatsapp_number === 'string' && typedBuyerApp.whatsapp_number.trim()
          ? typedBuyerApp.whatsapp_number.trim()
          : null,
      whatsapp_display_name:
        typeof typedBuyerApp.whatsapp_display_name === 'string' && typedBuyerApp.whatsapp_display_name.trim()
          ? typedBuyerApp.whatsapp_display_name.trim()
          : null,
    };
  }

  return {
    enabled: DEFAULT_TENANT_SETTINGS_STORED.buyer_app.enabled,
    whatsapp_number: DEFAULT_TENANT_SETTINGS_STORED.buyer_app.whatsapp_number || null,
    whatsapp_display_name: DEFAULT_TENANT_SETTINGS_STORED.buyer_app.whatsapp_display_name || null,
  };
}

function randomPassword() {
  return crypto.randomUUID().replace(/-/g, '')
    + crypto.randomUUID().replace(/-/g, '').slice(0, BUYER_SESSION_PASSWORD_LENGTH);
}

function syntheticBuyerEmail(phone: string, buyerId: string) {
  return `buyer-${phone}-${buyerId}@buyers.yukti.local`;
}

async function loadTenantBuyerAppMetadata(tenantIds: string[]): Promise<Map<string, TenantBuyerAppMetadata>> {
  if (!supabaseAdmin || tenantIds.length === 0) return new Map();

  const [tenantSettingsRes, tenantsRes] = await Promise.all([
    supabaseAdmin
      .schema('app')
      .from('tenant_settings')
      .select('tenant_id, settings')
      .in('tenant_id', tenantIds),
    supabaseAdmin
      .schema('app')
      .from('tenants')
      .select('id, settings')
      .in('id', tenantIds),
  ]);

  if (tenantSettingsRes.error || tenantsRes.error) {
    throw new Error(`Failed to load tenant settings: ${tenantSettingsRes.error?.message ?? tenantsRes.error?.message}`);
  }

  const tenantSettingsById = new Map(
    ((tenantSettingsRes.data ?? []) as TenantSettingsRow[]).map((row) => [row.tenant_id, row.settings]),
  );

  return new Map(
    ((tenantsRes.data ?? []) as Array<{ id: string; settings: Record<string, unknown> | null }>).map((row) => [
      row.id,
      buyerAppMetadataFromSettings(tenantSettingsById.get(row.id) ?? row.settings),
    ]),
  );
}

/** Seller's phone for buyer preview linking — domain-owned on app.tenant_users, not auth.users. */
export async function resolveSellerAuthPhone(userId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;

  // A user can belong to multiple tenants (multi-tenant seller_admin) — .maybeSingle()
  // errors on >1 rows. Phone is the same real person regardless of which tenant_users
  // row we read it off, so just take one deterministically.
  const { data } = await supabaseAdmin
    .schema('app')
    .from('tenant_users')
    .select('id, phone')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const row = data as { id: string; phone: string | null } | null;
  if (row?.phone) return row.phone;

  // Row exists but phone was never backfilled (or this tenant_users row predates the
  // column) — fall back to Auth once and persist it so the next call skips Auth.
  if (!row) return null;

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  const meta = authUser?.user?.user_metadata as Record<string, unknown> | null | undefined;
  const phone = (typeof meta?.phone === 'string' && meta.phone ? meta.phone : null)
    ?? authUser?.user?.phone
    ?? null;

  if (phone) {
    await supabaseAdmin
      .schema('app')
      .from('tenant_users')
      .update({ phone })
      .eq('id', row.id);
  }

  return phone;
}

/** Deduped buyer rows in a tenant that share the seller's phone (preview only). */
export async function findTenantBuyerPreviewCandidates(
  userId: string,
  tenantId: string,
): Promise<BuyerLoginCandidate[]> {
  const phone = await resolveSellerAuthPhone(userId);
  if (!phone) return [];

  const candidates = await findBuyerLoginCandidates(phone);
  const byBuyerId = new Map<string, BuyerLoginCandidate>();
  for (const candidate of candidates) {
    if (candidate.tenant_id !== tenantId) continue;
    if (!byBuyerId.has(candidate.buyer_id)) {
      byBuyerId.set(candidate.buyer_id, candidate);
    }
  }

  return Array.from(byBuyerId.values());
}

export async function findBuyerLoginCandidates(phone: string): Promise<BuyerLoginCandidate[]> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const normalizedPhone = normalizeIndianPhone(phone);
  const db = supabaseAdmin;

  // Single RPC combining what used to be 2 sequential PostgREST round trips
  // (app.buyers and app.buyer_users, each with a nested tenants embed) — see
  // app.find_buyer_login_candidates.
  const { data: rows, error } = await db
    .schema('app')
    .rpc('find_buyer_login_candidates', { p_phone: normalizedPhone });

  if (error) {
    throw new Error(`Buyer login candidate lookup failed: ${error.message}`);
  }

  type CandidateRow = {
    kind: 'owner' | 'delegate';
    id: string;
    tenant_id: string;
    business_name: string | null;
    contact_name: string | null;
    buyer_id: string;
    role: string;
    user_id: string | null;
    buyer_app_enabled: boolean | null;
    buyer_is_active: boolean | null;
    buyer_deleted_at: string | null;
    tenant_business_name: string | null;
    tenant_slug: string | null;
  };

  const tenantIds = new Set<string>();
  const ownerCandidates: BuyerLoginCandidate[] = [];
  const delegateCandidates: BuyerLoginCandidate[] = [];

  for (const row of (rows ?? []) as CandidateRow[]) {
    if (row.kind === 'owner') {
      const candidate: BuyerLoginCandidate = {
        tenant_id: String(row.tenant_id),
        tenant_name: String(row.tenant_business_name ?? ''),
        tenant_slug: String(row.tenant_slug ?? ''),
        tenant_whatsapp_number: null,
        tenant_whatsapp_display_name: null,
        buyer_id: String(row.id),
        role: 'buyer_admin',
        principal_type: 'buyer',
        user_id: null,
        buyer_user_id: null,
        phone: normalizedPhone,
        business_name: String(row.business_name ?? ''),
        contact_name: row.contact_name,
        buyer_app_enabled: Boolean(row.buyer_app_enabled),
        tenant_app_enabled: false,
      };
      tenantIds.add(candidate.tenant_id);
      ownerCandidates.push(candidate);
      continue;
    }

    if (!row.buyer_is_active || row.buyer_deleted_at) continue;

    const candidate: BuyerLoginCandidate = {
      tenant_id: String(row.tenant_id ?? ''),
      tenant_name: String(row.tenant_business_name ?? ''),
      tenant_slug: String(row.tenant_slug ?? ''),
      tenant_whatsapp_number: null,
      tenant_whatsapp_display_name: null,
      buyer_id: String(row.buyer_id ?? ''),
      role: (String(row.role ?? 'buyer_assistant') as 'buyer_admin' | 'buyer_assistant'),
      principal_type: 'delegate',
      user_id: String(row.user_id ?? ''),
      buyer_user_id: String(row.id ?? ''),
      phone: normalizedPhone,
      business_name: String(row.business_name ?? ''),
      contact_name: row.contact_name,
      buyer_app_enabled: Boolean(row.buyer_app_enabled),
      tenant_app_enabled: false,
    };
    tenantIds.add(candidate.tenant_id);
    delegateCandidates.push(candidate);
  }

  const metadataByTenant = await loadTenantBuyerAppMetadata(Array.from(tenantIds));

  return [...ownerCandidates, ...delegateCandidates].map((candidate) => ({
    ...candidate,
    tenant_app_enabled: metadataByTenant.get(candidate.tenant_id)?.enabled === true,
    tenant_whatsapp_number: metadataByTenant.get(candidate.tenant_id)?.whatsapp_number ?? null,
    tenant_whatsapp_display_name: metadataByTenant.get(candidate.tenant_id)?.whatsapp_display_name ?? null,
  }));
}

async function ensureBuyerOwnerPrincipal(candidate: BuyerLoginCandidate): Promise<{ user: User; email: string }> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const db = supabaseAdmin;
  const { data: existingRows, error: existingError } = await db
    .schema('app')
    .from('buyer_users')
    .select('id, user_id, role, phone, email')
    .eq('buyer_id', candidate.buyer_id)
    .eq('role', 'buyer_admin')
    .eq('phone', candidate.phone)
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(1);

  if (existingError) {
    throw new Error(`Failed to load buyer owner principal: ${existingError.message}`);
  }

  const existing = (existingRows ?? [])[0] as { id: string; user_id: string; email: string | null } | undefined;
  if (existing?.user_id) {
    // email is persisted on buyer_users at creation time below — no Auth Admin API
    // round-trip needed for a returning login. Rows created before this existed
    // (pre-fix) fall back to the deterministic synthetic email.
    const email = existing.email ?? syntheticBuyerEmail(candidate.phone, candidate.buyer_id);
    return {
      user: { id: existing.user_id } as User,
      email,
    };
  }

  const password = randomPassword();
  const email = syntheticBuyerEmail(candidate.phone, candidate.buyer_id);
  const fullName = candidate.contact_name?.trim() || candidate.business_name;
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      first_name: firstNameFromValue(fullName),
      phone: candidate.phone,
      buyer_id: candidate.buyer_id,
      tenant_id: candidate.tenant_id,
    },
    app_metadata: {
      current_tenant_id: candidate.tenant_id,
      current_buyer_id: candidate.buyer_id,
    },
  });

  if (createError || !created.user) {
    throw new Error(createError?.message ?? 'Failed to create buyer auth user');
  }

  const { error: insertError } = await db
    .schema('app')
    .from('buyer_users')
    .insert({
      buyer_id: candidate.buyer_id,
      user_id: created.user.id,
      role: 'buyer_admin',
      phone: candidate.phone,
      email,
      is_active: true,
      created_by: created.user.id,
      updated_by: created.user.id,
    });

  if (insertError) {
    throw new Error(`Failed to link buyer auth user: ${insertError.message}`);
  }

  return { user: created.user, email };
}

async function ensureBuyerDelegatePrincipal(candidate: BuyerLoginCandidate): Promise<{ user: User; email: string }> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  if (candidate.user_id) {
    // Same as the buyer-owner path: read the persisted email off buyer_users rather
    // than round-tripping to the Auth Admin API on every returning login.
    if (candidate.buyer_user_id) {
      const { data: row } = await supabaseAdmin
        .schema('app')
        .from('buyer_users')
        .select('email')
        .eq('id', candidate.buyer_user_id)
        .maybeSingle();
      const persistedEmail = (row as { email: string | null } | null)?.email;
      if (persistedEmail) {
        return { user: { id: candidate.user_id } as User, email: persistedEmail };
      }
    }

    // No persisted email yet (row created before this fix, or missing buyer_user_id) —
    // fall back to the Auth Admin API once, and persist it so the next login skips it.
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(candidate.user_id);
    if (error || !data.user) {
      throw new Error(error?.message ?? 'Buyer delegate auth user not found');
    }

    const email = data.user.email ?? syntheticBuyerEmail(candidate.phone, candidate.buyer_id);
    if (candidate.buyer_user_id) {
      await supabaseAdmin
        .schema('app')
        .from('buyer_users')
        .update({ email })
        .eq('id', candidate.buyer_user_id);
    }

    return {
      user: data.user,
      email,
    };
  }

  // Delegate rows synced in from an integration (e.g. Zoho contact_persons) have no
  // linked auth user until they first log in — provision one now, same as the buyer
  // owner path already does, and link it back onto the buyer_users row.
  if (!candidate.buyer_user_id) {
    throw new Error('Buyer delegate principal is missing a buyer_users row to link');
  }

  const password = randomPassword();
  const email = syntheticBuyerEmail(candidate.phone, candidate.buyer_id);
  const fullName = candidate.contact_name?.trim() || candidate.business_name;
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      first_name: firstNameFromValue(fullName),
      phone: candidate.phone,
      buyer_id: candidate.buyer_id,
      tenant_id: candidate.tenant_id,
    },
    app_metadata: {
      current_tenant_id: candidate.tenant_id,
      current_buyer_id: candidate.buyer_id,
    },
  });

  if (createError || !created.user) {
    throw new Error(createError?.message ?? 'Failed to create buyer delegate auth user');
  }

  const { error: updateError } = await supabaseAdmin
    .schema('app')
    .from('buyer_users')
    .update({
      user_id: created.user.id,
      email,
      updated_by: created.user.id,
    })
    .eq('id', candidate.buyer_user_id);

  if (updateError) {
    throw new Error(`Failed to link buyer delegate auth user: ${updateError.message}`);
  }

  return { user: created.user, email };
}

async function createBuyerSessionForUser(
  userId: string,
  email: string,
  password: string,
  candidate: BuyerLoginCandidate,
) {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const fullName = candidate.contact_name?.trim() || candidate.business_name;
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      first_name: firstNameFromValue(fullName),
      phone: candidate.phone,
      buyer_id: candidate.buyer_id,
      tenant_id: candidate.tenant_id,
    },
    app_metadata: {
      current_tenant_id: candidate.tenant_id,
      current_buyer_id: candidate.buyer_id,
    },
  });

  if (updateError) {
    throw new Error(updateError.message);
  }

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.session) {
    throw new Error(signInError?.message ?? 'Failed to create buyer session');
  }

  const { data: refreshData, error: refreshError } = await anonClient.auth.refreshSession({
    refresh_token: signInData.session.refresh_token,
  });

  if (refreshError) {
    throw new Error(refreshError.message);
  }

  return refreshData.session ?? signInData.session;
}

export async function mintBuyerSession(candidate: BuyerLoginCandidate): Promise<{ session: Session; user: User }> {
  const principal = candidate.principal_type === 'buyer'
    ? await ensureBuyerOwnerPrincipal(candidate)
    : await ensureBuyerDelegatePrincipal(candidate);

  const password = randomPassword();
  const session = await createBuyerSessionForUser(
    principal.user.id,
    principal.email,
    password,
    candidate,
  );

  return {
    session,
    user: principal.user,
  };
}

export async function requireBuyerAccessProfile(request: NextRequest): Promise<BuyerAccessProfile | null> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const context = await getBuyerAppContext(request);
  if (!context.tenant_id) {
    return null;
  }

  const db = supabaseAdmin;
  const tenantPromise = db
    .schema('app')
    .from('tenants')
    .select('id, business_name, slug, settings')
    .eq('id', context.tenant_id)
    .maybeSingle();

  // Pure seller preview — no linked buyer account
  if (context.mode === 'preview' && !context.buyer_id) {
    const { data: tenant, error } = await tenantPromise;
    if (error) throw new Error(error.message);

    return {
      context,
      buyer: null,
      tenant: tenant
        ? {
            id: tenant.id,
            business_name: tenant.business_name,
            slug: tenant.slug,
          }
        : null,
      greeting_name: 'Preview',
    };
  }

  if (!context.buyer_id) {
    return null;
  }

  let buyerLookup = db
    .schema('app')
    .from('buyers')
    .select('id, tenant_id, business_name, contact_name, credit_limit, phone, gstin, buyer_app_enabled, geography, whatsapp_consent_at, whatsapp_opt_out_at')
    .eq('id', context.buyer_id)
    .eq('tenant_id', context.tenant_id)
    .eq('is_active', true)
    .is('deleted_at', null);

  // Seller preview bypasses buyer_app_enabled — that gate controls buyer login, not preview.
  if (context.mode !== 'preview') {
    buyerLookup = buyerLookup.or('buyer_app_enabled.eq.true,buyer_app_enabled.is.null');
  }

  const [buyerRes, tenantRes, settingsRes] = await Promise.all([
    buyerLookup.maybeSingle(),
    tenantPromise,
    db
      .schema('app')
      .from('tenant_settings')
      .select('tenant_id, settings')
      .eq('tenant_id', context.tenant_id)
      .maybeSingle(),
  ]);

  if (buyerRes.error) throw new Error(buyerRes.error.message);
  if (tenantRes.error) throw new Error(tenantRes.error.message);
  if (settingsRes.error) throw new Error(settingsRes.error.message);

  if (!buyerRes.data) {
    return null;
  }

  const tenantSettingsEnabled = buyerAppMetadataFromSettings(
    (settingsRes.data as TenantSettingsRow | null)?.settings
    ?? (tenantRes.data?.settings as Record<string, unknown> | null | undefined),
  ).enabled;

  if (!tenantSettingsEnabled && context.mode !== 'preview') {
    return null;
  }

  const greetingName =
    firstNameFromValue(buyerRes.data.contact_name)
    || buyerRes.data.contact_name?.trim()
    || buyerRes.data.business_name;

  return {
    context,
    buyer: buyerRes.data as BuyerRow,
    tenant: tenantRes.data
      ? {
          id: tenantRes.data.id,
          business_name: tenantRes.data.business_name,
          slug: tenantRes.data.slug,
        }
      : null,
    greeting_name: greetingName || null,
  };
}

function buyerMatchesCatalog(
  catalog: BuyerVisibleCatalog,
  buyerId: string,
  buyerDefaultCohortId: string | null,
  explicitCohortIds: Set<string>,
  buyerGeography: { state?: string; city?: string; zone?: string } | null,
) {
  if (catalog.scope_type === 'all') return true;

  const scopeValue = (catalog.scope_value ?? {}) as {
    buyer_id?: string;
    buyer_ids?: string[];
    cohort_id?: string;
    geography?: { state?: string; city?: string; zone?: string };
  };

  if (catalog.scope_type === 'buyer') {
    if (Array.isArray(scopeValue.buyer_ids) && scopeValue.buyer_ids.length > 0) {
      return scopeValue.buyer_ids.includes(buyerId);
    }
    return scopeValue.buyer_id === buyerId;
  }

  if (catalog.scope_type === 'cohort') {
    const cohortId = scopeValue.cohort_id;
    if (!cohortId) return false;
    if (explicitCohortIds.has(cohortId)) return true;
    return buyerDefaultCohortId === cohortId;
  }

  if (catalog.scope_type === 'geography') {
    const geo = scopeValue.geography;
    if (!geo || !buyerGeography) return false;
    if (geo.state && geo.state !== buyerGeography.state) return false;
    if (geo.city && geo.city !== buyerGeography.city) return false;
    if (geo.zone && geo.zone !== buyerGeography.zone) return false;
    return true;
  }

  return false;
}

function isCatalogVisibleOnCurrentIstDay(validTo: string | null, now = new Date()): boolean {
  if (!validTo) return true;

  const validToDate = new Date(validTo);
  if (Number.isNaN(validToDate.getTime())) return false;

  return isoDateInTimeZone(validToDate) >= isoDateInTimeZone(now);
}

// ---------------------------------------------------------------------------
// Seller phone lookup + session minting
// ---------------------------------------------------------------------------

export async function findSellerLoginCandidates(phone: string): Promise<LoginOtpCandidate[]> {
  if (!supabaseAdmin) throw new Error('Server configuration error');

  const normalizedPhone = normalizeIndianPhone(phone);

  // The RPC is not yet in the generated DB types, so we cast through unknown
  const { data, error } = await (supabaseAdmin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc('find_seller_candidates_by_phone', { p_phone: normalizedPhone });

  if (error) throw new Error(`Seller lookup failed: ${error.message}`);

  return ((data ?? []) as Array<{
    user_id: string;
    tenant_id: string;
    tenant_name: string;
    tenant_slug: string;
    role: string;
    location_ids: string[] | null;
    email: string | null;
    full_name: string | null;
  }>).map((row) => ({
    kind: 'seller' as const,
    tenant_id: row.tenant_id,
    tenant_name: row.tenant_name,
    tenant_slug: row.tenant_slug,
    tenant_whatsapp_number: null,
    tenant_whatsapp_display_name: null,
    role: row.role,
    buyer_id: null,
    principal_type: 'seller' as const,
    user_id: row.user_id,
    buyer_user_id: null,
    phone: normalizedPhone,
    business_name: '',
    contact_name: row.full_name,
    email: row.email,
  }));
}

export async function findAllLoginCandidates(phone: string): Promise<LoginOtpCandidate[]> {
  const [sellers, buyers] = await Promise.all([
    findSellerLoginCandidates(phone),
    findBuyerLoginCandidates(phone),
  ]);

  // Map buyer candidates to the unified LoginOtpCandidate shape (filtering for eligible only)
  const eligibleBuyers: LoginOtpCandidate[] = buyers
    .filter((c) => c.buyer_app_enabled && c.tenant_app_enabled)
    .map((c) => ({
      kind: 'buyer' as const,
      tenant_id: c.tenant_id,
      tenant_name: c.tenant_name,
      tenant_slug: c.tenant_slug,
      tenant_whatsapp_number: c.tenant_whatsapp_number,
      tenant_whatsapp_display_name: c.tenant_whatsapp_display_name,
      role: c.role,
      buyer_id: c.buyer_id,
      principal_type: c.principal_type as 'buyer' | 'delegate',
      user_id: c.user_id,
      buyer_user_id: c.buyer_user_id,
      phone: c.phone,
      business_name: c.business_name,
      contact_name: c.contact_name,
    }));

  // Remove buyer entries where the same auth user already appears as a seller
  const sellerUserIds = new Set(sellers.map((s) => s.user_id).filter(Boolean));
  const filteredBuyers = eligibleBuyers.filter(
    (b) => !b.user_id || !sellerUserIds.has(b.user_id),
  );

  // Sellers first
  return [...sellers, ...filteredBuyers];
}

export function toBuyerLoginCandidate(c: LoginOtpCandidate): BuyerLoginCandidate {
  if (c.kind !== 'buyer' || !c.buyer_id) throw new Error('Not a buyer candidate');
  return {
    tenant_id: c.tenant_id,
    tenant_name: c.tenant_name,
    tenant_slug: c.tenant_slug,
    tenant_whatsapp_number: c.tenant_whatsapp_number,
    tenant_whatsapp_display_name: c.tenant_whatsapp_display_name,
    buyer_id: c.buyer_id,
    role: c.role as 'buyer_admin' | 'buyer_assistant',
    principal_type: c.principal_type as 'buyer' | 'delegate',
    user_id: c.user_id,
    buyer_user_id: c.buyer_user_id,
    phone: c.phone,
    business_name: c.business_name,
    contact_name: c.contact_name,
    buyer_app_enabled: true,
    tenant_app_enabled: true,
  };
}

export async function mintSellerSession(
  candidate: LoginOtpCandidate & { kind: 'seller' },
): Promise<{ session: Session; user: User }> {
  if (!supabaseAdmin || !candidate.user_id) {
    throw new Error('Server configuration error or missing user_id for seller');
  }

  // email is domain-owned on tenant_users — no Auth Admin API round-trip needed.
  const { data: tenantUserRow, error: tenantUserError } = await supabaseAdmin
    .schema('app')
    .from('tenant_users')
    .select('email')
    .eq('user_id', candidate.user_id)
    .eq('tenant_id', candidate.tenant_id)
    .maybeSingle();

  let email = (tenantUserRow as { email: string | null } | null)?.email ?? null;

  if (tenantUserError || !email) {
    // Rows created before this column existed may still be null — fall back once
    // and backfill so the next login skips Auth entirely.
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(candidate.user_id);
    if (userError || !userData.user?.email) {
      throw new Error(userError?.message ?? 'Seller auth user not found');
    }
    email = userData.user.email;
    await supabaseAdmin
      .schema('app')
      .from('tenant_users')
      .update({ email })
      .eq('user_id', candidate.user_id)
      .eq('tenant_id', candidate.tenant_id);
  }

  const sellerUser = { id: candidate.user_id } as User;

  // Set app_metadata (for the JWT hook) and generate the recovery link in parallel —
  // neither depends on the other's result, only on `email` resolved above. The
  // refreshSession() below still runs after verifyOtp() to pick up the metadata
  // write, since that's a genuine dependency (needs a hook re-run after the write).
  const [, { data: linkData, error: linkError }] = await Promise.all([
    supabaseAdmin.auth.admin.updateUserById(candidate.user_id, {
      app_metadata: {
        current_tenant_id: candidate.tenant_id,
        current_buyer_id: null,
      },
    }),
    // Generate a recovery link server-side — does NOT send any email
    supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email }),
  ]);

  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(linkError?.message ?? 'Failed to generate seller recovery link');
  }

  const { hashed_token: hashedToken } = linkData.properties;

  // Exchange the hashed_token for a live session using an anon client
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'recovery',
  });

  if (verifyError || !verifyData.session) {
    throw new Error(verifyError?.message ?? 'Failed to exchange recovery token for session');
  }

  // Best effort: refresh re-runs the custom_access_token_hook so seller claims are
  // embedded directly in the JWT. If Supabase rate-limits refresh, the verified
  // session still works because our request auth path can fall back to getUser()
  // plus workspace lookup from the bearer token.
  const { data: refreshData, error: refreshError } = await anonClient.auth.refreshSession({
    refresh_token: verifyData.session.refresh_token,
  });

  return {
    session: refreshError || !refreshData.session ? verifyData.session : refreshData.session,
    user: verifyData.user ?? sellerUser,
  };
}

// ---------------------------------------------------------------------------

export async function getVisibleBuyerCatalogs(tenantId: string, buyerId: string): Promise<BuyerVisibleCatalog[]> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const db = supabaseAdmin;
  const [catalogsRes, buyerRes, cohortMembershipRes] = await Promise.all([
    db
      .schema('app')
      .from('campaigns')
      .select('id, tenant_id, name, share_token, valid_to, message, created_at, scope_type, scope_value, hero_image_url')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    db
      .schema('app')
      .from('buyers')
      .select('id, default_cohort_id, geography')
      .eq('id', buyerId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    db
      .schema('app')
      .from('cohort_members_active')
      .select('cohort_id')
      .eq('buyer_id', buyerId),
  ]);

  if (catalogsRes.error) throw new Error(catalogsRes.error.message);
  if (buyerRes.error) throw new Error(buyerRes.error.message);
  if (cohortMembershipRes.error) throw new Error(cohortMembershipRes.error.message);

  const explicitCohorts = new Set(
    ((cohortMembershipRes.data ?? []) as Array<{ cohort_id: string }>).map((row) => row.cohort_id),
  );
  const buyerData = (buyerRes.data as {
    default_cohort_id?: string | null;
    geography?: { state?: string; city?: string; zone?: string } | null;
  } | null);
  const buyerDefaultCohortId = buyerData?.default_cohort_id ?? null;
  const buyerGeography = buyerData?.geography ?? null;

  return ((catalogsRes.data ?? []) as BuyerVisibleCatalog[]).filter((catalog) =>
    isCatalogVisibleOnCurrentIstDay(catalog.valid_to)
    && buyerMatchesCatalog(catalog, buyerId, buyerDefaultCohortId, explicitCohorts, buyerGeography),
  );
}
