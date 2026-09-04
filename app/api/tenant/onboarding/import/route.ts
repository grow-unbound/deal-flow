import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { assertSellerAdmin } from '@/lib/server/seller-auth';
import { runOnboardingImportChunk } from '@/lib/server/onboarding-import';

const RowSchema = z.object({
  internal_sku: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().optional(),
  category: z.string().optional(),
  mrp: z.number().optional(),
  base_selling_price: z.number().optional(),
  gst_rate: z.number().optional(),
  hsn_code: z.string().optional(),
  cost_price: z.number().optional(),
  default_uom: z.string().optional(),
  pack_size: z.number().optional(),
  description: z.string().optional(),
});

const BodySchema = z.object({
  products: z.array(RowSchema).min(1).max(250),
});

export async function POST(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);
    const admin = assertSellerAdmin(claims);
    if (!admin.ok) {
      return NextResponse.json({ error: admin.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: admin.status });
    }
    if (!supabaseAdmin || !claims.tenant_id) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await runOnboardingImportChunk(
      supabaseAdmin,
      claims.tenant_id,
      claims.sub ?? claims.tenant_id,
      parsed.data.products,
      true,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/tenant/onboarding/import]', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
