-- Hardens the EXECUTE-grant surface on app schema SECURITY DEFINER functions.
--
-- Context: specs/supabase-advisors-performance-2026-08-18.md (Security Advisor
-- section) found 158 SECURITY DEFINER functions in `app` with EXECUTE granted to
-- anon/authenticated — meaning any client can call them directly via
-- /rest/v1/rpc/<name>, bypassing the Next.js app entirely. Investigation this
-- session (two parallel audits: one enumerating every granted function's body
-- and grant status live against this database, one grepping every real .rpc()
-- call site across the whole app + edge functions) found:
--
--   1. Of the 158, only 2 (confirm_order, record_buyer_app_activity) do their
--      own auth check internally. Everything else trusts a client-supplied
--      parameter (p_actor_user_id, p_tenant_id, p_buyer_id, p_user_id) or does
--      no check at all — including 4 functions (price_list_archive/duplicate/
--      extend_validity/update_item_price) that are real, frontend-driven entry
--      points with ZERO auth check of any kind, currently letting any
--      unauthenticated caller mutate or delete any tenant's price list.
--
--   2. Cross-referencing against every confirmed .rpc() call site in the app
--      found that 157 of the 158 granted functions are called ONLY from
--      server-side Next.js API routes / Supabase edge functions using the
--      service-role client (supabaseAdmin) — never from a browser/client
--      component with the anon or authenticated key. Verified directly:
--      `grep -rl supabaseBrowser ... | xargs grep -l '\.rpc('` across the whole
--      repo returns exactly two files (src/hooks/useResolvedPrice.ts,
--      src/hooks/usePriceLists.ts), both calling only `resolve_price`.
--
--   This means the correct, sufficient fix for 157 of the 158 functions is a
--   pure grant revocation — REVOKE anon/authenticated, GRANT service_role only
--   — with ZERO function body changes. The Next.js route handlers already
--   verify the caller's JWT (getVerifiedClaims) and derive tenant_id/actor
--   identity correctly before invoking these RPCs via the service-role client;
--   once direct PostgREST access is closed, the "trusts a client-supplied
--   parameter" pattern inside these functions is no longer reachable by an
--   external attacker, because only the app's own trusted backend (which
--   already validated the request) can call them at all. This is a much lower-
--   risk fix than rewriting business logic in ~35 live functions, and was
--   confirmed correct by grepping every call site, not assumed.
--
--   `resolve_price` is the sole exception — genuinely called from the browser
--   (both hooks use `supabaseBrowser`, the anon/authenticated-key client, with
--   no Next.js API layer in between) — so it must keep its grant AND get a
--   real fix inside the function body (see below).
--
-- Perf impact: none. Grant changes are pure catalog metadata, resolved once at
-- connection/role-check time, not re-evaluated per query. The one function body
-- change (resolve_price) adds a single IS DISTINCT FROM comparison against
-- app.jwt_buyer_id() (a cheap `auth.jwt() ->> 'buyer_id'` lookup, no extra
-- table read) — negligible against a function that already does 3-4 sequential
-- SELECTs.

-- ============================================================================
-- Grant revocations — 157 functions, REVOKE anon/authenticated, GRANT
-- service_role only. Zero body changes. Covers:
--   - 5 underscore-prefixed internal helpers (_estimate_assert_seller_admin/
--     _member, _next_estimate_number, _next_invoice_number, _next_order_number)
--   - 37 trigger-only functions (RETURNS trigger — not meaningfully callable
--     via RPC anyway, but the grant should not exist)
--   - ~72 cron/batch/recompute jobs (ensure_*_cron_scheduled, purge_*,
--     rebuild_*_for_tenant, refresh_*_daily/_snapshot, reco_compute_*/run_all_*,
--     metrics_v4_check_period_drift, run_zoho_orchestrator_cron, etc.)
--   - 14 real entry points funneling auth through 3 shared helpers that trust
--     p_actor_user_id (estimate_send/accept/decline/void/duplicate/
--     convert_to_order [4 overloads]/convert_to_invoice, acknowledge_sync_
--     suspension, cancel_tenant_integration_sync_job, retry_sync_phase) — the
--     oracle these created is now unreachable once direct RPC access is closed
--   - 4 zero-auth-check price_list_* mutation functions (the critical finding)
--   - 3 create_tenant_and_admin overloads (p_user_id trust / privilege
--     escalation risk) — now unreachable once direct RPC access is closed
--   - 21 cross-tenant read-leak functions (get_buyer_home_summary,
--     get_metrics_v2_customer_summary, warehouse_inventory_posture,
--     resolve_prices_batch, resolve_broadcast_audience_*, search_catalog_
--     buyers, search_cohort_buyers_detail, reco_get_*, preview_cohort_count,
--     dequeue_embeddings) — same reasoning, unreachable once closed
--   - confirm_order, record_buyer_app_activity — already self-check
--     internally, but nothing calls them via anon/authenticated either, so
--     revoked for consistency (no legitimate direct caller either way)
-- ============================================================================

