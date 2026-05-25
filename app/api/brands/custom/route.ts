import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { z } from 'zod';

const CreateCustomBrandSchema = z.object({
  name: z.string().min(1, 'Brand name is required'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters and hyphens.'),
  description: z.string().optional(),
  logo_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await req.json();
    const parsed = CreateCustomBrandSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { name, slug, description, logo_url } = parsed.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    // Step 1: INSERT into catalog.brands with is_public=false and origin_tenant_id
    const { data: newBrand, error: brandError } = await db
      .schema('catalog')
      .from('brands')
      .insert({
        name,
        slug,
        description: description ?? null,
        logo_url: logo_url || null,
        is_public: false,
        origin_tenant_id: claims.tenant_id,
        created_by: claims.tenant_id,
        updated_by: claims.tenant_id,
      })
      .select()
      .single();

    if (brandError) {
      // Unique constraint on slug (code 23505)
      if (brandError.code === '23505') {
        return NextResponse.json(
          { error: 'A brand with this slug already exists.' },
          { status: 409 },
        );
      }
      console.error('Failed to create catalog brand:', brandError);
      return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 });
    }

    // Step 2: INSERT into app.tenant_brands
    const { data: tenantBrand, error: tenantBrandError } = await db
      .schema('app')
      .from('tenant_brands')
      .insert({
        tenant_id: claims.tenant_id,
        master_brand_id: newBrand.id,
        is_active: true,
        created_by: claims.tenant_id,
        updated_by: claims.tenant_id,
      })
      .select()
      .single();

    if (tenantBrandError) {
      console.error('Failed to link brand to tenant:', tenantBrandError);
      // Brand was created in catalog but failed to link — still return 500
      return NextResponse.json({ error: 'Failed to link brand to tenant' }, { status: 500 });
    }

    return NextResponse.json(
      {
        brand: {
          ...tenantBrand,
          master_brand: newBrand,
        },
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
