import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { findTenantBuyerPreviewCandidates } from '@/lib/server/buyer-access';
import { setBuyerPreviewCookies } from '@/lib/server/buyer-preview-session';
import { SELLER_ROLES } from '@/constants';

function isSellerRole(role: string | null): boolean {
  return role !== null && (SELLER_ROLES as readonly string[]).includes(role);
}

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !isSellerRole(claims.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shareToken = request.nextUrl.searchParams.get('share_token');
    const tenantCandidates = claims.sub
      ? await findTenantBuyerPreviewCandidates(claims.sub, claims.tenant_id)
      : [];
    const buyerId = tenantCandidates.length === 1 ? tenantCandidates[0]!.buyer_id : null;
    const needsBuyerPicker = tenantCandidates.length > 1;

    const redirectPath = needsBuyerPicker ? '/buy/preview/select-buyer' : '/buy/catalog';
    const response = NextResponse.redirect(new URL(redirectPath, request.url));

    await setBuyerPreviewCookies(response, {
      tenantId: claims.tenant_id,
      shareToken,
      buyerId,
      requiresConfirmation: !buyerId && !needsBuyerPicker,
    });

    return response;
  } catch (error) {
    console.error('[GET /api/buyer/preview/launch] unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
