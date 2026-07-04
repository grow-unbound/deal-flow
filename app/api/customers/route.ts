import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { BuyerCreateSchema } from '@/lib/zod';
import { getPostHogClient } from '@/lib/posthog-server';

async function syncDefaultPriceListAssignment(
  db: any,
  tenantId: string,
  buyerId: string,
  defaultPriceListId: string | null | undefined,
  actorUserId: string | null,
) {
  const { error: deleteError } = await db
    .schema('app')
    .from('price_list_assignments')
    .update({ deleted_at: new Date().toISOString(), updated_by: actorUserId })
    .eq('target_type', 'buyer')
    .eq('target_id', buyerId)
    .is('deleted_at', null);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!defaultPriceListId) {
    return null;
  }

  const { data: priceList, error: priceListError } = await db
    .schema('app')
    .from('price_lists')
    .select('id')
    .eq('id', defaultPriceListId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (priceListError) {
    throw new Error(priceListError.message);
  }
  if (!priceList) {
    throw new Error('Selected pricelist is invalid for this tenant.');
  }

  const { data: assignment, error: insertError } = await db
    .schema('app')
    .from('price_list_assignments')
    .insert({
      price_list_id: defaultPriceListId,
      target_type: 'buyer',
      target_id: buyerId,
      created_by: actorUserId,
      updated_by: actorUserId,
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return assignment;
}

export async function GET(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_customer_master', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // supabaseAdmin typed client does not expose .schema() on the TS interface.
  // Cast to any mirrors the pattern in app/api/team/members/route.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: rows, error } = await db
    .schema('app')
    .from('buyers')
    .select('*')
    .eq('tenant_id', claims.tenant_id)
    .is('is_active', true)
    .order('business_name', { ascending: true });

  if (error) {
    console.error('[GET /api/customers] DB error:', error.code, error.message, error.details);
    return NextResponse.json(
      { error: 'Failed to fetch customers', code: error.code, detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ buyers: rows ?? [] });
}

export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_customer_master', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BuyerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // supabaseAdmin typed client does not expose .schema() on the TS interface.
  // Cast to any mirrors the pattern in app/api/team/members/route.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // Phone uniqueness check per tenant
  const { data: phoneMatch } = await db
    .schema('app')
    .from('buyers')
    .select('id')
    .eq('tenant_id', claims.tenant_id)
    .eq('phone', data.phone)
    .is('is_active', true)
    .maybeSingle();

  if (phoneMatch) {
    return NextResponse.json(
      { error: 'A buyer with this phone number already exists.' },
      { status: 409 },
    );
  }

  if (data.default_cohort_id) {
    const { data: cohort } = await db
      .schema('app')
      .from('cohorts')
      .select('id')
      .eq('id', data.default_cohort_id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!cohort) {
      return NextResponse.json(
        { error: 'Selected cohort is invalid for this tenant.' },
        { status: 400 },
      );
    }
  }

  if (data.default_price_list_id) {
    const { data: priceList } = await db
      .schema('app')
      .from('price_lists')
      .select('id')
      .eq('id', data.default_price_list_id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!priceList) {
      return NextResponse.json(
        { error: 'Selected pricelist is invalid for this tenant.' },
        { status: 400 },
      );
    }
  }

  const { data: buyer, error: insertError } = await db
    .schema('app')
    .from('buyers')
    .insert({
      tenant_id: claims.tenant_id,
      business_name: data.business_name,
      contact_name: data.contact_name ?? null,
      phone: data.phone,
      email: data.email || null,
      gstin: data.gstin ?? null,
      geography: data.geography ?? null,
      credit_limit: data.credit_limit,
      payment_terms_days: data.payment_terms_days,
      default_cohort_id: data.default_cohort_id ?? null,
      buyer_app_enabled: data.buyer_app_enabled ?? false,
      is_active: true,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[POST /api/customers] DB error:', insertError.code, insertError.message, insertError.details);
    return NextResponse.json(
      { error: 'Failed to create customer', code: insertError.code, detail: insertError.message },
      { status: 500 },
    );
  }

  if (data.default_cohort_id && buyer) {
    await db
      .schema('app')
      .from('cohort_members')
      .insert({ cohort_id: data.default_cohort_id, buyer_id: buyer.id })
      .throwOnError();
  }

  if (buyer) {
    try {
      await syncDefaultPriceListAssignment(
        db,
        claims.tenant_id,
        buyer.id,
        data.default_price_list_id ?? null,
        claims.sub ?? null,
      );
    } catch (error) {
      console.error('[POST /api/customers] failed to sync default pricelist:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to assign pricelist' },
        { status: 400 },
      );
    }
  }

  try {
    const ph = getPostHogClient();
    ph.capture({
      distinctId: claims.sub ?? claims.tenant_id,
      event: 'customer_created',
      properties: {
        tenant_id: claims.tenant_id,
        buyer_id: buyer?.id,
        has_credit_limit: (data.credit_limit ?? 0) > 0,
        has_cohort: Boolean(data.default_cohort_id),
        has_default_price_list: Boolean(data.default_price_list_id),
      },
    });
    await ph.flush();
  } catch {
    // non-blocking
  }

  return NextResponse.json({ buyer }, { status: 201 });
}
