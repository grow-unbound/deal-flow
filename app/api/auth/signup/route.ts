import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { SignUpSchema } from '@/lib/zod';
import { TenantSchema } from '@/lib/zod';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate auth data
    const authValidation = SignUpSchema.safeParse(body);
    if (!authValidation.success) {
      return NextResponse.json(
        { error: 'Invalid auth data', details: authValidation.error.flatten() },
        { status: 400 }
      );
    }

    // Validate tenant data
    const tenantValidation = TenantSchema.safeParse(body);
    if (!tenantValidation.success) {
      return NextResponse.json(
        { error: 'Invalid tenant data', details: tenantValidation.error.flatten() },
        { status: 400 }
      );
    }

    const authData = authValidation.data;
    const tenantData = tenantValidation.data;

    // Sign up user with Supabase Auth
    const { data: authUser, error: authError } = await supabase.auth.signUp({
      email: authData.email,
      password: authData.password,
    });

    if (authError) {
      return NextResponse.json(
        { error: 'Failed to sign up', details: authError.message },
        { status: 400 }
      );
    }

    if (!authUser.user) {
      return NextResponse.json(
        { error: 'User creation failed' },
        { status: 500 }
      );
    }

    // Cast needed until Supabase types are generated from schema
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: tenant, error: tenantError } = await db
      .from('tenants')
      .insert([
        {
          slug: tenantData.slug,
          business_name: tenantData.business_name,
          gstin: tenantData.gstin || null,
          primary_state: tenantData.primary_state || null,
          plan: tenantData.plan,
          created_by: authUser.user.id,
          updated_by: authUser.user.id,
        },
      ])
      .select()
      .single() as { data: { id: string; slug: string; business_name: string } | null; error: { message: string } | null };

    if (tenantError || !tenant) {
      // Clean up: delete the user if tenant creation failed
      await supabase.auth.admin.deleteUser(authUser.user.id).catch(() => {});
      return NextResponse.json(
        { error: 'Failed to create tenant', details: tenantError?.message },
        { status: 500 }
      );
    }

    // Add user to tenant as admin
    const { error: userTenantError } = await db
      .from('tenant_users')
      .insert([
        {
          tenant_id: tenant.id,
          user_id: authUser.user.id,
          role: 'seller_admin',
          joined_at: new Date().toISOString(),
          created_by: authUser.user.id,
          updated_by: authUser.user.id,
        },
      ]) as { data: unknown; error: { message: string } | null };

    if (userTenantError) {
      return NextResponse.json(
        { error: 'Failed to add user to tenant', details: userTenantError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully. Please check your email to confirm.',
        user: {
          id: authUser.user.id,
          email: authUser.user.email,
        },
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          business_name: tenant.business_name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
