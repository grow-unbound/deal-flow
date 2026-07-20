import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { effectiveInvoiceStatus } from '@/lib/invoice-status';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

async function assertFlags(tenantId: string): Promise<boolean> {
  const [customerMaster, orderManagement, invoices] = await Promise.all([
    getFlag(FEATURE_FLAGS.CUSTOMER_MASTER, tenantId),
    getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FEATURE_FLAGS.INVOICES, tenantId),
  ]);

  return customerMaster && orderManagement && invoices;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!(await assertFlags(claims.tenant_id))) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id;

    const { data: buyer, error: buyerError } = await db
      .schema('app')
      .from('buyers')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (buyerError) {
      console.error('[GET /api/tenant/customers/[id]/outstanding-invoices] buyer', buyerError);
      return NextResponse.json({ error: 'Failed to load customer' }, { status: 500 });
    }

    if (!buyer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const { data: invoices, error: invoicesError } = await db
      .schema('app')
      .from('invoices')
      .select(
        'id, invoice_number, invoice_date, due_date, total_amount, outstanding_balance, location_id, status, place_of_supply',
      )
      .eq('tenant_id', tenantId)
      .eq('buyer_id', id)
      .gt('outstanding_balance', 0)
      .is('deleted_at', null)
      .not('status', 'in', '(draft,paid,void)')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('invoice_date', { ascending: true, nullsFirst: false })
      .limit(100);

    if (invoicesError) {
      console.error('[GET /api/tenant/customers/[id]/outstanding-invoices] invoices', invoicesError);
      return NextResponse.json({ error: 'Failed to load outstanding invoices' }, { status: 500 });
    }

    const locationIds = Array.from(
      new Set(
        (invoices ?? [])
          .map((row: { location_id: string | null }) => row.location_id)
          .filter((value: string | null): value is string => typeof value === 'string' && value.length > 0),
      ),
    );

    const { data: locations, error: locationsError } = locationIds.length > 0
      ? await db
          .schema('app')
          .from('locations')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .in('id', locationIds)
          .is('deleted_at', null)
          .limit(locationIds.length)
      : { data: [], error: null };

    if (locationsError) {
      console.error('[GET /api/tenant/customers/[id]/outstanding-invoices] locations', locationsError);
      return NextResponse.json({ error: 'Failed to load invoice locations' }, { status: 500 });
    }

    const locationNames = new Map(
      ((locations ?? []) as Array<{ id: string; name: string | null }>).map((row) => [row.id, row.name ?? null]),
    );

    return NextResponse.json({
      invoices: (invoices ?? []).map((row: any) => ({
        id: row.id,
        invoice_number: row.invoice_number ?? '—',
        invoice_date: row.invoice_date ?? null,
        due_date: row.due_date ?? null,
        total_amount: Number(row.total_amount ?? 0),
        outstanding_amount: Number(row.outstanding_balance ?? 0),
        location_id: row.location_id ?? null,
        location_name: row.location_id ? locationNames.get(row.location_id) ?? null : null,
        place_of_supply: row.place_of_supply ?? null,
        status: effectiveInvoiceStatus({
          status: String(row.status ?? 'draft'),
          due_date: row.due_date ?? null,
        }),
      })),
    }, { headers: SELLER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/tenant/customers/[id]/outstanding-invoices]', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
