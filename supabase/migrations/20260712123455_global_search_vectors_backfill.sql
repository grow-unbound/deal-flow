-- Backfill search_vector for existing rows, in its own migration so a slow
-- data statement can never block the schema/trigger migration and never
-- shares a transaction with DDL. Confirmed prod scale (467 tenant_products,
-- 10,575 buyers, 21 tenant_brands, 29 tenant_categories across 3 tenants) is
-- small enough that plain unbatched UPDATEs are the right tool — the
-- original migration's DO-loop batching-without-commits turned a
-- sub-second-to-low-single-digit-seconds statement into a multi-minute
-- lock-holding transaction that choked prod.
-- Buyers backfill joins buyer_users (CTE) which can be slow at scale;
-- use no statement_timeout for that one statement, 2min elsewhere.
SET statement_timeout = '2min';
SET lock_timeout = '30s';

-- app.buyers has an unconditional AFTER UPDATE trigger (trg_buyers_dispatch
-- -> app.dispatch_from_buyers()) that rebuilds 3 tenant-wide snapshot tables
-- on every row change. It already respects app.sync_trigger_bypass_active()
-- (same GUC the BEFORE search_vector triggers check) but a plain migration
-- UPDATE doesn't set that GUC by default — without it, this one backfill
-- statement would trigger 10,000+ redundant tenant-wide snapshot rebuilds
-- (one set per row instead of once total). session-scoped (is_local=false)
-- so it survives across the separate auto-committed statements below, turned
-- back off at the end of this file.
SELECT set_config('app.integration_sync_bypass_triggers', 'on', false);

UPDATE app.tenant_products tp
SET search_vector = joined.search_vector
FROM (
  SELECT
    tp2.id,
    to_tsvector(
      'english',
      concat_ws(
        ' ',
        COALESCE(tp2.name_override, cp.name, ''),
        COALESCE(tp2.description, cp.description, ''),
        COALESCE(tp2.internal_sku, ''),
        COALESCE(tp2.hsn_code, cp.hsn_code, ''),
        COALESCE(cp.master_sku, ''),
        COALESCE(tb.display_name_override, cb.name, ''),
        COALESCE(tb.description_override, tb.description, cb.description, ''),
        COALESCE(tc.name, ''),
        COALESCE(tc.description, ''),
        COALESCE(mc.name, ''),
        COALESCE(parent_tc.name, ''),
        COALESCE(tp2.attributes_override::text, ''),
        COALESCE(cp.attributes::text, '')
      )
    ) AS search_vector
  FROM app.tenant_products tp2
  LEFT JOIN catalog.products cp ON cp.id = tp2.master_product_id
  LEFT JOIN app.tenant_brands tb ON tb.id = tp2.tenant_brand_id
  LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
  LEFT JOIN app.tenant_categories tc ON tc.id = tp2.tenant_category_id
  LEFT JOIN catalog.categories mc ON mc.id = tc.master_category_id
  LEFT JOIN app.tenant_categories parent_tc ON parent_tc.id = tc.parent_tenant_category_id
  WHERE tp2.deleted_at IS NULL
    AND tp2.search_vector IS NULL
) joined
WHERE joined.id = tp.id;

SET statement_timeout = '0';
SET lock_timeout = '0';
UPDATE app.buyers b
SET search_vector = joined.search_vector
FROM (
  WITH buyer_contacts AS (
    SELECT
      bu.buyer_id,
      string_agg(
        concat_ws(
          ' ',
          COALESCE(bu.first_name, ''),
          COALESCE(bu.last_name, ''),
          COALESCE(bu.phone, ''),
          COALESCE(bu.email, ''),
          COALESCE(bu.designation, ''),
          COALESCE(bu.department, '')
        ),
        ' '
      ) AS contact_text
    FROM app.buyer_users bu
    WHERE bu.deleted_at IS NULL
      AND bu.is_active = true
    GROUP BY bu.buyer_id
  )
  SELECT
    b2.id,
    to_tsvector(
      'english',
      concat_ws(
        ' ',
        COALESCE(b2.business_name, ''),
        COALESCE(b2.contact_name, ''),
        COALESCE(b2.phone, ''),
        COALESCE(b2.email, ''),
        COALESCE(b2.gstin, ''),
        COALESCE(b2.gst_treatment, ''),
        COALESCE(b2.status, ''),
        COALESCE(b2.geography->>'city', ''),
        COALESCE(b2.geography->>'state', ''),
        COALESCE(b2.geography->>'district', ''),
        COALESCE(b2.geography->>'area', ''),
        COALESCE(b2.geography->>'zone', ''),
        COALESCE(b2.geography::text, ''),
        COALESCE(bc.contact_text, '')
      )
    ) AS search_vector
  FROM app.buyers b2
  LEFT JOIN buyer_contacts bc ON bc.buyer_id = b2.id
  WHERE b2.deleted_at IS NULL
    AND b2.search_vector IS NULL
) joined
WHERE joined.id = b.id;

