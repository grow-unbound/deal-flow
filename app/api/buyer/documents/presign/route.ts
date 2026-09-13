import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { BUYER_DOC_TYPES, signBuyerDocumentUpload } from '@/lib/server/buyer-document-presign';

/**
 * POST /api/buyer/documents/presign
 *
 * Issues a short-lived R2 upload URL for a buyer onboarding document
 * (shop image or GST certificate). Does NOT insert an app.buyer_documents
 * row — that only happens once the upload is confirmed to actually exist
 * (see /api/buyer/documents/confirm), since the client's upload may never
 * complete. specs/Yukti_Public-Signup_Backend-Plan_v1.md §4.
 */

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

const BodySchema = z
  .object({
    scope: z.enum(['personal', 'business']),
    gstin: z.string().trim().min(1).optional(),
    doc_type: z.enum(BUYER_DOC_TYPES),
    content_type: z.enum(ALLOWED_CONTENT_TYPES),
  })
  .refine((data) => data.scope !== 'business' || Boolean(data.gstin), {
    message: 'gstin is required when scope is business',
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

    const { scope, gstin, doc_type: docType, content_type: contentType } = parsed.data;

    // buyerId/tenantId always come from the verified session — never from the request body.
    const result = await signBuyerDocumentUpload({
      scope,
      buyerId: profile.buyer.id,
      gstin,
      docType,
      contentType,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/buyer/documents/presign]', error);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
