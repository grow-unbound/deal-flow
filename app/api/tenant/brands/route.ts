import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { z } from 'zod';

const AddBrandSchema = z.object({
  master_brand_id: z.string().uuid('Invalid brand ID'),
  display_name_override: z.string().optional(),
});

export async function GET(req: NextRequest) {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .schema('app')
      .from('tenant_brands')
      .select(`
        id,
        tenant_id,
        master_brand_id,
        display_name_override,
        margin_pct,
        exclusivity,
        is_active,
        external_ref,
        created_at,
        updated_at
      `)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/tenant/brands] DB error:', error.code, error.message, error.details);
      return NextResponse.json(
        { error: 'Failed to fetch brands', code: error.code, detail: error.message },
        { status: 500 },
      );
    }

    // Fetch master brand details for all master_brand_ids
    const masterBrandIds = (data ?? []).map((row: { master_brand_id: string }) => row.master_brand_id);
    let masterBrands: Record<string, { id: string; name: string; slug: string; logo_url: string | null; description: string | null }> = {};

    if (masterBrandIds.length > 0) {
      const { data: catalogBrands } = await db
        .schema('catalog')
        .from('brands')
        .select('id, name, slug, logo_url, description')
        .in('id', masterBrandIds);

      masterBrands = Object.fromEntries(
        (catalogBrands ?? []).map((b: { id: string; name: string; slug: string; logo_url: string | null; description: string | null }) => [b.id, b])
      );
    }

    const brands = (data ?? []).map((row: {
      id: string;
      tenant_id: string;
      master_brand_id: string;
      display_name_override: string | null;
      margin_pct: number | null;
      exclusivity: boolean | null;
      is_active: boolean;
      external_ref: string | null;
      created_at: string;
      updated_at: string;
    }) => ({
      ...row,
      master_brand: masterBrands[row.master_brand_id] ?? null,
    }));

    return NextResponse.json({ brands });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

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
    const parsed = AddBrandSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { master_brand_id, display_name_override } = parsed.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    // Check for duplicate
    const { data: existing } = await db
      .schema('app')
      .from('tenant_brands')
      .select('id')
      .eq('tenant_id', claims.tenant_id)
      .eq('master_brand_id', master_brand_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Brand already in your catalog' }, { status: 409 });
    }

    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('tenant_brands')
      .insert({
        tenant_id: claims.tenant_id,
        master_brand_id,
        display_name_override: display_name_override ?? null,
        is_active: true,
        created_by: claims.tenant_id,
        updated_by: claims.tenant_id,
      })
      .select()
      .single();

    if (insertError) {
      // Unique constraint violation (race condition)
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'Brand already in your catalog' }, { status: 409 });
      }
      console.error('[POST /api/tenant/brands] DB error:', insertError.code, insertError.message);
      return NextResponse.json(
        { error: 'Failed to add brand', code: insertError.code, detail: insertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ brand: inserted }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tenant/brands] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
