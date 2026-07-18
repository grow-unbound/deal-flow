-- Pagination is defined alongside the newly introduced seller landing search RPCs
-- in the preceding same-release migrations. This migration keeps the permission
-- contract explicit for the paged signatures.

REVOKE ALL ON FUNCTION app.search_seller_brand_landing_ids(uuid, text, text[], uuid[], uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.search_seller_category_landing_ids(uuid, text, text[], text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.search_seller_location_landing_ids(uuid, text, text[], text[], text[], integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.search_seller_warehouse_landing_ids(uuid, text, text[], text[], uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.search_seller_landing_entities(uuid, text, text, text[], uuid[], integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app.search_seller_brand_landing_ids(uuid, text, text[], uuid[], uuid[], integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.search_seller_category_landing_ids(uuid, text, text[], text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.search_seller_location_landing_ids(uuid, text, text[], text[], text[], integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.search_seller_warehouse_landing_ids(uuid, text, text[], text[], uuid[], integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.search_seller_landing_entities(uuid, text, text, text[], uuid[], integer, integer) TO service_role;
