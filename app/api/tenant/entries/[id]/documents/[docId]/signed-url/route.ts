import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { canAccessDocumentLocation } from '@/lib/server/seller-location-access';
import { getPresignedDownloadUrl } from '@/lib/r2';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid(), docId: z.string().uuid() });

/**
 * GET /api/tenant/entries/[id]/documents/[docId]/signed-url
 *
 * Mints a fresh, short-lived signed R2 GET URL for one app.buyer_documents
 * row, for the seller-facing document preview/download dialog added in
 * Task 12 of the buyer-approval signup flow. Called on demand every time the
 * dialog opens or Download is clicked — never cached client-side (signed
 * URLs expire quickly).
 *
 * AUTHORIZATION (this is the security-sensitive part — see Task 7's tracked
 * risk about a `buyer_documents` row's `storage_key` not being independently
 * GSTIN-verified against a fabricated match): this route does NOT trust the
 * `docId` alone, and does NOT take a tenant_id from the caller at all.
 * Instead:
 *   1. `id` (the Inbox entry) is loaded and its `tenant_id` compared against
 *      the CALLER's own verified JWT tenant_id (`getVerifiedClaims` — never
 *      a client-supplied value), exactly like the `entries/[id]/actions`
 *      route.
 *   2. The caller's role must be a seller_* role, and (if the entry has a
 *      location_id) the entry's location must be within the caller's
 *      location scope (`canAccessDocumentLocation`) — same two checks the
 *      actions route already enforces.
 *   3. The `buyer_documents` row for `docId` is then loaded and must satisfy
 *      ALL of: `tenant_id = claims.tenant_id` (the caller's own tenant, not
 *      a value from the URL/body) AND `buyer_id = entry.source_entity_id`
 *      (the document must actually belong to the SAME buyer this entry is
 *      about) AND `deleted_at IS NULL`.
 * Only once every one of those checks passes does this route ask R2 to sign
 * a URL for that row's `storage_key`. A request for a document that belongs
 * to a different tenant, or to a different buyer within the same tenant,
 * gets 404 either way (no distinguishing information leaked).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
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
    // Caller's own verified tenant_id vs. the entry's tenant_id — never a
    // tenant_id supplied by the client.
    if (entry.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (entry.location_id && !canAccessDocumentLocation(claims, entry.location_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (entry.source_entity_type !== 'buyer' || !entry.source_entity_id) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const { data: doc, error: docError } = await db
      .schema('app')
      .from('buyer_documents')
      .select('id, storage_key, doc_type')
      .eq('id', parsedParams.data.docId)
      .eq('tenant_id', claims.tenant_id)
      .eq('buyer_id', entry.source_entity_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const url = await getPresignedDownloadUrl(doc.storage_key);
    return NextResponse.json({ url, doc_type: doc.doc_type });
  } catch (error) {
    console.error('[GET /api/tenant/entries/[id]/documents/[docId]/signed-url]', error);
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }
}