REVOKE ALL ON FUNCTION app._estimate_assert_seller_admin(p_tenant_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app._estimate_assert_seller_admin(p_tenant_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app._estimate_assert_seller_member(p_tenant_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app._estimate_assert_seller_member(p_tenant_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app._next_estimate_number(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app._next_estimate_number(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app._next_invoice_number(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app._next_invoice_number(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app._next_order_number(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app._next_order_number(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.acknowledge_sync_suspension(p_tenant_integration_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.acknowledge_sync_suspension(p_tenant_integration_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.cancel_tenant_integration_sync_job(p_tenant_integration_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.cancel_tenant_integration_sync_job(p_tenant_integration_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.confirm_order(p_order_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.confirm_order(p_order_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.create_tenant_and_admin(p_user_id uuid, p_slug text, p_business_name text, p_business_phone text, p_business_email text, p_whatsapp_phone text, p_primary_state text, p_gstin text, p_initial_settings jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.create_tenant_and_admin(p_user_id uuid, p_slug text, p_business_name text, p_business_phone text, p_business_email text, p_whatsapp_phone text, p_primary_state text, p_gstin text, p_initial_settings jsonb) TO service_role;
REVOKE ALL ON FUNCTION app.create_tenant_and_admin(p_user_id uuid, p_slug text, p_business_name text, p_business_phone text, p_business_email text, p_whatsapp_phone text, p_primary_state text, p_gstin text, p_initial_settings jsonb, p_user_email text, p_user_phone text, p_user_full_name text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.create_tenant_and_admin(p_user_id uuid, p_slug text, p_business_name text, p_business_phone text, p_business_email text, p_whatsapp_phone text, p_primary_state text, p_gstin text, p_initial_settings jsonb, p_user_email text, p_user_phone text, p_user_full_name text) TO service_role;
REVOKE ALL ON FUNCTION app.create_tenant_and_admin(p_user_id uuid, p_slug text, p_business_name text, p_business_phone text, p_business_email text, p_whatsapp_phone text, p_primary_state text, p_gstin text, p_initial_settings jsonb, p_user_email text, p_user_phone text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.create_tenant_and_admin(p_user_id uuid, p_slug text, p_business_name text, p_business_phone text, p_business_email text, p_whatsapp_phone text, p_primary_state text, p_gstin text, p_initial_settings jsonb, p_user_email text, p_user_phone text) TO service_role;
REVOKE ALL ON FUNCTION app.dequeue_embeddings(p_batch_size integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.dequeue_embeddings(p_batch_size integer) TO service_role;
REVOKE ALL ON FUNCTION app.dispatch_from_buyer_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.dispatch_from_buyer_users() TO service_role;
REVOKE ALL ON FUNCTION app.dispatch_from_buyers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.dispatch_from_buyers() TO service_role;
REVOKE ALL ON FUNCTION app.dispatch_from_estimates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.dispatch_from_estimates() TO service_role;
REVOKE ALL ON FUNCTION app.dispatch_from_inventory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.dispatch_from_inventory() TO service_role;
REVOKE ALL ON FUNCTION app.dispatch_from_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.dispatch_from_invoices() TO service_role;
REVOKE ALL ON FUNCTION app.dispatch_from_order_items() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.dispatch_from_order_items() TO service_role;
REVOKE ALL ON FUNCTION app.dispatch_from_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.dispatch_from_orders() TO service_role;
REVOKE ALL ON FUNCTION app.dispatch_from_tenant_brands() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.dispatch_from_tenant_brands() TO service_role;
REVOKE ALL ON FUNCTION app.dispatch_from_tenant_products() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.dispatch_from_tenant_products() TO service_role;
REVOKE ALL ON FUNCTION app.emit_realtime_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.emit_realtime_notification() TO service_role;
REVOKE ALL ON FUNCTION app.ensure_buyer_metric_snapshot_cron_scheduled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.ensure_buyer_metric_snapshot_cron_scheduled() TO service_role;
REVOKE ALL ON FUNCTION app.ensure_metrics_prune_history_cron_scheduled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.ensure_metrics_prune_history_cron_scheduled() TO service_role;
REVOKE ALL ON FUNCTION app.ensure_metrics_prune_landing_cron_scheduled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.ensure_metrics_prune_landing_cron_scheduled() TO service_role;
REVOKE ALL ON FUNCTION app.ensure_metrics_refresh_tick_cron_scheduled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.ensure_metrics_refresh_tick_cron_scheduled() TO service_role;
REVOKE ALL ON FUNCTION app.ensure_metrics_v4_drift_check_cron_scheduled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.ensure_metrics_v4_drift_check_cron_scheduled() TO service_role;
REVOKE ALL ON FUNCTION app.ensure_whatsapp_allowance_reset_cron_scheduled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.ensure_whatsapp_allowance_reset_cron_scheduled() TO service_role;
REVOKE ALL ON FUNCTION app.estimate_accept(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.estimate_accept(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.estimate_convert_to_invoice(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid, p_line_ids uuid[], p_invoice_date date, p_invoice_number_override text, p_qty_overrides jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.estimate_convert_to_invoice(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid, p_line_ids uuid[], p_invoice_date date, p_invoice_number_override text, p_qty_overrides jsonb) TO service_role;
REVOKE ALL ON FUNCTION app.estimate_convert_to_order(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid, p_line_ids uuid[], p_expected_delivery date, p_order_number_override text, p_qty_overrides jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.estimate_convert_to_order(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid, p_line_ids uuid[], p_expected_delivery date, p_order_number_override text, p_qty_overrides jsonb) TO service_role;
REVOKE ALL ON FUNCTION app.estimate_convert_to_order(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid, p_line_ids uuid[], p_expected_delivery date, p_order_number_override text, p_qty_overrides jsonb, p_order_date date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.estimate_convert_to_order(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid, p_line_ids uuid[], p_expected_delivery date, p_order_number_override text, p_qty_overrides jsonb, p_order_date date) TO service_role;
REVOKE ALL ON FUNCTION app.estimate_convert_to_order(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid, p_line_ids uuid[], p_expected_delivery date, p_order_number_override text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.estimate_convert_to_order(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid, p_line_ids uuid[], p_expected_delivery date, p_order_number_override text) TO service_role;
REVOKE ALL ON FUNCTION app.estimate_convert_to_order(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.estimate_convert_to_order(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.estimate_decline(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.estimate_decline(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.estimate_duplicate(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.estimate_duplicate(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.estimate_send(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.estimate_send(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.estimate_void(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.estimate_void(p_tenant_id uuid, p_estimate_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.evaluate_buyer_for_cohorts(p_buyer_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.evaluate_buyer_for_cohorts(p_buyer_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.evaluate_product_for_campaigns(p_tenant_product_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.evaluate_product_for_campaigns(p_tenant_product_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.evaluate_product_for_price_lists(p_tenant_product_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.evaluate_product_for_price_lists(p_tenant_product_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.get_buyer_home_summary(p_tenant_id uuid, p_buyer_id uuid, p_as_of timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_buyer_home_summary(p_tenant_id uuid, p_buyer_id uuid, p_as_of timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION app.get_metrics_v2_customer_summary(p_tenant_id uuid, p_location_ids uuid[], p_as_of timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_metrics_v2_customer_summary(p_tenant_id uuid, p_location_ids uuid[], p_as_of timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION app.grant_initial_whatsapp_allowance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.grant_initial_whatsapp_allowance() TO service_role;
REVOKE ALL ON FUNCTION app.metrics_capture_buyer_app_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.metrics_capture_buyer_app_activity() TO service_role;
REVOKE ALL ON FUNCTION app.metrics_mark_daily_reconciliation(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.metrics_mark_daily_reconciliation(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.metrics_v2_run_daily_reconciliation_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.metrics_v2_run_daily_reconciliation_sweep() TO service_role;
REVOKE ALL ON FUNCTION app.metrics_v4_check_period_drift(p_tenant_id uuid, p_as_of timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.metrics_v4_check_period_drift(p_tenant_id uuid, p_as_of timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION app.post_sync_rebuild(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.post_sync_rebuild(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.preview_cohort_count(p_tenant_id uuid, p_rules_json jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.preview_cohort_count(p_tenant_id uuid, p_rules_json jsonb) TO service_role;
REVOKE ALL ON FUNCTION app.price_list_archive(p_tenant_id uuid, p_price_list_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.price_list_archive(p_tenant_id uuid, p_price_list_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.price_list_duplicate(p_tenant_id uuid, p_price_list_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.price_list_duplicate(p_tenant_id uuid, p_price_list_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.price_list_extend_validity(p_tenant_id uuid, p_price_list_id uuid, p_valid_to timestamp with time zone, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.price_list_extend_validity(p_tenant_id uuid, p_price_list_id uuid, p_valid_to timestamp with time zone, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.price_list_update_item_price(p_tenant_id uuid, p_price_list_id uuid, p_item_id uuid, p_list_price numeric, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.price_list_update_item_price(p_tenant_id uuid, p_price_list_id uuid, p_item_id uuid, p_list_price numeric, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.prune_kpi_daily_old_rows(p_retention_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.prune_kpi_daily_old_rows(p_retention_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.purge_integration_analytics_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.purge_integration_analytics_events() TO service_role;
REVOKE ALL ON FUNCTION app.purge_integration_webhook_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.purge_integration_webhook_events() TO service_role;
REVOKE ALL ON FUNCTION app.purge_metrics_dirty_work() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.purge_metrics_dirty_work() TO service_role;
REVOKE ALL ON FUNCTION app.purge_net_http_response() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.purge_net_http_response() TO service_role;
REVOKE ALL ON FUNCTION app.purge_otp_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.purge_otp_sessions() TO service_role;
REVOKE ALL ON FUNCTION app.purge_supabase_hooks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.purge_supabase_hooks() TO service_role;
REVOKE ALL ON FUNCTION app.rebuild_buyer_app_activity_for_tenant(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_buyer_app_activity_for_tenant(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.rebuild_buyer_app_daily_for_tenant(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_buyer_app_daily_for_tenant(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.rebuild_kpi_brand_daily_for_tenant(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_kpi_brand_daily_for_tenant(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.rebuild_kpi_category_daily_for_tenant(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_kpi_category_daily_for_tenant(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.rebuild_kpi_estimates_daily_for_tenant(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_kpi_estimates_daily_for_tenant(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.rebuild_kpi_invoices_daily_for_tenant(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_kpi_invoices_daily_for_tenant(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.rebuild_kpi_location_daily_for_tenant(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_kpi_location_daily_for_tenant(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.rebuild_kpi_orders_daily_for_tenant(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_kpi_orders_daily_for_tenant(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.rebuild_kpi_product_daily_for_tenant(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_kpi_product_daily_for_tenant(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.rebuild_kpi_tenant_daily_for_tenant(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_kpi_tenant_daily_for_tenant(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.rebuild_kpi_warehouse_daily_for_tenant(p_tenant_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_kpi_warehouse_daily_for_tenant(p_tenant_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.reco_compute_associations(p_tenant_id uuid, p_window_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_compute_associations(p_tenant_id uuid, p_window_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.reco_compute_category_associations(p_tenant_id uuid, p_window_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_compute_category_associations(p_tenant_id uuid, p_window_days integer) TO service_role;
REVOKE ALL ON FUNCTION app.reco_compute_category_profiles(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_compute_category_profiles(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.reco_compute_popularity(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_compute_popularity(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.reco_get_bestsellers(p_tenant_id uuid, p_category_id uuid, p_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_get_bestsellers(p_tenant_id uuid, p_category_id uuid, p_limit integer) TO service_role;
REVOKE ALL ON FUNCTION app.reco_get_brand_bestsellers(p_tenant_id uuid, p_brand_id uuid, p_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_get_brand_bestsellers(p_tenant_id uuid, p_brand_id uuid, p_limit integer) TO service_role;
REVOKE ALL ON FUNCTION app.reco_get_cart_bundles(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_get_cart_bundles(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.reco_get_category_roles(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_get_category_roles(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.reco_get_home(p_tenant_id uuid, p_buyer_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_get_home(p_tenant_id uuid, p_buyer_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.reco_get_product_page(p_tenant_id uuid, p_tenant_product_id uuid, p_buyer_id uuid, p_widget_types text[], p_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_get_product_page(p_tenant_id uuid, p_tenant_product_id uuid, p_buyer_id uuid, p_widget_types text[], p_limit integer) TO service_role;
REVOKE ALL ON FUNCTION app.reco_refresh_buyer_profiles(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_refresh_buyer_profiles(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.reco_refresh_category_intelligence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_refresh_category_intelligence() TO service_role;
REVOKE ALL ON FUNCTION app.reco_run_all_associations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_run_all_associations() TO service_role;
REVOKE ALL ON FUNCTION app.reco_run_all_buyer_profiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_run_all_buyer_profiles() TO service_role;
REVOKE ALL ON FUNCTION app.reco_run_all_popularity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_run_all_popularity() TO service_role;
REVOKE ALL ON FUNCTION app.reco_suggest_bundles(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.reco_suggest_bundles(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.record_buyer_app_activity(p_tenant_id uuid, p_buyer_id uuid, p_event_name text, p_occurred_at timestamp with time zone, p_location_id uuid, p_metadata jsonb, p_idempotency_key text, p_qualifies_for_engagement boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.record_buyer_app_activity(p_tenant_id uuid, p_buyer_id uuid, p_event_name text, p_occurred_at timestamp with time zone, p_location_id uuid, p_metadata jsonb, p_idempotency_key text, p_qualifies_for_engagement boolean) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_all_dynamic_campaigns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_all_dynamic_campaigns() TO service_role;
REVOKE ALL ON FUNCTION app.refresh_all_dynamic_cohorts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_all_dynamic_cohorts() TO service_role;
REVOKE ALL ON FUNCTION app.refresh_all_dynamic_price_lists() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_all_dynamic_price_lists() TO service_role;
REVOKE ALL ON FUNCTION app.refresh_all_warehouses_snapshots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_all_warehouses_snapshots() TO service_role;
REVOKE ALL ON FUNCTION app.refresh_brand_categories(p_brand_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_brand_categories(p_brand_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_brand_embedding(p_brand_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_brand_embedding(p_brand_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_brands_snapshot(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_brands_snapshot(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_buyer_app_daily(p_tenant_id uuid, p_date date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_buyer_app_daily(p_tenant_id uuid, p_date date) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_buyer_app_snapshot(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_buyer_app_snapshot(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_categories_snapshot(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_categories_snapshot(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_estimates_snapshot(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_estimates_snapshot(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_invoices_snapshot(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_invoices_snapshot(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_kpi_brand_daily(p_tenant_id uuid, p_brand_id uuid, p_day date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_kpi_brand_daily(p_tenant_id uuid, p_brand_id uuid, p_day date) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_kpi_category_daily(p_tenant_id uuid, p_category_id uuid, p_day date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_kpi_category_daily(p_tenant_id uuid, p_category_id uuid, p_day date) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_kpi_estimates_daily(p_tenant_id uuid, p_day date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_kpi_estimates_daily(p_tenant_id uuid, p_day date) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_kpi_invoices_daily(p_tenant_id uuid, p_day date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_kpi_invoices_daily(p_tenant_id uuid, p_day date) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_kpi_location_daily(p_tenant_id uuid, p_location_id uuid, p_day date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_kpi_location_daily(p_tenant_id uuid, p_location_id uuid, p_day date) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_kpi_orders_daily(p_tenant_id uuid, p_day date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_kpi_orders_daily(p_tenant_id uuid, p_day date) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_kpi_product_daily(p_tenant_id uuid, p_tenant_product_id uuid, p_day date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_kpi_product_daily(p_tenant_id uuid, p_tenant_product_id uuid, p_day date) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_kpi_tenant_daily(p_tenant_id uuid, p_day date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_kpi_tenant_daily(p_tenant_id uuid, p_day date) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_kpi_warehouse_daily(p_tenant_id uuid, p_warehouse_id uuid, p_day date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_kpi_warehouse_daily(p_tenant_id uuid, p_warehouse_id uuid, p_day date) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_locations_snapshot(p_location_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_locations_snapshot(p_location_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_orders_snapshot(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_orders_snapshot(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_products_snapshot(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_products_snapshot(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.refresh_warehouses_snapshot(p_warehouse_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_warehouses_snapshot(p_warehouse_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_all(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_all(p_tenant_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_buyer_selection(p_tenant_id uuid, p_buyer_ids uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_buyer_selection(p_tenant_id uuid, p_buyer_ids uuid[]) TO service_role;
REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_cohort(p_tenant_id uuid, p_cohort_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_cohort(p_tenant_id uuid, p_cohort_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_dormant(p_tenant_id uuid, p_filter jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_dormant(p_tenant_id uuid, p_filter jsonb) TO service_role;
REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_dues(p_tenant_id uuid, p_filter jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_dues(p_tenant_id uuid, p_filter jsonb) TO service_role;
REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_geography(p_tenant_id uuid, p_filter jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_geography(p_tenant_id uuid, p_filter jsonb) TO service_role;
REVOKE ALL ON FUNCTION app.resolve_prices_batch(p_tenant_product_ids uuid[], p_buyer_id uuid, p_qty numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.resolve_prices_batch(p_tenant_product_ids uuid[], p_buyer_id uuid, p_qty numeric) TO service_role;
REVOKE ALL ON FUNCTION app.retry_post_sync_rebuild_for_sync_job(p_job_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.retry_post_sync_rebuild_for_sync_job(p_job_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.retry_sync_phase(p_job_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.retry_sync_phase(p_job_id uuid, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.run_storage_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.run_storage_maintenance() TO service_role;
REVOKE ALL ON FUNCTION app.run_weekly_reco() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.run_weekly_reco() TO service_role;
REVOKE ALL ON FUNCTION app.run_zoho_orchestrator_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.run_zoho_orchestrator_cron() TO service_role;
REVOKE ALL ON FUNCTION app.search_catalog_buyers(p_tenant_id uuid, p_catalog_id uuid, p_query text, p_member text, p_status text[], p_invoice_this_quarter text[], p_demand_this_quarter text[], p_buyer_app text[], p_sort text, p_limit integer, p_offset integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.search_catalog_buyers(p_tenant_id uuid, p_catalog_id uuid, p_query text, p_member text, p_status text[], p_invoice_this_quarter text[], p_demand_this_quarter text[], p_buyer_app text[], p_sort text, p_limit integer, p_offset integer) TO service_role;
REVOKE ALL ON FUNCTION app.search_cohort_buyers_detail(p_tenant_id uuid, p_cohort_id uuid, p_query text, p_member text, p_invoice_this_quarter text[], p_demand_this_quarter text[], p_buyer_app text[], p_sort text, p_limit integer, p_offset integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.search_cohort_buyers_detail(p_tenant_id uuid, p_cohort_id uuid, p_query text, p_member text, p_invoice_this_quarter text[], p_demand_this_quarter text[], p_buyer_app text[], p_sort text, p_limit integer, p_offset integer) TO service_role;
REVOKE ALL ON FUNCTION app.seed_system_field_mappings(p_tenant_integration_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.seed_system_field_mappings(p_tenant_integration_id uuid) TO service_role;
REVOKE ALL ON FUNCTION app.trg_buyer_geography_changed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_buyer_geography_changed() TO service_role;
REVOKE ALL ON FUNCTION app.trg_estimates_refresh_buyer_app_daily() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_estimates_refresh_buyer_app_daily() TO service_role;
REVOKE ALL ON FUNCTION app.trg_inventory_campaign_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_inventory_campaign_refresh() TO service_role;
REVOKE ALL ON FUNCTION app.trg_invoices_refresh_buyer_app_daily() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_invoices_refresh_buyer_app_daily() TO service_role;
REVOKE ALL ON FUNCTION app.trg_membership_brand_products_dirty() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_membership_brand_products_dirty() TO service_role;
REVOKE ALL ON FUNCTION app.trg_membership_buyer_candidate_dirty() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_membership_buyer_candidate_dirty() TO service_role;
REVOKE ALL ON FUNCTION app.trg_membership_category_products_dirty() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_membership_category_products_dirty() TO service_role;
REVOKE ALL ON FUNCTION app.trg_membership_document_item_product_dirty() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_membership_document_item_product_dirty() TO service_role;
REVOKE ALL ON FUNCTION app.trg_membership_inventory_product_dirty() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_membership_inventory_product_dirty() TO service_role;
REVOKE ALL ON FUNCTION app.trg_membership_order_buyer_dirty() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_membership_order_buyer_dirty() TO service_role;
REVOKE ALL ON FUNCTION app.trg_membership_product_candidate_dirty() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_membership_product_candidate_dirty() TO service_role;
REVOKE ALL ON FUNCTION app.trg_membership_target_dirty() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_membership_target_dirty() TO service_role;
REVOKE ALL ON FUNCTION app.trg_metrics_v2_post_sync_reconciliation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_metrics_v2_post_sync_reconciliation() TO service_role;
REVOKE ALL ON FUNCTION app.trg_order_buyer_cohort_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_order_buyer_cohort_refresh() TO service_role;
REVOKE ALL ON FUNCTION app.trg_orders_refresh_buyer_app_daily() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_orders_refresh_buyer_app_daily() TO service_role;
REVOKE ALL ON FUNCTION app.trg_refresh_brand_categories_fn() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_refresh_brand_categories_fn() TO service_role;
REVOKE ALL ON FUNCTION app.trg_refresh_buyer_app_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_refresh_buyer_app_snapshot() TO service_role;
REVOKE ALL ON FUNCTION app.trg_refresh_categories_snapshot_from_inventory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_refresh_categories_snapshot_from_inventory() TO service_role;
REVOKE ALL ON FUNCTION app.trg_refresh_categories_snapshot_from_products() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_refresh_categories_snapshot_from_products() TO service_role;
REVOKE ALL ON FUNCTION app.trg_refresh_estimates_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_refresh_estimates_snapshot() TO service_role;
REVOKE ALL ON FUNCTION app.trg_refresh_invoices_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_refresh_invoices_snapshot() TO service_role;
REVOKE ALL ON FUNCTION app.trg_refresh_kpi_category_from_order_items() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_refresh_kpi_category_from_order_items() TO service_role;
REVOKE ALL ON FUNCTION app.trg_refresh_kpi_location_daily() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_refresh_kpi_location_daily() TO service_role;
REVOKE ALL ON FUNCTION app.trg_refresh_locations_snapshot_from_inventory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_refresh_locations_snapshot_from_inventory() TO service_role;
REVOKE ALL ON FUNCTION app.trg_refresh_locations_snapshot_from_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_refresh_locations_snapshot_from_invoices() TO service_role;
REVOKE ALL ON FUNCTION app.trg_refresh_products_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_refresh_products_snapshot() TO service_role;
REVOKE ALL ON FUNCTION app.trg_tenant_integrations_seed_field_mappings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.trg_tenant_integrations_seed_field_mappings() TO service_role;
REVOKE ALL ON FUNCTION app.warehouse_inventory_posture(p_warehouse_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.warehouse_inventory_posture(p_warehouse_id uuid) TO service_role;

-- ============================================================================
-- run_zoho_orchestrator_cron: also missing SET search_path entirely (confirmed
-- via pg_get_functiondef / proconfig — proconfig was NULL), missed by the
-- earlier 20260818051756_pin_search_path_security_definer_functions.sql
-- migration. Same allowlist convention as that migration's other 28 functions.
-- ============================================================================

ALTER FUNCTION app.run_zoho_orchestrator_cron() SET "search_path" TO 'pg_catalog', 'app', 'catalog', 'public';

-- ============================================================================
-- resolve_price: the sole function that must keep its anon/authenticated
-- grant (genuinely called from the browser via supabaseBrowser in
-- src/hooks/useResolvedPrice.ts and src/hooks/usePriceLists.ts, with no
-- Next.js API layer in between). Confirmed leak: p_buyer_id was accepted with
-- no ownership check, so any caller could pass an arbitrary buyer_id and read
-- that buyer's negotiated price (a pricing-tier oracle).
--
-- Fix has two legitimate caller shapes, not one — checked src/hooks/
-- usePriceLists.ts's useResolvePrice before assuming a single "buyer resolves
-- their own price" pattern, and found it's also used by
-- src/components/seller/pricing/ResolvedPriceLookupCard.tsx, a SELLER-facing
-- price-lookup tool where a seller_admin/seller_assistant legitimately queries
-- the resolved price for an arbitrary buyer of their own tenant (e.g. "what
-- would buyer X pay for product Y"). A check that only allowed
-- p_buyer_id = app.jwt_buyer_id() would have broken that real feature.
--
-- So: allow when EITHER (a) the caller is an authenticated buyer resolving
-- their own price (app.jwt_buyer_id() = p_buyer_id), OR (b) the caller is a
-- seller and p_buyer_id belongs to that seller's own tenant (app.buyers row
-- exists with tenant_id = app.jwt_tenant_id()). Any other case (anon with no
-- buyer/seller claim passing an arbitrary buyer_id, or a buyer/seller from an
-- unrelated tenant) is rejected. A NULL p_buyer_id is still allowed through
-- unchanged in all cases, preserving the existing guest/no-buyer-context
-- fallback path that already resolves to base_selling_price at the end of
-- this function — required for the tokenized buyer-catalog flow where a guest
-- browses before a buyer_id is established. The rest of the function body is
-- byte-for-byte identical to the current version (confirmed via
-- pg_get_functiondef before writing this replacement).
-- ============================================================================

CREATE OR REPLACE FUNCTION app.resolve_price(p_tenant_product_id uuid, p_buyer_id uuid, p_qty numeric DEFAULT 1)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'catalog', 'public'
AS $function$
DECLARE
  v_price numeric;
BEGIN
  IF p_buyer_id IS NOT NULL THEN
    IF app.jwt_buyer_id() IS NOT NULL THEN
      IF p_buyer_id IS DISTINCT FROM app.jwt_buyer_id() THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
      END IF;
    ELSIF app.jwt_role() LIKE 'seller_%' THEN
      IF NOT EXISTS (
        SELECT 1 FROM app.buyers b
        WHERE b.id = p_buyer_id AND b.tenant_id = app.jwt_tenant_id() AND b.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.deleted_at IS NULL
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'buyer'
    AND pla.target_id = p_buyer_id
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  JOIN app.cohort_members cm ON cm.cohort_id = pla.target_id AND cm.valid_until IS NULL
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.deleted_at IS NULL
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'cohort'
    AND cm.buyer_id = p_buyer_id
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.deleted_at IS NULL
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'all_buyers'
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT base_selling_price INTO v_price
  FROM app.tenant_products
  WHERE id = p_tenant_product_id;

  RETURN v_price;
END;
$function$;

REVOKE ALL ON FUNCTION app.resolve_price(p_tenant_product_id uuid, p_buyer_id uuid, p_qty numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_price(p_tenant_product_id uuid, p_buyer_id uuid, p_qty numeric) TO anon, authenticated, service_role;
