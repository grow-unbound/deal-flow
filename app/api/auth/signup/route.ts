import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getFlag } from '@/lib/flags';
import { getPostHogClient, seedTenantFeatureFlags } from '@/lib/posthog-server';
import { buildSignupTenantSettingsSeed } from '@/lib/tenant-settings/signup-seed';

const SignupBodySchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(8),
  business_name: z.string().min(1),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens'),
  phone: z.string().regex(/^[0-9]{10}$/).optional(),
  gstin: z.string().optional(),
  primary_state: z.string().optional(),
  plan: z.enum(['starter', 'growth', 'scale']).default('starter'),
});

// Postgres unique-violation error code
const PG_UNIQUE_VIOLATION = '23505';

interface TenantRpcResult {
  tenant_id: string;
  slug: string;
  subdomain: string;
}

async function deleteAuthUser(userId: string): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Gate: df_tenant_onboarding must be enabled
  const flagOn = await getFlag('df_tenant_onboarding', 'anonymous-signup');
  if (!flagOn) {
    return NextResponse.json(
      { error: 'This feature is not yet available.' },
      { status: 403 }
    );
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Server misconfiguration: service key missing' },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = SignupBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { full_name, email, password, business_name, slug, phone, gstin, primary_state, plan } = parsed.data;

  // Step 1 — create auth user without minting a JWT (avoids hook before tenant exists)
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone: phone ?? null, full_name: full_name ?? null },
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? 'Failed to create user' },
      { status: 400 }
    );
  }

  const userId = created.user.id;
  const initialSettings = buildSignupTenantSettingsSeed({
    businessName: business_name,
    businessPhone: phone ?? '',
    businessEmail: email,
    whatsappPhone: phone ?? '',
  });

  // Step 2 — atomically create tenant + seller_admin link via SECURITY DEFINER RPC
  const { data: rpcData, error: rpcError } = await supabaseAdmin
    .schema('app')
    .rpc('create_tenant_and_admin', {
      p_user_id: userId,
      p_slug: slug,
      p_business_name: business_name,
      p_business_phone: phone ?? '',
      p_business_email: email,
      p_whatsapp_phone: phone ?? '',
      p_primary_state: primary_state ?? null,
      p_gstin: gstin ?? null,
      p_initial_settings: initialSettings,
    });

  if (rpcError) {
    if (rpcError.code === PG_UNIQUE_VIOLATION) {
      await deleteAuthUser(userId);
      return NextResponse.json(
        {
          error: 'This business URL is already in use. Try a different one.',
          code: 'SLUG_TAKEN',
        },
        { status: 409 }
      );
    }

    await deleteAuthUser(userId);
    return NextResponse.json(
      { error: 'Failed to create workspace. Please try again.' },
      { status: 500 }
    );
  }

  const tenantResult = (rpcData as TenantRpcResult | null) ?? {
    tenant_id: '',
    slug,
    subdomain: `${slug}.yukti.so`,
  };

  // Step 3 — pin workspace so custom_access_token_hook resolves the new tenant
  const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: { current_tenant_id: tenantResult.tenant_id },
  });

  if (metadataError) {
    await deleteAuthUser(userId);
    return NextResponse.json(
      { error: 'Failed to finalize account setup. Please try again.' },
      { status: 500 }
    );
  }

  // Step 4 — mint session after tenant_users row exists
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    await deleteAuthUser(userId);
    return NextResponse.json(
      { error: 'Server misconfiguration: Supabase credentials missing' },
      { status: 500 }
    );
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.session) {
    await deleteAuthUser(userId);
    return NextResponse.json(
      { error: signInError?.message ?? 'Failed to create session' },
      { status: 500 }
    );
  }

  let finalSession = signInData.session;
  const { data: refreshData } = await anonClient.auth.refreshSession({
    refresh_token: signInData.session.refresh_token,
  });
  if (refreshData.session) {
    finalSession = refreshData.session;
  }

  try {
    await seedTenantFeatureFlags(tenantResult.tenant_id);
  } catch {
    // Non-fatal: feature-flag seeding should never block signup.
  }

  // Step 5 — fire PostHog server-side event for funnel analytics
  try {
    const distinctId = request.headers.get('X-POSTHOG-DISTINCT-ID') ?? userId;
    const ph = getPostHogClient();
    ph.identify({
      distinctId: userId,
      properties: { email, role: 'seller_admin', tenant_id: tenantResult.tenant_id },
    });
    ph.capture({
      distinctId,
      event: 'server_tenant_created',
      properties: {
        $set: { email, role: 'seller_admin' },
        user_id: userId,
        tenant_id: tenantResult.tenant_id,
        tenant_slug: tenantResult.slug,
        business_name,
        primary_state,
        plan,
        $session_id: request.headers.get('X-POSTHOG-SESSION-ID') ?? undefined,
      },
    });
    await ph.flush();
  } catch {
    // Non-fatal: analytics failure should not block signup
  }

  return NextResponse.json(
    {
      success: true,
      user: { id: userId, email },
      tenant: {
        tenant_id: tenantResult.tenant_id,
        slug: tenantResult.slug,
        subdomain: tenantResult.subdomain,
      },
      redirect: '/dashboard',
      session: finalSession,
    },
    { status: 201 }
  );
}
