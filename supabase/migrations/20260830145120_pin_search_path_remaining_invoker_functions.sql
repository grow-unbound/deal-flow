-- Closes the remaining function_search_path_mutable advisor findings.
-- All 41 are confirmed SECURITY INVOKER (verified via pg_proc.prosecdef)
-- -- lower risk than the SECURITY DEFINER class already pinned in
-- 20260818051756_pin_search_path_security_definer_functions.sql, but
-- worth closing for lint cleanliness and defense-in-depth, and for
-- parity with yukti-prod (this same statement set applied there too,
-- applied directly since that project isn't CLI-linked in this repo).
-- Same allowlist as the earlier DEFINER-pinning migration, plus
-- 'extensions' since the pg_trgm/vector move earlier today means some
-- of these could otherwise resolve types/operators from the wrong place.
ALTER FUNCTION app.derive_buyer_app_status(p_is_active boolean, p_buyer_app_enabled boolean) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.derive_gmv_90d_bucket(p_gmv numeric) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.derive_last_order_bucket(p_last_order_at timestamp with time zone) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.derive_sales_90d_level(p_gmv numeric) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.derive_stock_status_bucket(p_qty_available numeric, p_reorder_point numeric, p_is_new_today boolean) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.estimate_status_counts_as_demand(p_status text) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.estimate_status_is_open(p_status text) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.get_location_period_buyers(p_tenant_id uuid, p_location_id uuid, p_period_start date, p_period_end_exclusive date) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.invoice_is_overdue(p_status text, p_due_date timestamp with time zone, p_outstanding_balance numeric) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.invoice_status_gmv_included(p_status text) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.invoice_status_has_receivable(p_status text, p_outstanding_balance numeric) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.invoice_status_in_flow(p_status text) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.is_buyer() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.is_buyer_admin() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.is_platform_admin() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.is_seller() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.is_seller_admin() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.jwt_buyer_id() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.jwt_role() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.jwt_tenant_id() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.metric_day_ist(p_explicit_date date, p_created_at timestamp with time zone) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.order_status_in_flow(p_status text) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.order_status_is_downstream_quality(p_status text) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.order_status_is_open(p_status text) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.product_is_new_stock_today(p_tenant_product_id uuid) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.set_is_buyer_app_estimate() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.set_is_buyer_app_invoice() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.set_is_buyer_app_order() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.set_updated_at() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.sync_job_rebuild_days(p_job_type text, p_since_date timestamp with time zone, p_default_days integer) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.tenant_category_embedding_queue() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.tenant_product_brand_embedding_queue() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.tenant_products_embedding_queue() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.touch_updated_at() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.trg_refresh_kpi_from_orders() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION catalog.brands_embedding_queue() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION catalog.categories_embedding_queue() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION catalog.product_embedding_queue() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION catalog.products_embedding_queue() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION catalog.products_search_doc_update() SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';

-- Present only on the old (yukti) project -- an unrelated POC function/
-- table (public.poc_candidates) never part of the app/catalog migration
-- scope, so it doesn't exist on yukti-prod. Guarded so this file stays
-- copy-pasteable without erroring if it's ever run somewhere it's absent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='poc_match_candidates'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.poc_match_candidates(query_embedding extensions.vector, match_count integer) SET search_path TO ''pg_catalog'', ''app'', ''catalog'', ''public'', ''extensions''';
  END IF;
END $$;
