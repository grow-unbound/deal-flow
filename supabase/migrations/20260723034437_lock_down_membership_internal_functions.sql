-- Security advisor finding (mcp get_advisors, security): all new SECURITY DEFINER functions
-- from this membership-model work are, by Postgres default, EXECUTE-granted to PUBLIC, which
-- Supabase exposes to anon/authenticated over PostgREST (/rest/v1/rpc/<fn>). None of these
-- functions have a legitimate direct-client caller -- they're only ever invoked server-side
-- via the service-role client in Next.js API routes, or by cron/triggers. None of them check
-- that the calling JWT's tenant_id matches the p_tenant_id argument, so leaving them open
-- would let any authenticated (or anon) user read/mutate other tenants' membership data by
-- passing arbitrary tenant/entity ids. Revoke PUBLIC/anon/authenticated EXECUTE; service_role
-- access (already explicitly granted in each function's own migration) is unaffected.
--
-- Scope note: this does NOT touch the pre-existing v1 functions (evaluate_buyer_for_cohorts,
-- evaluate_product_for_campaigns, evaluate_product_for_price_lists, resolve_price,
-- resolve_prices_batch) which show the same advisor warning -- that's pre-existing repo
-- posture predating this work, out of scope for this migration.

REVOKE EXECUTE ON FUNCTION "app"."evaluate_buyer_for_cohorts_v2"("uuid") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."evaluate_buyer_for_campaign_buyers"("uuid") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."evaluate_product_for_price_lists_v2"("uuid") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."evaluate_product_for_campaigns_v2"("uuid") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."evaluate_products_for_price_lists_and_campaigns_batch"("uuid"[]) FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."refresh_price_list_by_id"("uuid") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."refresh_campaign_products_by_id"("uuid") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."refresh_campaign_buyers_by_id"("uuid") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."preview_buyer_membership_count"("uuid", "jsonb") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."preview_product_membership_count"("uuid", "jsonb") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."preview_membership_count"("uuid", "text", "jsonb") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."membership_mark_dirty"("uuid", "text", "uuid", "text") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."membership_mark_tenant_dirty"("uuid", "text", "text") FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."membership_refresh_tick"() FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."ensure_membership_refresh_tick_cron_scheduled"() FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "app"."reconcile_inventory_bulk_sync"("uuid", "jsonb", "jsonb") FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "app"."evaluate_buyer_for_cohorts_v2"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."evaluate_buyer_for_campaign_buyers"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."evaluate_product_for_price_lists_v2"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."evaluate_product_for_campaigns_v2"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."evaluate_products_for_price_lists_and_campaigns_batch"("uuid"[]) TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."refresh_price_list_by_id"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."refresh_campaign_products_by_id"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."refresh_campaign_buyers_by_id"("uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."preview_buyer_membership_count"("uuid", "jsonb") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."preview_product_membership_count"("uuid", "jsonb") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."preview_membership_count"("uuid", "text", "jsonb") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."membership_mark_dirty"("uuid", "text", "uuid", "text") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."membership_mark_tenant_dirty"("uuid", "text", "text") TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."membership_refresh_tick"() TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."ensure_membership_refresh_tick_cron_scheduled"() TO "service_role";
GRANT EXECUTE ON FUNCTION "app"."reconcile_inventory_bulk_sync"("uuid", "jsonb", "jsonb") TO "service_role";
