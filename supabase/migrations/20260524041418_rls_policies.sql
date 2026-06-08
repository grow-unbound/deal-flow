-- ============================================================
-- RLS Policies — All app.* Tables
-- Story: EP-11-002 (Row-Level Security on All app.* Tables)
--
-- JWT claims are injected by custom_access_token_hook (migration 002):
--   tenant_id  → auth.jwt() ->> 'tenant_id'
--   role       → auth.jwt() ->> 'role'   (seller_admin | seller_assistant |
--                                          buyer_admin | buyer_assistant)
--   buyer_id   → auth.jwt() ->> 'buyer_id'  (null for seller roles)
--
-- Role matrix (from Product Spec §6.1):
--   seller_admin     — full cockpit access within their tenant
--   seller_assistant — same as admin EXCEPT: cannot manage cohorts,
--                      price lists, tenant settings, or invite users
--   buyer_admin      — read catalogs + place/approve orders for own buyer
--   buyer_assistant  — read catalogs + place (pending-approval) orders
--
-- Service role (supabaseAdmin) always bypasses RLS — used in server-side
-- API routes. Anon role gets nothing from app.* tables.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- Helper functions (STABLE — cached per transaction)
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.jwt_tenant_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid
$$;

CREATE OR REPLACE FUNCTION app.jwt_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT auth.jwt() ->> 'role'
$$;

CREATE OR REPLACE FUNCTION app.jwt_buyer_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() ->> 'buyer_id')::uuid
$$;

-- true if current user is any seller role
CREATE OR REPLACE FUNCTION app.is_seller()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() ->> 'role') IN ('seller_admin', 'seller_assistant')
$$;

-- true if current user is specifically seller_admin
CREATE OR REPLACE FUNCTION app.is_seller_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() ->> 'role') = 'seller_admin'
$$;

-- true if current user is any buyer role
CREATE OR REPLACE FUNCTION app.is_buyer()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() ->> 'role') IN ('buyer_admin', 'buyer_assistant')
$$;

-- true if current user is specifically buyer_admin
CREATE OR REPLACE FUNCTION app.is_buyer_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() ->> 'role') = 'buyer_admin'
$$;

-- ──────────────────────────────────────────────────────────
-- 1. app.tenants
--    Sellers: read + admin-only write for their tenant.
--    Buyers:  read-only (need business_name for catalog display).
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_select ON app.tenants
  FOR SELECT USING (id = app.jwt_tenant_id());

CREATE POLICY tenants_update ON app.tenants
  FOR UPDATE USING (app.is_seller_admin() AND id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND id = app.jwt_tenant_id());

-- No INSERT/DELETE from authenticated users — tenant creation happens via
-- SECURITY DEFINER signup RPC using service role.

-- ──────────────────────────────────────────────────────────
-- 2. app.tenant_users
--    seller_admin: full CRUD for their tenant's users
--    seller_assistant: SELECT only (needs to know team)
--    buyer roles: no access
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.tenant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_users_select ON app.tenant_users
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_users_insert ON app.tenant_users
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_users_update ON app.tenant_users
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_users_delete ON app.tenant_users
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

-- ──────────────────────────────────────────────────────────
-- 3. app.tenant_brands
--    Both seller roles: full CRUD for their tenant.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.tenant_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_brands_select ON app.tenant_brands
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_brands_insert ON app.tenant_brands
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_brands_update ON app.tenant_brands
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_brands_delete ON app.tenant_brands
  FOR DELETE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- ──────────────────────────────────────────────────────────
-- 4. app.locations
--    Both seller roles: full CRUD.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY locations_select ON app.locations
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY locations_insert ON app.locations
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY locations_update ON app.locations
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY locations_delete ON app.locations
  FOR DELETE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- ──────────────────────────────────────────────────────────
-- 5. app.tenant_products
--    Sellers: full CRUD. Buyers: SELECT only (for catalog browsing).
--    NOTE: cost_price column exposure to buyers is addressed via
--    a SECURITY DEFINER view (future story); for now buyers can read
--    the row but application code must never surface cost_price.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.tenant_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_products_seller_select ON app.tenant_products
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_products_buyer_select ON app.tenant_products
  FOR SELECT USING (app.is_buyer() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_products_insert ON app.tenant_products
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_products_update ON app.tenant_products
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_products_delete ON app.tenant_products
  FOR DELETE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- ──────────────────────────────────────────────────────────
-- 6. app.tenant_inventory
--    Sellers only — stock levels are commercially sensitive.
--    Buyers get inventory context through catalog display logic (RPC).
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.tenant_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_inventory_select ON app.tenant_inventory
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.tenant_products tp
      WHERE tp.id = tenant_product_id
        AND tp.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY tenant_inventory_insert ON app.tenant_inventory
  FOR INSERT WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.tenant_products tp
      WHERE tp.id = tenant_product_id
        AND tp.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY tenant_inventory_update ON app.tenant_inventory
  FOR UPDATE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.tenant_products tp
      WHERE tp.id = tenant_product_id
        AND tp.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY tenant_inventory_delete ON app.tenant_inventory
  FOR DELETE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.tenant_products tp
      WHERE tp.id = tenant_product_id
        AND tp.tenant_id = app.jwt_tenant_id()
    )
  );

