import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { createBuyerPreviewToken, BUYER_PREVIEW_TTL_SECONDS } from '@/lib/buyer-preview';
import { findBuyerLoginCandidates } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';
import { SELLER_ROLES } from '@/constants';

function isSellerRole(role: string | null): boolean {
  return role !== null && (SELLER_ROLES as readonly string[]).includes(role);
}

// Reads seller's phone from auth.users.user_metadata (set once at invite/signup, never changes).
// Queries app.buyers by normalized phone to find the linked buyer account.
async function findLinkedBuyerId(userId: string, tenantId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const meta = authUser?.user?.user_metadata as Record<string, unknown> | null | undefined;
    const phone = typeof meta?.phone === 'string' && meta.phone ? meta.phone : null;
    if (!phone) return null;

    const candidates = await findBuyerLoginCandidates(phone);
    const match = candidates.find((c) => c.tenant_id === tenantId && c.buyer_app_enabled);
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

    const now = Math.floor(Date.now() / 1000);
    const previewToken = await createBuyerPreviewToken({
      tenantId: claims.tenant_id,
      shareToken,
      buyerId,
      now,
    });

    const redirectPath = buyerId ? '/buy/home' : '/buy/catalog';
    const response = NextResponse.redirect(new URL(redirectPath, request.url));

    const cookieOptions = {
      httpOnly: true,
      path: '/',
      maxAge: BUYER_PREVIEW_TTL_SECONDS,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    };
    response.cookies.set('buyer_preview', previewToken, cookieOptions);
    // Non-httpOnly companion so the client can show the expiry overlay without decoding the token.
    response.cookies.set('buyer_preview_exp', String(now + BUYER_PREVIEW_TTL_SECONDS), {
      ...cookieOptions,
      httpOnly: false,
    });

    return response;
  } catch (error) {
    console.error('[GET /api/buyer/preview/launch] unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
