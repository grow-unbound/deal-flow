# DealFlow — Image Upload & Storage Architecture

> **Audience:** Cursor agent implementing the image upload pipeline  
> **Status:** Architecture spec — implement exactly as described, do not deviate without flagging  
> **Last reviewed against schema:** `catalog.products`, `catalog.brands`, `catalog.categories`, `app.tenant_products`, `app.tenant_brands`, `app.tenants`

---

## 1. Decision Record

### 1.1 Where does resizing happen?

**Decision: Cloudflare Worker (not Vercel, not Cloudflare Images managed service)**

| Option | Cost | Complexity | Verdict |
|---|---|---|---|
| Vercel real-time image transforms | Per-transform billing, free tier burns fast | Low | ❌ Rejected — hits limits with catalog scale |
| Cloudflare Images (managed) | $5/mo + $1 per 1000 images stored | Low | ❌ Rejected — marginal cost at catalog scale |
| Sharp in Next.js API route (Vercel) | Compute cost on Vercel; WASM bundle size | Medium | ❌ Rejected — wrong runtime for batch uploads |
| **Cloudflare Worker + sharp (WASM)** | **Free tier: 100k req/day, 10ms CPU/req** | Medium | ✅ **Selected** |

**WASM sits in Cloudflare, not Vercel.** The Worker runs at the edge, receives the raw upload, resizes into all variants, writes to R2, and returns keys. Zero Vercel involvement in image processing.

### 1.2 ID vs SKU as folder key

**Decision: Use UUID (`id`) not SKU**

- `master_sku` / `internal_sku` can change; UUIDs never do
- Tenant `internal_sku` values are not globally unique — collision risk in shared catalog paths
- R2 keys are permanent references stored in DB; they must be immutable
- SKU is business data; UUID is infrastructure identity

---

## 2. Image Variants by Entity

| Entity | Variants Needed | Rationale |
|---|---|---|
| `catalog.products` | thumb + small + medium + large + original | Product grid, detail page, line items, zoom |
| `catalog.brands` | thumb + medium + original | Brand logo in nav, brand listing page |
| `catalog.categories` | thumb + medium + original | Category nav chips, category landing |
| `app.tenant_products` | thumb + small + medium + large + original | Same as catalog products (tenant override) |
| `app.tenant_brands` | thumb + medium + original | Tenant-specific brand logo override |
| `app.published_catalogs` | medium + original | Hero image on catalog share link |
| User avatars (`auth.users`) | thumb + small + original | Profile pic in nav, comment threads |

### Variant Dimensions (all square WebP)

```
thumb    →  120 × 120   px   (line items, chips, avatars in lists)
small    →  320 × 320   px   (mobile catalog grid, product cards)
medium   →  640 × 640   px   (web catalog grid, brand/category tiles)
large    →  1200 × 1200 px   (product detail, zoom, hero)
original →  source file retained as-is (JPEG/PNG/WebP)
```

**White background normalisation:** Applied during WebP conversion for `product` entities only (not logos, not category banners). Sharp `flatten({ background: '#ffffff' })` before format conversion — strips alpha channel and composites onto white.

---

## 3. R2 Bucket Structure

**Bucket name:** `dealflow-assets`  
**Public access:** Enabled for `catalog/` prefix only. Tenant paths use signed URLs.

```
dealflow-assets/
│
├── catalog/
│   ├── products/{product_uuid}/
│   │   ├── original.jpg          ← source, never served directly to end users
│   │   ├── large.webp
│   │   ├── medium.webp
│   │   ├── small.webp
│   │   └── thumb.webp
│   │
│   ├── brands/{brand_uuid}/
│   │   ├── original.png
│   │   ├── medium.webp
│   │   └── thumb.webp
│   │
│   └── categories/{category_uuid}/
│       ├── original.png
│       ├── medium.webp
│       └── thumb.webp
│
└── tenants/
    └── {tenant_uuid}/
        ├── products/{tenant_product_uuid}/
        │   ├── original.jpg
        │   ├── large.webp
        │   ├── medium.webp
        │   ├── small.webp
        │   └── thumb.webp
        │
        ├── brands/{tenant_brand_uuid}/    ← logo_url_override source
        │   ├── original.png
        │   ├── medium.webp
        │   └── thumb.webp
        │
        ├── catalogs/{published_catalog_uuid}/
        │   ├── original.jpg
        │   └── medium.webp
        │
        └── users/{user_uuid}/
            ├── original.jpg
            ├── small.webp
            └── thumb.webp
```

