import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';
import { copyObject } from '@/lib/r2';
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
 *  - personal-scope source rows are phone-keyed — reusing one requires the
 *    source buyer's phone to match THIS session's own OTP-verified phone
 *    (read from auth user_metadata, never a client-supplied value or a
 *    buyers.phone column), otherwise a buyer could copy a stranger's shop
 *    image into their own account just by guessing/observing a document id.
 *
 * SECURITY FIX (post-launch review of task 7, 2026-09): business-scope
 * source rows used to be copyable with NO authorization check at all — a
 * GSTIN is a publicly-known, self-asserted string (shop signage, invoices,
 * the GST portal) with zero verification anywhere in this system, so any
 * caller who learned a victim's real GSTIN could call reuse-check to get
 * back real document_ids and then reuse-confirm to copy the victim's actual
 * GST certificate / shop image into their own account — full cross-tenant
 * document exfiltration, not just the bounded "does this GSTIN exist"
 * existence-oracle the original spec accepted. Business-scope reuse-copy is
 * therefore disabled entirely this round: if ANY requested document_id
 * resolves to a business-scope row, the whole request is rejected (see the
 * rejection block below) — chosen over per-document rejection because this
 * route's response is a single all-or-nothing array (`document_ids`), not a
 * per-document result list, so an upfront whole-request rejection is the
 * less invasive fit for the existing structure. Personal-scope reuse is
 * unaffected — it was already properly authenticated via the OTP-verified
 * phone check below.
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

    // Business-scope reuse-copy is disabled this round — see the file-level
    // comment above. Reject the whole request (not just the offending ids)
    // since this route reports a single all-or-nothing result, never a
    // partial one.
    if (rows.some((row) => row.subject_scope === 'business')) {
      return NextResponse.json(
        {
          error: 'business_document_reuse_not_available',
          message: 'Business document reuse is not yet available — please upload a fresh copy.',
        },
        { status: 403 },
      );
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
    // All remaining rows are personal-scope (business rows were rejected above).
    const createdIds: string[] = [];
    // FIX (Important #3): the copy loop has no cross-document rollback — a
    // mid-loop failure used to abort with a bare 500, leaving earlier
    // successful copies/inserts in an ambiguous state (created but not
    // reported to the client). Now every document is attempted independently
    // and failures are collected rather than aborting the loop, so the
    // response always accurately reflects what was actually persisted. This
    // is a reporting fix, not a true transactional rollback (a copied R2
    // object from an earlier iteration is not deleted if a later iteration
    // fails) — full rollback would need compensating deletes and is out of
    // scope for this pass, especially since business-scope reuse (the
    // larger blast-radius case) is disabled entirely and this loop now only
    // ever processes a buyer's own personal-scope documents.
    const failed: Array<{ source_id: string; error: string }> = [];

    for (const row of rows) {
      const suffix = `${crypto.randomUUID()}-${Date.now().toString(36)}`;
      const destKey = `buyers/${currentBuyerId}/personal/${row.doc_type}/${suffix}`;

      try {
        await copyObject(row.storage_key, destKey);

        const { data: created, error: insertError } = await supabaseAdmin
          .schema('app')
          .from('buyer_documents')
          .insert({
            tenant_id: currentTenantId,
            buyer_id: currentBuyerId,
            gstin: null,
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
          throw insertError ?? new Error('insert returned no row');
        }

        createdIds.push((created as { id: string }).id);
      } catch (rowError) {
        console.error('[POST /api/buyer/documents/reuse-confirm] failed for source document', row.id, rowError);
        failed.push({ source_id: row.id, error: 'copy_or_insert_failed' });
      }
    }

    if (createdIds.length === 0) {
      return NextResponse.json({ error: 'Failed to reuse any requested documents', failed }, { status: 500 });
    }

    return NextResponse.json({
      document_ids: createdIds,
      ...(failed.length > 0 ? { failed } : {}),
    }, { status: failed.length > 0 ? 207 : 200 });
  } catch (error) {
    console.error('[POST /api/buyer/documents/reuse-confirm]', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
