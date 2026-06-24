-- Zoho transaction sync gap closure.
-- Adds deterministic line-item keys and payload preservation for transactional sync.

-- ── Parent transactional documents ─────────────────────────────────────────

ALTER TABLE app.estimates
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.orders
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── Child transactional line items ──────────────────────────────────────────

ALTER TABLE app.estimate_items
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.order_items
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.invoice_items
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── Deterministic upsert keys for child rows ────────────────────────────────
-- These are intentionally non-partial so the bulk upsert RPC can target them.

CREATE UNIQUE INDEX IF NOT EXISTS estimate_items_estimate_external_ref_upsert
  ON app.estimate_items (estimate_id, external_ref);

CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_external_ref_upsert
  ON app.order_items (order_id, external_ref);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_items_invoice_external_ref_upsert
  ON app.invoice_items (invoice_id, external_ref);
