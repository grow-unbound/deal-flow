import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { LoginSchema } from '@/lib/zod';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = LoginSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid credentials', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Fetch user's tenants (cast needed until Supabase types are generated)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: tenants, error: tenantsError } = await db
      .from('tenant_users')
      .select('tenant_id, role')
      .eq('user_id', data.user.id)
      .eq('is_active', true)
      .limit(1)
      .single() as { data: { tenant_id: string; role: string } | null; error: unknown };

    if (tenantsError || !tenants) {
      return NextResponse.json(
        { error: 'User not associated with any tenant' },
        { status: 403 }
      );
    }

    // Get tenant details
    const { data: tenant, error: tenantError } = await db
      .from('tenants')
      .select('*')
      .eq('id', tenants.tenant_id)
      .single() as { data: { id: string; slug: string; business_name: string; subdomain?: string } | null; error: unknown };

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Signed in successfully',
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        business_name: tenant.business_name,
        subdomain: tenant.subdomain,
      },
      session: data.session,
    });
  } catch (error) {
    console.error('Sign in error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