SET statement_timeout = '2min';
SET lock_timeout = '30s';
UPDATE app.tenant_brands tb
SET search_vector = joined.search_vector
FROM (
  SELECT
    tb2.id,
    to_tsvector(
      'english',
      concat_ws(
        ' ',
        COALESCE(tb2.display_name_override, cb.name, ''),
        COALESCE(tb2.description_override, tb2.description, cb.description, ''),
        COALESCE(cb.slug, ''),
        COALESCE(tb2.principal_name, ''),
        COALESCE(tb2.contact_name, ''),
        COALESCE(tb2.categories::text, '')
      )
    ) AS search_vector
  FROM app.tenant_brands tb2
  LEFT JOIN catalog.brands cb ON cb.id = tb2.master_brand_id
  WHERE tb2.deleted_at IS NULL
    AND tb2.search_vector IS NULL
) joined
WHERE joined.id = tb.id;

UPDATE app.tenant_categories tc
SET search_vector = joined.search_vector
FROM (
  SELECT
    tc2.id,
    to_tsvector(
      'english',
      concat_ws(
        ' ',
        COALESCE(tc2.name, ''),
        COALESCE(tc2.description, ''),
        COALESCE(tc2.slug, ''),
        COALESCE(mc.name, ''),
        COALESCE(mc.slug, ''),
        COALESCE(parent_tc.name, '')
      )
    ) AS search_vector
  FROM app.tenant_categories tc2
  LEFT JOIN catalog.categories mc ON mc.id = tc2.master_category_id
  LEFT JOIN app.tenant_categories parent_tc ON parent_tc.id = tc2.parent_tenant_category_id
  WHERE tc2.deleted_at IS NULL
    AND tc2.search_vector IS NULL
) joined
WHERE joined.id = tc.id;

UPDATE app.locations l
SET search_vector = to_tsvector(
  'english',
  concat_ws(
    ' ',
    COALESCE(l.name, ''),
    COALESCE(l.address->>'city', ''),
    COALESCE(l.address->>'state', ''),
    COALESCE(l.address->>'street_address1', ''),
    COALESCE(l.address->>'street_address2', ''),
    COALESCE(l.address->>'district', ''),
    COALESCE(l.address->>'pincode', ''),
    COALESCE(l.address::text, ''),
    COALESCE(l.phone_number, ''),
    COALESCE(l.status, '')
  )
)
WHERE l.deleted_at IS NULL
  AND l.search_vector IS NULL;

UPDATE app.warehouses w
SET search_vector = to_tsvector(
  'english',
  concat_ws(
    ' ',
    COALESCE(w.name, ''),
    COALESCE(w.address->>'city', ''),
    COALESCE(w.address->>'state', ''),
    COALESCE(w.address->>'street_address1', ''),
    COALESCE(w.address->>'street_address2', ''),
    COALESCE(w.address->>'district', ''),
    COALESCE(w.address->>'pincode', ''),
    COALESCE(w.address::text, ''),
    COALESCE(w.phone_number, ''),
    COALESCE(w.status, '')
  )
)
WHERE w.deleted_at IS NULL
  AND w.search_vector IS NULL;

UPDATE app.cohorts c
SET search_vector = to_tsvector('english', concat_ws(' ', COALESCE(c.name, ''), COALESCE(c.description, '')))
WHERE c.deleted_at IS NULL
  AND c.search_vector IS NULL;

UPDATE app.campaigns c
SET search_vector = to_tsvector('english', concat_ws(' ', COALESCE(c.name, ''), COALESCE(c.status, '')))
WHERE c.deleted_at IS NULL
  AND c.search_vector IS NULL;

UPDATE app.price_lists pl
SET search_vector = to_tsvector('english', concat_ws(' ', COALESCE(pl.name, ''), COALESCE(pl.description, '')))
WHERE pl.deleted_at IS NULL
  AND pl.search_vector IS NULL;

SELECT set_config('app.integration_sync_bypass_triggers', 'off', false);
