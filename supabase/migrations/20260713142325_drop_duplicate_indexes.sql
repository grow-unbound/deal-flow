-- get_advisors flagged 2 duplicate-index pairs (identical column sets, pure
-- write overhead with no read benefit beyond the surviving twin).
--
-- buyers_tenant_external_ref_upsert duplicates buyers_tenant_id_external_ref_key
-- — the latter is the actual UNIQUE constraint (contype='u'), so it stays;
-- the former is a plain redundant index.
DROP INDEX IF EXISTS app.buyers_tenant_external_ref_upsert;

-- idx_orders_estimate_id_ep17_sales_orders duplicates
-- idx_orders_estimate_id_tx_docs — both plain indexes, same columns; keep
-- the more recent/generic one.
DROP INDEX IF EXISTS app.idx_orders_estimate_id_ep17_sales_orders;
