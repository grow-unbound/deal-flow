-- Zoho imports may omit place_of_supply; bulk_persist_jsonb_records uses
-- jsonb_to_recordset with a union column set, so missing keys become NULL.
-- Allow NULL on transactional documents instead of failing the sync.

ALTER TABLE app.estimates
  ALTER COLUMN place_of_supply DROP NOT NULL;

ALTER TABLE app.invoices
  ALTER COLUMN place_of_supply DROP NOT NULL;

ALTER TABLE app.orders
  ALTER COLUMN place_of_supply DROP NOT NULL;
