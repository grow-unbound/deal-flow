import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { findTenantBuyerPreviewCandidates } from '@/lib/server/buyer-access';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { SELLER_ROLES } from '@/constants';

function isSellerRole(role: string | null): boolean {
  return role !== null && (SELLER_ROLES as readonly string[]).includes(role);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub || !isSellerRole(claims.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const candidates = await findTenantBuyerPreviewCandidates(claims.sub, claims.tenant_id);
    const tenantName = candidates[0]?.tenant_name ?? '';

    return NextResponse.json({
      tenant_name: tenantName,
      buyers: candidates.map((candidate) => ({
        buyer_id: candidate.buyer_id,
        business_name: candidate.business_name,
        contact_name: candidate.contact_name,
        buyer_app_enabled: candidate.buyer_app_enabled,
      })),
    }, { headers: SELLER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/buyer/preview/candidates]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
