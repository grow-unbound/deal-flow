import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { FEATURE_FLAGS } from '@/constants';
import { getFlag } from '@/lib/flags';
import { buildBuyerAppEnablePreview } from '@/lib/server/buyer-app-enable-notify';
import { supabaseAdmin } from '@/lib/supabase';

const EnablePreviewSchema = z.object({
  buyer_ids: z.array(z.string().uuid()).min(1, 'At least one buyer ID is required'),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const claims = await getVerifiedClaims(request);

    if (!claims.tenant_id || !claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const flagEnabled = await getFlag(FEATURE_FLAGS.BUYER_APP, claims.tenant_id);
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

    const parsed = EnablePreviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
        { status: 422 },
      );
    }

    const preview = await buildBuyerAppEnablePreview(
      supabaseAdmin as never,
      claims.tenant_id,
      parsed.data.buyer_ids,
    );

    return NextResponse.json(preview);
  } catch (error) {
    console.error('[POST /api/tenant/buyer-app/access/enable-preview]', error);
    return NextResponse.json({ error: 'Failed to build enable preview' }, { status: 500 });
  }
}
