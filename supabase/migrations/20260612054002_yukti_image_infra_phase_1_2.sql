CREATE TABLE IF NOT EXISTS catalog.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES catalog.products(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  r2_original_key text,
  r2_large_key text,
  r2_medium_key text,
  r2_small_key text,
  r2_thumb_key text,
  contributed_by_tenant_id uuid REFERENCES app.tenants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_product_images_primary_idx
  ON catalog.product_images(product_id)
  WHERE is_primary = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_product_images_product_sort
  ON catalog.product_images(product_id, deleted_at, sort_order);

CREATE TABLE IF NOT EXISTS catalog.brand_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES catalog.brands(id) ON DELETE RESTRICT,
  image_type text NOT NULL DEFAULT 'logo' CHECK (image_type IN ('logo', 'banner')),
  r2_original_key text,
  r2_medium_key text,
  r2_thumb_key text,
  contributed_by_tenant_id uuid REFERENCES app.tenants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_catalog_brand_images_brand_deleted
  ON catalog.brand_images(brand_id, deleted_at);

CREATE TABLE IF NOT EXISTS catalog.category_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  image_type text NOT NULL DEFAULT 'icon' CHECK (image_type IN ('icon', 'banner')),
  r2_original_key text,
  r2_medium_key text,
  r2_thumb_key text,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_catalog_category_images_category_deleted
  ON catalog.category_images(category_id, deleted_at);

CREATE TABLE IF NOT EXISTS app.tenant_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  master_category_id uuid REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  parent_tenant_category_id uuid REFERENCES app.tenant_categories(id) ON DELETE RESTRICT,
  promoted_catalog_category_id uuid REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  external_ref text,
  review_status text NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft', 'in_review', 'approved', 'rejected', 'promoted')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_categories_tenant_slug_unique
  ON app.tenant_categories(tenant_id, slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_categories_tenant_review_deleted
  ON app.tenant_categories(tenant_id, review_status, deleted_at);

CREATE INDEX IF NOT EXISTS idx_tenant_categories_master_category_id
  ON app.tenant_categories(master_category_id);

CREATE INDEX IF NOT EXISTS idx_tenant_categories_promoted_category_id
  ON app.tenant_categories(promoted_catalog_category_id);

CREATE INDEX IF NOT EXISTS idx_tenant_categories_parent_id
  ON app.tenant_categories(parent_tenant_category_id);

CREATE TABLE IF NOT EXISTS app.tenant_category_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_category_id uuid NOT NULL REFERENCES app.tenant_categories(id) ON DELETE RESTRICT,
  image_type text NOT NULL DEFAULT 'icon' CHECK (image_type IN ('icon', 'banner')),
  is_primary boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  r2_original_key text,
  r2_medium_key text,
  r2_thumb_key text,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_category_images_primary_per_type
  ON app.tenant_category_images(tenant_category_id, image_type)
  WHERE is_primary = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_category_images_category_sort
  ON app.tenant_category_images(tenant_category_id, deleted_at, sort_order);

ALTER TABLE app.tenant_products
  ADD COLUMN IF NOT EXISTS r2_original_key text,
  ADD COLUMN IF NOT EXISTS r2_large_key text,
  ADD COLUMN IF NOT EXISTS r2_medium_key text,
  ADD COLUMN IF NOT EXISTS r2_small_key text,
  ADD COLUMN IF NOT EXISTS r2_thumb_key text;

ALTER TABLE app.tenant_brands
  ADD COLUMN IF NOT EXISTS r2_logo_original_key text,
  ADD COLUMN IF NOT EXISTS r2_logo_medium_key text,
  ADD COLUMN IF NOT EXISTS r2_logo_thumb_key text;

ALTER TABLE app.published_catalogs
  ADD COLUMN IF NOT EXISTS r2_hero_original_key text,
  ADD COLUMN IF NOT EXISTS r2_hero_medium_key text;

CREATE TABLE IF NOT EXISTS app.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  r2_avatar_orig_key text,
  r2_avatar_small_key text,
  r2_avatar_thumb_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_deleted_at
  ON app.user_profiles(deleted_at);

DROP TRIGGER IF EXISTS catalog_product_images_updated_at ON catalog.product_images;
CREATE TRIGGER catalog_product_images_updated_at
  BEFORE UPDATE ON catalog.product_images
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS catalog_brand_images_updated_at ON catalog.brand_images;
CREATE TRIGGER catalog_brand_images_updated_at
  BEFORE UPDATE ON catalog.brand_images
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS catalog_category_images_updated_at ON catalog.category_images;
CREATE TRIGGER catalog_category_images_updated_at
  BEFORE UPDATE ON catalog.category_images
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS tenant_categories_updated_at ON app.tenant_categories;
CREATE TRIGGER tenant_categories_updated_at
  BEFORE UPDATE ON app.tenant_categories
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS tenant_category_images_updated_at ON app.tenant_category_images;
CREATE TRIGGER tenant_category_images_updated_at
  BEFORE UPDATE ON app.tenant_category_images
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS user_profiles_updated_at ON app.user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON app.user_profiles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.tenant_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenant_category_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_categories_select ON app.tenant_categories;
DROP POLICY IF EXISTS tenant_categories_insert ON app.tenant_categories;
DROP POLICY IF EXISTS tenant_categories_update ON app.tenant_categories;
DROP POLICY IF EXISTS tenant_categories_delete ON app.tenant_categories;
DROP POLICY IF EXISTS tenant_category_images_select ON app.tenant_category_images;
DROP POLICY IF EXISTS tenant_category_images_insert ON app.tenant_category_images;
DROP POLICY IF EXISTS tenant_category_images_update ON app.tenant_category_images;
DROP POLICY IF EXISTS tenant_category_images_delete ON app.tenant_category_images;
DROP POLICY IF EXISTS user_profiles_select ON app.user_profiles;
DROP POLICY IF EXISTS user_profiles_insert ON app.user_profiles;
DROP POLICY IF EXISTS user_profiles_update ON app.user_profiles;
DROP POLICY IF EXISTS user_profiles_delete ON app.user_profiles;

CREATE POLICY tenant_categories_select ON app.tenant_categories
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_categories_insert ON app.tenant_categories
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_categories_update ON app.tenant_categories
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_categories_delete ON app.tenant_categories
  FOR DELETE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_category_images_select ON app.tenant_category_images
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1
      FROM app.tenant_categories tc
      WHERE tc.id = tenant_category_id
        AND tc.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY tenant_category_images_insert ON app.tenant_category_images
  FOR INSERT WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1
      FROM app.tenant_categories tc
      WHERE tc.id = tenant_category_id
        AND tc.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY tenant_category_images_update ON app.tenant_category_images
  FOR UPDATE USING (
    app.is_seller() AND EXISTS (
      SELECT 1
      FROM app.tenant_categories tc
      WHERE tc.id = tenant_category_id
        AND tc.tenant_id = app.jwt_tenant_id()
    )
  )
  WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1
      FROM app.tenant_categories tc
      WHERE tc.id = tenant_category_id
        AND tc.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY tenant_category_images_delete ON app.tenant_category_images
  FOR DELETE USING (
    app.is_seller() AND EXISTS (
      SELECT 1
      FROM app.tenant_categories tc
      WHERE tc.id = tenant_category_id
        AND tc.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY user_profiles_select ON app.user_profiles
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1
      FROM app.tenant_users tu
      WHERE tu.user_id = app.user_profiles.user_id
        AND tu.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY user_profiles_insert ON app.user_profiles
  FOR INSERT WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1
      FROM app.tenant_users tu
      WHERE tu.user_id = app.user_profiles.user_id
        AND tu.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY user_profiles_update ON app.user_profiles
  FOR UPDATE USING (
    app.is_seller() AND EXISTS (
      SELECT 1
      FROM app.tenant_users tu
      WHERE tu.user_id = app.user_profiles.user_id
        AND tu.tenant_id = app.jwt_tenant_id()
    )
  )
  WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1
      FROM app.tenant_users tu
      WHERE tu.user_id = app.user_profiles.user_id
        AND tu.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY user_profiles_delete ON app.user_profiles
  FOR DELETE USING (
    app.is_seller() AND EXISTS (
      SELECT 1
      FROM app.tenant_users tu
      WHERE tu.user_id = app.user_profiles.user_id
        AND tu.tenant_id = app.jwt_tenant_id()
    )
  );
