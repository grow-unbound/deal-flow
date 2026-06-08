import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import { supabaseAdmin } from '@/lib/supabase';
import { minimalInvoicePdfBytes } from '@/lib/minimal-invoice-pdf';

export const dynamic = 'force-dynamic';

async function assertInvoiceFlags(tenantId: string): Promise<boolean> {
  const om = await getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, tenantId);
  const inv = await getFlag(FEATURE_FLAGS.INVOICES, tenantId);
  return om && inv;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(_request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!(await assertInvoiceFlags(claims.tenant_id))) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const { data: inv, error } = await supabaseAdmin
    .schema('app')
    .from('invoices')
    .select('id, tenant_id, invoice_number, status')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (inv.tenant_id !== claims.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    try {
      const edgeRes = await fetch(`${url}/functions/v1/generate-invoice-pdf`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoice_id: id }),
      });
      if (edgeRes.ok) {
        const buf = new Uint8Array(await edgeRes.arrayBuffer());
        return new NextResponse(Buffer.from(buf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${String(inv.invoice_number).replace(/[^\w.-]+/g, '_')}.pdf"`,
          },
        });
      }
    } catch (e) {
      console.warn('[GET invoice pdf] edge function failed, using stub', e);
    }
  }

  const bytes = minimalInvoicePdfBytes();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${String(inv.invoice_number).replace(/[^\w.-]+/g, '_')}.pdf"`,
    },
  });
}
