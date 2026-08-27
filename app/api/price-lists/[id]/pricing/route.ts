import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { PriceListSimplePricingStrategySchema } from '@/lib/zod';
import { z } from 'zod';

const PricingUpdateSchema = z.object({
  pricing_strategy: PriceListSimplePricingStrategySchema,
  strategy_value: z.coerce.number().nonnegative().nullable().optional(),
}).refine((data) => data.pricing_strategy === 'edit_each' || data.strategy_value != null, {
  message: 'Enter a value for the selected pricing mode',
  path: ['strategy_value'],
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (claims.role !== 'seller_admin') {
    return NextResponse.json({ error: 'Forbidden: seller_admin required' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_pricing_engine', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = PricingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 422 });
  }
  const { pricing_strategy, strategy_value } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: existingPriceList, error: existingError } = await db
    .schema('app')
    .from('price_lists')
    .select('id, external_ref')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: 'Failed to load price list' }, { status: 500 });
  }
  if (!existingPriceList) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }
  // Externally-sourced price lists (Zoho import): pricing comes exclusively from the
  // sync -- see app/api/price-lists/[id]/route.ts for the same guard on the main PATCH.
  if (existingPriceList.external_ref) {
    return NextResponse.json(
      { error: 'This price list is managed by your Zoho integration. Prices sync automatically — edit them in Zoho.' },
      { status: 409 },
    );
  }

  const { error: updateError } = await db
    .schema('app')
    .from('price_lists')
    .update({
      pricing_strategy,
      strategy_value: pricing_strategy === 'edit_each' ? null : (strategy_value ?? null),
      updated_by: claims.sub,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update pricing mode', detail: updateError.message }, { status: 500 });
  }

  let updatedCount = 0;
  if (pricing_strategy !== 'edit_each') {
    const { data: applyResult, error: applyError } = await db.schema('app').rpc('apply_price_list_pricing_strategy', { p_price_list_id: id });
    if (applyError) {
      return NextResponse.json({ error: 'Pricing mode saved but products could not be repriced', detail: applyError.message }, { status: 500 });
    }
    updatedCount = Number(applyResult ?? 0);
  }

  return NextResponse.json({ ok: true, updated_count: updatedCount });
}
