import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { verifyBuyerPreviewToken } from '@/lib/buyer-preview';
import { setBuyerPreviewCookies } from '@/lib/server/buyer-preview-session';
import { SELLER_ROLES } from '@/constants';

function isSellerRole(role: string | null): boolean {
  return role !== null && (SELLER_ROLES as readonly string[]).includes(role);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !isSellerRole(claims.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existingToken = request.cookies.get('buyer_preview')?.value;
    if (!existingToken) {
      return NextResponse.json({ error: 'No preview session' }, { status: 400 });
    }

    const payload = await verifyBuyerPreviewToken(existingToken);
    if (!payload || payload.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Preview session expired' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    await setBuyerPreviewCookies(response, {
      tenantId: payload.tenant_id,
      shareToken: payload.share_token,
      buyerId: payload.buyer_id ?? null,
      requiresConfirmation: false,
    });

    return response;
  } catch (error) {
    console.error('[POST /api/buyer/preview/refresh] unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
