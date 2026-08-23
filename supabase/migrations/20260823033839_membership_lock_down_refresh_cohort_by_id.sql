-- Pre-existing gap surfaced by get_advisors while verifying the membership v4 fixes in
-- 20260823032310/20260823032311/20260823032315: app.refresh_cohort_by_id was never
-- included in 20260723034437_lock_down_membership_internal_functions.sql's REVOKE/GRANT
-- pass alongside its three siblings (refresh_price_list_by_id, refresh_campaign_products_by_id,
-- refresh_campaign_buyers_by_id), so it stayed callable by anon/authenticated as a
-- SECURITY DEFINER RPC via /rest/v1/rpc/refresh_cohort_by_id with no tenant check --
-- anyone could force-recompute any tenant's cohort membership. Not part of this
-- session's three membership-queue/scale problems; fixed here since it's the same
-- function family and a one-line, zero-risk lock-down (API routes already call it via
-- the service-role client, so this changes no legitimate caller).

REVOKE EXECUTE ON FUNCTION app.refresh_cohort_by_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_cohort_by_id(uuid) TO service_role;
