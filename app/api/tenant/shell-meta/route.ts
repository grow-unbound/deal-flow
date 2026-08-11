import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { getSellerShellFeatureAvailability } from '@/lib/server/seller-features';
import { loadSellerShellBranding } from '@/lib/server/seller-shell-branding';
import { SELLER_CACHE_REFERENCE } from '@/lib/server/bounded-get';

// Powers SellerShell's tab-refocus revalidation — a narrow refetch of just the
// sidebar feature flags + header branding, replacing a blanket router.refresh()
// that used to re-render the whole route on every tab refocus.
export async function GET(request: NextRequest) {
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [featureAvailability, branding] = await Promise.all([
    getSellerShellFeatureAvailability(claims.tenant_id),
    loadSellerShellBranding(claims.tenant_id),
  ]);

  return NextResponse.json({ featureAvailability, branding }, { headers: SELLER_CACHE_REFERENCE });
}
