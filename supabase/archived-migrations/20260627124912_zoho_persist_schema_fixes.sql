-- Add missing date-only columns for transactional entities
-- bulk_persist_jsonb_records silently drops unknown keys, so these columns must
-- exist before the persist layer can write estimate_date / order_date.
ALTER TABLE app.estimates ADD COLUMN IF NOT EXISTS estimate_date date;
ALTER TABLE app.orders    ADD COLUMN IF NOT EXISTS order_date   date;

-- Centralise raw Zoho payload on the entity map rather than on domain tables.
-- Domain tables stay clean; the audit trail lives in one place.
ALTER TABLE app.integration_entity_map ADD COLUMN IF NOT EXISTS source_payload jsonb;

-- Drop source_payload from individual domain tables
ALTER TABLE app.estimates        DROP COLUMN IF EXISTS source_payload;
ALTER TABLE app.orders           DROP COLUMN IF EXISTS source_payload;
ALTER TABLE app.invoices         DROP COLUMN IF EXISTS source_payload;
ALTER TABLE app.price_lists      DROP COLUMN IF EXISTS source_payload;
ALTER TABLE app.price_list_items DROP COLUMN IF EXISTS source_payload;
ALTER TABLE app.estimate_items   DROP COLUMN IF EXISTS source_payload;
ALTER TABLE app.order_items      DROP COLUMN IF EXISTS source_payload;
ALTER TABLE app.invoice_items    DROP COLUMN IF EXISTS source_payload;
