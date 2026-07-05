import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { Session, User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getBuyerAppContext, type BuyerAppContext } from '@/lib/auth';
import { DEFAULT_TENANT_SETTINGS_STORED } from '@/lib/tenant-settings/defaults';
import { firstNameFromValue, normalizeIndianPhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase';
import type { LoginOtpCandidate } from '@/lib/server/buyer-otp-store';

export interface BuyerLoginCandidate {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
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

function buyerAppEnabledFromSettings(settings: Record<string, unknown> | null | undefined): boolean {
  const buyerApp = settings?.buyer_app;
  if (buyerApp && typeof buyerApp === 'object' && 'enabled' in buyerApp) {
    return Boolean((buyerApp as { enabled?: unknown }).enabled);
  }

  return DEFAULT_TENANT_SETTINGS_STORED.buyer_app.enabled;
}

function randomPassword() {
  return crypto.randomUUID().replace(/-/g, '')
    + crypto.randomUUID().replace(/-/g, '').slice(0, BUYER_SESSION_PASSWORD_LENGTH);
}

function syntheticBuyerEmail(phone: string, buyerId: string) {
  return `buyer-${phone}-${buyerId}@buyers.yukti.local`;
}

async function loadTenantBuyerAppFlags(tenantIds: string[]): Promise<Map<string, boolean>> {
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
      buyerAppEnabledFromSettings(tenantSettingsById.get(row.id) ?? row.settings),
    ]),
  );
}

