-- Restore a non-partial upsert key for Zoho contact persons.
-- app.bulk_persist_jsonb_records emits:
--   ON CONFLICT (buyer_id, external_ref)
-- and PostgreSQL cannot infer the older partial index with
-- WHERE external_ref IS NOT NULL.
--
-- Multiple NULL external_ref values remain valid because PostgreSQL UNIQUE
-- indexes treat NULL values as distinct.
CREATE UNIQUE INDEX IF NOT EXISTS buyer_users_buyer_external_ref_unfiltered_upsert
  ON app.buyer_users (buyer_id, external_ref);
