import { getPresignedUploadUrl, getPublicUrl } from '@/lib/r2';
import {
  ENTITY_VARIANT_CONFIG,
  buildOriginalKey,
  buildVariantKey,
  type VariantName,
} from '@/lib/image-entity-config';

export interface PresignedVariantSlot {
  name: string;
  key: string;
  upload_url: string;
  public_url: string;
}

export async function signEntityVariantUploads(params: {
  entityType: string;
  entityId: string;
  tenantId: string;
  originalContentType: string;
}): Promise<PresignedVariantSlot[]> {
  const config = ENTITY_VARIANT_CONFIG[params.entityType];
  if (!config) {
    throw new Error(`Unknown entity type: ${params.entityType}`);
  }

  const baseKey = config.buildBaseKey(params.entityId, params.tenantId);
  const variantEntries: { name: string; contentType: string; key: string }[] = [
    {
      name: 'original',
      contentType: params.originalContentType,
      key: buildOriginalKey(baseKey, params.originalContentType),
    },
    ...config.variants.map((v: VariantName) => ({
      name: v,
      contentType: 'image/webp',
      key: buildVariantKey(baseKey, v),
    })),
  ];

  return Promise.all(
    variantEntries.map(async ({ name, contentType, key }) => ({
      name,
      key,
      upload_url: await getPresignedUploadUrl(key, contentType),
      public_url: getPublicUrl(key),
    })),
  );
}
