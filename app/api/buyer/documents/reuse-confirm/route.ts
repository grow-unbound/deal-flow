import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';
import { copyObject } from '@/lib/r2';
import { hashGstin, normalizeGstin } from '@/lib/server/buyer-document-presign';
import { normalizeIndianPhone } from '@/lib/phone';

/**
 * POST /api/buyer/documents/reuse-confirm
 *
 * Explicit-consent step of the cross-tenant document reuse flow. Per
 * specs/Yukti_Public-Signup_Backend-Plan_v1.md §0b's "copy, not link"
 * decision: each source document is COPIED to a brand-new R2 object scoped
 * to the current buyer/tenant, and a new app.buyer_documents row is created
 * with reused_from_document_id pointing at the source — never a second row
 * sharing the source's storage_key.
 *
 * Re-validates every requested document_id server-side rather than trusting
 * that the client only ever passes ids a prior reuse-check call actually
 * returned to it:
 *  - business-scope source rows are GSTIN-keyed with no owner check, by the
 *    same design as reuse-check (a GSTIN is a self-asserted identifier
 *    elsewhere in this app too);
 *  - personal-scope source rows are phone-keyed — reusing one requires the
 *    source buyer's phone to match THIS session's own OTP-verified phone
 *    (read from auth user_metadata, never a client-supplied value or a
 *    buyers.phone column), otherwise a buyer could copy a stranger's shop
 *    image into their own account just by guessing/observing a document id.
 */

const BodySchema = z.object({
  document_ids: z.array(z.string().uuid()).min(1).max(10),
  consent: z.literal(true),
});

function isPendingOrAdmin(role: string | null): boolean {
  return role === 'buyer_pending' || role === 'buyer_admin';
}

interface SourceDocRow {
  id: string;
  tenant_id: string;
  buyer_id: string;
  gstin: string | null;
  doc_type: 'shop_image' | 'gst_certificate';
  subject_scope: 'personal' | 'business';
  storage_key: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id || !profile.buyer || !isPendingOrAdmin(profile.context.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      // Covers the "consent must be explicitly true" requirement too — z.literal(true)
      // rejects a missing field or an explicit false with the same validation-error path.
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 422 });
    }

    const { document_ids: documentIds } = parsed.data;

    const { data: sourceRows, error: fetchError } = await supabaseAdmin
      .schema('app')
      .from('buyer_documents')
      .select('id, tenant_id, buyer_id, gstin, doc_type, subject_scope, storage_key')
      .in('id', documentIds)
      .is('deleted_at', null);

    if (fetchError) {
      console.error('[POST /api/buyer/documents/reuse-confirm] source lookup failed', fetchError);
      return NextResponse.json({ error: 'Failed to look up source documents' }, { status: 500 });
    }

    const rows = (sourceRows ?? []) as SourceDocRow[];
    if (rows.length !== documentIds.length) {
      return NextResponse.json({ error: 'One or more documents were not found' }, { status: 404 });
    }

    const personalRows = rows.filter((row) => row.subject_scope === 'personal');
    if (personalRows.length > 0) {
      const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(
        profile.context.sub ?? '',
      );
      if (authUserError || !authUser?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const otpVerifiedPhone = (authUser.user.user_metadata as Record<string, unknown> | null)?.otp_verified_phone;
      if (typeof otpVerifiedPhone !== 'string' || !otpVerifiedPhone.trim()) {
        return NextResponse.json(
          { error: 'No verified phone on this session for personal document reuse' },
          { status: 403 },
        );
      }
      const sessionPhone = normalizeIndianPhone(otpVerifiedPhone);

      const sourceBuyerIds = Array.from(new Set(personalRows.map((row) => row.buyer_id)));
      const { data: sourceBuyers, error: buyersError } = await supabaseAdmin
        .schema('app')
        .from('buyers')
        .select('id, phone')
        .in('id', sourceBuyerIds);

      if (buyersError) {
        console.error('[POST /api/buyer/documents/reuse-confirm] source buyer lookup failed', buyersError);
        return NextResponse.json({ error: 'Failed to verify document ownership' }, { status: 500 });
      }

      const phoneByBuyerId = new Map(
        ((sourceBuyers ?? []) as Array<{ id: string; phone: string | null }>).map((row) => [
          row.id,
          row.phone ? normalizeIndianPhone(row.phone) : null,
        ]),
      );

      const unauthorized = personalRows.some((row) => phoneByBuyerId.get(row.buyer_id) !== sessionPhone);
      if (unauthorized) {
        return NextResponse.json(
          { error: 'Personal documents can only be reused across your own verified phone number' },
          { status: 403 },
        );
      }
    }

    const currentBuyerId = profile.buyer.id;
    const currentTenantId = profile.context.tenant_id;
    const createdIds: string[] = [];

    for (const row of rows) {
      const suffix = `${crypto.randomUUID()}-${Date.now().toString(36)}`;
      const destKey =
        row.subject_scope === 'business'
          ? `businesses/${hashGstin(row.gstin ?? '')}/docs/${row.doc_type}/${suffix}`
          : `buyers/${currentBuyerId}/personal/${row.doc_type}/${suffix}`;

      await copyObject(row.storage_key, destKey);

      const { data: created, error: insertError } = await supabaseAdmin
        .schema('app')
        .from('buyer_documents')
        .insert({
          tenant_id: currentTenantId,
          buyer_id: currentBuyerId,
          gstin: row.subject_scope === 'business' ? normalizeGstin(row.gstin ?? '') : null,
          doc_type: row.doc_type,
          subject_scope: row.subject_scope,
          storage_key: destKey,
          reused_from_document_id: row.id,
          created_by: profile.context.sub,
          updated_by: profile.context.sub,
        })
        .select('id')
        .single();

      if (insertError || !created) {
        console.error('[POST /api/buyer/documents/reuse-confirm] insert failed', insertError);
        return NextResponse.json({ error: 'Failed to record reused document' }, { status: 500 });
      }

      createdIds.push((created as { id: string }).id);
    }

    return NextResponse.json({ document_ids: createdIds });
  } catch (error) {
    console.error('[POST /api/buyer/documents/reuse-confirm]', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
