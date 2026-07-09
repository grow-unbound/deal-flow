-- Phase 1 Recommendation Engine: Pre-computed tables
-- Signal weights: invoice×2 (true conversion) + order×1 (confirmed intent) + estimate×0.5 (demand signal, if not invoiced)

-- ── app.reco_product_associations ─────────────────────────────────────────────
-- Pre-computed co-purchase pairs (directional — A→B and B→A stored separately).
CREATE TABLE IF NOT EXISTS app.reco_product_associations (
  id                  bigserial PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  product_a_id        uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE CASCADE,
  product_b_id        uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE CASCADE,
  association_type    text NOT NULL CHECK (association_type IN ('co_order', 'co_buyer')),
  -- co_order: products appearing in the same invoice/order/estimate event (weighted)
  -- co_buyer: same buyer purchased A and B across different events (cross-session)
  co_occurrence_count int NOT NULL DEFAULT 0,
  lift_score          numeric(10,6),
  confidence          numeric(10,6),
  time_window_days    int NOT NULL,
  computed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_a_id, product_b_id, association_type, time_window_days)
);

CREATE INDEX IF NOT EXISTS idx_reco_assoc_lookup
  ON app.reco_product_associations (tenant_id, product_a_id, association_type, time_window_days);
CREATE INDEX IF NOT EXISTS idx_reco_assoc_product_b
  ON app.reco_product_associations (tenant_id, product_b_id);

ALTER TABLE app.reco_product_associations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reco_assoc_service_write ON app.reco_product_associations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reco_assoc_tenant_read ON app.reco_product_associations
  FOR SELECT USING (app.jwt_tenant_id() = tenant_id);

-- ── app.reco_product_popularity ───────────────────────────────────────────────
-- One row per product per tenant. Recomputed daily.
-- category_rank_30d ranked by weighted_score_30d within tenant_category_id.
CREATE TABLE IF NOT EXISTS app.reco_product_popularity (
  tenant_id               uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  tenant_product_id       uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE CASCADE,
  -- Raw counts per source (for diagnostics)
  invoice_count_30d       int NOT NULL DEFAULT 0,
  order_count_30d         int NOT NULL DEFAULT 0,
  estimate_count_30d      int NOT NULL DEFAULT 0,
  -- Weighted score: invoice×2 + order×1 + estimate×0.5
  weighted_score_30d      numeric(10,2) NOT NULL DEFAULT 0,
  -- Extended windows (orders only, for trend signals)
  order_count_7d          int NOT NULL DEFAULT 0,
  order_count_90d         int NOT NULL DEFAULT 0,
  revenue_30d             numeric(14,2) NOT NULL DEFAULT 0,
  unique_buyer_count_30d  int NOT NULL DEFAULT 0,
  repeat_buyer_count_30d  int NOT NULL DEFAULT 0,
  category_rank_30d       int,
  computed_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tenant_product_id)
);

CREATE INDEX IF NOT EXISTS idx_reco_popularity_category_rank
  ON app.reco_product_popularity (tenant_id, category_rank_30d)
  WHERE weighted_score_30d > 0;
CREATE INDEX IF NOT EXISTS idx_reco_popularity_trending
  ON app.reco_product_popularity (tenant_id, weighted_score_30d DESC)
  WHERE weighted_score_30d > 0;

ALTER TABLE app.reco_product_popularity ENABLE ROW LEVEL SECURITY;
CREATE POLICY reco_popularity_service_write ON app.reco_product_popularity
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reco_popularity_tenant_read ON app.reco_product_popularity
  FOR SELECT USING (app.jwt_tenant_id() = tenant_id);

-- ── app.reco_buyer_profiles ───────────────────────────────────────────────────
-- Per-buyer purchase summary. Drives "Buy Again". Refreshed weekly.
-- top_products: [{product_id, weighted_count, last_ordered_at, product_name}]
-- top_categories: [{category_id, weighted_count, last_ordered_at}]
CREATE TABLE IF NOT EXISTS app.reco_buyer_profiles (
  tenant_id       uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  buyer_id        uuid NOT NULL REFERENCES app.buyers(id) ON DELETE CASCADE,
  top_products    jsonb NOT NULL DEFAULT '[]',
  top_categories  jsonb NOT NULL DEFAULT '[]',
  refreshed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_reco_buyer_profiles_refreshed
  ON app.reco_buyer_profiles (tenant_id, refreshed_at);

ALTER TABLE app.reco_buyer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY reco_buyer_profiles_service_write ON app.reco_buyer_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reco_buyer_profiles_tenant_read ON app.reco_buyer_profiles
  FOR SELECT USING (app.jwt_tenant_id() = tenant_id);
