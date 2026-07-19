export type VariantName = 'thumb' | 'small' | 'medium' | 'large';

export const VARIANT_SIZES: Record<VariantName, number> = {
  thumb: 120,
  small: 320,
  medium: 640,
  large: 1200,
};

export type EntityVariantConfig = {
  variants: VariantName[];
  flattenOnWhite: boolean;
  requiresTenantId: boolean;
  buildBaseKey: (entityId: string, tenantId?: string) => string;
};

export const ENTITY_VARIANT_CONFIG: Record<string, EntityVariantConfig> = {
  catalog_product: {
    variants: ['thumb', 'small', 'medium', 'large'],
    flattenOnWhite: true,
    requiresTenantId: false,
    buildBaseKey: (entityId) => `catalog/products/${entityId}`,
  },
  catalog_brand: {
    variants: ['thumb', 'medium'],
    flattenOnWhite: false,
    requiresTenantId: false,
    buildBaseKey: (entityId) => `catalog/brands/${entityId}`,
  },
  catalog_category: {
    variants: ['thumb', 'medium'],
    flattenOnWhite: true,
    requiresTenantId: false,
    buildBaseKey: (entityId) => `catalog/categories/${entityId}`,
  },
  tenant_product: {
    variants: ['thumb', 'small', 'medium', 'large'],
    flattenOnWhite: true,
    requiresTenantId: true,
    buildBaseKey: (entityId, tenantId) => `tenants/${tenantId}/products/${entityId}`,
  },
  tenant_brand: {
    variants: ['thumb', 'medium'],
    flattenOnWhite: false,
    requiresTenantId: true,
    buildBaseKey: (entityId, tenantId) => `tenants/${tenantId}/brands/${entityId}`,
  },
  tenant_category: {
    variants: ['thumb', 'medium'],
    flattenOnWhite: true,
    requiresTenantId: true,
    buildBaseKey: (entityId, tenantId) => `tenants/${tenantId}/categories/${entityId}`,
  },
  catalog_hero: {
    variants: ['medium'],
    flattenOnWhite: false,
    requiresTenantId: true,
    buildBaseKey: (entityId, tenantId) => `tenants/${tenantId}/campaigns/${entityId}/picture`,
  },
  user_avatar: {
    variants: ['thumb', 'small'],
    flattenOnWhite: false,
    requiresTenantId: true,
    buildBaseKey: (entityId, tenantId) => `tenants/${tenantId}/users/${entityId}`,
  },
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function buildOriginalKey(baseKey: string, mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType] ?? 'jpg';
  return `${baseKey}/original.${ext}`;
}

export function buildVariantKey(baseKey: string, variant: VariantName): string {
  return `${baseKey}/${variant}.webp`;
}