**Key naming convention:** Always `{variant}.webp` (lowercase). Original retains source extension. No timestamps, no random suffixes — the path structure provides all identity context.

---

## 4. Cloudflare Worker: Image Resize Pipeline

### 4.1 Worker entrypoint

**Deploy at:** `images.dealflow.app` (custom domain on Cloudflare Worker)  
**Auth:** Shared secret header `X-Upload-Secret` — set in Worker env var, matched in your API

### 4.2 Request contract

```
POST /upload
Content-Type: multipart/form-data

Fields:
  file          → binary image file (required)
  entity_type   → "catalog_product" | "catalog_brand" | "catalog_category"
                  | "tenant_product" | "tenant_brand" | "catalog_hero"
                  | "user_avatar"
  entity_id     → UUID of the entity (required)
  tenant_id     → UUID (required for tenant_* types, omit for catalog_*)
  is_primary    → "true" | "false" (default false) — for multi-image products
```

### 4.3 Response contract

```json
{
  "success": true,
  "entity_type": "catalog_product",
  "entity_id": "uuid-here",
  "variants": {
    "original": "catalog/products/uuid/original.jpg",
    "large":    "catalog/products/uuid/large.webp",
    "medium":   "catalog/products/uuid/medium.webp",
    "small":    "catalog/products/uuid/small.webp",
    "thumb":    "catalog/products/uuid/thumb.webp"
  },
  "public_base_url": "https://assets.dealflow.app"
}
```

Your API receives this response and writes the keys to Supabase (see Section 6).

### 4.4 Worker processing steps

```
1. Validate auth header (X-Upload-Secret)
2. Parse multipart — extract file buffer + metadata fields
3. Validate MIME type (image/jpeg | image/png | image/webp only)
4. Validate file size (max 10MB)
5. Determine output variants from entity_type (see table in §2)
6. For each variant:
   a. sharp(buffer).resize(w, h, { fit: 'cover', position: 'centre' })
   b. IF entity_type includes 'product': .flatten({ background: '#ffffff' })
   c. .webp({ quality: 85 })
   d. Write to R2 at computed key
7. Write original to R2 (no processing, original extension)
8. Return JSON with all R2 keys
```

### 4.5 Worker dependencies

```toml
# wrangler.toml
name = "dealflow-image-worker"
compatibility_date = "2024-01-01"

[build]
command = "npm run build"

[[r2_buckets]]
binding = "ASSETS_BUCKET"
bucket_name = "dealflow-assets"

[vars]
UPLOAD_SECRET = "..."   # set via wrangler secret, not plaintext
```

```json
// package.json dependencies
{
  "sharp": "^0.33.0"   // WASM build auto-selected in CF Worker runtime
}
```

> **Note for Cursor/Codex:** Sharp detects the Cloudflare Worker runtime and uses its WASM build automatically — no manual WASM configuration needed. Use `sharp` npm package directly.

### 4.6 Multiple images (products)

Products can have multiple gallery images. The Worker handles each upload independently. Your API is responsible for maintaining sort order and `is_primary` flag in the `catalog_product_images` table (see §6).

**Overwrite behaviour:** If a file already exists at the computed R2 key, the Worker **overwrites** it. This is intentional — re-uploading a primary image replaces the previous one. No versioning at the storage layer.

---

## 5. Supabase Schema Changes

> These migrations must be run **before** implementing any upload UI.

### 5.1 New table: `catalog.product_images`

Replaces the `image_urls text[]` array on `catalog.products`. The array approach cannot store per-variant keys, moderation status, or sort order.

```sql
-- Migration: replace catalog.products.image_urls with structured table

CREATE TABLE catalog.product_images (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id              UUID NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
  is_primary              BOOLEAN NOT NULL DEFAULT false,
  sort_order              INTEGER NOT NULL DEFAULT 0,

  -- R2 keys (relative paths, not full URLs)
  r2_original_key         TEXT,
  r2_large_key            TEXT,
  r2_medium_key           TEXT,
  r2_small_key            TEXT,
  r2_thumb_key            TEXT,

  -- Moderation
  contributed_by_tenant_id UUID REFERENCES app.tenants(id),
  status                  TEXT NOT NULL DEFAULT 'approved'
                          CHECK (status IN ('pending', 'approved', 'rejected')),

  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  created_by              UUID REFERENCES auth.users(id),
  deleted_at              TIMESTAMPTZ
);

-- Only one primary image per product
CREATE UNIQUE INDEX catalog_product_images_primary_idx
  ON catalog.product_images(product_id)
  WHERE is_primary = true AND deleted_at IS NULL;

ALTER TABLE catalog.products DROP COLUMN image_urls;
```

