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
    // Try tenant_users.phone first (may be null if seller never stored their phone there)
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

    let phone = (data as { phone?: string | null } | null)?.phone ?? null;

    // Fallback: phone is stored in user_metadata (set by find_seller_candidates_by_phone RPC path;
    // raw_user_meta_data ->> 'phone' is the authoritative seller phone field, surfaced by the JS
    // SDK as user.user_metadata.phone — NOT user.phone which is the Supabase native OTP field).
    if (!phone) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      const userMeta = authUser?.user?.user_metadata as Record<string, unknown> | null | undefined;
      phone = (typeof userMeta?.phone === 'string' && userMeta.phone ? userMeta.phone : null)
        ?? authUser?.user?.phone  // native Supabase phone (OTP-linked accounts)
        ?? null;
    }

    if (!phone) return null;

    const candidates = await findBuyerLoginCandidates(phone);
    // Only consider buyers under this seller's tenant with buyer app enabled
    const sameTenantBuyers = candidates.filter((c) => c.tenant_id === tenantId && c.buyer_app_enabled);
    if (sameTenantBuyers.length === 0) return null;
    // Return first match; multi-buyer picker will be added when needed
    return sameTenantBuyers[0].buyer_id ?? null;
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
