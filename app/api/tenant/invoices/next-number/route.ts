import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, invoicesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.INVOICES, claims.tenant_id),
    ]);
    if (!orderMgmt || !invoicesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as DbClient;
    const { data: invoiceNumberRow } = await db
      .schema('app')
      .from('invoices')
      .select('invoice_number')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastNum = (() => {
      const raw = (invoiceNumberRow?.invoice_number as string | null | undefined) ?? '';
      const match = raw.match(/(\d+)$/);
      return match ? Number(match[1]) : 0;
    })();
    const nextNum = String(lastNum + 1).padStart(4, '0');
    const invoice_number = `INV-${nextNum}`;

    return NextResponse.json({ invoice_number });
  } catch (error) {
    console.error('[GET /api/tenant/invoices/next-number]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
