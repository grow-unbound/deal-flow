import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { BUYER_ROLES } from '@/constants';
import {
  findBuyerLoginCandidates,
  mintBuyerHandoffLink,
  mintBuyerSession,
} from '@/lib/server/buyer-access';
import { recordBuyerAppActivitySafe } from '@/lib/server/buyer-app-activity';
import { resolveCallerPhone } from '@/lib/server/resolve-auth-phone';
import { buildStorefrontHandoffUrl, tenantStorefrontHostForRequest } from '@/lib/storefront-host';
import { supabaseAdmin } from '@/lib/supabase';

const EnterWorkspaceSchema = z.object({
  tenant_id: z.string().uuid(),
  buyer_id: z.string().uuid(),
  role: z.string().min(1),
});

/**
 * POST /api/auth/workspaces/enter
 * Pick a buyer account from the catalog workspace finder and hand off to tenant storefront.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.sub) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!claims.role || !(BUYER_ROLES as readonly string[]).includes(claims.role)) {
      return NextResponse.json({ error: 'Buyer session required' }, { status: 403 });
    }

    const parsed = EnterWorkspaceSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'tenant_id, buyer_id, and role are required' }, { status: 400 });
    }

    const phone = await resolveCallerPhone(claims.sub, claims.role);
    if (!phone) {
      return NextResponse.json({ error: 'No phone number on file for this account.' }, { status: 400 });
    }

    const candidates = await findBuyerLoginCandidates(phone);
    const match = candidates.find(
      (candidate) =>
        candidate.tenant_id === parsed.data.tenant_id
        && candidate.buyer_id === parsed.data.buyer_id
        && candidate.role === parsed.data.role,
    );

    if (!match) {
      return NextResponse.json({ error: 'Selected account is not available.' }, { status: 403 });
    }

    const buyerCandidate = match;
    const { session } = await mintBuyerSession(buyerCandidate);
    const { hashedToken } = await mintBuyerHandoffLink(buyerCandidate);
    const destinationHost = tenantStorefrontHostForRequest(
      request.headers.get('host') ?? '',
      buyerCandidate.tenant_slug,
    );
    const handoffUrl = buildStorefrontHandoffUrl(destinationHost, hashedToken);

    if (supabaseAdmin && buyerCandidate.buyer_id) {
      void recordBuyerAppActivitySafe(supabaseAdmin as any, {
        tenantId: buyerCandidate.tenant_id,
        buyerId: buyerCandidate.buyer_id,
        eventName: 'session_started',
        path: request.nextUrl.pathname,
        context: {
          role: buyerCandidate.role,
          principal_type: buyerCandidate.principal_type,
          source: 'workspace_finder',
        },
      });
    }

    return NextResponse.json({ session, handoff_url: handoffUrl });
  } catch (err) {
    console.error('[POST /api/auth/workspaces/enter]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
