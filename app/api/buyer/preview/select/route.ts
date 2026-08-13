import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { verifyBuyerPreviewToken } from '@/lib/buyer-preview';
import { findTenantBuyerPreviewCandidates } from '@/lib/server/buyer-access';
import { setBuyerPreviewCookies } from '@/lib/server/buyer-preview-session';
import { SELLER_ROLES } from '@/constants';

const selectBuyerSchema = z.object({
  buyer_id: z.string().uuid(),
});

function isSellerRole(role: string | null): boolean {
  return role !== null && (SELLER_ROLES as readonly string[]).includes(role);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub || !isSellerRole(claims.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existingToken = request.cookies.get('buyer_preview')?.value;
    const preview = existingToken ? await verifyBuyerPreviewToken(existingToken) : null;
    if (!preview || preview.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Preview session expired' }, { status: 401 });
    }

    const parsed = selectBuyerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid buyer_id' }, { status: 400 });
    }

    const candidates = await findTenantBuyerPreviewCandidates(claims.sub, claims.tenant_id);
    const selected = candidates.find((candidate) => candidate.buyer_id === parsed.data.buyer_id);
    if (!selected) {
      return NextResponse.json({ error: 'Buyer not available for preview' }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true, redirect: '/buy/catalog' });
    await setBuyerPreviewCookies(response, {
      tenantId: claims.tenant_id,
      shareToken: preview.share_token,
      buyerId: selected.buyer_id,
      requiresConfirmation: false,
    });

    return response;
  } catch (error) {
    console.error('[POST /api/buyer/preview/select]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
