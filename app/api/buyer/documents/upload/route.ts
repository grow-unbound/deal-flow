import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import {
  BUYER_DOC_TYPES,
  buildBusinessDocumentKey,
  buildPersonalDocumentKey,
  normalizeGstin,
} from '@/lib/server/buyer-document-presign';
import { putObjectBlob } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const ScopeSchema = z.enum(['personal', 'business']);
const DocTypeSchema = z.enum(BUYER_DOC_TYPES);
const SHOP_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const GST_CERTIFICATE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const MAX_SHOP_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_GST_CERTIFICATE_BYTES = 10 * 1024 * 1024;

function isPendingOrAdmin(role: string | null): boolean {
  return role === 'buyer_pending' || role === 'buyer_admin';
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function validateFile(file: File, docType: (typeof BUYER_DOC_TYPES)[number]): string | null {
  if (docType === 'shop_image') {
    if (!SHOP_IMAGE_TYPES.includes(file.type as (typeof SHOP_IMAGE_TYPES)[number])) {
      return 'Shop image must be a JPG, PNG, or WebP file.';
    }
    if (file.size > MAX_SHOP_IMAGE_BYTES) return 'Shop image must be under 8 MB.';
    return null;
  }

  if (!GST_CERTIFICATE_TYPES.includes(file.type as (typeof GST_CERTIFICATE_TYPES)[number])) {
    return 'GST certificate must be a PDF, JPG, or PNG file.';
  }
  if (file.size > MAX_GST_CERTIFICATE_BYTES) return 'GST certificate must be under 10 MB.';
  return null;
}

/**
 * Same-origin buyer document upload.
 *
 * Product/brand/category uploads use the existing R2 key/finalize pattern;
 * buyer catalog onboarding cannot rely on browser-to-R2 CORS from arbitrary
 * tenant catalog hosts, so this route receives the file and writes it to the
 * same R2 bucket server-side before recording app.buyer_documents.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id || !profile.buyer || !isPendingOrAdmin(profile.context.role)) {
      return jsonError('Unauthorized', 401);
    }
    if (!supabaseAdmin) {
      return jsonError('Server configuration error', 500);
    }

    const form = await request.formData();
    const scopeResult = ScopeSchema.safeParse(String(form.get('scope') ?? ''));
    const docTypeResult = DocTypeSchema.safeParse(String(form.get('doc_type') ?? ''));
    const file = form.get('file');
    const gstin = String(form.get('gstin') ?? '').trim();

    if (!scopeResult.success) return jsonError('Invalid document scope', 422);
    if (!docTypeResult.success) return jsonError('Invalid document type', 422);
    if (!(file instanceof File)) return jsonError('file is required', 400);

    const scope = scopeResult.data;
    const docType = docTypeResult.data;
    if (docType === 'gst_certificate' && scope !== 'business') {
      return jsonError('GST certificate uploads require business scope', 422);
    }
    if (scope === 'business' && !gstin) {
      return jsonError('gstin is required when scope is business', 422);
    }

    const validationError = validateFile(file, docType);
    if (validationError) return jsonError(validationError, 415);

    const key = scope === 'business'
      ? buildBusinessDocumentKey(gstin, docType)
      : buildPersonalDocumentKey(profile.buyer.id, docType);

    await putObjectBlob(key, new Uint8Array(await file.arrayBuffer()), file.type);

    const { data, error } = await (supabaseAdmin as any)
      .schema('app')
      .from('buyer_documents')
      .insert({
        tenant_id: profile.context.tenant_id,
        buyer_id: profile.buyer.id,
        gstin: scope === 'business' ? normalizeGstin(gstin) : null,
        doc_type: docType,
        subject_scope: scope,
        storage_key: key,
        created_by: profile.context.sub,
        updated_by: profile.context.sub,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[POST /api/buyer/documents/upload] insert failed', error);
      return jsonError('Failed to record uploaded document', 500);
    }

    return NextResponse.json({ id: data.id, key });
  } catch (error) {
    console.error('[POST /api/buyer/documents/upload]', error);
    return jsonError('Upload failed. Please try again.', 500);
  }
}
