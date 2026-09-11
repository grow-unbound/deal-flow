import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';
import {
  BUYER_DOC_TYPES,
  buyerDocumentObjectExists,
  hashGstin,
  normalizeGstin,
} from '@/lib/server/buyer-document-presign';

/**
 * POST /api/buyer/documents/confirm
 *
 * Inserts the app.buyer_documents row for a document the client claims it
 * just uploaded to the key returned by /api/buyer/documents/presign. Never
 * trusts that claim without verification:
 *  - the key must match the shape presign would have produced for THIS
 *    session's buyer_id (personal) or the submitted gstin (business) — a
 *    buyer confirming a stranger's key would otherwise let them attach
 *    someone else's already-uploaded object to their own row;
 *  - a HEAD request against R2 must show the object actually exists before
 *    any row is written (buyer_documents has no client-writable RLS policy —
 *    every write here goes through supabaseAdmin, confirmed against live
 *    grants before this route was written).
 */

const BodySchema = z
  .object({
    key: z.string().min(1),
    doc_type: z.enum(BUYER_DOC_TYPES),
    subject_scope: z.enum(['personal', 'business']),
    gstin: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.subject_scope !== 'business' || Boolean(data.gstin), {
    message: 'gstin is required when subject_scope is business',
    path: ['gstin'],
  });

function isPendingOrAdmin(role: string | null): boolean {
  return role === 'buyer_pending' || role === 'buyer_admin';
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
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 422 });
    }

    const { key, doc_type: docType, subject_scope: subjectScope, gstin } = parsed.data;

    if (subjectScope === 'personal') {
      const expectedPrefix = `buyers/${profile.buyer.id}/personal/${docType}/`;
      if (!key.startsWith(expectedPrefix)) {
        return NextResponse.json(
          { error: 'Key does not match the expected personal document path for this session' },
          { status: 403 },
        );
      }
    } else {
      const expectedPrefix = `businesses/${hashGstin(gstin!)}/docs/${docType}/`;
      if (!key.startsWith(expectedPrefix)) {
        return NextResponse.json(
          { error: 'Key does not match the expected business document path for this GSTIN' },
          { status: 403 },
        );
      }
    }

    const exists = await buyerDocumentObjectExists(key);
    if (!exists) {
      return NextResponse.json({ error: 'Uploaded object was not found in storage' }, { status: 422 });
    }

    const { data, error } = await supabaseAdmin
      .schema('app')
      .from('buyer_documents')
      .insert({
        tenant_id: profile.context.tenant_id,
        buyer_id: profile.buyer.id,
        gstin: subjectScope === 'business' ? normalizeGstin(gstin!) : null,
        doc_type: docType,
        subject_scope: subjectScope,
        storage_key: key,
        created_by: profile.context.sub,
        updated_by: profile.context.sub,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[POST /api/buyer/documents/confirm] insert failed', error);
      return NextResponse.json({ error: 'Failed to record uploaded document' }, { status: 500 });
    }

    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (error) {
    console.error('[POST /api/buyer/documents/confirm]', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
