-- The original 7-arg app.search_seller_location_landing_ids (no p_location_ids)
-- from 20260714102906 was superseded by an 8-arg version (with p_location_ids)
-- in 20260714113035, but CREATE OR REPLACE only replaces on exact signature
-- match, so the old 7-arg overload was left live alongside the new one.
-- PostgREST can no longer disambiguate calls (PGRST203) since every named
-- param on both overloads is optional. Drop the stale overload.
DROP FUNCTION IF EXISTS app.search_seller_location_landing_ids(
  p_tenant_id uuid,
  p_query text,
  p_statuses text[],
  p_stock_modes text[],
  p_dues_modes text[],
  p_limit integer,
  p_offset integer
);
