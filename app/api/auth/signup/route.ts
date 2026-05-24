import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { getFlag } from '@/lib/flags';
import { getPostHogClient } from '@/lib/posthog-server';

const SignupBodySchema = z.object({
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

export async function POST(request: NextRequest) {
  // Gate: df_tenant_onboarding must be enabled
  const flagOn = await getFlag('df_tenant_onboarding', 'anonymous-signup');
  if (!flagOn) {
    return NextResponse.json(
      { error: 'This feature is not yet available.' },
      { status: 403 }
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

  const { email, password, business_name, slug, phone, gstin, primary_state, plan } = parsed.data;

  // Step 1 — create the Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { phone: phone ?? null },
    },
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? 'Failed to create user' },
      { status: 400 }
    );
  }

  const userId = authData.user.id;

  // Step 2 — atomically create tenant + seller_admin link via SECURITY DEFINER RPC.
  // supabaseAdmin uses the service-role key and bypasses RLS.
  if (!supabaseAdmin) {
    await supabase.auth.admin?.deleteUser(userId).catch(() => {});
    return NextResponse.json(
      { error: 'Server misconfiguration: service key missing' },
      { status: 500 }
    );
  }

  type TenantRpcResult = { tenant_id: string; slug: string; subdomain: string };
  const { data: rpcData, error: rpcError } = await (supabaseAdmin as unknown as {
    rpc: (fn: string, args: Record<string, string | undefined>) => Promise<{ data: TenantRpcResult | null; error: { code?: string; message?: string } | null }>;
  }).rpc('create_tenant_and_admin', {
    p_user_id: userId,
    p_slug: slug,
    p_business_name: business_name,
    p_primary_state: primary_state,
    p_gstin: gstin,
  });

  if (rpcError) {
    if ((rpcError as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      return NextResponse.json(
        {
          error: 'This business URL is already in use. Try a different one.',
          code: 'SLUG_TAKEN',
        },
        { status: 409 }
      );
    }

    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json(
      { error: 'Failed to create workspace. Please try again.' },
      { status: 500 }
    );
  }

  const tenantResult = rpcData ?? { tenant_id: '', slug, subdomain: `${slug}.dealflow.in` };

  // Step 3 — fire PostHog server-side event for funnel analytics
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
    },
    { status: 201 }
  );
}
