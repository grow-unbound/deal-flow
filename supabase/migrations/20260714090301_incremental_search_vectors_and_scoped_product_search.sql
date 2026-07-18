SET lock_timeout = '5s';

DROP FUNCTION IF EXISTS app.rebuild_tenant_products_search_vectors(uuid, uuid[]);

CREATE OR REPLACE FUNCTION app.rebuild_tenant_products_search_vectors(
  p_tenant_id uuid,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '30s'
SET lock_timeout = '2s'
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
    WHERE tp.tenant_id = p_tenant_id
      AND tp.id = ANY (p_ids)
      AND tp.deleted_at IS NULL
  )
  UPDATE app.tenant_products tp
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = tp.id
    AND tp.search_vector IS DISTINCT FROM joined.search_vector;
$$;

REVOKE ALL ON FUNCTION app.rebuild_tenant_products_search_vectors(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.rebuild_tenant_products_search_vectors(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_tenant_products_search_vectors(uuid, uuid[]) TO service_role;

DROP FUNCTION IF EXISTS app.rebuild_buyers_search_vectors(uuid, uuid[]);

CREATE OR REPLACE FUNCTION app.rebuild_buyers_search_vectors(
  p_tenant_id uuid,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '30s'
SET lock_timeout = '2s'
AS $$
  WITH target_buyers AS MATERIALIZED (
    SELECT b.id
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.id = ANY (p_ids)
      AND b.deleted_at IS NULL
  ),
  buyer_contacts AS (
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
    JOIN target_buyers target ON target.id = bu.buyer_id
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
          COALESCE(contacts.contact_text, '')
        )
      ) AS search_vector
    FROM target_buyers target
    JOIN app.buyers b ON b.id = target.id
    LEFT JOIN buyer_contacts contacts ON contacts.buyer_id = b.id
  )
  UPDATE app.buyers b
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = b.id
    AND b.search_vector IS DISTINCT FROM joined.search_vector;
$$;

REVOKE ALL ON FUNCTION app.rebuild_buyers_search_vectors(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.rebuild_buyers_search_vectors(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_buyers_search_vectors(uuid, uuid[]) TO service_role;

DROP FUNCTION IF EXISTS app.rebuild_buyer_users_search_vectors(uuid[], uuid[]);

CREATE OR REPLACE FUNCTION app.rebuild_buyer_users_search_vectors(
  p_buyer_ids uuid[] DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '30s'
SET lock_timeout = '2s'
AS $$
  UPDATE app.buyer_users bu
  SET search_vector = to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(b.business_name, ''),
      COALESCE(bu.first_name, ''),
      COALESCE(bu.last_name, ''),
      COALESCE(bu.email, ''),
      COALESCE(bu.phone, ''),
      COALESCE(bu.designation, ''),
      COALESCE(bu.department, '')
    )
  )
  FROM app.buyers b
  WHERE b.id = bu.buyer_id
    AND bu.deleted_at IS NULL
    AND bu.search_vector IS DISTINCT FROM to_tsvector(
      'english',
      concat_ws(
        ' ',
        COALESCE(b.business_name, ''),
        COALESCE(bu.first_name, ''),
        COALESCE(bu.last_name, ''),
        COALESCE(bu.email, ''),
        COALESCE(bu.phone, ''),
        COALESCE(bu.designation, ''),
        COALESCE(bu.department, '')
      )
    )
    AND (
      (p_buyer_ids IS NOT NULL AND bu.buyer_id = ANY (p_buyer_ids))
      OR (p_ids IS NOT NULL AND bu.id = ANY (p_ids))
    );
$$;

REVOKE ALL ON FUNCTION app.rebuild_buyer_users_search_vectors(uuid[], uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.rebuild_buyer_users_search_vectors(uuid[], uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_buyer_users_search_vectors(uuid[], uuid[]) TO service_role;

DROP FUNCTION IF EXISTS app.rebuild_tenant_brands_search_vectors(uuid, uuid[]);

CREATE OR REPLACE FUNCTION app.rebuild_tenant_brands_search_vectors(
  p_tenant_id uuid DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '30s'
SET lock_timeout = '2s'
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
    WHERE tb.tenant_id = p_tenant_id
      AND tb.id = ANY (p_ids)
      AND tb.deleted_at IS NULL
  )
  UPDATE app.tenant_brands tb
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = tb.id
    AND tb.search_vector IS DISTINCT FROM joined.search_vector;
$$;

REVOKE ALL ON FUNCTION app.rebuild_tenant_brands_search_vectors(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.rebuild_tenant_brands_search_vectors(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_tenant_brands_search_vectors(uuid, uuid[]) TO service_role;

DROP FUNCTION IF EXISTS app.rebuild_tenant_categories_search_vectors(uuid, uuid[]);

CREATE OR REPLACE FUNCTION app.rebuild_tenant_categories_search_vectors(
  p_tenant_id uuid DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '30s'
SET lock_timeout = '2s'
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
    WHERE tc.tenant_id = p_tenant_id
      AND tc.id = ANY (p_ids)
      AND tc.deleted_at IS NULL
  )
  UPDATE app.tenant_categories tc
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = tc.id
    AND tc.search_vector IS DISTINCT FROM joined.search_vector;
$$;

REVOKE ALL ON FUNCTION app.rebuild_tenant_categories_search_vectors(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.rebuild_tenant_categories_search_vectors(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_tenant_categories_search_vectors(uuid, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION app.rebuild_locations_search_vectors(
  p_tenant_id uuid,
  p_ids uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '30s'
SET lock_timeout = '2s'
AS $$
  WITH joined AS (
    SELECT
      l.id,
      to_tsvector(
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
      ) AS search_vector
    FROM app.locations l
    WHERE l.deleted_at IS NULL
      AND l.tenant_id = p_tenant_id
      AND l.id = ANY (p_ids)
  )
  UPDATE app.locations l
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = l.id
    AND l.search_vector IS DISTINCT FROM joined.search_vector;
$$;

REVOKE ALL ON FUNCTION app.rebuild_locations_search_vectors(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.rebuild_locations_search_vectors(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_locations_search_vectors(uuid, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION app.rebuild_warehouses_search_vectors(
  p_tenant_id uuid,
  p_ids uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '30s'
SET lock_timeout = '2s'
AS $$
  WITH joined AS (
    SELECT
      w.id,
      to_tsvector(
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
      ) AS search_vector
    FROM app.warehouses w
    WHERE w.deleted_at IS NULL
      AND w.tenant_id = p_tenant_id
      AND w.id = ANY (p_ids)
  )
  UPDATE app.warehouses w
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = w.id
    AND w.search_vector IS DISTINCT FROM joined.search_vector;
$$;

REVOKE ALL ON FUNCTION app.rebuild_warehouses_search_vectors(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.rebuild_warehouses_search_vectors(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_warehouses_search_vectors(uuid, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION app.rebuild_cohorts_search_vectors(
  p_tenant_id uuid,
  p_ids uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '30s'
SET lock_timeout = '2s'
AS $$
  WITH joined AS (
    SELECT
      c.id,
      to_tsvector('english', concat_ws(' ', COALESCE(c.name, ''), COALESCE(c.description, ''))) AS search_vector
    FROM app.cohorts c
    WHERE c.deleted_at IS NULL
      AND c.tenant_id = p_tenant_id
      AND c.id = ANY (p_ids)
  )
  UPDATE app.cohorts c
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = c.id
    AND c.search_vector IS DISTINCT FROM joined.search_vector;
$$;

REVOKE ALL ON FUNCTION app.rebuild_cohorts_search_vectors(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.rebuild_cohorts_search_vectors(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_cohorts_search_vectors(uuid, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION app.rebuild_campaigns_search_vectors(
  p_tenant_id uuid,
  p_ids uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '30s'
SET lock_timeout = '2s'
AS $$
  WITH joined AS (
    SELECT
      c.id,
      to_tsvector('english', concat_ws(' ', COALESCE(c.name, ''), COALESCE(c.status, ''))) AS search_vector
    FROM app.campaigns c
    WHERE c.deleted_at IS NULL
      AND c.tenant_id = p_tenant_id
      AND c.id = ANY (p_ids)
  )
  UPDATE app.campaigns c
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = c.id
    AND c.search_vector IS DISTINCT FROM joined.search_vector;
$$;

REVOKE ALL ON FUNCTION app.rebuild_campaigns_search_vectors(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.rebuild_campaigns_search_vectors(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_campaigns_search_vectors(uuid, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION app.rebuild_price_lists_search_vectors(
  p_tenant_id uuid,
  p_ids uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '30s'
SET lock_timeout = '2s'
AS $$
  WITH joined AS (
    SELECT
      pl.id,
      to_tsvector('english', concat_ws(' ', COALESCE(pl.name, ''), COALESCE(pl.description, ''))) AS search_vector
    FROM app.price_lists pl
    WHERE pl.deleted_at IS NULL
      AND pl.tenant_id = p_tenant_id
      AND pl.id = ANY (p_ids)
  )
  UPDATE app.price_lists pl
  SET search_vector = joined.search_vector
  FROM joined
  WHERE joined.id = pl.id
    AND pl.search_vector IS DISTINCT FROM joined.search_vector;
$$;

REVOKE ALL ON FUNCTION app.rebuild_price_lists_search_vectors(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.rebuild_price_lists_search_vectors(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.rebuild_price_lists_search_vectors(uuid, uuid[]) TO service_role;

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

  IF TG_OP = 'UPDATE'
    AND NEW.name_override IS NOT DISTINCT FROM OLD.name_override
    AND NEW.description IS NOT DISTINCT FROM OLD.description
    AND NEW.internal_sku IS NOT DISTINCT FROM OLD.internal_sku
    AND NEW.hsn_code IS NOT DISTINCT FROM OLD.hsn_code
    AND NEW.master_product_id IS NOT DISTINCT FROM OLD.master_product_id
    AND NEW.tenant_brand_id IS NOT DISTINCT FROM OLD.tenant_brand_id
    AND NEW.tenant_category_id IS NOT DISTINCT FROM OLD.tenant_category_id
    AND NEW.attributes_override IS NOT DISTINCT FROM OLD.attributes_override THEN
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

  IF TG_OP = 'UPDATE'
    AND NEW.business_name IS NOT DISTINCT FROM OLD.business_name
    AND NEW.contact_name IS NOT DISTINCT FROM OLD.contact_name
    AND NEW.phone IS NOT DISTINCT FROM OLD.phone
    AND NEW.email IS NOT DISTINCT FROM OLD.email
    AND NEW.gstin IS NOT DISTINCT FROM OLD.gstin
    AND NEW.gst_treatment IS NOT DISTINCT FROM OLD.gst_treatment
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.geography IS NOT DISTINCT FROM OLD.geography THEN
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

CREATE OR REPLACE FUNCTION app.buyer_users_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_business_name text;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.buyer_id IS NOT DISTINCT FROM OLD.buyer_id
    AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name
    AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name
    AND NEW.phone IS NOT DISTINCT FROM OLD.phone
    AND NEW.email IS NOT DISTINCT FROM OLD.email
    AND NEW.designation IS NOT DISTINCT FROM OLD.designation
    AND NEW.department IS NOT DISTINCT FROM OLD.department
    AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  SELECT b.business_name
  INTO v_business_name
  FROM app.buyers b
  WHERE b.id = NEW.buyer_id;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(NEW.first_name, ''),
      COALESCE(NEW.last_name, ''),
      COALESCE(NEW.phone, ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.designation, ''),
      COALESCE(NEW.department, ''),
      COALESCE(v_business_name, '')
    )
  );
  RETURN NEW;
END;
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

  IF TG_OP = 'UPDATE'
    AND NEW.display_name_override IS NOT DISTINCT FROM OLD.display_name_override
    AND NEW.description_override IS NOT DISTINCT FROM OLD.description_override
    AND NEW.description IS NOT DISTINCT FROM OLD.description
    AND NEW.principal_name IS NOT DISTINCT FROM OLD.principal_name
    AND NEW.contact_name IS NOT DISTINCT FROM OLD.contact_name
    AND NEW.categories IS NOT DISTINCT FROM OLD.categories
    AND NEW.master_brand_id IS NOT DISTINCT FROM OLD.master_brand_id THEN
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

  IF TG_OP = 'UPDATE'
    AND NEW.name IS NOT DISTINCT FROM OLD.name
    AND NEW.description IS NOT DISTINCT FROM OLD.description
    AND NEW.slug IS NOT DISTINCT FROM OLD.slug
    AND NEW.master_category_id IS NOT DISTINCT FROM OLD.master_category_id
    AND NEW.parent_tenant_category_id IS NOT DISTINCT FROM OLD.parent_tenant_category_id THEN
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

CREATE OR REPLACE FUNCTION app.locations_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.name IS NOT DISTINCT FROM OLD.name
    AND NEW.address IS NOT DISTINCT FROM OLD.address
    AND NEW.phone_number IS NOT DISTINCT FROM OLD.phone_number
    AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
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

  IF TG_OP = 'UPDATE'
    AND NEW.name IS NOT DISTINCT FROM OLD.name
    AND NEW.address IS NOT DISTINCT FROM OLD.address
    AND NEW.phone_number IS NOT DISTINCT FROM OLD.phone_number
    AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
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

CREATE OR REPLACE FUNCTION app.cohorts_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.name IS NOT DISTINCT FROM OLD.name
    AND NEW.description IS NOT DISTINCT FROM OLD.description THEN
    RETURN NEW;
  END IF;

  NEW.search_vector := to_tsvector('english', concat_ws(' ', COALESCE(NEW.name, ''), COALESCE(NEW.description, '')));
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

  IF TG_OP = 'UPDATE'
    AND NEW.name IS NOT DISTINCT FROM OLD.name
    AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  NEW.search_vector := to_tsvector('english', concat_ws(' ', COALESCE(NEW.name, ''), COALESCE(NEW.status, '')));
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

  IF TG_OP = 'UPDATE'
    AND NEW.name IS NOT DISTINCT FROM OLD.name
    AND NEW.description IS NOT DISTINCT FROM OLD.description THEN
    RETURN NEW;
  END IF;

  NEW.search_vector := to_tsvector('english', concat_ws(' ', COALESCE(NEW.name, ''), COALESCE(NEW.description, '')));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_product_vectors_from_tenant_brand()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  IF NEW.display_name_override IS NOT DISTINCT FROM OLD.display_name_override
    AND NEW.description_override IS NOT DISTINCT FROM OLD.description_override
    AND NEW.description IS NOT DISTINCT FROM OLD.description
    AND NEW.categories IS NOT DISTINCT FROM OLD.categories
    AND NEW.master_brand_id IS NOT DISTINCT FROM OLD.master_brand_id THEN
    RETURN NEW;
  END IF;

  SELECT ARRAY(
    SELECT tp.id
    FROM app.tenant_products tp
    WHERE tp.tenant_brand_id = NEW.id
      AND tp.deleted_at IS NULL
  ) INTO v_ids;

  IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
    PERFORM app.rebuild_tenant_products_search_vectors(NEW.tenant_id, v_ids);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_product_vectors_from_tenant_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_ids uuid[];
  v_child_ids uuid[];
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  IF NEW.name IS NOT DISTINCT FROM OLD.name
    AND NEW.description IS NOT DISTINCT FROM OLD.description
    AND NEW.master_category_id IS NOT DISTINCT FROM OLD.master_category_id
    AND NEW.parent_tenant_category_id IS NOT DISTINCT FROM OLD.parent_tenant_category_id THEN
    RETURN NEW;
  END IF;

  SELECT ARRAY(
    SELECT child.id
    FROM app.tenant_categories child
    WHERE child.tenant_id = NEW.tenant_id
      AND child.parent_tenant_category_id = NEW.id
      AND child.deleted_at IS NULL
  ) INTO v_child_ids;

  IF COALESCE(array_length(v_child_ids, 1), 0) > 0 THEN
    PERFORM app.rebuild_tenant_categories_search_vectors(NEW.tenant_id, v_child_ids);
  END IF;

  SELECT ARRAY(
    SELECT tp.id
    FROM app.tenant_products tp
    WHERE (
        tp.tenant_category_id = NEW.id
        OR tp.tenant_category_id = ANY (COALESCE(v_child_ids, ARRAY[]::uuid[]))
      )
      AND tp.deleted_at IS NULL
  ) INTO v_ids;

  IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
    PERFORM app.rebuild_tenant_products_search_vectors(NEW.tenant_id, v_ids);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_buyer_search_vector_from_contact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_buyer_ids uuid[];
  v_tenant_id uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_buyer_ids := ARRAY(
    SELECT DISTINCT buyer_id
    FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END
    ]) AS changed(buyer_id)
    WHERE buyer_id IS NOT NULL
  );

  FOR v_tenant_id IN
    SELECT DISTINCT b.tenant_id
    FROM app.buyers b
    WHERE b.id = ANY (v_buyer_ids)
  LOOP
    PERFORM app.rebuild_buyers_search_vectors(
      v_tenant_id,
      ARRAY(
        SELECT b.id
        FROM app.buyers b
        WHERE b.tenant_id = v_tenant_id
          AND b.id = ANY (v_buyer_ids)
      )
    );
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_buyer_user_vectors_from_buyer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF app.sync_trigger_bypass_active()
    OR NEW.business_name IS NOT DISTINCT FROM OLD.business_name THEN
    RETURN NEW;
  END IF;

  PERFORM app.rebuild_buyer_users_search_vectors(ARRAY[NEW.id], NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_buyer_user_vectors_from_buyer ON app.buyers;
CREATE TRIGGER refresh_buyer_user_vectors_from_buyer
AFTER UPDATE OF business_name ON app.buyers
FOR EACH ROW EXECUTE FUNCTION app.refresh_buyer_user_vectors_from_buyer();

DROP TRIGGER IF EXISTS buyer_users_search_vector_update ON app.buyer_users;
CREATE TRIGGER buyer_users_search_vector_update
BEFORE INSERT OR UPDATE OF buyer_id, first_name, last_name, phone, email, designation, department, is_active, deleted_at
ON app.buyer_users
FOR EACH ROW EXECUTE FUNCTION app.buyer_users_search_vector_update();

-- Snapshot dispatch must not run for search-vector-only rebuilds. These
-- column-specific triggers preserve normal business refreshes while excluding
-- search_vector, embedding, and audit-only updates from expensive fan-out.
DROP TRIGGER IF EXISTS trg_buyer_users_dispatch ON app.buyer_users;
CREATE TRIGGER trg_buyer_users_dispatch
AFTER INSERT OR DELETE OR UPDATE OF buyer_id, user_id, role, is_active, deleted_at,
  phone, first_name, last_name, email, designation, department, external_ref
ON app.buyer_users
FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_buyer_users();

DROP TRIGGER IF EXISTS trg_buyers_dispatch ON app.buyers;
CREATE TRIGGER trg_buyers_dispatch
AFTER INSERT OR DELETE OR UPDATE OF tenant_id, business_name, contact_name, phone,
  email, gstin, geography, credit_limit, payment_terms_days, tier, external_ref,
  is_active, deleted_at, default_cohort_id, buyer_app_enabled, gst_treatment,
  status, billing_address, shipping_address, whatsapp_consent_at,
  whatsapp_consent_method, whatsapp_opt_out_at, custom_fields
ON app.buyers
FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_buyers();

DROP TRIGGER IF EXISTS trg_tenant_brands_dispatch ON app.tenant_brands;
CREATE TRIGGER trg_tenant_brands_dispatch
AFTER INSERT OR DELETE OR UPDATE OF tenant_id, master_brand_id,
  display_name_override, margin_pct, exclusivity, is_active, external_ref,
  description_override, logo_url_override, deleted_at, logo_url, principal_name,
  principal_email, principal_phone, principal_location, contact_name,
  contact_email, contact_phone, default_cohort_id, r2_logo_original_key,
  r2_logo_medium_key, r2_logo_thumb_key, slug, description, categories
ON app.tenant_brands
FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_tenant_brands();

DROP TRIGGER IF EXISTS trg_tenant_products_dispatch ON app.tenant_products;
CREATE TRIGGER trg_tenant_products_dispatch
AFTER INSERT OR DELETE OR UPDATE OF tenant_id, tenant_brand_id,
  master_product_id, internal_sku, name_override, attributes_override, mrp,
  base_selling_price, cost_price, default_uom, pack_size, image_urls, is_active,
  external_ref, deleted_at, hsn_code, gst_rate, r2_original_key, r2_large_key,
  r2_medium_key, r2_small_key, r2_thumb_key, description, tenant_category_id
ON app.tenant_products
FOR EACH ROW EXECUTE FUNCTION app.dispatch_from_tenant_products();

DROP TRIGGER IF EXISTS integration_sync_jobs_rebuild_search_vectors ON app.integration_sync_jobs;
DROP FUNCTION IF EXISTS app.rebuild_search_vectors_after_sync();
DROP FUNCTION IF EXISTS app.rebuild_tenant_search_vectors(uuid);

CREATE OR REPLACE FUNCTION app.search_products_scoped(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_buyer_id uuid DEFAULT NULL,
  p_price_list_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_query_embedding public.vector DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL,
  p_brand_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_allowed_brand_ids uuid[] DEFAULT NULL,
  p_warehouse_ids uuid[] DEFAULT NULL,
  p_availability text DEFAULT 'show_all',
  p_sort text DEFAULT 'relevance',
  p_include_inventory boolean DEFAULT true,
  p_campaign_id uuid DEFAULT NULL,
  p_category_scope_id uuid DEFAULT NULL
)
RETURNS TABLE(
  tenant_product_id uuid,
  product_name text,
  sku text,
  brand_id uuid,
  brand_name text,
  category_id uuid,
  category_name text,
  hsn_code text,
  tax_pct numeric,
  on_hand numeric,
  reorder_point numeric,
  unit_price numeric,
  mrp numeric,
  base_selling_price numeric,
  cost_price numeric,
  default_uom text,
  pack_size numeric,
  created_at timestamptz,
  search_rank double precision,
  total_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
  WITH normalized AS (
    SELECT
      NULLIF(btrim(p_query), '') AS query,
      CASE
        WHEN NULLIF(btrim(p_query), '') IS NULL THEN NULL
        ELSE websearch_to_tsquery('english', NULLIF(btrim(p_query), ''))
      END AS ts_query,
      CASE
        WHEN NULLIF(btrim(p_query), '') IS NULL THEN NULL
        ELSE (
          SELECT to_tsquery(
            'english',
            string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
          )
          FROM unnest(tsvector_to_array(to_tsvector('english', NULLIF(btrim(p_query), '')))) AS terms(lexeme)
        )
      END AS prefix_ts_query,
      lower(NULLIF(btrim(p_query), '')) AS like_q,
      p_query_embedding AS query_embedding,
      CASE
        WHEN p_buyer_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM app.buyers b
          WHERE b.id = p_buyer_id
            AND b.tenant_id = p_tenant_id
            AND b.deleted_at IS NULL
        ) THEN p_buyer_id
      END AS buyer_id,
      CASE
        WHEN p_price_list_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM app.price_lists pl
          WHERE pl.id = p_price_list_id
            AND pl.tenant_id = p_tenant_id
            AND pl.deleted_at IS NULL
        ) THEN p_price_list_id
      END AS price_list_id,
      LEAST(GREATEST(p_limit, 1), 100) AS page_size,
      GREATEST(p_offset, 0) AS page_offset
  ),
  inventory AS (
    SELECT
      ti.tenant_product_id,
      SUM(COALESCE(ti.qty_available, 0))::numeric AS on_hand,
      MAX(COALESCE(ti.reorder_point, 0))::numeric AS reorder_point,
      MAX(ti.updated_at) AS inventory_updated_at
    FROM app.tenant_inventory ti
    JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
      AND ti.deleted_at IS NULL
      AND p_include_inventory
      AND p_availability NOT IN ('show_all', 'show_everything')
      AND (p_warehouse_ids IS NULL OR ti.warehouse_id = ANY (p_warehouse_ids))
    GROUP BY ti.tenant_product_id
  ),
  scoped_products AS (
    SELECT
      tp.id AS tenant_product_id,
      COALESCE(tp.name_override, cp.name, tp.internal_sku) AS product_name,
      tp.internal_sku AS sku,
      tp.name_override,
      tp.tenant_brand_id AS brand_id,
      COALESCE(tb.display_name_override, cb.name, 'Brand') AS brand_name,
      tp.tenant_category_id AS category_id,
      COALESCE(tc.name, '') AS category_name,
      COALESCE(tp.hsn_code, cp.hsn_code) AS hsn_code,
      COALESCE(tp.gst_rate, cp.gst_rate) AS tax_pct,
      COALESCE(inv.on_hand, 0) AS on_hand,
      COALESCE(inv.reorder_point, 0) AS reorder_point,
      inv.inventory_updated_at,
      tp.base_selling_price AS unit_price,
      COALESCE(tp.mrp, 0) AS mrp,
      tp.base_selling_price,
      tp.cost_price,
      tp.default_uom,
      tp.pack_size,
      tp.created_at,
      tp.search_vector,
      tp.embedding,
      campaign_scope.display_order AS campaign_display_order,
      lower(
        concat_ws(
          ' ',
          COALESCE(tp.name_override, cp.name, ''),
          COALESCE(tp.internal_sku, ''),
          COALESCE(tb.display_name_override, cb.name, ''),
          COALESCE(tc.name, ''),
          COALESCE(tp.hsn_code, cp.hsn_code, ''),
          COALESCE(tp.attributes_override::text, ''),
          COALESCE(cp.attributes::text, '')
        )
      ) AS search_text
    FROM app.tenant_products tp
    LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc
      ON tc.id = tp.tenant_category_id
      AND tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
    LEFT JOIN inventory inv ON inv.tenant_product_id = tp.id
    LEFT JOIN LATERAL (
      SELECT ci.id AS campaign_item_id, ci.display_order
      FROM app.campaign_items ci
      JOIN app.campaigns campaign ON campaign.id = ci.campaign_id
      WHERE p_campaign_id IS NOT NULL
        AND ci.campaign_id = p_campaign_id
        AND ci.tenant_product_id = tp.id
        AND ci.deleted_at IS NULL
        AND campaign.tenant_id = p_tenant_id
        AND campaign.deleted_at IS NULL
      ORDER BY ci.display_order NULLS LAST, ci.id
      LIMIT 1
    ) campaign_scope ON true
    WHERE tp.tenant_id = p_tenant_id
      AND EXISTS (
        SELECT 1
        FROM app.tenants tenant
        WHERE tenant.id = p_tenant_id
      )
      AND tp.is_active = true
      AND tp.deleted_at IS NULL
      AND (p_ids IS NULL OR tp.id = ANY (p_ids))
      AND (p_brand_ids IS NULL OR tp.tenant_brand_id = ANY (p_brand_ids))
      AND (p_category_ids IS NULL OR tp.tenant_category_id = ANY (p_category_ids))
      AND (
        p_category_scope_id IS NULL
        OR tc.id = p_category_scope_id
        OR tc.master_category_id = p_category_scope_id
        OR cp.category_id = p_category_scope_id
      )
      AND (p_allowed_brand_ids IS NULL OR tp.tenant_brand_id = ANY (p_allowed_brand_ids))
      AND (p_campaign_id IS NULL OR campaign_scope.campaign_item_id IS NOT NULL)
  ),
  ranked AS (
    SELECT
      sp.*,
      COALESCE(
        CASE
          WHEN n.ts_query IS NOT NULL AND sp.search_vector @@ n.ts_query
            THEN ts_rank(sp.search_vector, n.ts_query)
          WHEN n.prefix_ts_query IS NOT NULL AND sp.search_vector @@ n.prefix_ts_query
            THEN 0.75 * ts_rank(sp.search_vector, n.prefix_ts_query)
          ELSE 0
        END,
        0
      )
      + CASE
          WHEN n.like_q IS NOT NULL AND n.like_q <> ''
            THEN 0.25 * public.similarity(sp.search_text, n.like_q)
          ELSE 0
        END
      + CASE
          WHEN n.query_embedding IS NOT NULL AND sp.embedding IS NOT NULL
            THEN 0.35 * (1 - (sp.embedding OPERATOR(public.<=>) n.query_embedding))
          ELSE 0
        END AS search_rank
    FROM scoped_products sp
    CROSS JOIN normalized n
    WHERE (
      n.query IS NULL
      OR (n.ts_query IS NOT NULL AND sp.search_vector @@ n.ts_query)
      OR (n.prefix_ts_query IS NOT NULL AND sp.search_vector @@ n.prefix_ts_query)
      OR lower(sp.name_override) LIKE '%' || n.like_q || '%'
      OR lower(sp.sku) LIKE '%' || n.like_q || '%'
      OR (
        n.query_embedding IS NOT NULL
        AND sp.embedding IS NOT NULL
        AND (1 - (sp.embedding OPERATOR(public.<=>) n.query_embedding)) >= 0.15
      )
    )
      AND (
        p_availability = 'show_all'
        OR p_availability = 'show_everything'
        OR (p_availability = 'in_stock' AND COALESCE(sp.on_hand, 0) > 0)
        OR (p_availability = 'in_stock_only' AND COALESCE(sp.on_hand, 0) > 0)
        OR (p_availability = 'low_stock' AND COALESCE(sp.on_hand, 0) > 0 AND COALESCE(sp.reorder_point, 0) > 0 AND COALESCE(sp.on_hand, 0) <= COALESCE(sp.reorder_point, 0))
        OR (p_availability = 'low_stock_only' AND COALESCE(sp.on_hand, 0) > 0 AND COALESCE(sp.reorder_point, 0) > 0 AND COALESCE(sp.on_hand, 0) <= COALESCE(sp.reorder_point, 0))
        OR (p_availability = 'out_of_stock' AND COALESCE(sp.on_hand, 0) <= 0)
        OR (
          p_availability = 'new_in_stock_today'
          AND COALESCE(sp.on_hand, 0) > 0
          AND sp.inventory_updated_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
        )
        OR (
          p_availability = 'old_stock'
          AND sp.created_at < now() - interval '7 days'
          AND NOT (
            COALESCE(sp.on_hand, 0) > 0
            AND sp.inventory_updated_at >= now() - interval '3 days'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM app.order_items oi
            JOIN app.orders recent_order ON recent_order.id = oi.order_id
            WHERE oi.tenant_product_id = sp.tenant_product_id
              AND oi.deleted_at IS NULL
              AND recent_order.tenant_id = p_tenant_id
              AND recent_order.deleted_at IS NULL
              AND recent_order.status <> 'cancelled'
              AND COALESCE(
                (recent_order.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'),
                recent_order.created_at
              ) >= now() - interval '30 days'
          )
        )
      )
  ),
  paged AS MATERIALIZED (
    SELECT
      ranked.*,
      COUNT(*) OVER() AS total_count,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE
            WHEN n.query IS NULL AND p_campaign_id IS NOT NULL THEN 0
            WHEN n.query IS NULL AND p_sort = 'created_desc' THEN 0
            WHEN n.query IS NULL AND p_sort = 'name_asc' THEN 1
            ELSE 2
          END ASC,
          CASE WHEN n.query IS NULL AND p_campaign_id IS NOT NULL THEN ranked.campaign_display_order END ASC NULLS LAST,
          CASE WHEN n.query IS NULL AND p_sort = 'created_desc' THEN ranked.created_at END DESC,
          CASE WHEN n.query IS NULL AND p_sort = 'name_asc' THEN ranked.product_name END ASC,
          CASE WHEN n.query IS NULL AND p_sort = 'name_asc' THEN ranked.sku END ASC,
          ranked.search_rank DESC,
          ranked.product_name ASC,
          ranked.sku ASC,
          ranked.tenant_product_id ASC
      ) AS page_order
    FROM ranked
    CROSS JOIN normalized n
    ORDER BY page_order
    OFFSET (SELECT page_offset FROM normalized)
    LIMIT (SELECT page_size FROM normalized)
  ),
  page_inventory AS (
    SELECT
      ti.tenant_product_id,
      SUM(COALESCE(ti.qty_available, 0))::numeric AS on_hand,
      MAX(COALESCE(ti.reorder_point, 0))::numeric AS reorder_point
    FROM app.tenant_inventory ti
    JOIN paged page ON page.tenant_product_id = ti.tenant_product_id
    WHERE p_include_inventory
      AND ti.deleted_at IS NULL
      AND (p_warehouse_ids IS NULL OR ti.warehouse_id = ANY (p_warehouse_ids))
    GROUP BY ti.tenant_product_id
  )
  SELECT
    page.tenant_product_id,
    page.product_name,
    page.sku,
    page.brand_id,
    page.brand_name,
    page.category_id,
    page.category_name,
    page.hsn_code,
    page.tax_pct,
    COALESCE(page_inv.on_hand, page.on_hand, 0) AS on_hand,
    COALESCE(page_inv.reorder_point, page.reorder_point, 0) AS reorder_point,
    COALESCE(
      pl_override.price,
      CASE
        WHEN n.buyer_id IS NOT NULL THEN app.resolve_price(page.tenant_product_id, n.buyer_id, 1)
        ELSE NULL
      END,
      page.base_selling_price,
      0
    ) AS unit_price,
    page.mrp,
    page.base_selling_price,
    page.cost_price,
    page.default_uom,
    page.pack_size,
    page.created_at,
    page.search_rank,
    page.total_count
  FROM paged page
  CROSS JOIN normalized n
  LEFT JOIN page_inventory page_inv ON page_inv.tenant_product_id = page.tenant_product_id
  LEFT JOIN LATERAL (
    SELECT pli.price
    FROM app.price_list_items pli
    WHERE n.price_list_id IS NOT NULL
      AND pli.price_list_id = n.price_list_id
      AND pli.tenant_product_id = page.tenant_product_id
      AND pli.deleted_at IS NULL
      AND COALESCE(pli.min_qty, 1) <= 1
    ORDER BY COALESCE(pli.min_qty, 1) DESC, pli.created_at DESC
    LIMIT 1
  ) pl_override ON true
  ORDER BY page.page_order;
$$;

REVOKE ALL ON FUNCTION app.search_products_scoped(uuid, text, uuid, uuid, integer, integer, public.vector, uuid[], uuid[], uuid[], uuid[], uuid[], text, text, boolean, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_products_scoped(uuid, text, uuid, uuid, integer, integer, public.vector, uuid[], uuid[], uuid[], uuid[], uuid[], text, text, boolean, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION app.search_products_scoped(uuid, text, uuid, uuid, integer, integer, public.vector, uuid[], uuid[], uuid[], uuid[], uuid[], text, text, boolean, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_products_scoped(uuid, text, uuid, uuid, integer, integer, public.vector, uuid[], uuid[], uuid[], uuid[], uuid[], text, text, boolean, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION app.get_buyer_product_facets_scoped(
  p_tenant_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_allowed_brand_ids uuid[] DEFAULT NULL,
  p_brand_scope_id uuid DEFAULT NULL,
  p_category_scope_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  facet_type text,
  facet_id uuid,
  facet_label text,
  facet_slug text,
  image_url text,
  image_thumb_key text,
  image_medium_key text,
  product_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog
SET statement_timeout = '5s'
SET lock_timeout = '2s'
AS $$
  WITH bounds AS (
    SELECT LEAST(GREATEST(p_limit, 1), 200) AS facet_limit
  ),
  scoped_products AS MATERIALIZED (
    SELECT
      tp.id,
      tp.tenant_brand_id,
      tb.master_brand_id,
      COALESCE(tb.display_name_override, cb.name, 'Brand') AS brand_name,
      COALESCE(tb.logo_url, cb.logo_url) AS brand_logo_url,
      tp.tenant_category_id,
      tc.master_category_id,
      tc.name AS tenant_category_name,
      tc.slug AS tenant_category_slug,
      tc.r2_image_thumb_key,
      tc.r2_image_medium_key,
      cp.category_id AS catalog_category_id,
      cc.name AS catalog_category_name,
      cc.slug AS catalog_category_slug,
      cc.image_url AS catalog_category_image_url
    FROM app.tenant_products tp
    LEFT JOIN app.tenant_brands tb
      ON tb.id = tp.tenant_brand_id
      AND tb.tenant_id = p_tenant_id
      AND tb.deleted_at IS NULL
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc
      ON tc.id = tp.tenant_category_id
      AND tc.tenant_id = p_tenant_id
      AND tc.is_active = true
      AND tc.deleted_at IS NULL
    LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
    LEFT JOIN catalog.categories cc ON cc.id = cp.category_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.is_active = true
      AND tp.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM app.tenants tenant
        WHERE tenant.id = p_tenant_id
      )
      AND (p_allowed_brand_ids IS NULL OR tp.tenant_brand_id = ANY (p_allowed_brand_ids))
      AND (
        p_brand_scope_id IS NULL
        OR tb.id = p_brand_scope_id
        OR tb.master_brand_id = p_brand_scope_id
      )
      AND (
        p_category_scope_id IS NULL
        OR tc.id = p_category_scope_id
        OR tc.master_category_id = p_category_scope_id
        OR cp.category_id = p_category_scope_id
      )
      AND (
        p_campaign_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM app.campaign_items ci
          JOIN app.campaigns campaign
            ON campaign.id = ci.campaign_id
            AND campaign.tenant_id = p_tenant_id
            AND campaign.deleted_at IS NULL
          WHERE ci.campaign_id = p_campaign_id
            AND ci.tenant_product_id = tp.id
            AND ci.deleted_at IS NULL
        )
      )
  ),
  brand_facets AS (
    SELECT
      'brand'::text AS facet_type,
      COALESCE(sp.master_brand_id, sp.tenant_brand_id) AS facet_id,
      sp.brand_name AS facet_label,
      NULL::text AS facet_slug,
      sp.brand_logo_url AS image_url,
      NULL::text AS image_thumb_key,
      NULL::text AS image_medium_key,
      COUNT(*)::bigint AS product_count
    FROM scoped_products sp
    WHERE sp.tenant_brand_id IS NOT NULL
    GROUP BY
      COALESCE(sp.master_brand_id, sp.tenant_brand_id),
      sp.brand_name,
      sp.brand_logo_url
    ORDER BY product_count DESC, facet_label ASC, facet_id ASC
    LIMIT (SELECT facet_limit FROM bounds)
  ),
  category_facets AS (
    SELECT
      'category'::text AS facet_type,
      COALESCE(sp.tenant_category_id, sp.catalog_category_id) AS facet_id,
      COALESCE(sp.tenant_category_name, sp.catalog_category_name) AS facet_label,
      COALESCE(sp.tenant_category_slug, sp.catalog_category_slug) AS facet_slug,
      sp.catalog_category_image_url AS image_url,
      sp.r2_image_thumb_key AS image_thumb_key,
      sp.r2_image_medium_key AS image_medium_key,
      COUNT(*)::bigint AS product_count
    FROM scoped_products sp
    WHERE COALESCE(sp.tenant_category_id, sp.catalog_category_id) IS NOT NULL
      AND COALESCE(sp.tenant_category_name, sp.catalog_category_name) IS NOT NULL
    GROUP BY
      COALESCE(sp.tenant_category_id, sp.catalog_category_id),
      COALESCE(sp.tenant_category_name, sp.catalog_category_name),
      COALESCE(sp.tenant_category_slug, sp.catalog_category_slug),
      sp.catalog_category_image_url,
      sp.r2_image_thumb_key,
      sp.r2_image_medium_key
    ORDER BY product_count DESC, facet_label ASC, facet_id ASC
    LIMIT (SELECT facet_limit FROM bounds)
  )
  SELECT * FROM brand_facets
  UNION ALL
  SELECT * FROM category_facets
  ORDER BY facet_type, product_count DESC, facet_label ASC, facet_id ASC;
$$;

REVOKE ALL ON FUNCTION app.get_buyer_product_facets_scoped(uuid, uuid, uuid[], uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_buyer_product_facets_scoped(uuid, uuid, uuid[], uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION app.get_buyer_product_facets_scoped(uuid, uuid, uuid[], uuid, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.get_buyer_product_facets_scoped(uuid, uuid, uuid[], uuid, uuid, integer) TO service_role;

DROP FUNCTION IF EXISTS app.search_products(uuid, text, uuid, uuid, integer, public.vector, uuid[]);

CREATE OR REPLACE FUNCTION app.search_products(
  p_tenant_id uuid,
  p_query text,
  p_buyer_id uuid DEFAULT NULL,
  p_price_list_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 12,
  p_query_embedding public.vector DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  tenant_product_id uuid,
  product_name text,
  sku text,
  brand_name text,
  category_name text,
  hsn_code text,
  tax_pct numeric,
  on_hand numeric,
  unit_price numeric,
  mrp numeric,
  base_selling_price numeric,
  default_uom text,
  pack_size numeric,
  search_rank double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog
AS $$
  SELECT
    sp.tenant_product_id,
    sp.product_name,
    sp.sku,
    sp.brand_name,
    sp.category_name,
    sp.hsn_code,
    sp.tax_pct,
    sp.on_hand,
    sp.unit_price,
    sp.mrp,
    sp.base_selling_price,
    sp.default_uom,
    sp.pack_size,
    sp.search_rank
  FROM app.search_products_scoped(
    p_tenant_id := p_tenant_id,
    p_query := p_query,
    p_buyer_id := p_buyer_id,
    p_price_list_id := p_price_list_id,
    p_limit := p_limit,
    p_offset := 0,
    p_query_embedding := p_query_embedding,
    p_ids := p_ids
  ) sp;
$$;

REVOKE ALL ON FUNCTION app.search_products(uuid, text, uuid, uuid, integer, public.vector, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_products(uuid, text, uuid, uuid, integer, public.vector, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_products(uuid, text, uuid, uuid, integer, public.vector, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION app.search_cohort_composer_buyers(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_geographies text[] DEFAULT NULL,
  p_last_order_bucket text DEFAULT NULL,
  p_gmv_buckets text[] DEFAULT NULL,
  p_ninety_days_ago date DEFAULT (CURRENT_DATE - 90),
  p_month_start date DEFAULT date_trunc('month', CURRENT_DATE)::date,
  p_next_month_start date DEFAULT (date_trunc('month', CURRENT_DATE) + interval '1 month')::date,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  buyer_id uuid,
  business_name text,
  contact_name text,
  external_ref text,
  geography jsonb,
  tier text,
  payment_terms_days integer,
  last_order_at timestamptz,
  outstanding_dues numeric,
  gmv_90d numeric,
  mtd_spend numeric,
  orders_mtd bigint,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, public
SET statement_timeout = '15s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_ts_query tsquery;
  v_prefix_query_text text;
  v_prefix_ts_query tsquery;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;

  IF v_query IS NOT NULL THEN
    v_ts_query := websearch_to_tsquery('english', v_query);

    SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
    INTO v_prefix_query_text
    FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);

    IF v_prefix_query_text IS NOT NULL THEN
      v_prefix_ts_query := to_tsquery('english', v_prefix_query_text);
    END IF;
  END IF;

  RETURN QUERY
  WITH eligible_buyers AS MATERIALIZED (
    SELECT
      b.id,
      b.business_name,
      b.contact_name,
      b.external_ref,
      b.geography,
      b.tier,
      b.payment_terms_days,
      CASE
        WHEN v_query IS NULL THEN 0::double precision
        WHEN b.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(b.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(b.search_vector, v_prefix_ts_query)::double precision
      END AS search_rank
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.is_active = true
      AND b.deleted_at IS NULL
      AND (
        COALESCE(cardinality(p_geographies), 0) = 0
        OR b.geography->>'city' = ANY (p_geographies)
      )
      AND (
        v_query IS NULL
        OR b.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND b.search_vector @@ v_prefix_ts_query)
      )
  ),
  buyer_kpis AS MATERIALIZED (
    SELECT
      k.buyer_id,
      COALESCE(sum(k.orders_gmv), 0) AS gmv_90d,
      COALESCE(sum(k.orders_gmv) FILTER (
        WHERE k.day >= p_month_start AND k.day < p_next_month_start
      ), 0) AS mtd_spend,
      COALESCE(sum(k.orders_count) FILTER (
        WHERE k.day >= p_month_start AND k.day < p_next_month_start
      ), 0)::bigint AS orders_mtd
    FROM app.kpi_buyers_daily k
    JOIN eligible_buyers eb ON eb.id = k.buyer_id
    WHERE k.tenant_id = p_tenant_id
      AND k.scope = 'tenant'
      AND k.day >= p_ninety_days_ago
    GROUP BY k.buyer_id
  ),
  filtered AS MATERIALIZED (
    SELECT
      eb.*,
      bs.last_order_at,
      COALESCE(bs.outstanding_dues, 0) AS outstanding_dues,
      COALESCE(k.gmv_90d, 0) AS gmv_90d,
      COALESCE(k.mtd_spend, 0) AS mtd_spend,
      COALESCE(k.orders_mtd, 0) AS orders_mtd
    FROM eligible_buyers eb
    LEFT JOIN app.buyers_snapshot bs
      ON bs.tenant_id = p_tenant_id
     AND bs.buyer_id = eb.id
     AND bs.scope = 'tenant'
    LEFT JOIN buyer_kpis k ON k.buyer_id = eb.id
    WHERE (
      p_last_order_bucket IS NULL
      OR p_last_order_bucket = 'anytime'
      OR (p_last_order_bucket = 'within_30_days' AND bs.last_order_at >= now() - interval '30 days')
      OR (p_last_order_bucket = 'within_90_days' AND bs.last_order_at >= now() - interval '90 days')
      OR (
        p_last_order_bucket = 'dormant_90_plus_days'
        AND (bs.last_order_at IS NULL OR bs.last_order_at < now() - interval '90 days')
      )
    )
      AND (
        COALESCE(cardinality(p_gmv_buckets), 0) = 0
        OR ('gmv_0' = ANY (p_gmv_buckets) AND COALESCE(k.gmv_90d, 0) <= 0)
        OR ('gmv_1_50000' = ANY (p_gmv_buckets) AND COALESCE(k.gmv_90d, 0) > 0 AND COALESCE(k.gmv_90d, 0) <= 50000)
        OR ('gmv_50001_200000' = ANY (p_gmv_buckets) AND COALESCE(k.gmv_90d, 0) > 50000 AND COALESCE(k.gmv_90d, 0) <= 200000)
        OR ('gmv_200001_500000' = ANY (p_gmv_buckets) AND COALESCE(k.gmv_90d, 0) > 200000 AND COALESCE(k.gmv_90d, 0) <= 500000)
        OR ('gmv_500001_plus' = ANY (p_gmv_buckets) AND COALESCE(k.gmv_90d, 0) > 500000)
      )
  ),
  paged AS MATERIALIZED (
    SELECT f.*, count(*) OVER () AS result_count
    FROM filtered f
    ORDER BY f.search_rank DESC, f.business_name ASC, f.id ASC
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    p.id,
    p.business_name,
    p.contact_name,
    p.external_ref,
    p.geography,
    p.tier,
    p.payment_terms_days,
    p.last_order_at,
    p.outstanding_dues,
    p.gmv_90d,
    p.mtd_spend,
    p.orders_mtd,
    p.result_count
  FROM paged p
  ORDER BY p.search_rank DESC, p.business_name ASC, p.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION app.search_cohort_composer_buyers(uuid, text, text[], text, text[], date, date, date, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_cohort_composer_buyers(uuid, text, text[], text, text[], date, date, date, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_cohort_composer_buyers(uuid, text, text[], text, text[], date, date, date, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION app.get_product_composer_facets(p_tenant_id uuid)
RETURNS TABLE (
  facet_type text,
  facet_id uuid,
  facet_label text,
  product_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
  SELECT
    'brand'::text,
    tb.id,
    COALESCE(NULLIF(btrim(tb.display_name_override), ''), 'Brand'),
    count(*)::bigint
  FROM app.tenant_products tp
  JOIN app.tenant_brands tb
    ON tb.id = tp.tenant_brand_id
   AND tb.tenant_id = p_tenant_id
   AND tb.deleted_at IS NULL
  WHERE tp.tenant_id = p_tenant_id
    AND tp.is_active = true
    AND tp.deleted_at IS NULL
  GROUP BY tb.id, tb.display_name_override

  UNION ALL

  SELECT
    'category'::text,
    tc.id,
    COALESCE(NULLIF(btrim(tc.name), ''), 'Uncategorized'),
    count(*)::bigint
  FROM app.tenant_products tp
  JOIN app.tenant_categories tc
    ON tc.id = tp.tenant_category_id
   AND tc.tenant_id = p_tenant_id
   AND tc.deleted_at IS NULL
  WHERE tp.tenant_id = p_tenant_id
    AND tp.is_active = true
    AND tp.deleted_at IS NULL
  GROUP BY tc.id, tc.name;
$$;

REVOKE ALL ON FUNCTION app.get_product_composer_facets(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_product_composer_facets(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.get_product_composer_facets(uuid) TO service_role;

CREATE OR REPLACE FUNCTION app.get_catalog_composer_product_metrics(
  p_tenant_id uuid,
  p_product_ids uuid[],
  p_recent_since timestamptz,
  p_month_start timestamptz
)
RETURNS TABLE (
  tenant_product_id uuid,
  qty_available numeric,
  reorder_point numeric,
  inventory_updated_at timestamptz,
  units_mtd numeric,
  has_recent_order boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
  WITH target_products AS MATERIALIZED (
    SELECT tp.id
    FROM app.tenant_products tp
    WHERE tp.tenant_id = p_tenant_id
      AND tp.id = ANY (p_product_ids)
      AND tp.deleted_at IS NULL
  ),
  inventory AS MATERIALIZED (
    SELECT
      ti.tenant_product_id,
      COALESCE(sum(ti.qty_available), 0) AS qty_available,
      COALESCE(max(ti.reorder_point), 0) AS reorder_point,
      max(ti.updated_at) AS inventory_updated_at
    FROM app.tenant_inventory ti
    JOIN target_products target ON target.id = ti.tenant_product_id
    WHERE ti.deleted_at IS NULL
    GROUP BY ti.tenant_product_id
  ),
  order_metrics AS MATERIALIZED (
    SELECT
      oi.tenant_product_id,
      COALESCE(sum(oi.qty) FILTER (WHERE o.placed_at >= p_month_start), 0) AS units_mtd,
      bool_or(o.placed_at >= p_recent_since) AS has_recent_order
    FROM app.order_items oi
    JOIN target_products target ON target.id = oi.tenant_product_id
    JOIN app.orders o
      ON o.id = oi.order_id
     AND o.tenant_id = p_tenant_id
     AND o.deleted_at IS NULL
     AND o.status <> 'cancelled'
     AND o.placed_at >= LEAST(p_recent_since, p_month_start)
    WHERE oi.deleted_at IS NULL
    GROUP BY oi.tenant_product_id
  )
  SELECT
    target.id,
    COALESCE(inv.qty_available, 0),
    COALESCE(inv.reorder_point, 0),
    inv.inventory_updated_at,
    COALESCE(metrics.units_mtd, 0),
    COALESCE(metrics.has_recent_order, false)
  FROM target_products target
  LEFT JOIN inventory inv ON inv.tenant_product_id = target.id
  LEFT JOIN order_metrics metrics ON metrics.tenant_product_id = target.id;
$$;

REVOKE ALL ON FUNCTION app.get_catalog_composer_product_metrics(uuid, uuid[], timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_catalog_composer_product_metrics(uuid, uuid[], timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.get_catalog_composer_product_metrics(uuid, uuid[], timestamptz, timestamptz) TO service_role;

DROP FUNCTION IF EXISTS app.global_search(text, uuid, text, integer, public.vector);

CREATE OR REPLACE FUNCTION app.global_search(
  p_query text,
  p_tenant_id uuid,
  p_role text DEFAULT 'seller_admin',
  p_items_per_group integer DEFAULT 5,
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
SET search_path = pg_catalog, app, catalog, public
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_like text;
  v_prefix_query_text text;
  v_ts_query tsquery;
  v_prefix_ts_query tsquery;
  v_is_assistant boolean := p_role = 'seller_assistant';
  v_location_ids uuid[] := COALESCE(p_location_ids, ARRAY[]::uuid[]);
  v_limit integer := LEAST(GREATEST(COALESCE(p_items_per_group, 5), 1), 10);
BEGIN
  IF v_query IS NULL OR char_length(v_query) < 2 THEN
    RETURN;
  END IF;

  v_like := '%' || lower(v_query) || '%';
  v_ts_query := websearch_to_tsquery('english', v_query);

  SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
  INTO v_prefix_query_text
  FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);

  IF v_prefix_query_text IS NOT NULL THEN
    v_prefix_ts_query := to_tsquery('english', v_prefix_query_text);
  END IF;

  RETURN QUERY
  WITH product_matches AS MATERIALIZED (
    SELECT
      'product'::text AS entity_type,
      sp.tenant_product_id AS id,
      sp.product_name AS label,
      concat_ws(' · ', sp.brand_name, sp.category_name, sp.sku) AS sublabel,
      '/products/' || sp.tenant_product_id::text AS url_path,
      sp.search_rank AS rank
    FROM app.search_products_scoped(
      p_tenant_id := p_tenant_id,
      p_query := v_query,
      p_limit := v_limit,
      p_offset := 0,
      p_query_embedding := p_query_embedding,
      p_sort := 'relevance',
      p_include_inventory := false
    ) sp
    ORDER BY sp.search_rank DESC, sp.product_name ASC, sp.tenant_product_id ASC
    LIMIT v_limit
  ),
  brand_matches AS MATERIALIZED (
    SELECT
      'brand'::text AS entity_type,
      tb.id,
      COALESCE(tb.display_name_override, cb.name, 'Brand') AS label,
      COALESCE(tb.description_override, tb.description, cb.description, '') AS sublabel,
      '/brands/' || tb.id::text AS url_path,
      CASE
        WHEN tb.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(tb.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(tb.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.tenant_brands tb
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    WHERE tb.tenant_id = p_tenant_id
      AND tb.is_active = true
      AND tb.deleted_at IS NULL
      AND (
        tb.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND tb.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, tb.id ASC
    LIMIT v_limit
  ),
  category_matches AS MATERIALIZED (
    SELECT
      'category'::text AS entity_type,
      tc.id,
      tc.name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(tc.description, ''), ''),
        NULLIF(COALESCE(mc.name, ''), ''),
        CASE WHEN tc.is_active THEN 'Active' ELSE 'Inactive' END
      ) AS sublabel,
      '/categories/' || tc.id::text AS url_path,
      CASE
        WHEN tc.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(tc.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(tc.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.tenant_categories tc
    LEFT JOIN catalog.categories mc ON mc.id = tc.master_category_id
    WHERE tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
      AND (
        tc.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND tc.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, tc.id ASC
    LIMIT v_limit
  ),
  customer_matches AS MATERIALIZED (
    SELECT
      'customer'::text AS entity_type,
      b.id,
      b.business_name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(b.contact_name, ''), ''),
        NULLIF(COALESCE(b.geography->>'city', ''), ''),
        NULLIF(COALESCE(b.phone, ''), '')
      ) AS sublabel,
      '/customers/' || b.id::text AS url_path,
      CASE
        WHEN b.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(b.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(b.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.is_active = true
      AND b.deleted_at IS NULL
      AND (
        b.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND b.search_vector @@ v_prefix_ts_query)
      )
      AND (
        NOT v_is_assistant
        OR EXISTS (
          SELECT 1
          FROM app.buyers_snapshot bs
          WHERE bs.tenant_id = p_tenant_id
            AND bs.buyer_id = b.id
            AND bs.scope = 'location'
            AND bs.location_id = ANY (v_location_ids)
        )
        OR EXISTS (
          SELECT 1
          FROM app.orders scoped_order
          WHERE scoped_order.tenant_id = p_tenant_id
            AND scoped_order.buyer_id = b.id
            AND scoped_order.location_id = ANY (v_location_ids)
            AND scoped_order.deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM app.invoices scoped_invoice
          WHERE scoped_invoice.tenant_id = p_tenant_id
            AND scoped_invoice.buyer_id = b.id
            AND scoped_invoice.location_id = ANY (v_location_ids)
            AND scoped_invoice.deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM app.estimates scoped_estimate
          WHERE scoped_estimate.tenant_id = p_tenant_id
            AND scoped_estimate.buyer_id = b.id
            AND scoped_estimate.location_id = ANY (v_location_ids)
            AND scoped_estimate.deleted_at IS NULL
        )
      )
    ORDER BY rank DESC, 3 ASC, b.id ASC
    LIMIT v_limit
  ),
  cohort_matches AS MATERIALIZED (
    SELECT
      'cohort'::text AS entity_type,
      c.id,
      c.name AS label,
      COALESCE(c.description, '') AS sublabel,
      '/customer-groups/' || c.id::text AS url_path,
      CASE
        WHEN c.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(c.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(c.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.cohorts c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND (
        c.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND c.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, c.id ASC
    LIMIT v_limit
  ),
  campaign_matches AS MATERIALIZED (
    SELECT
      'campaign'::text AS entity_type,
      c.id,
      c.name AS label,
      COALESCE(c.status, '') AS sublabel,
      '/campaigns/' || c.id::text AS url_path,
      CASE
        WHEN c.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(c.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(c.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.campaigns c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND (
        c.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND c.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, c.id ASC
    LIMIT v_limit
  ),
  price_list_matches AS MATERIALIZED (
    SELECT
      'price_list'::text AS entity_type,
      pl.id,
      pl.name AS label,
      COALESCE(pl.description, '') AS sublabel,
      '/price-lists/' || pl.id::text AS url_path,
      CASE
        WHEN pl.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(pl.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(pl.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.price_lists pl
    WHERE pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL
      AND (
        pl.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND pl.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, pl.id ASC
    LIMIT v_limit
  ),
  order_matches AS MATERIALIZED (
    SELECT
      'order'::text AS entity_type,
      o.id,
      o.order_number AS label,
      COALESCE(b.business_name, '') AS sublabel,
      '/sales-orders/' || o.id::text AS url_path,
      CASE
        WHEN lower(o.order_number) = lower(v_query) THEN 3.0
        WHEN lower(o.order_number) LIKE lower(v_query) || '%' THEN 2.0
        ELSE public.similarity(lower(o.order_number), lower(v_query))::double precision
      END AS rank
    FROM app.orders o
    LEFT JOIN app.buyers b ON b.id = o.buyer_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND (NOT v_is_assistant OR o.location_id = ANY (v_location_ids))
      AND (
        lower(o.order_number) LIKE lower(v_query) || '%'
        OR (char_length(v_query) >= 3 AND lower(o.order_number) LIKE v_like)
      )
    ORDER BY rank DESC, 3 ASC, o.id ASC
    LIMIT v_limit
  ),
  invoice_matches AS MATERIALIZED (
    SELECT
      'invoice'::text AS entity_type,
      i.id,
      i.invoice_number AS label,
      COALESCE(b.business_name, '') AS sublabel,
      '/invoices/' || i.id::text AS url_path,
      CASE
        WHEN lower(i.invoice_number) = lower(v_query) THEN 3.0
        WHEN lower(i.invoice_number) LIKE lower(v_query) || '%' THEN 2.0
        ELSE public.similarity(lower(i.invoice_number), lower(v_query))::double precision
      END AS rank
    FROM app.invoices i
    LEFT JOIN app.buyers b ON b.id = i.buyer_id
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND (NOT v_is_assistant OR i.location_id = ANY (v_location_ids))
      AND (
        lower(i.invoice_number) LIKE lower(v_query) || '%'
        OR (char_length(v_query) >= 3 AND lower(i.invoice_number) LIKE v_like)
      )
    ORDER BY rank DESC, 3 ASC, i.id ASC
    LIMIT v_limit
  ),
  estimate_matches AS MATERIALIZED (
    SELECT
      'estimate'::text AS entity_type,
      e.id,
      COALESCE(e.estimate_number, '') AS label,
      COALESCE(b.business_name, '') AS sublabel,
      '/estimates/' || e.id::text AS url_path,
      CASE
        WHEN lower(COALESCE(e.estimate_number, '')) = lower(v_query) THEN 3.0
        WHEN lower(COALESCE(e.estimate_number, '')) LIKE lower(v_query) || '%' THEN 2.0
        ELSE public.similarity(lower(COALESCE(e.estimate_number, '')), lower(v_query))::double precision
      END AS rank
    FROM app.estimates e
    LEFT JOIN app.buyers b ON b.id = e.buyer_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.estimate_number IS NOT NULL
      AND (NOT v_is_assistant OR e.location_id = ANY (v_location_ids))
      AND (
        lower(e.estimate_number) LIKE lower(v_query) || '%'
        OR (char_length(v_query) >= 3 AND lower(e.estimate_number) LIKE v_like)
      )
    ORDER BY rank DESC, 3 ASC, e.id ASC
    LIMIT v_limit
  ),
  location_matches AS MATERIALIZED (
    SELECT
      'location'::text AS entity_type,
      l.id,
      l.name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(l.address->>'city', ''), ''),
        NULLIF(COALESCE(l.address->>'state', ''), '')
      ) AS sublabel,
      '/locations/' || l.id::text AS url_path,
      CASE
        WHEN l.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(l.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(l.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.locations l
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (NOT v_is_assistant OR l.id = ANY (v_location_ids))
      AND (
        l.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND l.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, l.id ASC
    LIMIT v_limit
  ),
  warehouse_matches AS MATERIALIZED (
    SELECT
      'warehouse'::text AS entity_type,
      w.id,
      w.name AS label,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(w.address->>'city', ''), ''),
        NULLIF(COALESCE(w.address->>'state', ''), '')
      ) AS sublabel,
      '/warehouses/' || w.id::text AS url_path,
      CASE
        WHEN w.search_vector @@ v_ts_query
          THEN 2.0 + ts_rank_cd(w.search_vector, v_ts_query)::double precision
        ELSE ts_rank_cd(w.search_vector, v_prefix_ts_query)::double precision
      END AS rank
    FROM app.warehouses w
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND (NOT v_is_assistant OR w.location_id = ANY (v_location_ids))
      AND (
        w.search_vector @@ v_ts_query
        OR (v_prefix_ts_query IS NOT NULL AND w.search_vector @@ v_prefix_ts_query)
      )
    ORDER BY rank DESC, 3 ASC, w.id ASC
    LIMIT v_limit
  ),
  all_matches AS (
    SELECT *, 1 AS group_order FROM product_matches
    UNION ALL SELECT *, 2 FROM brand_matches
    UNION ALL SELECT *, 3 FROM category_matches
    UNION ALL SELECT *, 4 FROM customer_matches
    UNION ALL SELECT *, 5 FROM cohort_matches
    UNION ALL SELECT *, 6 FROM campaign_matches
    UNION ALL SELECT *, 7 FROM price_list_matches
    UNION ALL SELECT *, 8 FROM order_matches
    UNION ALL SELECT *, 9 FROM invoice_matches
    UNION ALL SELECT *, 10 FROM estimate_matches
    UNION ALL SELECT *, 11 FROM location_matches
    UNION ALL SELECT *, 12 FROM warehouse_matches
  )
  SELECT
    matches.entity_type,
    matches.id,
    matches.label,
    matches.sublabel,
    matches.url_path
  FROM all_matches matches
  ORDER BY matches.group_order, matches.rank DESC, matches.label ASC, matches.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION app.global_search(text, uuid, text, integer, public.vector, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.global_search(text, uuid, text, integer, public.vector, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.global_search(text, uuid, text, integer, public.vector, uuid[]) TO service_role;