### 5.2 New table: `catalog.brand_images`

Replaces `catalog.brands.logo_url` (single text field).

```sql
CREATE TABLE catalog.brand_images (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                UUID NOT NULL REFERENCES catalog.brands(id) ON DELETE CASCADE,
  image_type              TEXT NOT NULL DEFAULT 'logo'
                          CHECK (image_type IN ('logo', 'banner')),

  r2_original_key         TEXT,
  r2_medium_key           TEXT,
  r2_thumb_key            TEXT,

  contributed_by_tenant_id UUID REFERENCES app.tenants(id),
  status                  TEXT NOT NULL DEFAULT 'approved'
                          CHECK (status IN ('pending', 'approved', 'rejected')),

  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  created_by              UUID REFERENCES auth.users(id),
  deleted_at              TIMESTAMPTZ
);

-- Keep logo_url on catalog.brands as a computed/cached convenience column
-- It is updated via trigger from catalog.brand_images (see §5.6)
```

### 5.3 New table: `catalog.category_images`

Replaces `catalog.categories.image_url`.

```sql
CREATE TABLE catalog.category_images (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id             UUID NOT NULL REFERENCES catalog.categories(id) ON DELETE CASCADE,
  image_type              TEXT NOT NULL DEFAULT 'icon'
                          CHECK (image_type IN ('icon', 'banner')),

  r2_original_key         TEXT,
  r2_medium_key           TEXT,
  r2_thumb_key            TEXT,

  status                  TEXT NOT NULL DEFAULT 'approved'
                          CHECK (status IN ('pending', 'approved', 'rejected')),

  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  created_by              UUID REFERENCES auth.users(id),
  deleted_at              TIMESTAMPTZ
);

ALTER TABLE catalog.categories DROP COLUMN image_url;
```

### 5.4 Tenant product images: add structured columns

`app.tenant_products` currently has `image_urls text[]`. Replace with structured keys.

```sql
ALTER TABLE app.tenant_products
  ADD COLUMN r2_original_key  TEXT,
  ADD COLUMN r2_large_key     TEXT,
  ADD COLUMN r2_medium_key    TEXT,
  ADD COLUMN r2_small_key     TEXT,
  ADD COLUMN r2_thumb_key     TEXT;

-- Drop the array column after backfilling (backfill script separate)
-- ALTER TABLE app.tenant_products DROP COLUMN image_urls;
-- Note: keep image_urls until UI migrated, then drop in follow-up migration
```

> **Multi-image for tenant products:** Single primary image only for v1. Multi-gallery is catalog-level. Add a `tenant_product_images` table only if tenants explicitly need galleries on private products.

### 5.5 Tenant brand image override

`app.tenant_brands` already has `logo_url_override TEXT`. Add R2 key columns alongside:

```sql
ALTER TABLE app.tenant_brands
  ADD COLUMN r2_logo_original_key TEXT,
  ADD COLUMN r2_logo_medium_key   TEXT,
  ADD COLUMN r2_logo_thumb_key    TEXT;
-- logo_url_override remains for legacy/external URLs
```

### 5.6 Published catalog hero image

`app.published_catalogs` has `hero_image_url TEXT`. Add R2 keys:

```sql
ALTER TABLE app.published_catalogs
  ADD COLUMN r2_hero_original_key TEXT,
  ADD COLUMN r2_hero_medium_key   TEXT;
```

### 5.7 User avatar

```sql
ALTER TABLE auth.users ... -- cannot alter directly in Supabase

-- Store in app schema instead:
CREATE TABLE app.user_profiles (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id),
  r2_avatar_small_key TEXT,
  r2_avatar_thumb_key TEXT,
  r2_avatar_orig_key  TEXT,
  updated_at          TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. URL Resolution Pattern

R2 keys are **relative paths** — never store full URLs in Supabase. Construct URLs at read time.

```typescript
// packages/shared/lib/r2.ts

