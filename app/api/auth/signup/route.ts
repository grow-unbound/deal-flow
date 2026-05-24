import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { getFlag } from '@/lib/flags';

const SignupBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  business_name: z.string().min(1),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens'),
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

  const { email, password, business_name, slug } = parsed.data;

  // Step 1 — create the Supabase Auth user (anon key is fine here)
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
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
    // Service key not configured — clean up the orphaned auth user and bail
    await supabase.auth.admin?.deleteUser(userId).catch(() => {});
    return NextResponse.json(
      { error: 'Server misconfiguration: service key missing' },
      { status: 500 }
    );
  }

  type TenantRpcResult = { tenant_id: string; slug: string; subdomain: string };
  const { data: rpcData, error: rpcError } = await (supabaseAdmin as unknown as {
    rpc: (fn: string, args: Record<string, string>) => Promise<{ data: TenantRpcResult | null; error: { code?: string; message?: string } | null }>;
  }).rpc('create_tenant_and_admin', {
    p_user_id: userId,
    p_slug: slug,
    p_business_name: business_name,
  });

  if (rpcError) {
    // The service role bypasses RLS but can still throw a unique constraint error
    if ((rpcError as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      // Roll back the auth user so the address is reusable
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
