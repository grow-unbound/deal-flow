import crypto from 'crypto';
import { getPresignedUploadUrl, getObjectSize } from '@/lib/r2';

/**
 * R2 storage plan for buyer-submitted onboarding documents.
 * specs/Yukti_Public-Signup_Backend-Plan_v1.md §4 (key structure) + §0b (copy-not-link).
 *
 * Distinct from src/lib/server/r2-presign-entity.ts's signEntityVariantUploads:
 * that helper's key-building is tenant-scoped and variant-aware (image
 * original + resized webp variants). Buyer documents are neither — one raw
 * upload per (buyer, doc_type) or (gstin, doc_type), no variants.
 */

export const BUYER_DOC_TYPES = ['shop_image', 'gst_certificate'] as const;
export type BuyerDocType = (typeof BUYER_DOC_TYPES)[number];

export type BuyerDocumentScope = 'personal' | 'business';

/**
 * GSTIN is hashed for the storage-key path segment only — the plaintext value
 * still lives in app.buyer_documents.gstin (needed for the cross-tenant reuse
 * lookup index), it just never appears in the R2 object key. Normalize before
 * hashing (and everywhere else a GSTIN is compared/stored by these helpers) so
 * the same real GSTIN always resolves to the same hash/row regardless of the
 * case or whitespace a buyer typed it in.
 */
export function normalizeGstin(gstin: string): string {
  return gstin.trim().toUpperCase();
}

export function hashGstin(gstin: string): string {
  return crypto.createHash('sha256').update(normalizeGstin(gstin)).digest('hex');
}

function randomKeySuffix(): string {
  // No client-supplied filename in the presign request body (scope/gstin/doc_type/content_type
  // only) — fall back to a uuid + timestamp suffix per the brief's
  // "<uuid>-<sanitized-filename-or-timestamp>" key shape.
  return `${crypto.randomUUID()}-${Date.now().toString(36)}`;
}

export function buildPersonalDocumentKey(buyerId: string, docType: BuyerDocType): string {
  return `buyers/${buyerId}/personal/${docType}/${randomKeySuffix()}`;
}

export function buildBusinessDocumentKey(gstin: string, docType: BuyerDocType): string {
  return `businesses/${hashGstin(gstin)}/docs/${docType}/${randomKeySuffix()}`;
}

export async function signBuyerDocumentUpload(params: {
  scope: BuyerDocumentScope;
  buyerId: string;
  gstin?: string;
  docType: BuyerDocType;
  contentType: string;
}): Promise<{ key: string; upload_url: string }> {
  const { scope, buyerId, gstin, docType, contentType } = params;

  if (!buyerId.trim()) {
    throw new Error('buyerId is required');
  }

  let key: string;
  if (scope === 'business') {
    if (!gstin || !gstin.trim()) {
      throw new Error('gstin is required when scope is business');
    }
    key = buildBusinessDocumentKey(gstin, docType);
  } else {
    key = buildPersonalDocumentKey(buyerId, docType);
  }

  const upload_url = await getPresignedUploadUrl(key, contentType);
  return { key, upload_url };
}

/**
 * Confirms an object was actually written to R2 before any DB row references
 * it — the confirm route must never trust the client's claim that its PUT
 * succeeded. Reuses r2.ts's existing getObjectSize (already used the same way
 * by the entity-upload finalize path) rather than adding a second HEAD helper.
 */
export async function buyerDocumentObjectExists(key: string): Promise<boolean> {
  const size = await getObjectSize(key);
  return size !== null;
}