const R2_PUBLIC_BASE = process.env.NEXT_PUBLIC_R2_BASE_URL
// e.g. "https://assets.dealflow.app"
// This is the public R2 custom domain — set in Cloudflare R2 bucket settings

export function r2Url(key: string | null | undefined): string | null {
  if (!key) return null
  return `${R2_PUBLIC_BASE}/${key}`
}

// Usage:
// r2Url(product.r2_medium_key)
// → "https://assets.dealflow.app/catalog/products/uuid/medium.webp"
```

**Signed URLs** (for tenant-private paths):

```typescript
// Only needed for tenants/{tenant_id}/... paths
// Use Cloudflare R2 presigned URL API — 1hr TTL is fine for UI usage
// Implement only when tenant privacy requirement is confirmed
// For v1: all paths can be public-readable (obscurity via UUID is sufficient)
```

---

## 7. Upload Flow (Next.js API → Worker → R2 → Supabase)

```
Browser/App
  │
  │  POST /api/upload/product-image
  │  (multipart: file + entity metadata)
  ▼
Next.js API Route (apps/seller/app/api/upload/[entity]/route.ts)
  │
  │  1. Authenticate user (Supabase session)
  │  2. Validate entity ownership (tenant_id check)
  │  3. Forward to CF Worker with X-Upload-Secret
  ▼
Cloudflare Worker (images.dealflow.app)
  │
  │  4. Resize into variants
  │  5. Write all variants to R2
  │  6. Return { variants: { thumb, small, medium, large, original } }
  ▼
Next.js API Route (continued)
  │
  │  7. Write R2 keys to Supabase
  │     - catalog.product_images (for catalog products)
  │     - app.tenant_products (for tenant product overrides)
  │     - etc. per entity type
  │  8. Return { success: true, urls: { ... } } to client
  ▼
Browser/App
  (display using r2Url() helper)
```

---

## 8. Implementation Checklist for Cursor

### Phase 1 — Infrastructure
- [ ] Create Cloudflare Worker project (`dealflow-image-worker`)
- [ ] Configure R2 bucket `dealflow-assets` with public access on `catalog/` prefix
- [ ] Set `UPLOAD_SECRET` env var in Worker (wrangler secret)
- [ ] Set `NEXT_PUBLIC_R2_BASE_URL` in Next.js env (custom domain for R2)
- [ ] Deploy Worker to `images.dealflow.app`

### Phase 2 — Schema migrations (run in order)
- [ ] Create `catalog.product_images` table
- [ ] Create `catalog.brand_images` table  
- [ ] Create `catalog.category_images` table
- [ ] Add R2 key columns to `app.tenant_products`
- [ ] Add R2 key columns to `app.tenant_brands`
- [ ] Add R2 key columns to `app.published_catalogs`
- [ ] Create `app.user_profiles` table

### Phase 3 — Worker implementation
- [ ] Implement `POST /upload` endpoint in Worker
- [ ] Sharp WASM resize pipeline with variant config per entity type
- [ ] White background flattening for product entity types
- [ ] R2 write for all variants
- [ ] Error handling: invalid MIME, oversized file, R2 write failure

### Phase 4 — API routes (Next.js)
- [ ] `POST /api/upload/catalog-product` → catalog.product_images
- [ ] `POST /api/upload/catalog-brand` → catalog.brand_images
- [ ] `POST /api/upload/catalog-category` → catalog.category_images
- [ ] `POST /api/upload/tenant-product` → app.tenant_products R2 keys
- [ ] `POST /api/upload/tenant-brand` → app.tenant_brands R2 keys
- [ ] `POST /api/upload/catalog-hero` → app.published_catalogs R2 keys
- [ ] `POST /api/upload/avatar` → app.user_profiles

### Phase 5 — Shared utility
- [ ] `packages/shared/lib/r2.ts` — `r2Url()` helper
- [ ] Type definitions for variant key sets

---

## 9. Open Questions (resolve before implementation)

| # | Question | Impact |
|---|---|---|
| 1 | Will tenant product images ever need galleries (multiple images)? | If yes, add `tenant_product_images` table instead of inline columns |
| 2 | Should category/brand images bypass moderation (`status='approved'` immediately)? | Only tenant-contributed catalog product images need `pending` flow |
| 3 | Signed URLs for tenant paths needed at v1? | If no — simplify to all-public R2 bucket with UUID-based obscurity |
| 4 | Max images per catalog product? | Cap in Worker or API route — suggest 8 max |

