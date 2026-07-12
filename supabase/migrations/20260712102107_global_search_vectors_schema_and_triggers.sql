-- Global search vectors — schema, functions, triggers only. Split out of the
-- original single-file migration (which choked prod: 4 unbatched-commit DO
-- loops + 5 unbatched full-table UPDATEs + non-concurrent CREATE INDEX, all
-- in one migration-wide transaction). Data backfill and index creation now
-- live in their own migration files (see the two that follow this one) so a
-- slow data statement can never block trigger/function deployment and never
-- shares a transaction with DDL.
--
-- Also removes the catalog.* → app.* cascade queue/cron from the original
-- migration entirely (search_vector_refresh_queue table,
-- process_search_vector_refresh_queue function, the every-2-minute
-- search-vector-refresh-queue cron). Rationale: no live producer exists for
-- that queue today — no admin/superadmin UI edits catalog.brands/categories/
-- products (confirmed: no such route exists), the only writer is
-- supabase/seed.sql (an explicitly idempotent local/dev bootstrap script).
-- Master-catalog edits are a blue-moon event until a superadmin UI ships;
-- when they do happen, run `SELECT app.rebuild_tenant_search_vectors(id)
-- FROM app.tenants` manually (or scope it to affected tenants) — no
-- standing infrastructure needed for an event this rare.
SET lock_timeout = '30s';

ALTER TABLE app.tenant_brands
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

ALTER TABLE app.tenant_categories
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

ALTER TABLE app.locations
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

ALTER TABLE app.warehouses
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

ALTER TABLE app.cohorts
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

ALTER TABLE app.campaigns
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