-- ──────────────────────────────────────────────────────────
-- 7. app.buyers
--    Sellers: full CRUD for buyers in their tenant.
--    Buyer roles: SELECT their own buyer record only.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.buyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY buyers_seller_select ON app.buyers
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY buyers_buyer_select ON app.buyers
  FOR SELECT USING (app.is_buyer() AND id = app.jwt_buyer_id());

CREATE POLICY buyers_insert ON app.buyers
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY buyers_update ON app.buyers
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY buyers_delete ON app.buyers
  FOR DELETE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- ──────────────────────────────────────────────────────────
-- 8. app.buyer_users
--    Sellers: read all buyer_users in their tenant.
--    buyer_admin: manage users for their own buyer.
--    buyer_assistant: read their own record only.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.buyer_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY buyer_users_seller_select ON app.buyer_users
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.buyers b
      WHERE b.id = buyer_id AND b.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY buyer_users_buyer_select ON app.buyer_users
  FOR SELECT USING (
    app.is_buyer() AND buyer_id = app.jwt_buyer_id()
  );

CREATE POLICY buyer_users_buyer_admin_insert ON app.buyer_users
  FOR INSERT WITH CHECK (
    app.is_buyer_admin() AND buyer_id = app.jwt_buyer_id()
  );

CREATE POLICY buyer_users_buyer_admin_update ON app.buyer_users
  FOR UPDATE USING (
    app.is_buyer_admin() AND buyer_id = app.jwt_buyer_id()
  ) WITH CHECK (
    app.is_buyer_admin() AND buyer_id = app.jwt_buyer_id()
  );

CREATE POLICY buyer_users_buyer_admin_delete ON app.buyer_users
  FOR DELETE USING (
    app.is_buyer_admin() AND buyer_id = app.jwt_buyer_id()
  );

-- ──────────────────────────────────────────────────────────
-- 9. app.cohorts
--    seller_admin: full CRUD. seller_assistant: SELECT only.
--    Buyer roles: no access (cohort definitions are seller-internal).
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.cohorts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cohorts_seller_select ON app.cohorts
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY cohorts_seller_admin_insert ON app.cohorts
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY cohorts_seller_admin_update ON app.cohorts
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY cohorts_seller_admin_delete ON app.cohorts
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

