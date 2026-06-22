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
    // Primary: read phone from tenant_users (written on every login, backfilled by migration).
    const { data: tuRow } = await supabaseAdmin
      .schema('app')
      .from('tenant_users')
      .select('phone')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();

    let phone = (tuRow as { phone?: string | null } | null)?.phone ?? null;

    // Fallback: read from auth.users.user_metadata (covers first login before the
    // tenant_users.phone write lands, or legacy accounts not yet migrated).
    if (!phone) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      const meta = authUser?.user?.user_metadata as Record<string, unknown> | null | undefined;
      phone = (typeof meta?.phone === 'string' && meta.phone ? meta.phone : null)
        ?? authUser?.user?.phone ?? null;

      // Back-fill so the next request is fast.
      if (phone) {
        void supabaseAdmin
          .schema('app')
          .from('tenant_users')
          .update({ phone })
          .eq('user_id', userId)
          .eq('tenant_id', tenantId);
      }
    }

    if (!phone) return null;

    const candidates = await findBuyerLoginCandidates(phone);
    const sameTenantBuyers = candidates.filter((c) => c.tenant_id === tenantId && c.buyer_app_enabled);
    if (sameTenantBuyers.length === 0) return null;
    return sameTenantBuyers[0].buyer_id ?? null;
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
