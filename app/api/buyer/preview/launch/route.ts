import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { findBuyerLoginCandidates } from '@/lib/server/buyer-access';
import { setBuyerPreviewCookies } from '@/lib/server/buyer-preview-session';
import { supabaseAdmin } from '@/lib/supabase';
import { SELLER_ROLES } from '@/constants';

function isSellerRole(role: string | null): boolean {
  return role !== null && (SELLER_ROLES as readonly string[]).includes(role);
}

// Finds the buyer account linked to a seller by phone.
// Phone lookup order: user_metadata.phone → native auth.users.phone (set via phone OTP auth).
// Does NOT require buyer_app_enabled — seller preview bypasses that gate (it controls buyer login,
// not seller access to preview their own buyer portal).
async function findLinkedBuyerId(userId: string, tenantId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const user = authUser?.user;
    const meta = user?.user_metadata as Record<string, unknown> | null | undefined;
    // user_metadata.phone is set during email/password invite flow;
    // user.phone (native) is set when the seller uses phone OTP auth.
    const phone = (typeof meta?.phone === 'string' && meta.phone ? meta.phone : null)
      ?? user?.phone
      ?? null;
    if (!phone) return null;

    const candidates = await findBuyerLoginCandidates(phone);
    // Match by tenant only — buyer_app_enabled is irrelevant for seller preview.
    const match = candidates.find((c) => c.tenant_id === tenantId);
    return match?.buyer_id ?? null;
  } catch (err) {
    console.error('[findLinkedBuyerId] error:', err);
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

    const redirectPath = '/buy/home';
    const response = NextResponse.redirect(new URL(redirectPath, request.url));

    await setBuyerPreviewCookies(response, {
      tenantId: claims.tenant_id,
      shareToken,
      buyerId,
    });

    return response;
  } catch (error) {
    console.error('[GET /api/buyer/preview/launch] unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
