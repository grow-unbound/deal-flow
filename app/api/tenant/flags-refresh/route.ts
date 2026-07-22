import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { resolveTenantFlags } from '@/lib/server/tenant-flags-resolve';

// Node.js runtime (default for Route Handlers) — posthog-node is not Edge-Runtime
// compatible, so middleware.ts (which only runs on Edge) self-fetches this route
// instead of calling resolveTenantFlags directly. Same self-HTTP-call pattern as
// fetchSellerPageBootstrap.
export async function GET(request: NextRequest) {
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await resolveTenantFlags(claims.tenant_id);
  return NextResponse.json(data);
}