ALTER TABLE app.price_lists
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION app.rebuild_tenant_products_search_vectors(
  p_tenant_id uuid DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '5min'
SET lock_timeout = '30s'
AS $$
  WITH joined AS (
    SELECT
      tp.id,
      to_tsvector(
        'english',
        concat_ws(
          ' ',
          COALESCE(tp.name_override, cp.name, ''),
          COALESCE(tp.description, cp.description, ''),
          COALESCE(tp.internal_sku, ''),
          COALESCE(tp.hsn_code, cp.hsn_code, ''),
          COALESCE(cp.master_sku, ''),
          COALESCE(tb.display_name_override, cb.name, ''),
          COALESCE(tb.description_override, tb.description, cb.description, ''),
          COALESCE(tc.name, ''),
          COALESCE(tc.description, ''),
          COALESCE(mc.name, ''),
          COALESCE(parent_tc.name, ''),
          COALESCE(tp.attributes_override::text, ''),
          COALESCE(cp.attributes::text, '')
        )
      ) AS search_vector
    FROM app.tenant_products tp
    LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
    LEFT JOIN catalog.categories mc ON mc.id = tc.master_category_id
    LEFT JOIN app.tenant_categories parent_tc ON parent_tc.id = tc.parent_tenant_category_id
    WHERE tp.deleted_at IS NULL
      AND (p_tenant_id IS NULL OR tp.tenant_id = p_tenant_id)
      AND (p_ids IS NULL OR tp.id = ANY (p_ids))
  )
  UPDATE app.tenant_products tp
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = tp.id;
$$;

CREATE OR REPLACE FUNCTION app.tenant_products_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app, catalog, public
AS $$
DECLARE
  v_master_name text;
  v_master_description text;
  v_master_sku text;
  v_master_hsn text;
  v_master_attributes text;
  v_brand_name text;
  v_brand_description text;
  v_category_name text;
  v_category_description text;
  v_master_category_name text;
  v_parent_category_name text;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  SELECT cp.name, cp.description, cp.master_sku, cp.hsn_code, COALESCE(cp.attributes::text, '')
  INTO v_master_name, v_master_description, v_master_sku, v_master_hsn, v_master_attributes
  FROM catalog.products cp
  WHERE cp.id = NEW.master_product_id;

  SELECT COALESCE(tb.display_name_override, cb.name), COALESCE(tb.description_override, tb.description, cb.description)
  INTO v_brand_name, v_brand_description
  FROM app.tenant_brands tb
  LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
  WHERE tb.id = NEW.tenant_brand_id;

  SELECT tc.name, tc.description, mc.name, parent_tc.name
  INTO v_category_name, v_category_description, v_master_category_name, v_parent_category_name
  FROM app.tenant_categories tc
  LEFT JOIN catalog.categories mc ON mc.id = tc.master_category_id
  LEFT JOIN app.tenant_categories parent_tc ON parent_tc.id = tc.parent_tenant_category_id
  WHERE tc.id = NEW.tenant_category_id;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(NEW.name_override, v_master_name, ''),
      COALESCE(NEW.description, v_master_description, ''),
      COALESCE(NEW.internal_sku, ''),
      COALESCE(NEW.hsn_code, v_master_hsn, ''),
      COALESCE(v_master_sku, ''),
      COALESCE(v_brand_name, ''),
      COALESCE(v_brand_description, ''),
      COALESCE(v_category_name, ''),
      COALESCE(v_category_description, ''),
      COALESCE(v_master_category_name, ''),
      COALESCE(v_parent_category_name, ''),
      COALESCE(NEW.attributes_override::text, ''),
      COALESCE(v_master_attributes, '')
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_buyers_search_vectors(
  p_tenant_id uuid DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '5min'
SET lock_timeout = '30s'
AS $$
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
  ),
  joined AS (
    SELECT
      b.id,
      to_tsvector(
        'english',
        concat_ws(
          ' ',
          COALESCE(b.business_name, ''),
          COALESCE(b.contact_name, ''),
          COALESCE(b.phone, ''),
          COALESCE(b.email, ''),
          COALESCE(b.gstin, ''),
          COALESCE(b.gst_treatment, ''),
          COALESCE(b.status, ''),
          COALESCE(b.geography->>'city', ''),
          COALESCE(b.geography->>'state', ''),
          COALESCE(b.geography->>'district', ''),
          COALESCE(b.geography->>'area', ''),
          COALESCE(b.geography->>'zone', ''),
          COALESCE(b.geography::text, ''),
          COALESCE(bc.contact_text, '')
        )
      ) AS search_vector
    FROM app.buyers b
    LEFT JOIN buyer_contacts bc ON bc.buyer_id = b.id
    WHERE b.deleted_at IS NULL
      AND (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
      AND (p_ids IS NULL OR b.id = ANY (p_ids))
  )
  UPDATE app.buyers b
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = b.id;
$$;

CREATE OR REPLACE FUNCTION app.buyers_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_contact_text text;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(
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
  )
  INTO v_contact_text
  FROM app.buyer_users bu
  WHERE bu.buyer_id = NEW.id
    AND bu.deleted_at IS NULL
    AND bu.is_active = true;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(NEW.business_name, ''),
      COALESCE(NEW.contact_name, ''),
      COALESCE(NEW.phone, ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.gstin, ''),
      COALESCE(NEW.gst_treatment, ''),
      COALESCE(NEW.status, ''),
      COALESCE(NEW.geography->>'city', ''),
      COALESCE(NEW.geography->>'state', ''),
      COALESCE(NEW.geography->>'district', ''),
      COALESCE(NEW.geography->>'area', ''),
      COALESCE(NEW.geography->>'zone', ''),
      COALESCE(NEW.geography::text, ''),
      COALESCE(v_contact_text, '')
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_buyer_search_vector_from_contact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_buyer_id uuid;
  v_tenant_id uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_buyer_id := OLD.buyer_id;
  ELSE
    v_buyer_id := NEW.buyer_id;
  END IF;
  IF v_buyer_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT b.tenant_id INTO v_tenant_id
  FROM app.buyers b
  WHERE b.id = v_buyer_id;

  IF v_tenant_id IS NOT NULL THEN
    PERFORM app.rebuild_buyers_search_vectors(v_tenant_id, ARRAY[v_buyer_id]);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_tenant_brands_search_vectors(
  p_tenant_id uuid DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '5min'
SET lock_timeout = '30s'
AS $$
  WITH joined AS (
    SELECT
      tb.id,
      to_tsvector(
        'english',
        concat_ws(
          ' ',
          COALESCE(tb.display_name_override, cb.name, ''),
          COALESCE(tb.description_override, tb.description, cb.description, ''),
          COALESCE(cb.slug, ''),
          COALESCE(tb.principal_name, ''),
          COALESCE(tb.contact_name, ''),
          COALESCE(tb.categories::text, '')
        )
      ) AS search_vector
    FROM app.tenant_brands tb
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    WHERE tb.deleted_at IS NULL
      AND (p_tenant_id IS NULL OR tb.tenant_id = p_tenant_id)
      AND (p_ids IS NULL OR tb.id = ANY (p_ids))
  )
  UPDATE app.tenant_brands tb
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = tb.id;
$$;

CREATE OR REPLACE FUNCTION app.tenant_brands_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app, catalog, public
AS $$
DECLARE
  v_master_name text;
  v_master_description text;
  v_master_slug text;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  SELECT cb.name, cb.description, cb.slug
  INTO v_master_name, v_master_description, v_master_slug
  FROM catalog.brands cb
  WHERE cb.id = NEW.master_brand_id;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(NEW.display_name_override, v_master_name, ''),
      COALESCE(NEW.description_override, NEW.description, v_master_description, ''),
      COALESCE(v_master_slug, ''),
      COALESCE(NEW.principal_name, ''),
      COALESCE(NEW.contact_name, ''),
      COALESCE(NEW.categories::text, '')
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_tenant_categories_search_vectors(
  p_tenant_id uuid DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '5min'
SET lock_timeout = '30s'
AS $$
  WITH joined AS (
    SELECT
      tc.id,
      to_tsvector(
        'english',
        concat_ws(
          ' ',
          COALESCE(tc.name, ''),
          COALESCE(tc.description, ''),
          COALESCE(tc.slug, ''),
          COALESCE(mc.name, ''),
          COALESCE(mc.slug, ''),
          COALESCE(parent_tc.name, '')
        )
      ) AS search_vector
    FROM app.tenant_categories tc
    LEFT JOIN catalog.categories mc ON mc.id = tc.master_category_id
    LEFT JOIN app.tenant_categories parent_tc ON parent_tc.id = tc.parent_tenant_category_id
    WHERE tc.deleted_at IS NULL
      AND (p_tenant_id IS NULL OR tc.tenant_id = p_tenant_id)
      AND (p_ids IS NULL OR tc.id = ANY (p_ids))
  )
  UPDATE app.tenant_categories tc
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = tc.id;
$$;

CREATE OR REPLACE FUNCTION app.tenant_categories_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app, catalog, public
AS $$
DECLARE
  v_master_name text;
  v_master_slug text;
  v_parent_name text;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  SELECT mc.name, mc.slug
  INTO v_master_name, v_master_slug
  FROM catalog.categories mc
  WHERE mc.id = NEW.master_category_id;

  SELECT parent_tc.name
  INTO v_parent_name
  FROM app.tenant_categories parent_tc
  WHERE parent_tc.id = NEW.parent_tenant_category_id;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(NEW.name, ''),
      COALESCE(NEW.description, ''),
      COALESCE(NEW.slug, ''),
      COALESCE(v_master_name, ''),
      COALESCE(v_master_slug, ''),
      COALESCE(v_parent_name, '')
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.cohorts_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(' ', COALESCE(NEW.name, ''), COALESCE(NEW.description, ''))
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.campaigns_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(' ', COALESCE(NEW.name, ''), COALESCE(NEW.status, ''))
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.price_lists_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(' ', COALESCE(NEW.name, ''), COALESCE(NEW.description, ''))
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.locations_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(NEW.name, ''),
      COALESCE(NEW.address->>'city', ''),
      COALESCE(NEW.address->>'state', ''),
      COALESCE(NEW.address->>'street_address1', ''),
      COALESCE(NEW.address->>'street_address2', ''),
      COALESCE(NEW.address->>'district', ''),
      COALESCE(NEW.address->>'pincode', ''),
      COALESCE(NEW.address::text, ''),
      COALESCE(NEW.phone_number, ''),
      COALESCE(NEW.status, '')
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.warehouses_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(NEW.name, ''),
      COALESCE(NEW.address->>'city', ''),
      COALESCE(NEW.address->>'state', ''),
      COALESCE(NEW.address->>'street_address1', ''),
      COALESCE(NEW.address->>'street_address2', ''),
      COALESCE(NEW.address->>'district', ''),
      COALESCE(NEW.address->>'pincode', ''),
      COALESCE(NEW.address::text, ''),
      COALESCE(NEW.phone_number, ''),
      COALESCE(NEW.status, '')
    )
  );
  RETURN NEW;
END;
$$;

-- Same-tenant cascade: a tenant editing its OWN brand/category synchronously
-- rebuilds that tenant's own products referencing it. Kept synchronous
-- deliberately — at confirmed prod scale (≤500 tenant_products total across
-- all tenants today; spec targets hundreds-to-low-thousands per tenant) this
-- is sub-millisecond, not a request-latency hazard. No queue needed for this
-- case.
CREATE OR REPLACE FUNCTION app.refresh_product_vectors_from_tenant_brand()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  PERFORM app.rebuild_tenant_products_search_vectors(NEW.tenant_id, ARRAY(
    SELECT tp.id
    FROM app.tenant_products tp
    WHERE tp.tenant_brand_id = NEW.id
      AND tp.deleted_at IS NULL
  ));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_product_vectors_from_tenant_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  PERFORM app.rebuild_tenant_products_search_vectors(NEW.tenant_id, ARRAY(
    SELECT tp.id
    FROM app.tenant_products tp
    WHERE tp.tenant_category_id = NEW.id
      AND tp.deleted_at IS NULL
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_products_search_vector_update ON app.tenant_products;
CREATE TRIGGER tenant_products_search_vector_update
BEFORE INSERT OR UPDATE OF name_override, description, internal_sku, hsn_code, master_product_id, tenant_brand_id, tenant_category_id, attributes_override
ON app.tenant_products
FOR EACH ROW EXECUTE FUNCTION app.tenant_products_search_vector_update();

DROP TRIGGER IF EXISTS buyers_search_vector_update ON app.buyers;
CREATE TRIGGER buyers_search_vector_update
BEFORE INSERT OR UPDATE OF business_name, contact_name, phone, email, gstin, gst_treatment, status, geography
ON app.buyers
FOR EACH ROW EXECUTE FUNCTION app.buyers_search_vector_update();

DROP TRIGGER IF EXISTS refresh_buyer_search_vector_from_contact ON app.buyer_users;
CREATE TRIGGER refresh_buyer_search_vector_from_contact
AFTER INSERT OR UPDATE OF buyer_id, first_name, last_name, phone, email, designation, department, is_active, deleted_at OR DELETE
ON app.buyer_users
FOR EACH ROW EXECUTE FUNCTION app.refresh_buyer_search_vector_from_contact();

DROP TRIGGER IF EXISTS tenant_brands_search_vector_update ON app.tenant_brands;
CREATE TRIGGER tenant_brands_search_vector_update
BEFORE INSERT OR UPDATE OF display_name_override, description_override, description, principal_name, contact_name, categories, master_brand_id
ON app.tenant_brands
FOR EACH ROW EXECUTE FUNCTION app.tenant_brands_search_vector_update();

DROP TRIGGER IF EXISTS tenant_categories_search_vector_update ON app.tenant_categories;
CREATE TRIGGER tenant_categories_search_vector_update
BEFORE INSERT OR UPDATE OF name, description, slug, master_category_id, parent_tenant_category_id
ON app.tenant_categories
FOR EACH ROW EXECUTE FUNCTION app.tenant_categories_search_vector_update();

DROP TRIGGER IF EXISTS locations_search_vector_update ON app.locations;
CREATE TRIGGER locations_search_vector_update
BEFORE INSERT OR UPDATE OF name, address, phone_number, status
ON app.locations
FOR EACH ROW EXECUTE FUNCTION app.locations_search_vector_update();

DROP TRIGGER IF EXISTS warehouses_search_vector_update ON app.warehouses;
CREATE TRIGGER warehouses_search_vector_update
BEFORE INSERT OR UPDATE OF name, address, phone_number, status
ON app.warehouses
FOR EACH ROW EXECUTE FUNCTION app.warehouses_search_vector_update();

DROP TRIGGER IF EXISTS cohorts_search_vector_update ON app.cohorts;
CREATE TRIGGER cohorts_search_vector_update
BEFORE INSERT OR UPDATE OF name, description
ON app.cohorts
FOR EACH ROW EXECUTE FUNCTION app.cohorts_search_vector_update();

DROP TRIGGER IF EXISTS campaigns_search_vector_update ON app.campaigns;
CREATE TRIGGER campaigns_search_vector_update
BEFORE INSERT OR UPDATE OF name, status
ON app.campaigns
FOR EACH ROW EXECUTE FUNCTION app.campaigns_search_vector_update();

DROP TRIGGER IF EXISTS price_lists_search_vector_update ON app.price_lists;
CREATE TRIGGER price_lists_search_vector_update
BEFORE INSERT OR UPDATE OF name, description
ON app.price_lists
FOR EACH ROW EXECUTE FUNCTION app.price_lists_search_vector_update();

DROP TRIGGER IF EXISTS refresh_product_vectors_from_tenant_brand ON app.tenant_brands;
CREATE TRIGGER refresh_product_vectors_from_tenant_brand
AFTER UPDATE OF display_name_override, description_override, description, categories, master_brand_id
ON app.tenant_brands
FOR EACH ROW EXECUTE FUNCTION app.refresh_product_vectors_from_tenant_brand();

DROP TRIGGER IF EXISTS refresh_product_vectors_from_tenant_category ON app.tenant_categories;
CREATE TRIGGER refresh_product_vectors_from_tenant_category
AFTER UPDATE OF name, description, master_category_id, parent_tenant_category_id
ON app.tenant_categories
FOR EACH ROW EXECUTE FUNCTION app.refresh_product_vectors_from_tenant_category();

-- Manual command for the rare (currently zero-producer) master-catalog edit
-- case — run after editing catalog.brands/categories/products, scoped to
-- whichever tenants reference the edited master row. No automatic cascade,
-- no queue, no cron: see migration header comment for rationale.
CREATE OR REPLACE FUNCTION app.rebuild_tenant_search_vectors(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  PERFORM app.rebuild_tenant_products_search_vectors(p_tenant_id, NULL);
  PERFORM app.rebuild_buyers_search_vectors(p_tenant_id, NULL);
  PERFORM app.rebuild_tenant_brands_search_vectors(p_tenant_id, NULL);
  PERFORM app.rebuild_tenant_categories_search_vectors(p_tenant_id, NULL);
END;
$$;

REVOKE ALL ON FUNCTION app.rebuild_tenant_search_vectors(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app.rebuild_tenant_search_vectors(uuid) TO service_role;

-- Catch-up for rows written via the Zoho sync/webhook persist path
-- (app.bulk_persist_jsonb_records / app.persist_with_natural_key_lock), which
-- deliberately skip the search_vector triggers above via
-- app.sync_trigger_bypass_active() so a sync's write-heavy transaction never
-- pays per-row trigger cost or eats into its own time budget. That bypass is
-- correct and stays as-is — but nothing rebuilt search_vector for those rows
-- afterward, so they went stale permanently. Fix: rebuild once, per tenant,
-- right after that tenant's sync run reaches a terminal 'completed' state —
-- bounded to one tenant (confirmed scale: ≤500 products, low-thousands
-- buyers per tenant today), running after the sync's own transaction/budget,
-- not inside it. Deliberately NOT gated by sync_trigger_bypass_active() —
-- this trigger IS the catch-up for what that bypass skipped.
CREATE OR REPLACE FUNCTION app.rebuild_search_vectors_after_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  PERFORM app.rebuild_tenant_search_vectors(NEW.tenant_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.rebuild_search_vectors_after_sync() FROM PUBLIC;
GRANT ALL ON FUNCTION app.rebuild_search_vectors_after_sync() TO service_role;

DROP TRIGGER IF EXISTS integration_sync_jobs_rebuild_search_vectors ON app.integration_sync_jobs;

CREATE TRIGGER integration_sync_jobs_rebuild_search_vectors
AFTER UPDATE OF status ON app.integration_sync_jobs
FOR EACH ROW
WHEN (NEW.phase = 'sync_run' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
EXECUTE FUNCTION app.rebuild_search_vectors_after_sync();

DROP FUNCTION IF EXISTS app.global_search(text, uuid, text, int, public.vector);
DROP FUNCTION IF EXISTS app.global_search(text, uuid, text, int, public.vector, uuid[]);

CREATE OR REPLACE FUNCTION app.global_search(
  p_query text,
  p_tenant_id uuid,
  p_role text DEFAULT 'seller_admin',
  p_items_per_group int DEFAULT 5,
  p_query_embedding public.vector(1536) DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  entity_type text,
  id uuid,
  label text,
  sublabel text,
  url_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, catalog, public
AS $$
DECLARE
  v_like text;
  v_ts_query tsquery;
  v_is_assistant boolean;
  v_location_ids uuid[];
BEGIN
  IF p_query IS NULL OR trim(p_query) = '' THEN
    RETURN;
  END IF;

  v_like := '%' || lower(trim(p_query)) || '%';
  v_ts_query := websearch_to_tsquery('english', trim(p_query));
  v_is_assistant := p_role = 'seller_assistant';
  v_location_ids := COALESCE(p_location_ids, ARRAY[]::uuid[]);

  RETURN QUERY
  WITH accessible_buyers AS (
    SELECT DISTINCT source.buyer_id
    FROM (
      SELECT bs.buyer_id
      FROM app.buyers_snapshot bs
      WHERE bs.tenant_id = p_tenant_id
        AND bs.scope = 'location'
        AND (NOT v_is_assistant OR bs.location_id = ANY (v_location_ids))

      UNION

      SELECT o.buyer_id
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.deleted_at IS NULL
        AND o.buyer_id IS NOT NULL
        AND (NOT v_is_assistant OR o.location_id = ANY (v_location_ids))

      UNION

      SELECT i.buyer_id
      FROM app.invoices i
      WHERE i.tenant_id = p_tenant_id
        AND i.deleted_at IS NULL
        AND i.buyer_id IS NOT NULL
        AND (NOT v_is_assistant OR i.location_id = ANY (v_location_ids))

      UNION

      SELECT e.buyer_id
      FROM app.estimates e
      WHERE e.tenant_id = p_tenant_id
        AND e.deleted_at IS NULL
        AND e.buyer_id IS NOT NULL
        AND (NOT v_is_assistant OR e.location_id = ANY (v_location_ids))
    ) source
    WHERE source.buyer_id IS NOT NULL
  ),
  all_matches AS (
    SELECT
      'product'::text AS entity_type,
      sp.tenant_product_id AS id,
      sp.product_name AS label,
      concat_ws(' · ', sp.brand_name, sp.category_name, sp.sku) AS sublabel,
      '/products/' || sp.tenant_product_id::text AS url_path,
      sp.search_rank AS rank
    FROM app.search_products(
      p_tenant_id,
      p_query,
      NULL,
      NULL,
      p_items_per_group * 3,
      p_query_embedding,
      NULL
    ) sp

    UNION ALL

    SELECT
      'brand'::text,
      tb.id,
      COALESCE(tb.display_name_override, cb.name, 'Brand'),
      COALESCE(tb.description_override, tb.description, cb.description, ''),
      '/brands/' || tb.id::text,
      CASE
        WHEN tb.search_vector @@ v_ts_query THEN ts_rank(tb.search_vector, v_ts_query)::float8
        ELSE 0.1::float8
      END
    FROM app.tenant_brands tb
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    WHERE tb.tenant_id = p_tenant_id
      AND tb.is_active = true
      AND tb.deleted_at IS NULL
      AND (
        tb.search_vector @@ v_ts_query
        OR lower(COALESCE(tb.display_name_override, cb.name, '')) LIKE v_like
        OR lower(COALESCE(tb.description_override, tb.description, cb.description, '')) LIKE v_like
      )

    UNION ALL

    SELECT
      'category'::text,
      tc.id,
      tc.name,
      concat_ws(' · ', tc.description, COALESCE(mc.name, ''), CASE WHEN tc.is_active THEN 'Active' ELSE 'Inactive' END),
      '/categories/' || tc.id::text,
      CASE
        WHEN tc.search_vector @@ v_ts_query THEN ts_rank(tc.search_vector, v_ts_query)::float8
        ELSE 0.1::float8
      END
    FROM app.tenant_categories tc
    LEFT JOIN catalog.categories mc ON mc.id = tc.master_category_id
    WHERE tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
      AND (
        tc.search_vector @@ v_ts_query
        OR lower(tc.name) LIKE v_like
        OR lower(COALESCE(tc.description, '')) LIKE v_like
        OR lower(COALESCE(mc.name, '')) LIKE v_like
      )

    UNION ALL

    SELECT
      'customer'::text,
      b.id,
      b.business_name,
      concat_ws(' · ', NULLIF(COALESCE(b.contact_name, ''), ''), NULLIF(COALESCE(b.geography->>'city', ''), ''), NULLIF(COALESCE(b.phone, ''), '')),
      '/customers/' || b.id::text,
      CASE
        WHEN b.search_vector @@ v_ts_query THEN ts_rank(b.search_vector, v_ts_query)::float8
        ELSE 0.1::float8
      END
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.is_active = true
      AND b.deleted_at IS NULL
      AND (NOT v_is_assistant OR b.id IN (SELECT ab.buyer_id FROM accessible_buyers ab))
      AND (
        b.search_vector @@ v_ts_query
        OR lower(b.business_name) LIKE v_like
        OR lower(COALESCE(b.contact_name, '')) LIKE v_like
        OR lower(COALESCE(b.phone, '')) LIKE v_like
        OR lower(COALESCE(b.geography::text, '')) LIKE v_like
      )

    UNION ALL

    SELECT
      'cohort'::text,
      c.id,
      c.name,
      COALESCE(c.description, ''),
      '/customer-groups/' || c.id::text,
      CASE WHEN c.search_vector @@ v_ts_query THEN ts_rank(c.search_vector, v_ts_query)::float8 ELSE 0.1::float8 END
    FROM app.cohorts c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND (c.search_vector @@ v_ts_query OR lower(c.name) LIKE v_like)

    UNION ALL

    SELECT
      'campaign'::text,
      c.id,
      c.name,
      COALESCE(c.status, ''),
      '/campaigns/' || c.id::text,
      CASE WHEN c.search_vector @@ v_ts_query THEN ts_rank(c.search_vector, v_ts_query)::float8 ELSE 0.1::float8 END
    FROM app.campaigns c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND (c.search_vector @@ v_ts_query OR lower(c.name) LIKE v_like)

    UNION ALL

    SELECT
      'price_list'::text,
      pl.id,
      pl.name,
      COALESCE(pl.description, ''),
      '/price-lists/' || pl.id::text,
      CASE WHEN pl.search_vector @@ v_ts_query THEN ts_rank(pl.search_vector, v_ts_query)::float8 ELSE 0.1::float8 END
    FROM app.price_lists pl
    WHERE pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL
      AND (pl.search_vector @@ v_ts_query OR lower(pl.name) LIKE v_like)

    UNION ALL

    SELECT
      'order'::text,
      o.id,
      o.order_number,
      COALESCE(bu.business_name, ''),
      '/sales-orders/' || o.id::text,
      1.0::float8
    FROM app.orders o
    LEFT JOIN app.buyers bu ON bu.id = o.buyer_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND (NOT v_is_assistant OR o.location_id = ANY (v_location_ids))
      AND lower(o.order_number) LIKE v_like

    UNION ALL

    SELECT
      'invoice'::text,
      i.id,
      i.invoice_number,
      COALESCE(bu.business_name, ''),
      '/invoices/' || i.id::text,
      1.0::float8
    FROM app.invoices i
    LEFT JOIN app.buyers bu ON bu.id = i.buyer_id
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND (NOT v_is_assistant OR i.location_id = ANY (v_location_ids))
      AND lower(i.invoice_number) LIKE v_like

    UNION ALL

    SELECT
      'estimate'::text,
      e.id,
      COALESCE(e.estimate_number, ''),
      COALESCE(bu.business_name, ''),
      '/estimates/' || e.id::text,
      1.0::float8
    FROM app.estimates e
    LEFT JOIN app.buyers bu ON bu.id = e.buyer_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND (NOT v_is_assistant OR e.location_id = ANY (v_location_ids))
      AND lower(COALESCE(e.estimate_number, '')) LIKE v_like

    UNION ALL

    SELECT
      'location'::text,
      l.id,
      l.name,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(l.address->>'city', ''), ''),
        NULLIF(COALESCE(l.address->>'state', ''), '')
      ),
      '/locations/' || l.id::text,
      CASE WHEN l.search_vector @@ v_ts_query THEN ts_rank(l.search_vector, v_ts_query)::float8 ELSE 0.1::float8 END
    FROM app.locations l
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (NOT v_is_assistant OR l.id = ANY (v_location_ids))
      AND (
        l.search_vector @@ v_ts_query
        OR lower(l.name) LIKE v_like
        OR lower(COALESCE(l.address::text, '')) LIKE v_like
      )

    UNION ALL

    SELECT
      'warehouse'::text,
      w.id,
      w.name,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(w.address->>'city', ''), ''),
        NULLIF(COALESCE(w.address->>'state', ''), '')
      ),
      '/warehouses/' || w.id::text,
      CASE WHEN w.search_vector @@ v_ts_query THEN ts_rank(w.search_vector, v_ts_query)::float8 ELSE 0.1::float8 END
    FROM app.warehouses w
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND (NOT v_is_assistant OR w.location_id = ANY (v_location_ids))
      AND (
        w.search_vector @@ v_ts_query
        OR lower(w.name) LIKE v_like
        OR lower(COALESCE(w.address::text, '')) LIKE v_like
      )
  ),
  ranked AS (
    SELECT
      m.entity_type,
      m.id,
      m.label,
      m.sublabel,
      m.url_path,
      ROW_NUMBER() OVER (PARTITION BY m.entity_type ORDER BY m.rank DESC, m.label ASC) AS rn
    FROM all_matches m
  )
  SELECT
    r.entity_type,
    r.id,
    r.label,
    r.sublabel,
    r.url_path
  FROM ranked r
  WHERE r.rn <= p_items_per_group
  ORDER BY r.entity_type, r.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION app.global_search(text, uuid, text, int, public.vector, uuid[]) TO authenticated;
