-- Create the three main schemas
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS app;

-- Set up comment on schemas
COMMENT ON SCHEMA catalog IS 'Master brands, products, categories. Reusable across all tenants.';
COMMENT ON SCHEMA app IS 'All tenant business data. RLS-enforced per tenant.';

-- Audit trigger function (used by all tables)
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==================== CATALOG SCHEMA ====================

-- Brands table
CREATE TABLE catalog.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  description text,
  origin_tenant_id uuid,
  is_public boolean DEFAULT true,
  external_ref text,
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX idx_brands_slug ON catalog.brands(slug);
CREATE INDEX idx_brands_is_public ON catalog.brands(is_public);
CREATE INDEX idx_brands_origin_tenant_id ON catalog.brands(origin_tenant_id);

-- Categories table
CREATE TABLE catalog.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  image_url text,
  is_public boolean DEFAULT true,
  external_ref text,
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(parent_id, slug)
);

CREATE INDEX idx_categories_slug ON catalog.categories(slug);
CREATE INDEX idx_categories_parent_id ON catalog.categories(parent_id);
CREATE INDEX idx_categories_is_public ON catalog.categories(is_public);

-- Products table
CREATE TABLE catalog.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES catalog.brands(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  master_sku text NOT NULL,
  name text NOT NULL,
  description text,
  default_uom text,
  pack_size numeric,
  hsn_code text,
  gst_rate numeric,
  attributes jsonb DEFAULT '{}',
  image_urls text[] DEFAULT '{}',
  is_public boolean DEFAULT true,
  embedding vector(1536),
  external_ref text,
  search_doc tsvector,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(brand_id, master_sku)
);

CREATE INDEX idx_products_brand_id ON catalog.products(brand_id);
CREATE INDEX idx_products_category_id ON catalog.products(category_id);
CREATE INDEX idx_products_is_public ON catalog.products(is_public);
CREATE INDEX idx_products_master_sku ON catalog.products(master_sku);
CREATE INDEX idx_products_search_doc ON catalog.products USING GIN(search_doc);
CREATE INDEX idx_products_embedding ON catalog.products USING HNSW(embedding vector_cosine_ops);

-- Product aliases table
CREATE TABLE catalog.product_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
  alias text NOT NULL,
  language text,
  embedding vector(1536)
);

CREATE INDEX idx_product_aliases_product_id ON catalog.product_aliases(product_id);

-- Triggers for updated_at
CREATE TRIGGER brands_updated_at BEFORE UPDATE ON catalog.brands
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER categories_updated_at BEFORE UPDATE ON catalog.categories
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER products_updated_at BEFORE UPDATE ON catalog.products
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ==================== APP SCHEMA ====================

-- Tenants table
CREATE TABLE app.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  business_name text NOT NULL,
  gstin text,
  primary_state text,
  subdomain text UNIQUE,
  plan text DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'scale')),
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX idx_tenants_slug ON app.tenants(slug);
CREATE INDEX idx_tenants_subdomain ON app.tenants(subdomain);

-- Tenant users table
CREATE TABLE app.tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('seller_admin', 'seller_assistant')),
  is_active boolean DEFAULT true,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_users_tenant_id ON app.tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user_id ON app.tenant_users(user_id);
CREATE INDEX idx_tenant_users_role ON app.tenant_users(role);

-- Tenant brands table
CREATE TABLE app.tenant_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  master_brand_id uuid NOT NULL REFERENCES catalog.brands(id) ON DELETE RESTRICT,
  display_name_override text,
  margin_pct numeric,
  exclusivity boolean DEFAULT false,
  is_active boolean DEFAULT true,
  external_ref text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(tenant_id, master_brand_id)
);

CREATE INDEX idx_tenant_brands_tenant_id ON app.tenant_brands(tenant_id);
CREATE INDEX idx_tenant_brands_master_brand_id ON app.tenant_brands(master_brand_id);

-- Locations table
CREATE TABLE app.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  address jsonb,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX idx_locations_tenant_id ON app.locations(tenant_id);

-- Tenant products table
CREATE TABLE app.tenant_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  tenant_brand_id uuid NOT NULL REFERENCES app.tenant_brands(id) ON DELETE CASCADE,
  master_product_id uuid REFERENCES catalog.products(id) ON DELETE RESTRICT,
  internal_sku text NOT NULL,
  name_override text,
  attributes_override jsonb DEFAULT '{}',
  mrp numeric,
  base_selling_price numeric,
  cost_price numeric,
  default_uom text,
  pack_size numeric,
  image_urls text[],
  is_active boolean DEFAULT true,
  external_ref text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(tenant_id, internal_sku)
);

CREATE INDEX idx_tenant_products_tenant_id ON app.tenant_products(tenant_id);
CREATE INDEX idx_tenant_products_tenant_brand_id ON app.tenant_products(tenant_brand_id);
CREATE INDEX idx_tenant_products_master_product_id ON app.tenant_products(master_product_id);
CREATE INDEX idx_tenant_products_internal_sku ON app.tenant_products(internal_sku);

-- Tenant inventory table
CREATE TABLE app.tenant_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_product_id uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES app.locations(id) ON DELETE CASCADE,
  qty_available numeric DEFAULT 0,
  qty_reserved numeric DEFAULT 0,
  reorder_point numeric,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tenant_inventory_tenant_product_id ON app.tenant_inventory(tenant_product_id);
CREATE INDEX idx_tenant_inventory_location_id ON app.tenant_inventory(location_id);

