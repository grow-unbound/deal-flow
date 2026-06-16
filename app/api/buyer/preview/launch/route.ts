import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import {
  buildBuyerPreviewRedirectPath,
  createBuyerPreviewToken,
} from '@/lib/buyer-preview';
import { findBuyerLoginCandidates } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';
import { SELLER_ROLES } from '@/constants';

function isSellerRole(role: string | null): boolean {
  return role !== null && (SELLER_ROLES as readonly string[]).includes(role);
}

async function findLinkedBuyerId(userId: string, tenantId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data } = await supabaseAdmin
      .schema('app')
      .from('tenant_users')
      .select('phone')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    const phone = (data as { phone?: string | null } | null)?.phone;
    if (!phone) return null;

    const candidates = await findBuyerLoginCandidates(phone);
    const match = candidates.find((c) => c.tenant_id === tenantId && c.buyer_app_enabled);
    return match?.buyer_id ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !isSellerRole(claims.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shareToken = request.nextUrl.searchParams.get('share_token');

    const buyerId = claims.sub
      ? await findLinkedBuyerId(claims.sub, claims.tenant_id)
      : null;

    const previewToken = await createBuyerPreviewToken({
      tenantId: claims.tenant_id,
      shareToken,
      buyerId,
    });

    const redirectPath = buildBuyerPreviewRedirectPath({
      previewToken,
      shareToken,
      buyerId,
    });

    return NextResponse.redirect(new URL(redirectPath, request.url));
  } catch (error) {
    console.error('[GET /api/buyer/preview/launch] unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
