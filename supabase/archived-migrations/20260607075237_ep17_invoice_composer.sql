ALTER TABLE app.invoices
  ALTER COLUMN buyer_id DROP NOT NULL;

ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS buyer_po_ref text,
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS notes_for_buyer text,
  ADD COLUMN IF NOT EXISTS seller_note text,
  ADD COLUMN IF NOT EXISTS discount_flat numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freight numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_channel text,
  ADD COLUMN IF NOT EXISTS gstin_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hsn_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tally_export_id uuid;

UPDATE app.invoices AS inv
SET
  place_of_supply = COALESCE(
    NULLIF(inv.place_of_supply, ''),
    NULLIF(buyers.geography ->> 'state', ''),
    'Unknown'
  ),
  notes_for_buyer = COALESCE(inv.notes_for_buyer, ''),
  seller_note = COALESCE(inv.seller_note, ''),
  discount_flat = COALESCE(inv.discount_flat, 0),
  freight = COALESCE(inv.freight, 0),
  round_off = COALESCE(inv.round_off, 0),
  amount_paid = COALESCE(inv.amount_paid, GREATEST(COALESCE(inv.total_amount, 0) - COALESCE(inv.outstanding_balance, 0), 0)),
  sent_at = COALESCE(inv.sent_at, CASE WHEN inv.status IN ('sent', 'paid', 'overdue') THEN inv.updated_at ELSE NULL END)
FROM app.buyers
WHERE buyers.id = inv.buyer_id;

ALTER TABLE app.invoices
  ALTER COLUMN place_of_supply SET DEFAULT 'Unknown';

UPDATE app.invoices
SET place_of_supply = 'Unknown'
WHERE place_of_supply IS NULL OR btrim(place_of_supply) = '';

ALTER TABLE app.invoices
  ALTER COLUMN place_of_supply SET NOT NULL;

ALTER TABLE app.invoice_items
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS disc_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS scheme_tag text;

UPDATE app.invoice_items AS item
SET
  sku = COALESCE(item.sku, products.internal_sku),
  hsn_code = COALESCE(item.hsn_code, products.hsn_code, catalog_products.hsn_code),
  tax_pct = COALESCE(item.tax_pct, item.tax_rate, products.gst_rate, catalog_products.gst_rate, 0)
FROM app.tenant_products AS products
LEFT JOIN catalog.products AS catalog_products
  ON catalog_products.id = products.master_product_id
WHERE products.id = item.tenant_product_id;
