import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { dismissTenantOnboardingBanner } from '@/lib/server/tenant-creator';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id || !claims.sub) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Login required' } },
      { status: 401 },
    );
  }

  const result = await dismissTenantOnboardingBanner(claims.tenant_id, claims.sub);
  if (!result.ok) {
    const code =
      result.status === 403 ? 'FORBIDDEN' : result.status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR';
    return NextResponse.json(
      { data: null, error: { code, message: result.message } },
      { status: result.status },
    );
  }

  return NextResponse.json({
    data: { dismissed_at: result.dismissedAt },
    error: null,
  });
}
