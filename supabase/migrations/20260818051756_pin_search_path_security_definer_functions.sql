-- Fix: 28 SECURITY DEFINER functions were missing a pinned search_path, letting a
-- lower-privileged role potentially shadow unqualified object references with
-- attacker-controlled objects earlier in its own search_path — classic Postgres
-- SECURITY DEFINER privilege-escalation. Pin all of them to the same conservative
-- allowlist already used elsewhere in this codebase (pg_catalog, app, catalog,
-- public) — DDL-only, no runtime/query-path cost.

ALTER FUNCTION "app"."evaluate_buyer_for_cohorts"("p_buyer_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."preview_cohort_count"("p_tenant_id" "uuid", "p_rules_json" "jsonb") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."price_list_archive"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_actor_user_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."price_list_duplicate"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_actor_user_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."price_list_extend_validity"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_valid_to" timestamp with time zone, "p_actor_user_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."price_list_update_item_price"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_item_id" "uuid", "p_list_price" numeric, "p_actor_user_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_compute_associations"("p_tenant_id" "uuid", "p_window_days" integer) SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_compute_category_associations"("p_tenant_id" "uuid", "p_window_days" integer) SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_compute_category_profiles"("p_tenant_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_compute_popularity"("p_tenant_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_get_bestsellers"("p_tenant_id" "uuid", "p_category_id" "uuid", "p_limit" integer) SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_get_brand_bestsellers"("p_tenant_id" "uuid", "p_brand_id" "uuid", "p_limit" integer) SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_get_cart_bundles"("p_tenant_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_get_category_roles"("p_tenant_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_get_home"("p_tenant_id" "uuid", "p_buyer_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_get_product_page"("p_tenant_id" "uuid", "p_tenant_product_id" "uuid", "p_buyer_id" "uuid", "p_widget_types" "text"[], "p_limit" integer) SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_refresh_buyer_profiles"("p_tenant_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_refresh_category_intelligence"() SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_run_all_associations"() SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_run_all_buyer_profiles"() SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_run_all_popularity"() SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."reco_suggest_bundles"("p_tenant_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."refresh_all_dynamic_cohorts"() SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."refresh_brand_categories"("p_brand_id" "uuid") SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."run_weekly_reco"() SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."trg_buyer_geography_changed"() SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."trg_order_buyer_cohort_refresh"() SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION "app"."trg_refresh_brand_categories_fn"() SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';
