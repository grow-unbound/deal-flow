import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { canAccessDocumentLocation } from '@/lib/server/seller-location-access';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

/**
 * GET /api/tenant/entries/[id]/documents
 *
 * Lists the app.buyer_documents rows submitted by the buyer behind a
 * `business_approval` / `new_user_login` Inbox entry, for Task 12's
 * "submitted documents" section. Never returns a signed URL here — only
 * metadata for rendering a thumbnail placeholder. A fresh signed URL is
 * fetched on demand (see the sibling `[docId]/signed-url` route) only when
 * the seller actually opens the preview dialog or clicks Download, since
 * signed URLs are short-lived and must not be cached or embedded at page
 * load (Yukti_Public-Signup_Frontend-Spec_v1.md §6/§1.2).
 *
 * Auth mirrors the entries/[id]/actions route exactly: the caller must be a
 * seller of the SAME tenant that owns the entry (never a client-supplied
 * tenant_id), and the entry's location (if any) must be within the caller's
 * location scope.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsedParams = ParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;

    const { data: entry, error: entryError } = await db
      .schema('app')
      .from('entries')
      .select('id, tenant_id, location_id, source_entity_type, source_entity_id')
      .eq('id', parsedParams.data.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (entryError || !entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    if (entry.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (entry.location_id && !canAccessDocumentLocation(claims, entry.location_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (entry.source_entity_type !== 'buyer' || !entry.source_entity_id) {
      return NextResponse.json({ documents: [] });
    }

    const { data: rows, error: docsError } = await db
      .schema('app')
      .from('buyer_documents')
      .select('id, doc_type, subject_scope, uploaded_at, verified_at')
      .eq('tenant_id', claims.tenant_id)
      .eq('buyer_id', entry.source_entity_id)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: true });

    if (docsError) {
      console.error('[GET /api/tenant/entries/[id]/documents]', docsError);
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
    }

    return NextResponse.json({
      documents: (rows ?? []).map((row: any) => ({
        id: row.id,
        doc_type: row.doc_type,
        subject_scope: row.subject_scope,
        uploaded_at: row.uploaded_at,
        verified: row.verified_at != null,
      })),
    });
  } catch (error) {
    console.error('[GET /api/tenant/entries/[id]/documents]', error);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
  }
}