-- ──────────────────────────────────────────────────────────
-- 10. app.cohort_members
--     seller_admin: full CRUD. seller_assistant: SELECT only.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.cohort_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY cohort_members_seller_select ON app.cohort_members
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.cohorts c
      WHERE c.id = cohort_id AND c.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY cohort_members_seller_admin_insert ON app.cohort_members
  FOR INSERT WITH CHECK (
    app.is_seller_admin() AND EXISTS (
      SELECT 1 FROM app.cohorts c
      WHERE c.id = cohort_id AND c.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY cohort_members_seller_admin_delete ON app.cohort_members
  FOR DELETE USING (
    app.is_seller_admin() AND EXISTS (
      SELECT 1 FROM app.cohorts c
      WHERE c.id = cohort_id AND c.tenant_id = app.jwt_tenant_id()
    )
  );

-- ──────────────────────────────────────────────────────────
-- 11. app.price_lists
--     seller_admin: full CRUD. seller_assistant: SELECT only.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.price_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY price_lists_seller_select ON app.price_lists
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY price_lists_seller_admin_insert ON app.price_lists
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY price_lists_seller_admin_update ON app.price_lists
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY price_lists_seller_admin_delete ON app.price_lists
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

-- ──────────────────────────────────────────────────────────
-- 12. app.price_list_items
--     seller_admin: full CRUD. seller_assistant: SELECT only.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.price_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY price_list_items_seller_select ON app.price_list_items
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.price_lists pl
      WHERE pl.id = price_list_id AND pl.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY price_list_items_seller_admin_insert ON app.price_list_items
  FOR INSERT WITH CHECK (
    app.is_seller_admin() AND EXISTS (
      SELECT 1 FROM app.price_lists pl
      WHERE pl.id = price_list_id AND pl.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY price_list_items_seller_admin_update ON app.price_list_items
  FOR UPDATE USING (
    app.is_seller_admin() AND EXISTS (
      SELECT 1 FROM app.price_lists pl
      WHERE pl.id = price_list_id AND pl.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY price_list_items_seller_admin_delete ON app.price_list_items
  FOR DELETE USING (
    app.is_seller_admin() AND EXISTS (
      SELECT 1 FROM app.price_lists pl
      WHERE pl.id = price_list_id AND pl.tenant_id = app.jwt_tenant_id()
    )
  );

-- ──────────────────────────────────────────────────────────
-- 13. app.price_list_assignments
--     seller_admin: full CRUD. seller_assistant: SELECT only.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.price_list_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY price_list_assignments_seller_select ON app.price_list_assignments
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.price_lists pl
      WHERE pl.id = price_list_id AND pl.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY price_list_assignments_seller_admin_insert ON app.price_list_assignments
  FOR INSERT WITH CHECK (
    app.is_seller_admin() AND EXISTS (
      SELECT 1 FROM app.price_lists pl
      WHERE pl.id = price_list_id AND pl.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY price_list_assignments_seller_admin_update ON app.price_list_assignments
  FOR UPDATE USING (
    app.is_seller_admin() AND EXISTS (
      SELECT 1 FROM app.price_lists pl
      WHERE pl.id = price_list_id AND pl.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY price_list_assignments_seller_admin_delete ON app.price_list_assignments
  FOR DELETE USING (
    app.is_seller_admin() AND EXISTS (
      SELECT 1 FROM app.price_lists pl
      WHERE pl.id = price_list_id AND pl.tenant_id = app.jwt_tenant_id()
    )
  );

-- ──────────────────────────────────────────────────────────
-- 14. app.published_catalogs
--     Sellers: full CRUD for their tenant.
--     Buyers: SELECT published catalogs in their tenant (scope
--             filtering—cohort/geography—is enforced at app layer via
--             SECURITY DEFINER RPC to avoid complex per-row subqueries).
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.published_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY published_catalogs_seller_select ON app.published_catalogs
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY published_catalogs_buyer_select ON app.published_catalogs
  FOR SELECT USING (
    app.is_buyer()
    AND tenant_id = app.jwt_tenant_id()
    AND status = 'published'
    AND (valid_to IS NULL OR valid_to > now())
  );

CREATE POLICY published_catalogs_seller_insert ON app.published_catalogs
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY published_catalogs_seller_update ON app.published_catalogs
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY published_catalogs_seller_delete ON app.published_catalogs
  FOR DELETE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- ──────────────────────────────────────────────────────────
-- 15. app.published_catalog_items
--     Sellers: full CRUD. Buyers: SELECT for published catalogs only.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.published_catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY published_catalog_items_seller_select ON app.published_catalog_items
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.published_catalogs pc
      WHERE pc.id = catalog_id AND pc.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY published_catalog_items_buyer_select ON app.published_catalog_items
  FOR SELECT USING (
    app.is_buyer() AND EXISTS (
      SELECT 1 FROM app.published_catalogs pc
      WHERE pc.id = catalog_id
        AND pc.tenant_id = app.jwt_tenant_id()
        AND pc.status = 'published'
        AND (pc.valid_to IS NULL OR pc.valid_to > now())
    )
  );

CREATE POLICY published_catalog_items_seller_insert ON app.published_catalog_items
  FOR INSERT WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.published_catalogs pc
      WHERE pc.id = catalog_id AND pc.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY published_catalog_items_seller_update ON app.published_catalog_items
  FOR UPDATE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.published_catalogs pc
      WHERE pc.id = catalog_id AND pc.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY published_catalog_items_seller_delete ON app.published_catalog_items
  FOR DELETE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.published_catalogs pc
      WHERE pc.id = catalog_id AND pc.tenant_id = app.jwt_tenant_id()
    )
  );

-- ──────────────────────────────────────────────────────────
-- 16. app.orders
--     Sellers: full CRUD for their tenant's orders.
--     Buyers: SELECT their own buyer's orders; INSERT (place orders).
--     buyer_admin: also UPDATE their own orders (approve, cancel).
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_seller_select ON app.orders
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY orders_buyer_select ON app.orders
  FOR SELECT USING (
    app.is_buyer()
    AND tenant_id = app.jwt_tenant_id()
    AND buyer_id = app.jwt_buyer_id()
  );

CREATE POLICY orders_seller_insert ON app.orders
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY orders_buyer_insert ON app.orders
  FOR INSERT WITH CHECK (
    app.is_buyer()
    AND tenant_id = app.jwt_tenant_id()
    AND buyer_id = app.jwt_buyer_id()
  );

CREATE POLICY orders_seller_update ON app.orders
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- buyer_admin can update own orders (approve pending, cancel draft)
CREATE POLICY orders_buyer_admin_update ON app.orders
  FOR UPDATE USING (
    app.is_buyer_admin()
    AND tenant_id = app.jwt_tenant_id()
    AND buyer_id = app.jwt_buyer_id()
  ) WITH CHECK (
    app.is_buyer_admin()
    AND tenant_id = app.jwt_tenant_id()
    AND buyer_id = app.jwt_buyer_id()
  );

CREATE POLICY orders_seller_delete ON app.orders
  FOR DELETE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- ──────────────────────────────────────────────────────────
-- 17. app.order_items
--     Follow parent order's access rules.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_items_seller_select ON app.order_items
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.orders o
      WHERE o.id = order_id AND o.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY order_items_buyer_select ON app.order_items
  FOR SELECT USING (
    app.is_buyer() AND EXISTS (
      SELECT 1 FROM app.orders o
      WHERE o.id = order_id
        AND o.tenant_id = app.jwt_tenant_id()
        AND o.buyer_id = app.jwt_buyer_id()
    )
  );

CREATE POLICY order_items_seller_insert ON app.order_items
  FOR INSERT WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.orders o
      WHERE o.id = order_id AND o.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY order_items_buyer_insert ON app.order_items
  FOR INSERT WITH CHECK (
    app.is_buyer() AND EXISTS (
      SELECT 1 FROM app.orders o
      WHERE o.id = order_id
        AND o.tenant_id = app.jwt_tenant_id()
        AND o.buyer_id = app.jwt_buyer_id()
    )
  );

CREATE POLICY order_items_seller_update ON app.order_items
  FOR UPDATE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.orders o
      WHERE o.id = order_id AND o.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY order_items_seller_delete ON app.order_items
  FOR DELETE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.orders o
      WHERE o.id = order_id AND o.tenant_id = app.jwt_tenant_id()
    )
  );

-- ──────────────────────────────────────────────────────────
-- 18. app.audit_log
--     Append-only via SECURITY DEFINER triggers/functions.
--     seller_admin: SELECT for their tenant. No direct writes.
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_seller_admin_select ON app.audit_log
  FOR SELECT USING (
    app.is_seller_admin() AND tenant_id = app.jwt_tenant_id()
  );

-- ──────────────────────────────────────────────────────────
-- catalog schema RLS (§6.2: is_public readable by all)
-- ──────────────────────────────────────────────────────────
ALTER TABLE catalog.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.product_aliases ENABLE ROW LEVEL SECURITY;

-- Public records readable by any authenticated user (catalog browsing)
CREATE POLICY catalog_brands_public_select ON catalog.brands
  FOR SELECT USING (
    is_public = true
    OR origin_tenant_id = app.jwt_tenant_id()
  );

CREATE POLICY catalog_categories_public_select ON catalog.categories
  FOR SELECT USING (is_public = true);

CREATE POLICY catalog_products_public_select ON catalog.products
  FOR SELECT USING (
    is_public = true
    OR EXISTS (
      SELECT 1 FROM catalog.brands b
      WHERE b.id = brand_id AND b.origin_tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY catalog_product_aliases_select ON catalog.product_aliases
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM catalog.products p
      WHERE p.id = product_id AND (
        p.is_public = true
        OR EXISTS (
          SELECT 1 FROM catalog.brands b
          WHERE b.id = p.brand_id AND b.origin_tenant_id = app.jwt_tenant_id()
        )
      )
    )
  );

-- Sellers can insert into catalog (contributing to master catalog)
CREATE POLICY catalog_brands_seller_insert ON catalog.brands
  FOR INSERT WITH CHECK (
    app.is_seller() AND origin_tenant_id = app.jwt_tenant_id()
  );

CREATE POLICY catalog_products_seller_insert ON catalog.products
  FOR INSERT WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM catalog.brands b
      WHERE b.id = brand_id AND b.origin_tenant_id = app.jwt_tenant_id()
    )
  );

-- Sellers can update their own catalog entries
CREATE POLICY catalog_brands_seller_update ON catalog.brands
  FOR UPDATE USING (
    app.is_seller_admin() AND origin_tenant_id = app.jwt_tenant_id()
  ) WITH CHECK (
    app.is_seller_admin() AND origin_tenant_id = app.jwt_tenant_id()
  );

CREATE POLICY catalog_products_seller_update ON catalog.products
  FOR UPDATE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM catalog.brands b
      WHERE b.id = brand_id AND b.origin_tenant_id = app.jwt_tenant_id()
    )
  );