-- Buyers table
CREATE TABLE app.buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  gstin text,
  geography jsonb,
  credit_limit numeric DEFAULT 0,
  payment_terms_days integer DEFAULT 0,
  tier text CHECK (tier IN ('A', 'B', 'C')),
  external_ref text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(tenant_id, external_ref)
);

CREATE INDEX idx_buyers_tenant_id ON app.buyers(tenant_id);
CREATE INDEX idx_buyers_phone ON app.buyers(phone);
CREATE INDEX idx_buyers_email ON app.buyers(email);
CREATE INDEX idx_buyers_tier ON app.buyers(tier);

-- Buyer users table
CREATE TABLE app.buyer_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('buyer_admin', 'buyer_assistant')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(buyer_id, user_id)
);

CREATE INDEX idx_buyer_users_buyer_id ON app.buyer_users(buyer_id);
CREATE INDEX idx_buyer_users_user_id ON app.buyer_users(user_id);

-- Cohorts table
CREATE TABLE app.cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  rules jsonb,
  is_static boolean DEFAULT false,
  cached_member_count integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX idx_cohorts_tenant_id ON app.cohorts(tenant_id);

-- Cohort members table
CREATE TABLE app.cohort_members (
  cohort_id uuid NOT NULL REFERENCES app.cohorts(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE CASCADE,
  PRIMARY KEY (cohort_id, buyer_id)
);

CREATE INDEX idx_cohort_members_cohort_id ON app.cohort_members(cohort_id);
CREATE INDEX idx_cohort_members_buyer_id ON app.cohort_members(buyer_id);

-- Price lists table
CREATE TABLE app.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  currency text DEFAULT 'INR',
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  priority integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX idx_price_lists_tenant_id ON app.price_lists(tenant_id);
CREATE INDEX idx_price_lists_valid_from ON app.price_lists(valid_from);

-- Price list items table
CREATE TABLE app.price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES app.price_lists(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  min_qty numeric DEFAULT 1,
  max_qty numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(price_list_id, tenant_product_id, min_qty)
);

CREATE INDEX idx_price_list_items_price_list_id ON app.price_list_items(price_list_id);
CREATE INDEX idx_price_list_items_tenant_product_id ON app.price_list_items(tenant_product_id);

-- Price list assignments table
CREATE TABLE app.price_list_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES app.price_lists(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('buyer', 'cohort', 'all_buyers')),
  target_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX idx_price_list_assignments_price_list_id ON app.price_list_assignments(price_list_id);
CREATE INDEX idx_price_list_assignments_target ON app.price_list_assignments(target_type, target_id);

-- Published catalogs table
CREATE TABLE app.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('cohort', 'buyer', 'geography', 'all')),
  scope_value jsonb,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  hero_image_url text,
  message text,
  share_token text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX idx_campaigns_tenant_id ON app.campaigns(tenant_id);
CREATE INDEX idx_campaigns_share_token ON app.campaigns(share_token);
CREATE INDEX idx_campaigns_status ON app.campaigns(status);

-- Published catalog items table
CREATE TABLE app.campaign_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES app.campaigns(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE CASCADE,
  is_featured boolean DEFAULT false,
  display_order integer,
  price_override numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(campaign_id, tenant_product_id)
);

CREATE INDEX idx_campaign_items_catalog_id ON app.campaign_items(campaign_id);

-- Orders table
CREATE TABLE app.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE CASCADE,
  placed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  order_number text NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'received', 'confirmed', 'partially_dispatched', 'dispatched', 'delivered', 'cancelled')),
  source text CHECK (source IN ('buyer_app', 'cockpit_manual', 'csv_import')),
  campaign_id uuid REFERENCES app.campaigns(id) ON DELETE SET NULL,
  subtotal numeric,
  tax_amount numeric,
  total_amount numeric,
  currency text DEFAULT 'INR',
  notes text,
  placed_at timestamptz,
  external_ref text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE(tenant_id, order_number)
);

CREATE INDEX idx_orders_tenant_id ON app.orders(tenant_id);
CREATE INDEX idx_orders_buyer_id ON app.orders(buyer_id);
CREATE INDEX idx_orders_status ON app.orders(status);
CREATE INDEX idx_orders_placed_at ON app.orders(placed_at);

-- Order items table
CREATE TABLE app.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE RESTRICT,
  qty numeric NOT NULL,
  unit_price numeric NOT NULL,
  tax_rate numeric,
  line_total numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX idx_order_items_order_id ON app.order_items(order_id);
CREATE INDEX idx_order_items_tenant_product_id ON app.order_items(tenant_product_id);

-- Audit log table
CREATE TABLE app.audit_log (
  id bigserial PRIMARY KEY,
  tenant_id uuid,
  actor_user_id uuid,
  entity_type text,
  entity_id uuid,
  action text CHECK (action IN ('create', 'update', 'delete', 'publish', 'status_change')),
  diff jsonb,
  ts timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_log_tenant_id ON app.audit_log(tenant_id);
CREATE INDEX idx_audit_log_entity ON app.audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_ts ON app.audit_log(ts);

-- Add triggers for updated_at on app tables
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON app.tenants
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER tenant_users_updated_at BEFORE UPDATE ON app.tenant_users
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER tenant_brands_updated_at BEFORE UPDATE ON app.tenant_brands
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER tenant_products_updated_at BEFORE UPDATE ON app.tenant_products
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER buyers_updated_at BEFORE UPDATE ON app.buyers
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER cohorts_updated_at BEFORE UPDATE ON app.cohorts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER price_lists_updated_at BEFORE UPDATE ON app.price_lists
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON app.campaigns
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON app.orders
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
