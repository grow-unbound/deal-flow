-- Warehouses is the last Growth-group entity still calling pre-metrics-v2
-- ("v1") RPC names. Rename in place (same body, same grants) to the _v2
-- convention already used by Categories, so v1 can be retired cleanly
-- without breaking the Warehouses landing/stock pages.

ALTER FUNCTION app.search_seller_warehouse_landing_ids(
  p_tenant_id uuid,
  p_query text,
  p_statuses text[],
  p_stock_modes text[],
  p_location_ids uuid[],
  p_limit integer,
  p_offset integer
) RENAME TO search_seller_warehouse_landing_ids_v2;

ALTER FUNCTION app.get_seller_warehouses_landing_summary(
  p_tenant_id uuid,
  p_location_ids uuid[]
) RENAME TO get_seller_warehouses_landing_summary_v2;

ALTER FUNCTION app.get_seller_warehouse_landing_row_metrics(
  p_tenant_id uuid,
  p_warehouse_ids uuid[]
) RENAME TO get_seller_warehouse_landing_row_metrics_v2;

ALTER FUNCTION app.search_warehouse_stock(
  uuid, uuid, text, text[], text, integer, integer
) RENAME TO search_warehouse_stock_v2;
