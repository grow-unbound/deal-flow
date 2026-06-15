import { generateEntityVariants } from '@/lib/client/image-variants';

export type UploadEntityResponse = {
  success: true;
  entity_type: string;
  entity_id: string;
  urls: Record<string, string | null>;
};

type PresignedVariant = {
  name: string;
  key: string;
  upload_url: string;
  public_url: string;
};

async function getPresignedVariants(
  entityType: string,
  entityId: string,
  originalContentType: string,
): Promise<PresignedVariant[]> {
  const res = await fetch('/api/uploads/r2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entity_type: entityType,
      entity_id: entityId,
      original_content_type: originalContentType,
    }),
  });

  const json = await res.json().catch(() => ({})) as { variants?: PresignedVariant[]; error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to get upload URLs');
  if (!json.variants?.length) throw new Error('No upload URLs returned');
  return json.variants;
}

async function putVariantToR2(uploadUrl: string, blob: Blob, contentType: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': contentType },
  });
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status} ${res.statusText}`);
}

export async function uploadEntityFile(input: {
  endpoint: string;
  entityType: string;
  entityId: string;
  file: File;
  isPrimary?: boolean;
  imageType?: 'icon' | 'banner' | 'logo';
}): Promise<UploadEntityResponse> {
  // 1. Generate all variants in the browser
  const generated = await generateEntityVariants(input.file, input.entityType, input.entityId);

  // 2. Get per-variant presigned URLs from the server
  const presigned = await getPresignedVariants(input.entityType, input.entityId, input.file.type);

  // 3. Match generated blobs to presigned URLs by variant name and upload in parallel
  await Promise.all(
    generated.map(({ name, blob, contentType }) => {
      const slot = presigned.find((p) => p.name === name);
      if (!slot) throw new Error(`No presigned URL for variant "${name}"`);
      return putVariantToR2(slot.upload_url, blob, contentType);
    }),
  );

  // 4. Build the variant key map to send to the finalize endpoint
  const variantKeys: Record<string, string> = {};
  for (const { name, key } of presigned) {
    variantKeys[name] = key;
  }

  // 5. Finalize: save keys to the database via the entity-specific route
  const finalizeRes = await fetch(input.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entity_id: input.entityId,
      variants: variantKeys,
      ...(input.isPrimary !== undefined && { is_primary: input.isPrimary }),
      ...(input.imageType && { image_type: input.imageType }),
    }),
  });

  const finalizeJson = await finalizeRes.json().catch(() => ({})) as { error?: string };
  if (!finalizeRes.ok) {
    throw new Error(finalizeJson.error ?? 'Image upload failed.');
  }

  return finalizeJson as UploadEntityResponse;
}
