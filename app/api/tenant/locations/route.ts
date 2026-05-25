import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { z } from 'zod';

const CreateLocationSchema = z.object({
  name: z.string().min(1, 'Location name is required'),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      pincode: z.string().optional(),
    })
    .optional(),
  is_default: z.boolean().optional(),
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
      .from('locations')
      .select('id, tenant_id, name, address, is_default, created_at, updated_at')
      .eq('tenant_id', claims.tenant_id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 });
    }

    return NextResponse.json({ locations: data ?? [] });
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

    // Only seller_admin can create locations
    if (claims.role !== 'seller_admin') {
      return NextResponse.json({ error: 'Forbidden: only seller_admin can create locations' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await req.json();
    const parsed = CreateLocationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { name, address, is_default } = parsed.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    // If setting this as default, clear existing default first
    if (is_default) {
      await db
        .schema('app')
        .from('locations')
        .update({ is_default: false })
        .eq('tenant_id', claims.tenant_id)
        .eq('is_default', true);
    }

    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('locations')
      .insert({
        tenant_id: claims.tenant_id,
        name,
        address: address ?? null,
        is_default: is_default ?? false,
        created_by: claims.tenant_id,
        updated_by: claims.tenant_id,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: 'Failed to create location' }, { status: 500 });
    }

    return NextResponse.json({ location: inserted }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
