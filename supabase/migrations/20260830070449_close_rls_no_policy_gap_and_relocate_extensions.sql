-- Pre-colocation DB hygiene pass, per owner instruction ("resolve DB
-- advisor findings before porting the db"). Two independent fixes:
--
-- 1) 8 tables had RLS enabled but zero policies (rls_enabled_no_policy,
-- flagged since 2026-07-26, never actioned). Postgres default-denies with
-- RLS-on-no-policy, so this was never an actual open door -- but all 8
-- also carry stray `authenticated` table-level GRANTs left over from
-- scaffolding, which is real attack surface if a permissive policy is
-- ever added later without noticing the grant is still there. Every app
-- caller of these 8 tables already goes through supabaseAdmin
-- (service_role, bypasses RLS) -- confirmed via grep, zero
-- authenticated/anon-context callers exist. Fix: revoke the stray grants,
-- add an explicit service-role-only policy on each, matching the house
-- pattern already used on otp_sessions/auth_signin_attempts/
-- metrics_v4_period_drift_log.
--
-- (The other 2026-07-26 finding, app.otp_sessions_public with a wide-open
-- USING(true) policy, no longer exists -- confirmed dropped/renamed to
-- app.otp_sessions at some point since, which already has the correct
-- service_role_only policy. Stale finding, nothing to do.)

REVOKE ALL ON app.email_verification_otps FROM authenticated, anon;
REVOKE ALL ON app.integration_oauth_states FROM authenticated, anon;
REVOKE ALL ON app.membership_dirty_work FROM authenticated, anon;
REVOKE ALL ON app.metrics_dirty_work FROM authenticated, anon;
REVOKE ALL ON app.metrics_refresh_leases FROM authenticated, anon;
REVOKE ALL ON app.platform_admins FROM authenticated, anon;
REVOKE ALL ON app.whatsapp_rate_card FROM authenticated, anon;
REVOKE ALL ON app.whatsapp_send_queue FROM authenticated, anon;

CREATE POLICY email_verification_otps_service_role_only ON app.email_verification_otps
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY integration_oauth_states_service_role_only ON app.integration_oauth_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY membership_dirty_work_service_role_only ON app.membership_dirty_work
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY metrics_dirty_work_service_role_only ON app.metrics_dirty_work
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY metrics_refresh_leases_service_role_only ON app.metrics_refresh_leases
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY platform_admins_service_role_only ON app.platform_admins
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY whatsapp_rate_card_service_role_only ON app.whatsapp_rate_card
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY whatsapp_send_queue_service_role_only ON app.whatsapp_send_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) pg_trgm and vector extensions living in `public` instead of the
-- Supabase-reserved `extensions` schema (already exists, already first in
-- every session's default search_path -- confirmed via SHOW search_path:
-- "$user", public, extensions). Audited before moving: all trgm/vector
-- index usage across app/catalog (10 GIN/HNSW indexes) goes through
-- operator classes, which Postgres resolves by catalog OID at index-build
-- time, not by schema-qualified name at query time -- immune to this
-- move. Only 2 functions call trgm operators directly in their SQL body
-- (global_search, search_products_scoped, both via `%`/similarity), and
-- both pin an explicit `search_path` that does NOT include `extensions`
-- -- patched below so they keep resolving after the move. Zero functions
-- reference the `vector` type or its operators directly (only via
-- indexes), so nothing else needs a search_path patch.
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

ALTER FUNCTION app.global_search(p_query text, p_tenant_id uuid, p_role text, p_items_per_group integer, p_location_ids uuid[], p_buyer_id uuid, p_allowed_brand_ids uuid[])
  SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER FUNCTION app.search_products_scoped(p_tenant_id uuid, p_query text, p_buyer_id uuid, p_price_list_id uuid, p_limit integer, p_offset integer, p_ids uuid[], p_brand_ids uuid[], p_category_ids uuid[], p_allowed_brand_ids uuid[], p_warehouse_ids uuid[], p_availability text, p_sort text, p_include_inventory boolean, p_campaign_id uuid, p_category_scope_id uuid)
  SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