export async function findBuyerLoginCandidates(phone: string): Promise<BuyerLoginCandidate[]> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const normalizedPhone = normalizeIndianPhone(phone);
  const db = supabaseAdmin;

  const [buyersRes, delegatesRes] = await Promise.all([
    db
      .schema('app')
      .from('buyers')
      .select(`
        id,
        tenant_id,
        business_name,
        contact_name,
        phone,
        buyer_app_enabled,
        is_active,
        deleted_at,
        tenants!tenant_id ( id, business_name, slug )
      `)
      .eq('phone', normalizedPhone)
      .eq('is_active', true)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('buyer_users')
      .select(`
        id,
        buyer_id,
        user_id,
        role,
        phone,
        is_active,
        deleted_at,
        buyers!buyer_id (
          id,
          tenant_id,
          business_name,
          contact_name,
          buyer_app_enabled,
          is_active,
          deleted_at,
          tenants!tenant_id ( id, business_name, slug )
        )
      `)
      .eq('phone', normalizedPhone)
      .eq('is_active', true)
      .is('deleted_at', null),
  ]);

  if (buyersRes.error) {
    throw new Error(`Buyer lookup failed: ${buyersRes.error.message}`);
  }
  if (delegatesRes.error) {
    throw new Error(`Buyer user lookup failed: ${delegatesRes.error.message}`);
  }

  const tenantIds = new Set<string>();
  const ownerCandidates = ((buyersRes.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const tenant = row.tenants as Record<string, unknown>;
      const candidate: BuyerLoginCandidate = {
        tenant_id: String(row.tenant_id),
        tenant_name: String(tenant.business_name ?? ''),
        tenant_slug: String(tenant.slug ?? ''),
        buyer_id: String(row.id),
        role: 'buyer_admin',
        principal_type: 'buyer',
        user_id: null,
        buyer_user_id: null,
        phone: normalizedPhone,
        business_name: String(row.business_name ?? ''),
        contact_name: typeof row.contact_name === 'string' ? row.contact_name : null,
        buyer_app_enabled: Boolean(row.buyer_app_enabled),
        tenant_app_enabled: false,
      };
      tenantIds.add(candidate.tenant_id);
      return candidate;
    });

  const delegateCandidates = ((delegatesRes.data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const buyer = row.buyers as Record<string, unknown>;
      return Boolean(buyer?.is_active) && !buyer?.deleted_at;
    })
    .map((row) => {
      const buyer = row.buyers as Record<string, unknown>;
      const tenant = buyer.tenants as Record<string, unknown>;
      const candidate: BuyerLoginCandidate = {
        tenant_id: String(buyer.tenant_id ?? ''),
        tenant_name: String(tenant.business_name ?? ''),
        tenant_slug: String(tenant.slug ?? ''),
        buyer_id: String(row.buyer_id ?? ''),
        role: (String(row.role ?? 'buyer_assistant') as 'buyer_admin' | 'buyer_assistant'),
        principal_type: 'delegate',
        user_id: String(row.user_id ?? ''),
        buyer_user_id: String(row.id ?? ''),
        phone: normalizedPhone,
        business_name: String(buyer.business_name ?? ''),
        contact_name: typeof buyer.contact_name === 'string' ? buyer.contact_name : null,
        buyer_app_enabled: Boolean(buyer.buyer_app_enabled),
        tenant_app_enabled: false,
      };
      tenantIds.add(candidate.tenant_id);
      return candidate;
    });

  const flagsByTenant = await loadTenantBuyerAppFlags(Array.from(tenantIds));

  return [...ownerCandidates, ...delegateCandidates].map((candidate) => ({
    ...candidate,
    tenant_app_enabled: flagsByTenant.get(candidate.tenant_id) === true,
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
    .select('id, user_id, role, phone')
    .eq('buyer_id', candidate.buyer_id)
    .eq('role', 'buyer_admin')
    .eq('phone', candidate.phone)
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(1);

  if (existingError) {
    throw new Error(`Failed to load buyer owner principal: ${existingError.message}`);
  }

  const existing = (existingRows ?? [])[0] as { id: string; user_id: string } | undefined;
  if (existing?.user_id) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(existing.user_id);
    if (error || !data.user) {
      throw new Error(error?.message ?? 'Buyer owner auth user not found');
    }

    return {
      user: data.user,
      email: data.user.email ?? syntheticBuyerEmail(candidate.phone, candidate.buyer_id),
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
  if (!candidate.user_id || !supabaseAdmin) {
    throw new Error('Buyer delegate principal is missing an auth user');
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(candidate.user_id);
  if (error || !data.user) {
    throw new Error(error?.message ?? 'Buyer delegate auth user not found');
  }

  return {
    user: data.user,
    email: data.user.email ?? syntheticBuyerEmail(candidate.phone, candidate.buyer_id),
  };
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
  if (!context.tenant_id) return null;

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

  const [buyerRes, tenantRes, settingsRes] = await Promise.all([
    db
      .schema('app')
      .from('buyers')
      .select('id, tenant_id, business_name, contact_name, credit_limit, phone, gstin, buyer_app_enabled, geography, whatsapp_consent_at, whatsapp_opt_out_at')
      .eq('id', context.buyer_id)
      .eq('tenant_id', context.tenant_id)
      .eq('is_active', true)
      .or('buyer_app_enabled.eq.true,buyer_app_enabled.is.null')
      .is('deleted_at', null)
      .maybeSingle(),
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

  const tenantSettingsEnabled = buyerAppEnabledFromSettings(
    (settingsRes.data as TenantSettingsRow | null)?.settings
    ?? (tenantRes.data?.settings as Record<string, unknown> | null | undefined),
  );

  if (!tenantSettingsEnabled) {
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
  }>).map((row) => ({
    kind: 'seller' as const,
    tenant_id: row.tenant_id,
    tenant_name: row.tenant_name,
    tenant_slug: row.tenant_slug,
    role: row.role,
    buyer_id: null,
    principal_type: 'seller' as const,
    user_id: row.user_id,
    buyer_user_id: null,
    phone: normalizedPhone,
    business_name: '',
    contact_name: null,
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

  // Fetch the seller's email from auth.users
  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.getUserById(candidate.user_id);
  if (userError || !userData.user?.email) {
    throw new Error(userError?.message ?? 'Seller auth user not found');
  }

  const sellerUser = userData.user;
  const email = sellerUser.email!; // guarded above

  // Set app_metadata so the JWT hook embeds the correct tenant claim
  await supabaseAdmin.auth.admin.updateUserById(candidate.user_id, {
    app_metadata: {
      current_tenant_id: candidate.tenant_id,
      current_buyer_id: null,
    },
  });

  // Generate a recovery link server-side — does NOT send any email
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email });

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

  // Refresh so the custom_access_token_hook re-runs and embeds tenant_id + role claims
  const { data: refreshData, error: refreshError } = await anonClient.auth.refreshSession({
    refresh_token: verifyData.session.refresh_token,
  });

  if (refreshError || !refreshData.session) {
    throw new Error(refreshError?.message ?? 'Failed to refresh seller session');
  }

  return {
    session: refreshData.session,
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
      .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`)
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
      .from('cohort_members')
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
    buyerMatchesCatalog(catalog, buyerId, buyerDefaultCohortId, explicitCohorts, buyerGeography),
  );
}
