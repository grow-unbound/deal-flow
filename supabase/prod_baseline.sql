

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "app";


ALTER SCHEMA "app" OWNER TO "postgres";


COMMENT ON SCHEMA "app" IS 'All tenant business data. RLS-enforced per tenant.';



CREATE OR REPLACE FUNCTION "app"."_assert_integration_child_tenant_consistency"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_tenant_integration app.tenant_integrations%ROWTYPE;
BEGIN
  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = NEW.tenant_integration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM v_tenant_integration.tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch for integration child row' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."_assert_integration_child_tenant_consistency"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."_estimate_assert_seller_admin"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM app.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.user_id = p_actor_user_id
      AND COALESCE(tu.is_active, true)
      AND tu.role = 'seller_admin'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION "app"."_estimate_assert_seller_admin"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."_estimate_assert_seller_member"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM app.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.user_id = p_actor_user_id
      AND COALESCE(tu.is_active, true)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION "app"."_estimate_assert_seller_member"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."_next_estimate_number"("p_tenant_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM (timezone('Asia/Kolkata', now())))::int;
  v_seq int;
BEGIN
  SELECT COUNT(*)::int + 1 INTO v_seq FROM app.estimates WHERE tenant_id = p_tenant_id;
  RETURN format('EST-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
END;
$$;


ALTER FUNCTION "app"."_next_estimate_number"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."_next_invoice_number"("p_tenant_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM (timezone('Asia/Kolkata', now())))::int;
  v_seq int;
BEGIN
  SELECT COUNT(*)::int + 1 INTO v_seq FROM app.invoices WHERE tenant_id = p_tenant_id;
  RETURN format('INV-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
END;
$$;


ALTER FUNCTION "app"."_next_invoice_number"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."_next_order_number"("p_tenant_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM (timezone('Asia/Kolkata', now())))::int;
  v_seq int;
BEGIN
  SELECT COUNT(*)::int + 1 INTO v_seq FROM app.orders WHERE tenant_id = p_tenant_id;
  RETURN format('ORD-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
END;
$$;


ALTER FUNCTION "app"."_next_order_number"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."_tenant_integrations_assert_seller_admin"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.user_id = p_actor_user_id
      AND tu.role = 'seller_admin'
      AND COALESCE(tu.is_active, true)
      AND tu.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION "app"."_tenant_integrations_assert_seller_admin"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."_tenant_settings_assert_seller_admin"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM app.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.user_id = p_actor_user_id
      AND tu.role = 'seller_admin'
      AND COALESCE(tu.is_active, true)
      AND tu.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION "app"."_tenant_settings_assert_seller_admin"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."_validate_integration_data_flow_webhook"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
BEGIN
  IF NEW.webhook_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM app.integration_webhooks iw
      WHERE iw.id = NEW.webhook_id
        AND iw.tenant_id = NEW.tenant_id
        AND iw.tenant_integration_id = NEW.tenant_integration_id
        AND iw.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'integration webhook must belong to the same tenant integration' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."_validate_integration_data_flow_webhook"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."bulk_persist_jsonb_records"("p_table" "text", "p_rows" "jsonb", "p_conflict_cols" "text"[] DEFAULT NULL::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    SET "statement_timeout" TO '60s'
    AS $_$
DECLARE
  v_rel regclass;
  v_schema text;
  v_row_keys text[];
  v_columns text[];
  v_defs text;
  v_insert_cols text;
  v_select_cols text;
  v_update_set text;
  v_conflict_clause text := '';
  v_sql text;
  v_result jsonb;
BEGIN
  -- Set transaction-local GUC so all trigger functions skip expensive refreshes
  -- during this bulk upsert. Triggers read this via sync_trigger_bypass_active().
  PERFORM set_config('app.integration_sync_bypass_triggers', 'on', true);
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  IF position('.' IN p_table) > 0 THEN
    v_rel := to_regclass(p_table);
  ELSE
    v_rel := to_regclass(format('app.%I', p_table));
  END IF;

  IF v_rel IS NULL THEN
    RAISE EXCEPTION 'Unknown table %', p_table;
  END IF;

  SELECT n.nspname
  INTO v_schema
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = v_rel;

  IF v_schema <> 'app' THEN
    RAISE EXCEPTION 'bulk_persist_jsonb_records only supports app schema tables';
  END IF;

  SELECT array_agg(DISTINCT key)
  INTO v_row_keys
  FROM jsonb_array_elements(p_rows) AS elem
  CROSS JOIN LATERAL jsonb_object_keys(elem) AS key;

  SELECT array_agg(a.attname ORDER BY a.attnum)
  INTO v_columns
  FROM pg_attribute a
  WHERE a.attrelid = v_rel
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname = ANY (v_row_keys);

  IF coalesce(array_length(v_columns, 1), 0) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT string_agg(format('%I %s', a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod)), ', ' ORDER BY a.attnum)
  INTO v_defs
  FROM pg_attribute a
  WHERE a.attrelid = v_rel
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname = ANY (v_columns);

  SELECT string_agg(format('%I', col), ', ')
  INTO v_insert_cols
  FROM unnest(v_columns) AS col;

  SELECT string_agg(
    CASE WHEN col = 'id' THEN format('coalesce(src.%I, gen_random_uuid())', col) ELSE format('src.%I', col) END,
    ', '
  )
  INTO v_select_cols
  FROM unnest(v_columns) AS col;

  IF p_conflict_cols IS NOT NULL AND array_length(p_conflict_cols, 1) > 0 THEN
    SELECT string_agg(
      CASE
        WHEN col = 'updated_by' THEN
          format('%1$I = coalesce(excluded.%1$I, target.%1$I)', col)
        ELSE
          format('%1$I = excluded.%1$I', col)
      END,
      ', '
    )
    INTO v_update_set
    FROM unnest(v_columns) AS col
    WHERE col <> ALL (p_conflict_cols)
      AND col NOT IN ('id', 'created_at', 'created_by');

    IF v_update_set IS NULL OR length(v_update_set) = 0 THEN
      v_conflict_clause := format(' ON CONFLICT (%s) DO NOTHING', array_to_string(ARRAY(
        SELECT format('%I', col) FROM unnest(p_conflict_cols) AS col
      ), ', '));
    ELSE
      v_conflict_clause := format(
        ' ON CONFLICT (%s) DO UPDATE SET %s',
        array_to_string(ARRAY(
          SELECT format('%I', col) FROM unnest(p_conflict_cols) AS col
        ), ', '),
        v_update_set
      );
    END IF;
  END IF;

  v_sql := format(
    'WITH input AS (
       SELECT *
       FROM jsonb_to_recordset($1) AS src(%s)
     ),
     persisted AS (
       INSERT INTO %s AS target (%s)
       SELECT %s
       FROM input AS src
       %s
       RETURNING to_jsonb(target.*) AS row
     )
     SELECT coalesce(jsonb_agg(row), ''[]''::jsonb)
     FROM persisted',
    v_defs,
    v_rel,
    v_insert_cols,
    v_select_cols,
    v_conflict_clause
  );

  EXECUTE v_sql INTO v_result USING p_rows;
  RETURN coalesce(v_result, '[]'::jsonb);
END;
$_$;


ALTER FUNCTION "app"."bulk_persist_jsonb_records"("p_table" "text", "p_rows" "jsonb", "p_conflict_cols" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."buyer_users_search_vector_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_business_name text;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
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
      COALESCE(v_business_name, ''),
      COALESCE(NEW.first_name, ''),
      COALESCE(NEW.last_name, ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.phone, ''),
      COALESCE(NEW.designation, ''),
      COALESCE(NEW.department, '')
    )
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."buyer_users_search_vector_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."buyers_search_vector_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

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
      COALESCE(NEW.status, '')
    )
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."buyers_search_vector_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."cancel_tenant_integration_sync_job"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_tenant_integration app.tenant_integrations%rowtype;
  v_now timestamptz := now();
  v_now_iso text := to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_cancelled_count int;
  v_master_id uuid;
  v_sync_run_id text;
BEGIN
  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = p_tenant_integration_id
    AND ti.deleted_at IS NULL;

  IF NOT found THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM app._tenant_integrations_assert_seller_admin(v_tenant_integration.tenant_id, p_actor_user_id);

  SELECT mj.id, COALESCE(mj.progress->>'sync_run_id', mj.id::text)
  INTO v_master_id, v_sync_run_id
  FROM app.integration_sync_jobs mj
  WHERE mj.tenant_integration_id = p_tenant_integration_id
    AND mj.deleted_at IS NULL
    AND mj.phase = 'sync_run'
    AND mj.status IN ('pending', 'running', 'paused')
  ORDER BY mj.created_at DESC
  LIMIT 1;

  IF v_master_id IS NULL THEN
    SELECT COALESCE(j.progress->'meta'->>'sync_run_id', j.progress->'meta'->>'master_job_id')
    INTO v_sync_run_id
    FROM app.integration_sync_jobs j
    WHERE j.tenant_integration_id = p_tenant_integration_id
      AND j.deleted_at IS NULL
      AND j.status IN ('pending', 'queued', 'running', 'paused')
    ORDER BY j.created_at DESC
    LIMIT 1;

    IF v_sync_run_id IS NOT NULL THEN
      v_master_id := v_sync_run_id::uuid;
    END IF;
  END IF;

  UPDATE app.integration_sync_jobs
  SET
    status       = 'cancelled',
    progress     = jsonb_set(
                     COALESCE(progress, '{}'::jsonb),
                     '{phase}', '"cancelled"'
                   ) ||
                   jsonb_build_object(
                     'phase_label', 'Sync cancelled',
                     'updated_at',  v_now_iso,
                     'note',        'Stopped by user request.'
                   ),
    completed_at = v_now,
    updated_at   = v_now,
    updated_by   = p_actor_user_id
  WHERE tenant_integration_id = p_tenant_integration_id
    AND deleted_at IS NULL
    AND status IN ('pending', 'queued', 'running', 'paused')
    AND (
      v_sync_run_id IS NULL
      OR id::text = v_sync_run_id
      OR progress->'meta'->>'sync_run_id' = v_sync_run_id
      OR progress->'meta'->>'master_job_id' = v_sync_run_id
    );

  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  IF v_master_id IS NOT NULL THEN
    UPDATE app.integration_sync_jobs
    SET progress = jsonb_set(
      COALESCE(progress, '{}'::jsonb),
      '{meta,run_cancelled}',
      'true'::jsonb,
      true
    ),
    updated_at = v_now,
    updated_by = p_actor_user_id
    WHERE id = v_master_id;
  END IF;

  IF v_cancelled_count = 0 THEN
    RETURN jsonb_build_object(
      'ok',                    false,
      'status',                'idle',
      'tenant_integration_id', p_tenant_integration_id,
      'message',               'No active sync jobs found.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',                    true,
    'status',                'cancelled',
    'cancelled_count',       v_cancelled_count,
    'tenant_integration_id', p_tenant_integration_id,
    'sync_run_id',           v_sync_run_id
  );
END;
$$;


ALTER FUNCTION "app"."cancel_tenant_integration_sync_job"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."confirm_order"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_order app.orders%ROWTYPE;
  v_short_lines jsonb := '[]'::jsonb;
  v_line record;
  v_on_hand integer;
BEGIN
  SELECT *
  INTO STRICT v_order
  FROM app.orders o
  WHERE o.id = p_order_id
    AND o.deleted_at IS NULL;

  IF v_order.tenant_id <> app.jwt_tenant_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT app.is_seller() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_line IN
    SELECT oi.id, oi.tenant_product_id, oi.qty
    FROM app.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    SELECT COALESCE(SUM(ti.qty_available), 0)::integer
    INTO v_on_hand
    FROM app.tenant_inventory ti
    WHERE ti.tenant_product_id = v_line.tenant_product_id;

    UPDATE app.order_items
    SET on_hand_at_confirm = v_on_hand,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = v_line.id;

    IF v_line.qty > v_on_hand THEN
      v_short_lines := v_short_lines || jsonb_build_object(
        'line_id', v_line.id,
        'tenant_product_id', v_line.tenant_product_id,
        'qty', v_line.qty,
        'on_hand', v_on_hand,
        'shortfall', GREATEST(v_line.qty - v_on_hand, 0)
      );
    END IF;
  END LOOP;

  UPDATE app.orders
  SET status = 'received',
      placed_at = COALESCE(placed_at, now()),
      order_date = COALESCE(order_date, (COALESCE(placed_at, now()) AT TIME ZONE 'Asia/Kolkata')::date),
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = p_order_id;

  INSERT INTO app.audit_log (
    tenant_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    diff,
    ts
  )
  VALUES (
    v_order.tenant_id,
    auth.uid(),
    'order',
    p_order_id,
    'status_change',
    jsonb_build_object(
      'to', 'received',
      'has_backorder', COALESCE(jsonb_array_length(v_short_lines), 0) > 0
    ),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'short_lines', v_short_lines
  );
END;
$$;


ALTER FUNCTION "app"."confirm_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."create_tenant_and_admin"("p_user_id" "uuid", "p_slug" "text", "p_business_name" "text", "p_business_phone" "text" DEFAULT NULL::"text", "p_business_email" "text" DEFAULT NULL::"text", "p_whatsapp_phone" "text" DEFAULT NULL::"text", "p_primary_state" "text" DEFAULT NULL::"text", "p_gstin" "text" DEFAULT NULL::"text", "p_initial_settings" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_subdomain  text;
  v_settings   jsonb;
BEGIN
  v_subdomain := p_slug || '.yukti.so';

  INSERT INTO app.tenants (
    slug, business_name, gstin, primary_state,
    subdomain, created_by, updated_by
  ) VALUES (
    p_slug, p_business_name, p_gstin, p_primary_state,
    v_subdomain, p_user_id, p_user_id
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO app.tenant_users (
    tenant_id, user_id, role, joined_at, created_by, updated_by
  ) VALUES (
    v_tenant_id, p_user_id, 'seller_admin', now(), p_user_id, p_user_id
  );

  v_settings := app.jsonb_deep_merge(
    jsonb_build_object(
      'business', jsonb_build_object(
        'company_name', p_business_name,
        'gstin', '',
        'logo_url', NULL,
        'address', jsonb_build_object(
          'line1', '',
          'line2', '',
          'city', '',
          'state', '',
          'pincode', ''
        ),
        'phone', COALESCE(p_business_phone, ''),
        'email', COALESCE(p_business_email, '')
      ),
      'product_defaults', jsonb_build_object('uom', 'PCS'),
      'orders', jsonb_build_object(
        'enquiry_number_format', 'EST-{YYYY}-{SEQ}',
        'sales_order_number_format', 'SO-{YYYY}-{SEQ}',
        'invoice_number_format', 'INV-{YYYY}-{SEQ}',
        'inventory_lock_stage', 'sales_order',
        'invoice_pdf_enabled', false,
        'features', jsonb_build_object(
          'enquiries', false,
          'sales_orders', false,
          'invoices', false,
          'create_enquiries', true,
          'create_sales_orders', true,
          'create_invoices', true
        )
      ),
      'buyer_app', jsonb_build_object(
        'enabled', false,
        'whatsapp_number', COALESCE(p_whatsapp_phone, COALESCE(p_business_phone, '')),
        'share_link_expiry_enabled', false,
        'share_link_expiry_days', 90,
        'credit_limit_visible', true,
        'show_out_of_stock', true
      ),
      'catalog', jsonb_build_object(
        'price_lists_enabled', false,
        'cohort_pricing_enabled', false,
        'price_visibility', 'discounted_only',
        'catalog_publishing_enabled', false,
        'default_catalog_expiry_days', 0
      ),
      'notifications', jsonb_build_object(
        'whatsapp', jsonb_build_object(
          'enquiry_received', true,
          'order_placed', true,
          'order_confirmed_to_buyer', true,
          'dispatch_to_buyer', true,
          'catalog_shared_to_buyer', true,
          'response_eta_hours', 24
        )
      ),
      'business_policy', jsonb_build_object(
        'credit_enabled', true,
        'gst_inclusive', false,
        'gst_rate', 18
      ),
      'delivery_routing_threshold_km', 50
    ),
    COALESCE(p_initial_settings, '{}'::jsonb)
  );

  INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
  VALUES (v_tenant_id, v_settings, p_user_id)
  ON CONFLICT (tenant_id) DO UPDATE SET
    settings = EXCLUDED.settings,
    updated_at = now(),
    updated_by = p_user_id;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'slug',      p_slug,
    'subdomain', v_subdomain
  );
END;
$$;


ALTER FUNCTION "app"."create_tenant_and_admin"("p_user_id" "uuid", "p_slug" "text", "p_business_name" "text", "p_business_phone" "text", "p_business_email" "text", "p_whatsapp_phone" "text", "p_primary_state" "text", "p_gstin" "text", "p_initial_settings" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "app"."whatsapp_credit_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "credits" numeric(12,2) NOT NULL,
    "inr_amount" numeric(12,2),
    "balance_after" numeric(12,2) NOT NULL,
    "related_message_id" "uuid",
    "payment_reference" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "whatsapp_credit_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['topup'::"text", 'debit'::"text", 'refund'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "app"."whatsapp_credit_transactions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."debit_whatsapp_credits"("p_whatsapp_message_id" "uuid") RETURNS "app"."whatsapp_credit_transactions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_message app.whatsapp_messages%ROWTYPE;
  v_rate app.whatsapp_rate_card%ROWTYPE;
  v_credit_price numeric(6,4);
  v_current_balance numeric(12,2);
  v_new_balance numeric(12,2);
  v_inr_amount numeric(12,2);
  v_txn app.whatsapp_credit_transactions%ROWTYPE;
BEGIN
  IF p_whatsapp_message_id IS NULL THEN
    RAISE EXCEPTION 'whatsapp_message_id required' USING ERRCODE = '22023';
  END IF;

  -- Lock the message row first so concurrent debit attempts on the same
  -- message serialize (no double-debit of a single send).
  SELECT * INTO v_message
  FROM app.whatsapp_messages
  WHERE id = p_whatsapp_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'whatsapp message % not found', p_whatsapp_message_id USING ERRCODE = 'P0002';
  END IF;

  IF v_message.wallet_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'whatsapp message % already debited (wallet_transaction_id=%)',
      p_whatsapp_message_id, v_message.wallet_transaction_id
      USING ERRCODE = '22023';
  END IF;

  -- (a) rate lookup
  SELECT * INTO v_rate
  FROM app.whatsapp_rate_card
  WHERE meta_category = v_message.meta_category
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active rate card entry for category %', v_message.meta_category USING ERRCODE = 'P0002';
  END IF;

  SELECT credit_price_inr INTO v_credit_price
  FROM app.whatsapp_credit_pricing
  WHERE deleted_at IS NULL
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_credit_price IS NULL THEN
    RAISE EXCEPTION 'no active whatsapp_credit_pricing row' USING ERRCODE = 'P0002';
  END IF;

  -- (b) lock tenant row, guard against negative balance
  SELECT whatsapp_credits_balance INTO v_current_balance
  FROM app.tenants
  WHERE id = v_message.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant % not found', v_message.tenant_id USING ERRCODE = 'P0002';
  END IF;

  IF v_current_balance < v_rate.credits_per_message THEN
    RAISE EXCEPTION 'insufficient whatsapp credits for tenant % (balance % < required %)',
      v_message.tenant_id, v_current_balance, v_rate.credits_per_message
      USING ERRCODE = '73000'; -- insufficient_resources
  END IF;

  v_new_balance := v_current_balance - v_rate.credits_per_message;
  v_inr_amount := round(v_rate.credits_per_message * v_credit_price, 2);

  UPDATE app.tenants
  SET whatsapp_credits_balance = v_new_balance
  WHERE id = v_message.tenant_id;

  -- (c) ledger row
  INSERT INTO app.whatsapp_credit_transactions (
    tenant_id, transaction_type, credits, inr_amount, balance_after,
    related_message_id
  ) VALUES (
    v_message.tenant_id, 'debit', -v_rate.credits_per_message, v_inr_amount, v_new_balance,
    v_message.id
  )
  RETURNING * INTO v_txn;

  -- (d) stamp the message row
  UPDATE app.whatsapp_messages
  SET
    credits_charged = v_rate.credits_per_message,
    meta_cost_inr = v_rate.meta_cost_inr,
    billed_amount = v_inr_amount,
    wallet_transaction_id = v_txn.id
  WHERE id = v_message.id;

  RETURN v_txn;
END;
$$;


ALTER FUNCTION "app"."debit_whatsapp_credits"("p_whatsapp_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."delete_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app', 'vault'
    AS $$
DECLARE
  v_tenant_integration app.tenant_integrations%ROWTYPE;
BEGIN
  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = p_tenant_integration_id
    AND ti.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM app._tenant_integrations_assert_seller_admin(v_tenant_integration.tenant_id, p_actor_user_id);

  IF v_tenant_integration.vault_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets
    WHERE id = v_tenant_integration.vault_secret_id;
  END IF;

  UPDATE app.tenant_integrations
  SET
    vault_secret_id = NULL,
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE id = p_tenant_integration_id;
END;
$$;


ALTER FUNCTION "app"."delete_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."dequeue_embeddings"("p_batch_size" integer DEFAULT 20) RETURNS TABLE("id" bigint, "entity_type" "text", "entity_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'catalog', 'app', 'public'
    AS $$
BEGIN
  RETURN QUERY
  UPDATE catalog.embedding_queue q
  SET processed_at = now()
  FROM (
    SELECT eq.id
    FROM catalog.embedding_queue eq
    WHERE eq.processed_at IS NULL
    ORDER BY eq.created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ) selected
  WHERE q.id = selected.id
  RETURNING q.id, q.entity_type, q.entity_id;
END;
$$;


ALTER FUNCTION "app"."dequeue_embeddings"("p_batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."derive_gmv_90d_bucket"("p_gmv" numeric) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_gmv <= 0       THEN 'gmv_0'
    WHEN p_gmv <= 50000   THEN 'gmv_1_50000'
    WHEN p_gmv <= 200000  THEN 'gmv_50001_200000'
    WHEN p_gmv <= 500000  THEN 'gmv_200001_500000'
    ELSE                       'gmv_500001_plus'
  END;
$$;


ALTER FUNCTION "app"."derive_gmv_90d_bucket"("p_gmv" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."derive_last_order_bucket"("p_last_order_at" timestamp with time zone) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_last_order_at IS NULL                          THEN 'dormant_90_plus_days'
    WHEN p_last_order_at >= now() - INTERVAL '30 days'   THEN 'within_30_days'
    WHEN p_last_order_at >= now() - INTERVAL '90 days'   THEN 'within_90_days'
    ELSE 'dormant_90_plus_days'
  END;
$$;


ALTER FUNCTION "app"."derive_last_order_bucket"("p_last_order_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."dispatch_from_buyer_users"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  SELECT b.tenant_id INTO v_tenant
  FROM app.buyers b
  WHERE b.id = COALESCE(NEW.buyer_id, OLD.buyer_id);

  IF v_tenant IS NOT NULL THEN
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."dispatch_from_buyer_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."dispatch_from_buyers"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  PERFORM app.refresh_buyers_snapshot(v_tenant);
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  PERFORM app.refresh_buyer_current_snapshot(v_tenant);

  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."dispatch_from_buyers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."dispatch_from_estimates"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
  v_old_day date;
  v_new_day date;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  IF TG_OP <> 'INSERT' THEN
    v_old_day := app.metric_day_ist(OLD.estimate_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_day := app.metric_day_ist(NEW.estimate_date, NEW.created_at);
  END IF;

  IF NOT v_bypass THEN
    PERFORM app.refresh_estimates_snapshot(v_tenant);
    PERFORM app.refresh_buyers_snapshot(v_tenant);
    IF v_old_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_estimates_daily(v_tenant, v_old_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_old_day);
    END IF;
    IF v_new_day IS NOT NULL AND v_new_day IS DISTINCT FROM v_old_day THEN
      PERFORM app.refresh_kpi_estimates_daily(v_tenant, v_new_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_new_day);
    END IF;

    PERFORM app.sync_buyer_app_activity_from_estimate(COALESCE(NEW.id, OLD.id));

    IF v_old_day IS NOT NULL THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_old_day);
    END IF;
    IF v_new_day IS NOT NULL AND v_new_day IS DISTINCT FROM v_old_day THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_new_day);
    END IF;
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."dispatch_from_estimates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."dispatch_from_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_old_product_id uuid;
  v_new_product_id uuid;
  v_old_warehouse_id uuid;
  v_new_warehouse_id uuid;
  v_old_location uuid;
  v_new_location uuid;
  v_tenant uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  v_old_product_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.tenant_product_id ELSE NULL END;
  v_new_product_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.tenant_product_id ELSE NULL END;
  v_old_warehouse_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.warehouse_id ELSE NULL END;
  v_new_warehouse_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.warehouse_id ELSE NULL END;

  SELECT tenant_id
  INTO v_tenant
  FROM app.tenant_products
  WHERE id = COALESCE(v_new_product_id, v_old_product_id);

  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  IF v_old_warehouse_id IS NOT NULL THEN
    SELECT location_id INTO v_old_location
    FROM app.warehouses
    WHERE id = v_old_warehouse_id;
  END IF;

  IF v_new_warehouse_id IS NOT NULL THEN
    SELECT location_id INTO v_new_location
    FROM app.warehouses
    WHERE id = v_new_warehouse_id;
  END IF;

  IF v_old_product_id IS NOT NULL THEN
    PERFORM app.refresh_kpi_product_daily(v_tenant, v_old_product_id, v_today);
  END IF;
  IF v_new_product_id IS NOT NULL
     AND (v_new_product_id IS DISTINCT FROM v_old_product_id)
  THEN
    PERFORM app.refresh_kpi_product_daily(v_tenant, v_new_product_id, v_today);
  END IF;

  PERFORM app.refresh_products_snapshot(v_tenant);
  PERFORM app.refresh_categories_snapshot(v_tenant);

  IF v_old_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_old_location);
  END IF;
  IF v_new_location IS NOT NULL AND v_new_location IS DISTINCT FROM v_old_location THEN
    PERFORM app.refresh_locations_snapshot(v_new_location);
  END IF;

  IF v_old_warehouse_id IS NOT NULL THEN
    PERFORM app.refresh_warehouses_snapshot(v_old_warehouse_id);
    PERFORM app.refresh_kpi_warehouse_daily(v_tenant, v_old_warehouse_id, v_today);
  END IF;
  IF v_new_warehouse_id IS NOT NULL
     AND v_new_warehouse_id IS DISTINCT FROM v_old_warehouse_id
  THEN
    PERFORM app.refresh_warehouses_snapshot(v_new_warehouse_id);
    PERFORM app.refresh_kpi_warehouse_daily(v_tenant, v_new_warehouse_id, v_today);
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."dispatch_from_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."dispatch_from_invoices"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_tenant uuid;
  v_old_location uuid;
  v_new_location uuid;
  v_old_day date;
  v_new_day date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_location := OLD.location_id;
    v_old_day := app.metric_day_ist(OLD.invoice_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_location := NEW.location_id;
    v_new_day := app.metric_day_ist(NEW.invoice_date, NEW.created_at);
  END IF;

  PERFORM app.refresh_invoices_snapshot(v_tenant);
  PERFORM app.refresh_buyers_snapshot(v_tenant);
  PERFORM app.refresh_buyer_current_snapshot(v_tenant);

  IF v_old_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_old_location);
  END IF;
  IF v_new_location IS NOT NULL AND v_new_location IS DISTINCT FROM v_old_location THEN
    PERFORM app.refresh_locations_snapshot(v_new_location);
  END IF;

  IF v_old_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_invoices_daily(v_tenant, v_old_day);
    PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_old_day);
    PERFORM app.refresh_buyer_app_daily(v_tenant, v_old_day);
  END IF;
  IF v_new_day IS NOT NULL AND v_new_day IS DISTINCT FROM v_old_day THEN
    PERFORM app.refresh_kpi_invoices_daily(v_tenant, v_new_day);
    PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_new_day);
    PERFORM app.refresh_buyer_app_daily(v_tenant, v_new_day);
  END IF;
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);

  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."dispatch_from_invoices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."dispatch_from_order_items"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_old_order_id uuid;
  v_new_order_id uuid;
  v_old_product_id uuid;
  v_new_product_id uuid;
  v_old_tenant uuid;
  v_new_tenant uuid;
  v_old_day date;
  v_new_day date;
  v_old_category uuid;
  v_new_category uuid;
  v_old_brand uuid;
  v_new_brand uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_order_id := OLD.order_id;
    v_old_product_id := OLD.tenant_product_id;
    SELECT o.tenant_id, app.metric_day_ist(o.order_date, o.created_at)
    INTO v_old_tenant, v_old_day
    FROM app.orders o
    WHERE o.id = v_old_order_id;
    SELECT tp.tenant_category_id, tp.tenant_brand_id
    INTO v_old_category, v_old_brand
    FROM app.tenant_products tp
    WHERE tp.id = v_old_product_id;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_new_order_id := NEW.order_id;
    v_new_product_id := NEW.tenant_product_id;
    SELECT o.tenant_id, app.metric_day_ist(o.order_date, o.created_at)
    INTO v_new_tenant, v_new_day
    FROM app.orders o
    WHERE o.id = v_new_order_id;
    SELECT tp.tenant_category_id, tp.tenant_brand_id
    INTO v_new_category, v_new_brand
    FROM app.tenant_products tp
    WHERE tp.id = v_new_product_id;
  END IF;

  IF v_old_tenant IS NOT NULL AND v_old_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_tenant_daily(v_old_tenant, v_old_day);
    IF v_old_product_id IS NOT NULL THEN
      PERFORM app.refresh_kpi_product_daily(v_old_tenant, v_old_product_id, v_old_day);
    END IF;
    IF v_old_category IS NOT NULL THEN
      PERFORM app.refresh_kpi_category_daily(v_old_tenant, v_old_category, v_old_day);
    END IF;
    IF v_old_brand IS NOT NULL THEN
      PERFORM app.refresh_kpi_brand_daily(v_old_tenant, v_old_brand, v_old_day);
    END IF;
  END IF;

  IF v_new_tenant IS NOT NULL AND v_new_day IS NOT NULL THEN
    IF v_new_tenant IS DISTINCT FROM v_old_tenant OR v_new_day IS DISTINCT FROM v_old_day THEN
      PERFORM app.refresh_kpi_tenant_daily(v_new_tenant, v_new_day);
    END IF;
    IF v_new_product_id IS NOT NULL
       AND (v_new_product_id IS DISTINCT FROM v_old_product_id
         OR v_new_day IS DISTINCT FROM v_old_day
         OR v_new_tenant IS DISTINCT FROM v_old_tenant)
    THEN
      PERFORM app.refresh_kpi_product_daily(v_new_tenant, v_new_product_id, v_new_day);
    END IF;
    IF v_new_category IS NOT NULL
       AND (v_new_category IS DISTINCT FROM v_old_category
         OR v_new_day IS DISTINCT FROM v_old_day
         OR v_new_tenant IS DISTINCT FROM v_old_tenant)
    THEN
      PERFORM app.refresh_kpi_category_daily(v_new_tenant, v_new_category, v_new_day);
    END IF;
    IF v_new_brand IS NOT NULL
       AND (v_new_brand IS DISTINCT FROM v_old_brand
         OR v_new_day IS DISTINCT FROM v_old_day
         OR v_new_tenant IS DISTINCT FROM v_old_tenant)
    THEN
      PERFORM app.refresh_kpi_brand_daily(v_new_tenant, v_new_brand, v_new_day);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."dispatch_from_order_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."dispatch_from_orders"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
  v_old_location uuid;
  v_new_location uuid;
  v_old_day date;
  v_new_day date;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  IF TG_OP <> 'INSERT' THEN
    v_old_location := OLD.location_id;
    v_old_day := app.metric_day_ist(OLD.order_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_location := NEW.location_id;
    v_new_day := app.metric_day_ist(NEW.order_date, NEW.created_at);
  END IF;

  IF NOT v_bypass THEN
    PERFORM app.refresh_orders_snapshot(v_tenant);
    PERFORM app.refresh_buyers_snapshot(v_tenant);
    PERFORM app.refresh_buyer_current_snapshot(v_tenant);

    IF v_old_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_orders_daily(v_tenant, v_old_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_old_day);
      PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_old_day);
      IF v_old_location IS NOT NULL THEN
        PERFORM app.refresh_kpi_location_daily(v_tenant, v_old_location, v_old_day);
      END IF;
    END IF;

    IF v_new_day IS NOT NULL THEN
      IF v_new_day IS DISTINCT FROM v_old_day THEN
        PERFORM app.refresh_kpi_orders_daily(v_tenant, v_new_day);
        PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_new_day);
        PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_new_day);
      END IF;
      IF v_new_location IS NOT NULL
         AND (v_new_location IS DISTINCT FROM v_old_location OR v_new_day IS DISTINCT FROM v_old_day)
      THEN
        PERFORM app.refresh_kpi_location_daily(v_tenant, v_new_location, v_new_day);
      END IF;
    END IF;

    PERFORM app.sync_buyer_app_activity_from_order(COALESCE(NEW.id, OLD.id));

    IF v_old_day IS NOT NULL THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_old_day);
    END IF;
    IF v_new_day IS NOT NULL AND v_new_day IS DISTINCT FROM v_old_day THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_new_day);
    END IF;
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."dispatch_from_orders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."dispatch_from_tenant_brands"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  PERFORM app.refresh_brands_snapshot(v_tenant);

  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."dispatch_from_tenant_brands"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."dispatch_from_tenant_products"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  PERFORM app.refresh_products_snapshot(v_tenant);
  PERFORM app.refresh_brands_snapshot(v_tenant);
  PERFORM app.refresh_categories_snapshot(v_tenant);

  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."dispatch_from_tenant_products"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."ensure_buyer_metric_snapshot_cron_scheduled"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'buyer-metric-snapshot-freshness') THEN
    PERFORM cron.schedule(
      'buyer-metric-snapshot-freshness',
      '40 18 * * *',
      'SELECT app.refresh_all_buyer_metric_snapshots()'
    );
  END IF;
END;
$$;


ALTER FUNCTION "app"."ensure_buyer_metric_snapshot_cron_scheduled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."ensure_zoho_sync_cron_scheduled"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zoho-sync-orchestrator') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'zoho-sync-orchestrator';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zoho-sync-daily') THEN
    -- 23:30 UTC ≈ 05:00 IST
    PERFORM cron.schedule('zoho-sync-daily', '30 23 * * *', 'SELECT app.run_zoho_orchestrator_cron()');
  END IF;
END;
$$;


ALTER FUNCTION "app"."ensure_zoho_sync_cron_scheduled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."estimate_accept"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_row app.estimates%ROWTYPE;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_row
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_row.status <> 'sent' THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;

  UPDATE app.estimates
  SET status = 'accepted',
      accepted_at = now(),
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object('to', 'accepted'),
    now()
  );

  RETURN jsonb_build_object('ok', true, 'estimate_id', p_estimate_id);
END;
$$;


ALTER FUNCTION "app"."estimate_accept"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."estimate_convert_to_invoice"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_invoice_date" "date" DEFAULT NULL::"date", "p_invoice_number_override" "text" DEFAULT NULL::"text", "p_qty_overrides" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_est app.estimates%ROWTYPE;
  v_inv_id uuid;
  v_inv_number text;
  v_item app.estimate_items%ROWTYPE;
  v_ids uuid[];
  v_sub numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_gst_inclusive boolean := false;
  v_policy_rate numeric := 18;
  v_taxable numeric := 0;
  v_item_tax_rate numeric := 0;
  v_qty numeric := 0;
  v_line_total numeric := 0;
  v_invoice_date date := coalesce(p_invoice_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_payment_terms_days integer := 0;
  v_due_date timestamptz;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT
    COALESCE((settings->'business_policy'->>'gst_inclusive')::boolean, false),
    COALESCE((settings->'business_policy'->>'gst_rate')::numeric, 18)
  INTO v_gst_inclusive, v_policy_rate
  FROM app.tenant_settings
  WHERE tenant_id = p_tenant_id;
  v_gst_inclusive := COALESCE(v_gst_inclusive, false);
  v_policy_rate := COALESCE(v_policy_rate, 18);

  SELECT * INTO STRICT v_est
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_est.status <> 'accepted' THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;
  IF v_est.converted_to_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_invoiced' USING ERRCODE = '23514';
  END IF;

  IF p_line_ids IS NULL OR cardinality(p_line_ids) = 0 THEN
    SELECT coalesce(array_agg(sub.id), '{}'::uuid[])
    INTO v_ids
    FROM (
      SELECT ei.id
      FROM app.estimate_items ei
      WHERE ei.estimate_id = p_estimate_id AND ei.deleted_at IS NULL
      ORDER BY ei.created_at
    ) sub;
  ELSE
    v_ids := p_line_ids;
  END IF;

  IF v_ids IS NULL OR coalesce(cardinality(v_ids), 0) = 0 THEN
    RAISE EXCEPTION 'no_lines' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)::int
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  ) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'invalid_line_ids' USING ERRCODE = '23514';
  END IF;

  v_inv_number := nullif(trim(coalesce(p_invoice_number_override, '')), '');
  IF v_inv_number IS NULL THEN
    v_inv_number := app._next_invoice_number(p_tenant_id);
  END IF;

  SELECT COALESCE(b.payment_terms_days, 0)
  INTO v_payment_terms_days
  FROM app.buyers b
  WHERE b.id = v_est.buyer_id
    AND b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL;

  v_due_date := ((v_invoice_date + COALESCE(v_payment_terms_days, 0))::text || 'T12:00:00.000Z')::timestamptz;

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  LOOP
    v_qty := COALESCE(
      NULLIF(trim(p_qty_overrides ->> v_item.id::text), '')::numeric,
      v_item.qty
    );
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_qty_override' USING ERRCODE = '22023';
    END IF;

    v_taxable := v_qty * v_item.unit_price * (1 - coalesce(v_item.disc_pct, v_item.discount_pct, 0) / 100);
    v_item_tax_rate := coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate);
    v_sub := v_sub + v_taxable;
    IF NOT v_gst_inclusive THEN
      v_tax := v_tax + (v_taxable * v_item_tax_rate / 100);
    END IF;
  END LOOP;

  v_total := greatest(v_sub - coalesce(v_est.discount_flat, 0), 0) + v_tax + coalesce(v_est.freight, 0) + coalesce(v_est.round_off, 0);

  INSERT INTO app.invoices (
    tenant_id,
    buyer_id,
    order_id,
    invoice_number,
    invoice_date,
    status,
    subtotal,
    tax_amount,
    total_amount,
    outstanding_balance,
    estimate_id,
    due_date,
    notes,
    buyer_po_ref,
    discount_flat,
    freight,
    round_off,
    created_by,
    updated_by
  )
  VALUES (
    v_est.tenant_id,
    v_est.buyer_id,
    NULL,
    v_inv_number,
    (v_invoice_date::text || 'T12:00:00.000Z')::timestamptz,
    'draft',
    v_sub,
    v_tax,
    v_total,
    v_total,
    p_estimate_id,
    v_due_date,
    v_est.notes,
    v_est.buyer_po_ref,
    coalesce(v_est.discount_flat, 0),
    coalesce(v_est.freight, 0),
    coalesce(v_est.round_off, 0),
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO v_inv_id;

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  LOOP
    v_qty := COALESCE(
      NULLIF(trim(p_qty_overrides ->> v_item.id::text), '')::numeric,
      v_item.qty
    );
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_qty_override' USING ERRCODE = '22023';
    END IF;

    v_taxable := v_qty * v_item.unit_price * (1 - coalesce(v_item.disc_pct, v_item.discount_pct, 0) / 100);
    v_item_tax_rate := coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate);
    v_line_total := round(
      CASE
        WHEN v_gst_inclusive THEN v_taxable
        ELSE v_taxable + (v_taxable * v_item_tax_rate / 100)
      END,
      2
    );

    INSERT INTO app.invoice_items (
      invoice_id,
      tenant_product_id,
      qty,
      unit_price,
      tax_rate,
      line_total,
      disc_pct,
      tax_pct,
      scheme_tag,
      created_by,
      updated_by
    )
    VALUES (
      v_inv_id,
      v_item.tenant_product_id,
      v_qty,
      v_item.unit_price,
      coalesce(v_item.tax_rate, v_item.tax_pct, v_policy_rate),
      v_line_total,
      coalesce(v_item.disc_pct, v_item.discount_pct, 0),
      coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate),
      v_item.scheme_tag,
      p_actor_user_id,
      p_actor_user_id
    );
  END LOOP;

  UPDATE app.estimates
  SET
    status = 'invoiced',
    converted_to_invoice_id = v_inv_id,
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object(
      'to', 'invoiced',
      'invoice_id', v_inv_id,
      'invoice_number', v_inv_number,
      'invoice_date', v_invoice_date,
      'line_ids', v_ids,
      'qty_overrides', coalesce(p_qty_overrides, '{}'::jsonb)
    ),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', v_inv_id,
    'invoice_number', v_inv_number,
    'redirect_path', format('/invoices/%s', v_inv_id)
  );
END;
$$;


ALTER FUNCTION "app"."estimate_convert_to_invoice"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_invoice_date" "date", "p_invoice_number_override" "text", "p_qty_overrides" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_est app.estimates%ROWTYPE;
  v_order_id uuid;
  v_order_number text;
  v_item app.estimate_items%ROWTYPE;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_est
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_est.status <> 'accepted' THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;
  IF v_est.converted_to_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_converted' USING ERRCODE = '23514';
  END IF;

  v_order_number := app._next_order_number(p_tenant_id);

  INSERT INTO app.orders (
    tenant_id,
    buyer_id,
    placed_by,
    order_number,
    status,
    source,
    catalog_id,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    notes,
    placed_at,
    estimate_id,
    created_by,
    updated_by
  )
  VALUES (
    v_est.tenant_id,
    v_est.buyer_id,
    p_actor_user_id,
    v_order_number,
    'received',
    'cockpit_manual',
    v_est.catalog_id,
    v_est.subtotal,
    v_est.tax_amount,
    v_est.total_amount,
    COALESCE(v_est.currency, 'INR'),
    v_est.notes,
    now(),
    p_estimate_id,
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id AND ei.deleted_at IS NULL
  LOOP
    INSERT INTO app.order_items (
      order_id,
      tenant_product_id,
      qty,
      unit_price,
      tax_rate,
      line_total,
      created_by,
      updated_by
    )
    VALUES (
      v_order_id,
      v_item.tenant_product_id,
      v_item.qty,
      v_item.unit_price,
      v_item.tax_rate,
      v_item.line_total,
      p_actor_user_id,
      p_actor_user_id
    );
  END LOOP;

  UPDATE app.estimates
  SET status = 'converted',
      converted_to_order_id = v_order_id,
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object('to', 'converted', 'order_id', v_order_id, 'order_number', v_order_number),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'redirect_path', format('/sales-orders/%s', v_order_id)
  );
END;
$$;


ALTER FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_expected_delivery" "date" DEFAULT NULL::"date", "p_order_number_override" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_est app.estimates%ROWTYPE;
  v_order_id uuid;
  v_order_number text;
  v_item app.estimate_items%ROWTYPE;
  v_ids uuid[];
  v_delivery date;
  v_sub numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_gst_inclusive boolean := false;
  v_policy_rate numeric := 18;
  v_taxable numeric := 0;
  v_item_tax_rate numeric := 0;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT
    COALESCE((settings->'business_policy'->>'gst_inclusive')::boolean, false),
    COALESCE((settings->'business_policy'->>'gst_rate')::numeric, 18)
  INTO v_gst_inclusive, v_policy_rate
  FROM app.tenant_settings
  WHERE tenant_id = p_tenant_id;
  v_gst_inclusive := COALESCE(v_gst_inclusive, false);
  v_policy_rate := COALESCE(v_policy_rate, 18);

  SELECT * INTO STRICT v_est
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_est.status NOT IN ('accepted', 'sent') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;
  IF v_est.converted_to_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_converted' USING ERRCODE = '23514';
  END IF;
  IF v_est.buyer_id IS NULL THEN
    RAISE EXCEPTION 'buyer_required' USING ERRCODE = '22023';
  END IF;

  IF p_line_ids IS NULL OR cardinality(p_line_ids) = 0 THEN
    SELECT coalesce(array_agg(sub.id), '{}'::uuid[])
    INTO v_ids
    FROM (
      SELECT ei.id
      FROM app.estimate_items ei
      WHERE ei.estimate_id = p_estimate_id AND ei.deleted_at IS NULL
      ORDER BY ei.created_at
    ) sub;
  ELSE
    v_ids := p_line_ids;
  END IF;

  IF v_ids IS NULL OR coalesce(cardinality(v_ids), 0) = 0 THEN
    RAISE EXCEPTION 'no_lines' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)::int
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  ) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'invalid_line_ids' USING ERRCODE = '23514';
  END IF;

  v_order_number := nullif(trim(coalesce(p_order_number_override, '')), '');
  IF v_order_number IS NULL THEN
    v_order_number := app._next_order_number(p_tenant_id);
  END IF;

  v_delivery := coalesce(p_expected_delivery, (CURRENT_DATE + 7));

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  LOOP
    v_taxable := v_item.qty * v_item.unit_price * (1 - coalesce(v_item.disc_pct, v_item.discount_pct, 0) / 100);
    v_item_tax_rate := coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate);
    v_sub := v_sub + v_taxable;
    IF NOT v_gst_inclusive THEN
      v_tax := v_tax + (v_taxable * v_item_tax_rate / 100);
    END IF;
  END LOOP;

  v_total := greatest(v_sub - coalesce(v_est.discount_flat, 0), 0) + v_tax + coalesce(v_est.freight, 0) + coalesce(v_est.round_off, 0);

  INSERT INTO app.orders (
    tenant_id,
    buyer_id,
    placed_by,
    order_number,
    status,
    source,
    campaign_id,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    notes,
    placed_at,
    estimate_id,
    expected_delivery,
    buyer_po_ref,
    discount_flat,
    freight,
    round_off,
    created_by,
    updated_by
  )
  VALUES (
    v_est.tenant_id,
    v_est.buyer_id,
    p_actor_user_id,
    v_order_number,
    'received',
    'cockpit_manual',
    v_est.campaign_id,
    v_sub,
    v_tax,
    v_total,
    coalesce(v_est.currency, 'INR'),
    v_est.notes,
    now(),
    p_estimate_id,
    v_delivery,
    v_est.buyer_po_ref,
    coalesce(v_est.discount_flat, 0),
    coalesce(v_est.freight, 0),
    coalesce(v_est.round_off, 0),
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  LOOP
    INSERT INTO app.order_items (
      order_id,
      tenant_product_id,
      qty,
      unit_price,
      tax_rate,
      line_total,
      disc_pct,
      tax_pct,
      scheme_tag,
      created_by,
      updated_by
    )
    VALUES (
      v_order_id,
      v_item.tenant_product_id,
      v_item.qty,
      v_item.unit_price,
      coalesce(v_item.tax_rate, v_item.tax_pct, v_policy_rate),
      v_item.line_total,
      coalesce(v_item.disc_pct, v_item.discount_pct, 0),
      coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate),
      v_item.scheme_tag,
      p_actor_user_id,
      p_actor_user_id
    );
  END LOOP;

  UPDATE app.estimate_items ei
  SET
    deleted_at = now(),
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE ei.estimate_id = p_estimate_id
    AND ei.id = ANY (v_ids)
    AND ei.deleted_at IS NULL;

  UPDATE app.estimates
  SET
    status = 'converted',
    converted_to_order_id = v_order_id,
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object('to', 'converted', 'order_id', v_order_id, 'order_number', v_order_number, 'line_ids', v_ids),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'redirect_path', format('/sales-orders/%s', v_order_id)
  );
END;
$$;


ALTER FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_expected_delivery" "date", "p_order_number_override" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_expected_delivery" "date" DEFAULT NULL::"date", "p_order_number_override" "text" DEFAULT NULL::"text", "p_qty_overrides" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_est app.estimates%ROWTYPE;
  v_order_id uuid;
  v_order_number text;
  v_item app.estimate_items%ROWTYPE;
  v_ids uuid[];
  v_delivery date;
  v_sub numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_gst_inclusive boolean := false;
  v_policy_rate numeric := 18;
  v_taxable numeric := 0;
  v_item_tax_rate numeric := 0;
  v_qty numeric := 0;
  v_line_total numeric := 0;
  v_order_date date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT
    COALESCE((settings->'business_policy'->>'gst_inclusive')::boolean, false),
    COALESCE((settings->'business_policy'->>'gst_rate')::numeric, 18)
  INTO v_gst_inclusive, v_policy_rate
  FROM app.tenant_settings
  WHERE tenant_id = p_tenant_id;
  v_gst_inclusive := COALESCE(v_gst_inclusive, false);
  v_policy_rate := COALESCE(v_policy_rate, 18);

  SELECT * INTO STRICT v_est
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_est.status NOT IN ('accepted', 'sent') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;
  IF v_est.converted_to_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_converted' USING ERRCODE = '23514';
  END IF;
  IF v_est.buyer_id IS NULL THEN
    RAISE EXCEPTION 'buyer_required' USING ERRCODE = '22023';
  END IF;

  IF p_line_ids IS NULL OR cardinality(p_line_ids) = 0 THEN
    SELECT coalesce(array_agg(sub.id), '{}'::uuid[])
    INTO v_ids
    FROM (
      SELECT ei.id
      FROM app.estimate_items ei
      WHERE ei.estimate_id = p_estimate_id AND ei.deleted_at IS NULL
      ORDER BY ei.created_at
    ) sub;
  ELSE
    v_ids := p_line_ids;
  END IF;

  IF v_ids IS NULL OR coalesce(cardinality(v_ids), 0) = 0 THEN
    RAISE EXCEPTION 'no_lines' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)::int
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  ) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'invalid_line_ids' USING ERRCODE = '23514';
  END IF;

  v_order_number := nullif(trim(coalesce(p_order_number_override, '')), '');
  IF v_order_number IS NULL THEN
    v_order_number := app._next_order_number(p_tenant_id);
  END IF;

  v_delivery := coalesce(p_expected_delivery, (CURRENT_DATE + 7));

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  LOOP
    v_qty := COALESCE(
      NULLIF(trim(p_qty_overrides ->> v_item.id::text), '')::numeric,
      v_item.qty
    );
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_qty_override' USING ERRCODE = '22023';
    END IF;

    v_taxable := v_qty * v_item.unit_price * (1 - coalesce(v_item.disc_pct, v_item.discount_pct, 0) / 100);
    v_item_tax_rate := coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate);
    v_sub := v_sub + v_taxable;
    IF NOT v_gst_inclusive THEN
      v_tax := v_tax + (v_taxable * v_item_tax_rate / 100);
    END IF;
  END LOOP;

  v_total := greatest(v_sub - coalesce(v_est.discount_flat, 0), 0) + v_tax + coalesce(v_est.freight, 0) + coalesce(v_est.round_off, 0);

  INSERT INTO app.orders (
    tenant_id,
    buyer_id,
    placed_by,
    order_number,
    status,
    source,
    campaign_id,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    notes,
    placed_at,
    order_date,
    estimate_id,
    expected_delivery,
    buyer_po_ref,
    discount_flat,
    freight,
    round_off,
    created_by,
    updated_by
  )
  VALUES (
    v_est.tenant_id,
    v_est.buyer_id,
    p_actor_user_id,
    v_order_number,
    'received',
    'cockpit_manual',
    v_est.campaign_id,
    v_sub,
    v_tax,
    v_total,
    coalesce(v_est.currency, 'INR'),
    v_est.notes,
    (v_order_date::text || 'T12:00:00.000Z')::timestamptz,
    v_order_date,
    p_estimate_id,
    v_delivery,
    v_est.buyer_po_ref,
    coalesce(v_est.discount_flat, 0),
    coalesce(v_est.freight, 0),
    coalesce(v_est.round_off, 0),
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  LOOP
    v_qty := COALESCE(
      NULLIF(trim(p_qty_overrides ->> v_item.id::text), '')::numeric,
      v_item.qty
    );
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_qty_override' USING ERRCODE = '22023';
    END IF;

    v_taxable := v_qty * v_item.unit_price * (1 - coalesce(v_item.disc_pct, v_item.discount_pct, 0) / 100);
    v_item_tax_rate := coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate);
    v_line_total := round(
      CASE
        WHEN v_gst_inclusive THEN v_taxable
        ELSE v_taxable + (v_taxable * v_item_tax_rate / 100)
      END,
      2
    );

    INSERT INTO app.order_items (
      order_id,
      tenant_product_id,
      qty,
      unit_price,
      tax_rate,
      line_total,
      disc_pct,
      tax_pct,
      scheme_tag,
      created_by,
      updated_by
    )
    VALUES (
      v_order_id,
      v_item.tenant_product_id,
      v_qty,
      v_item.unit_price,
      coalesce(v_item.tax_rate, v_item.tax_pct, v_policy_rate),
      v_line_total,
      coalesce(v_item.disc_pct, v_item.discount_pct, 0),
      coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate),
      v_item.scheme_tag,
      p_actor_user_id,
      p_actor_user_id
    );
  END LOOP;

  UPDATE app.estimate_items ei
  SET
    deleted_at = now(),
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE ei.estimate_id = p_estimate_id
    AND ei.id = ANY (v_ids)
    AND ei.deleted_at IS NULL;

  UPDATE app.estimates
  SET
    status = 'converted',
    converted_to_order_id = v_order_id,
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object(
      'to', 'converted',
      'order_id', v_order_id,
      'order_number', v_order_number,
      'line_ids', v_ids,
      'qty_overrides', coalesce(p_qty_overrides, '{}'::jsonb)
    ),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'redirect_path', format('/sales-orders/%s', v_order_id)
  );
END;
$$;


ALTER FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_expected_delivery" "date", "p_order_number_override" "text", "p_qty_overrides" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_expected_delivery" "date" DEFAULT NULL::"date", "p_order_number_override" "text" DEFAULT NULL::"text", "p_qty_overrides" "jsonb" DEFAULT '{}'::"jsonb", "p_order_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_result jsonb;
  v_order_id uuid;
  v_effective_order_date date := COALESCE(p_order_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
BEGIN
  v_result := app.estimate_convert_to_order(
    p_tenant_id,
    p_estimate_id,
    p_actor_user_id,
    p_line_ids,
    p_expected_delivery,
    p_order_number_override,
    p_qty_overrides
  );

  v_order_id := NULLIF(v_result ->> 'order_id', '')::uuid;

  IF v_order_id IS NOT NULL THEN
    UPDATE app.orders
    SET
      order_date = v_effective_order_date,
      placed_at = COALESCE(
        placed_at,
        make_timestamptz(
          EXTRACT(YEAR FROM v_effective_order_date)::int,
          EXTRACT(MONTH FROM v_effective_order_date)::int,
          EXTRACT(DAY FROM v_effective_order_date)::int,
          12, 0, 0,
          'Asia/Kolkata'
        )
      ),
      updated_at = now(),
      updated_by = p_actor_user_id
    WHERE id = v_order_id
      AND tenant_id = p_tenant_id;
  END IF;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_expected_delivery" "date", "p_order_number_override" "text", "p_qty_overrides" "jsonb", "p_order_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."estimate_decline"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_row app.estimates%ROWTYPE;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_row
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_row.status <> 'sent' THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;

  UPDATE app.estimates
  SET status = 'declined',
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object('to', 'declined'),
    now()
  );

  RETURN jsonb_build_object('ok', true, 'estimate_id', p_estimate_id);
END;
$$;


ALTER FUNCTION "app"."estimate_decline"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."estimate_duplicate"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_src app.estimates%ROWTYPE;
  v_new_id uuid;
  v_new_number text;
  v_item app.estimate_items%ROWTYPE;
  v_expires timestamptz := (now() AT TIME ZONE 'utc') + interval '30 days';
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_src
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  v_new_number := app._next_estimate_number(p_tenant_id);

  INSERT INTO app.estimates (
    tenant_id,
    buyer_id,
    estimate_number,
    status,
    catalog_id,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    notes,
    seller_note,
    source,
    expires_at,
    created_by,
    updated_by
  )
  VALUES (
    v_src.tenant_id,
    v_src.buyer_id,
    v_new_number,
    'draft',
    v_src.catalog_id,
    v_src.subtotal,
    v_src.tax_amount,
    v_src.total_amount,
    COALESCE(v_src.currency, 'INR'),
    v_src.notes,
    v_src.seller_note,
    'seller',
    v_expires,
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO v_new_id;

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id AND ei.deleted_at IS NULL
  LOOP
    INSERT INTO app.estimate_items (
      estimate_id,
      tenant_product_id,
      qty,
      unit_price,
      tax_rate,
      line_total,
      discount_pct,
      created_by,
      updated_by
    )
    VALUES (
      v_new_id,
      v_item.tenant_product_id,
      v_item.qty,
      v_item.unit_price,
      v_item.tax_rate,
      v_item.line_total,
      COALESCE(v_item.discount_pct, 0),
      p_actor_user_id,
      p_actor_user_id
    );
  END LOOP;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    v_new_id,
    'create',
    jsonb_build_object('from_estimate_id', p_estimate_id, 'estimate_number', v_new_number),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'estimate_id', v_new_id,
    'estimate_number', v_new_number,
    'redirect_path', format('/estimates/%s', v_new_id)
  );
END;
$$;


ALTER FUNCTION "app"."estimate_duplicate"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."estimate_send"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_row app.estimates%ROWTYPE;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_row
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_row.status <> 'draft' THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;

  UPDATE app.estimates
  SET status = 'sent',
      sent_at = now(),
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object('to', 'sent'),
    now()
  );

  RETURN jsonb_build_object('ok', true, 'estimate_id', p_estimate_id);
END;
$$;


ALTER FUNCTION "app"."estimate_send"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."estimate_status_is_open"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_status, '') IN ('draft', 'sent');
$$;


ALTER FUNCTION "app"."estimate_status_is_open"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."estimate_void"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_est app.estimates%ROWTYPE;
BEGIN
  PERFORM app._estimate_assert_seller_admin(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_est
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_est.status NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;

  UPDATE app.estimates
  SET
    status = 'void',
    voided_at = now(),
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object('to', 'void'),
    now()
  );

  RETURN jsonb_build_object('ok', true, 'estimate_id', p_estimate_id);
END;
$$;


ALTER FUNCTION "app"."estimate_void"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."evaluate_buyer_for_cohorts"("p_buyer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_tenant_id        uuid;
  v_city             text;
  v_last_order_at    timestamptz;
  v_gmv_90d          numeric;
  v_last_order_bucket text;
  v_gmv_90d_bucket   text;
  v_cohort           record;
  v_filter           jsonb;
  v_field            text;
  v_operator         text;
  v_value_arr        text[];
  v_matches          boolean;
  v_is_excluded      boolean;
  v_bucket_val       text;
  v_now              timestamptz := now();
BEGIN
  -- ── Fetch buyer basics ──────────────────────────────────────────────────────
  SELECT tenant_id, lower(trim(geography->>'city'))
  INTO v_tenant_id, v_city
  FROM app.buyers
  WHERE id = p_buyer_id AND deleted_at IS NULL AND is_active = true;

  IF NOT FOUND THEN
    RETURN; -- buyer deleted or inactive; cohort_members will be cleaned by cascades
  END IF;

  -- ── Compute order-derived metrics for this buyer ────────────────────────────
  SELECT
    MAX(o.placed_at),
    COALESCE(SUM(
      CASE WHEN o.placed_at >= v_now - INTERVAL '90 days' THEN o.total_amount ELSE 0 END
    ), 0)
  INTO v_last_order_at, v_gmv_90d
  FROM app.orders o
  WHERE o.tenant_id = v_tenant_id
    AND o.buyer_id  = p_buyer_id
    AND o.deleted_at IS NULL
    AND o.status   != 'cancelled';

  v_last_order_bucket := app.derive_last_order_bucket(v_last_order_at);
  v_gmv_90d_bucket    := app.derive_gmv_90d_bucket(v_gmv_90d);

  -- ── Evaluate each dynamic cohort ────────────────────────────────────────────
  FOR v_cohort IN
    SELECT id, rules
    FROM app.cohorts
    WHERE tenant_id  = v_tenant_id
      AND is_static  = false
      AND deleted_at IS NULL
  LOOP
    -- Check explicit exclusion list
    v_is_excluded := false;
    IF (v_cohort.rules ? 'excluded_buyer_ids') AND
       jsonb_array_length(v_cohort.rules -> 'excluded_buyer_ids') > 0
    THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_cohort.rules -> 'excluded_buyer_ids') x
        WHERE x = p_buyer_id::text
      ) INTO v_is_excluded;
    END IF;

    IF v_is_excluded THEN
      DELETE FROM app.cohort_members WHERE cohort_id = v_cohort.id AND buyer_id = p_buyer_id;
      CONTINUE;
    END IF;

    -- Evaluate each filter
    v_matches := true;

    FOR v_filter IN SELECT * FROM jsonb_array_elements(COALESCE(v_cohort.rules -> 'filters', '[]'::jsonb))
    LOOP
      v_field    := v_filter ->> 'field';
      v_operator := v_filter ->> 'operator';

      IF v_field = 'geography.city' THEN
        SELECT array_agg(lower(x)) INTO v_value_arr
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(v_filter -> 'value') = 'array'
               THEN v_filter -> 'value'
               ELSE jsonb_build_array(v_filter -> 'value')
          END
        ) x;
        IF NOT (COALESCE(v_city, '') = ANY(v_value_arr)) THEN
          v_matches := false;
          EXIT;
        END IF;

      ELSIF v_field = 'last_order_bucket' THEN
        v_bucket_val := CASE
          WHEN jsonb_typeof(v_filter -> 'value') = 'array'
          THEN (v_filter -> 'value') ->> 0
          ELSE v_filter ->> 'value'
        END;
        IF v_bucket_val = 'within_30_days' AND v_last_order_bucket != 'within_30_days' THEN
          v_matches := false; EXIT;
        ELSIF v_bucket_val = 'within_90_days'
          AND v_last_order_bucket NOT IN ('within_30_days', 'within_90_days') THEN
          v_matches := false; EXIT;
        ELSIF v_bucket_val = 'dormant_90_plus_days'
          AND v_last_order_bucket != 'dormant_90_plus_days' THEN
          v_matches := false; EXIT;
        -- 'anytime' always passes through
        END IF;

      ELSIF v_field = 'gmv_90d_bucket' THEN
        SELECT array_agg(x) INTO v_value_arr
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(v_filter -> 'value') = 'array'
               THEN v_filter -> 'value'
               ELSE jsonb_build_array(v_filter -> 'value')
          END
        ) x;
        IF NOT (v_gmv_90d_bucket = ANY(v_value_arr)) THEN
          v_matches := false; EXIT;
        END IF;
      END IF;
    END LOOP;

    -- Apply membership change
    IF v_matches THEN
      INSERT INTO app.cohort_members (cohort_id, buyer_id)
      VALUES (v_cohort.id, p_buyer_id)
      ON CONFLICT (cohort_id, buyer_id) DO NOTHING;
    ELSE
      DELETE FROM app.cohort_members
      WHERE cohort_id = v_cohort.id AND buyer_id = p_buyer_id;
    END IF;
  END LOOP;

  -- Update cached_member_count + last_refreshed_at for affected cohorts
  UPDATE app.cohorts c
  SET
    cached_member_count = (SELECT COUNT(*) FROM app.cohort_members WHERE cohort_id = c.id),
    last_refreshed_at   = v_now
  WHERE c.tenant_id  = v_tenant_id
    AND c.is_static  = false
    AND c.deleted_at IS NULL;
END;
$$;


ALTER FUNCTION "app"."evaluate_buyer_for_cohorts"("p_buyer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."evaluate_product_for_campaigns"("p_tenant_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_tenant_id         uuid;
  v_brand_name        text;
  v_category_name     text;
  v_qty_available     numeric;
  v_availability      text;
  v_is_new_in_stock   boolean;
  v_last_order_at     timestamptz;
  v_gmv_90d           numeric;
  v_last_order_bucket text;
  v_gmv_90d_bucket    text;
  v_campaign          record;
  v_rules             jsonb;
  v_brand_names       text[];
  v_category_names    text[];
  v_avail_filter      text;
  v_lob_filter        text;
  v_gmv_filter        text;
  v_matches           boolean;
BEGIN
  -- ── Fetch product basics ────────────────────────────────────────────────────
  SELECT tp.tenant_id, tp.brand_name, tp.category_name
  INTO v_tenant_id, v_brand_name, v_category_name
  FROM app.tenant_products tp
  WHERE tp.id = p_tenant_product_id AND tp.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN; -- product deleted; nothing to evaluate
  END IF;

  -- ── Fetch inventory qty ─────────────────────────────────────────────────────
  SELECT COALESCE(ti.qty_available, 0)
  INTO v_qty_available
  FROM app.tenant_inventory ti
  WHERE ti.tenant_product_id = p_tenant_product_id
    AND ti.deleted_at IS NULL
  ORDER BY ti.updated_at DESC
  LIMIT 1;

  v_qty_available := COALESCE(v_qty_available, 0);

  -- ── Derive availability status ──────────────────────────────────────────────
  v_availability := CASE
    WHEN v_qty_available <= 0  THEN 'out_of_stock'
    WHEN v_qty_available <= 10 THEN 'low_stock'
    ELSE                            'in_stock'
  END;

  -- ── Check new_in_stock_7d ───────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM app.stock_in_events sie
    WHERE sie.tenant_product_id = p_tenant_product_id
      AND sie.event_at >= now() - interval '7 days'
  ) INTO v_is_new_in_stock;

  -- ── Compute order-derived metrics for this product ──────────────────────────
  SELECT MAX(o.placed_at)
  INTO v_last_order_at
  FROM app.orders o
  JOIN app.order_items oi ON oi.order_id = o.id
  WHERE oi.tenant_product_id = p_tenant_product_id
    AND o.status   != 'cancelled'
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL;

  SELECT COALESCE(SUM(oi.qty * oi.unit_price), 0)
  INTO v_gmv_90d
  FROM app.order_items oi
  JOIN app.orders o ON o.id = oi.order_id
  WHERE oi.tenant_product_id = p_tenant_product_id
    AND o.placed_at >= now() - interval '90 days'
    AND o.status   != 'cancelled'
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL;

  v_last_order_bucket := app.derive_last_order_bucket(v_last_order_at);
  v_gmv_90d_bucket    := app.derive_gmv_90d_bucket(v_gmv_90d);

  -- ── Evaluate each dynamic campaign for this tenant ──────────────────────────
  FOR v_campaign IN
    SELECT c.id, c.dynamic_rules
    FROM app.campaigns c
    WHERE c.tenant_id  = v_tenant_id
      AND c.is_dynamic = true
      AND c.deleted_at IS NULL
  LOOP
    v_rules   := v_campaign.dynamic_rules;
    v_matches := true;

    -- brand_names filter (empty array = no restriction)
    SELECT array_agg(x) INTO v_brand_names
    FROM jsonb_array_elements_text(COALESCE(v_rules -> 'brand_names', '[]'::jsonb)) x;

    IF v_brand_names IS NOT NULL AND array_length(v_brand_names, 1) > 0 THEN
      IF NOT (lower(COALESCE(v_brand_name, '')) = ANY(
        SELECT lower(unnest(v_brand_names))
      )) THEN
        v_matches := false;
      END IF;
    END IF;

    -- category_names filter
    IF v_matches THEN
      SELECT array_agg(x) INTO v_category_names
      FROM jsonb_array_elements_text(COALESCE(v_rules -> 'category_names', '[]'::jsonb)) x;

      IF v_category_names IS NOT NULL AND array_length(v_category_names, 1) > 0 THEN
        IF NOT (lower(COALESCE(v_category_name, '')) = ANY(
          SELECT lower(unnest(v_category_names))
        )) THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    -- availability filter
    IF v_matches THEN
      v_avail_filter := v_rules ->> 'availability';
      IF v_avail_filter IS NOT NULL AND v_avail_filter != 'show_everything' THEN
        IF v_avail_filter = 'new_in_stock_today' THEN
          IF NOT v_is_new_in_stock THEN
            v_matches := false;
          END IF;
        ELSIF v_avail_filter != v_availability THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    -- last_ordered_bucket filter
    IF v_matches THEN
      v_lob_filter := v_rules ->> 'last_ordered_bucket';
      IF v_lob_filter IS NOT NULL THEN
        IF v_lob_filter = 'within_30_days' AND v_last_order_bucket != 'within_30_days' THEN
          v_matches := false;
        ELSIF v_lob_filter = 'within_90_days'
          AND v_last_order_bucket NOT IN ('within_30_days', 'within_90_days') THEN
          v_matches := false;
        ELSIF v_lob_filter = 'dormant_90_plus_days'
          AND v_last_order_bucket != 'dormant_90_plus_days' THEN
          v_matches := false;
        -- 'anytime' always passes
        END IF;
      END IF;
    END IF;

    -- gmv_90d_bucket filter
    IF v_matches THEN
      v_gmv_filter := v_rules ->> 'gmv_90d_bucket';
      IF v_gmv_filter IS NOT NULL AND v_gmv_filter != v_gmv_90d_bucket THEN
        v_matches := false;
      END IF;
    END IF;

    -- Apply membership change
    IF v_matches THEN
      INSERT INTO app.campaign_items (campaign_id, tenant_product_id)
      VALUES (v_campaign.id, p_tenant_product_id)
      ON CONFLICT (campaign_id, tenant_product_id) DO NOTHING;

      -- Un-soft-delete if previously removed
      UPDATE app.campaign_items
      SET deleted_at = NULL
      WHERE campaign_id        = v_campaign.id
        AND tenant_product_id  = p_tenant_product_id
        AND deleted_at IS NOT NULL;
    ELSE
      -- Soft-delete if currently active
      UPDATE app.campaign_items
      SET deleted_at = now()
      WHERE campaign_id        = v_campaign.id
        AND tenant_product_id  = p_tenant_product_id
        AND deleted_at IS NULL;
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."evaluate_product_for_campaigns"("p_tenant_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."evaluate_product_for_price_lists"("p_tenant_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_tenant_id         uuid;
  v_brand_name        text;
  v_category_name     text;
  v_base_price        numeric;
  v_mrp               numeric;
  v_qty_available     numeric;
  v_availability      text;
  v_is_new_in_stock   boolean;
  v_last_order_at     timestamptz;
  v_gmv_90d           numeric;
  v_last_order_bucket text;
  v_gmv_90d_bucket    text;
  v_price_list        record;
  v_filters           jsonb;
  v_brand_names       text[];
  v_category_names    text[];
  v_avail_filter      text;
  v_lob_filter        text;
  v_gmv_filter        text;
  v_matches           boolean;
  v_computed_price    numeric;
BEGIN
  -- ── Fetch product basics ────────────────────────────────────────────────────
  SELECT tp.tenant_id, tp.brand_name, tp.category_name,
         tp.base_selling_price, tp.mrp
  INTO v_tenant_id, v_brand_name, v_category_name, v_base_price, v_mrp
  FROM app.tenant_products tp
  WHERE tp.id = p_tenant_product_id AND tp.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- ── Fetch inventory qty ─────────────────────────────────────────────────────
  SELECT COALESCE(ti.qty_available, 0)
  INTO v_qty_available
  FROM app.tenant_inventory ti
  WHERE ti.tenant_product_id = p_tenant_product_id
    AND ti.deleted_at IS NULL
  ORDER BY ti.updated_at DESC
  LIMIT 1;

  v_qty_available := COALESCE(v_qty_available, 0);

  v_availability := CASE
    WHEN v_qty_available <= 0  THEN 'out_of_stock'
    WHEN v_qty_available <= 10 THEN 'low_stock'
    ELSE                            'in_stock'
  END;

  -- ── new_in_stock_7d ─────────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM app.stock_in_events sie
    WHERE sie.tenant_product_id = p_tenant_product_id
      AND sie.event_at >= now() - interval '7 days'
  ) INTO v_is_new_in_stock;

  -- ── Order-derived metrics ───────────────────────────────────────────────────
  SELECT MAX(o.placed_at)
  INTO v_last_order_at
  FROM app.orders o
  JOIN app.order_items oi ON oi.order_id = o.id
  WHERE oi.tenant_product_id = p_tenant_product_id
    AND o.status   != 'cancelled'
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL;

  SELECT COALESCE(SUM(oi.qty * oi.unit_price), 0)
  INTO v_gmv_90d
  FROM app.order_items oi
  JOIN app.orders o ON o.id = oi.order_id
  WHERE oi.tenant_product_id = p_tenant_product_id
    AND o.placed_at >= now() - interval '90 days'
    AND o.status   != 'cancelled'
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL;

  v_last_order_bucket := app.derive_last_order_bucket(v_last_order_at);
  v_gmv_90d_bucket    := app.derive_gmv_90d_bucket(v_gmv_90d);

  -- ── Evaluate each price list for this tenant ────────────────────────────────
  FOR v_price_list IN
    SELECT pl.id, pl.filters, pl.pricing_strategy, pl.strategy_value
    FROM app.price_lists pl
    WHERE pl.tenant_id = v_tenant_id
      AND pl.deleted_at IS NULL
      AND pl.filters IS NOT NULL
  LOOP
    -- Skip lists that require manual per-item pricing
    IF v_price_list.pricing_strategy = 'edit_each' THEN
      CONTINUE;
    END IF;

    v_filters := v_price_list.filters;
    v_matches := true;

    -- brand_names filter
    SELECT array_agg(x) INTO v_brand_names
    FROM jsonb_array_elements_text(COALESCE(v_filters -> 'brand_names', '[]'::jsonb)) x;

    IF v_brand_names IS NOT NULL AND array_length(v_brand_names, 1) > 0 THEN
      IF NOT (lower(COALESCE(v_brand_name, '')) = ANY(
        SELECT lower(unnest(v_brand_names))
      )) THEN
        v_matches := false;
      END IF;
    END IF;

    -- category_names filter
    IF v_matches THEN
      SELECT array_agg(x) INTO v_category_names
      FROM jsonb_array_elements_text(COALESCE(v_filters -> 'category_names', '[]'::jsonb)) x;

      IF v_category_names IS NOT NULL AND array_length(v_category_names, 1) > 0 THEN
        IF NOT (lower(COALESCE(v_category_name, '')) = ANY(
          SELECT lower(unnest(v_category_names))
        )) THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    -- availability filter
    IF v_matches THEN
      v_avail_filter := v_filters ->> 'availability';
      IF v_avail_filter IS NOT NULL AND v_avail_filter != 'show_everything' THEN
        IF v_avail_filter = 'new_in_stock_today' THEN
          IF NOT v_is_new_in_stock THEN
            v_matches := false;
          END IF;
        ELSIF v_avail_filter != v_availability THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    -- last_ordered_bucket filter
    IF v_matches THEN
      v_lob_filter := v_filters ->> 'last_ordered_bucket';
      IF v_lob_filter IS NOT NULL THEN
        IF v_lob_filter = 'within_30_days' AND v_last_order_bucket != 'within_30_days' THEN
          v_matches := false;
        ELSIF v_lob_filter = 'within_90_days'
          AND v_last_order_bucket NOT IN ('within_30_days', 'within_90_days') THEN
          v_matches := false;
        ELSIF v_lob_filter = 'dormant_90_plus_days'
          AND v_last_order_bucket != 'dormant_90_plus_days' THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    -- gmv_90d_bucket filter
    IF v_matches THEN
      v_gmv_filter := v_filters ->> 'gmv_90d_bucket';
      IF v_gmv_filter IS NOT NULL AND v_gmv_filter != v_gmv_90d_bucket THEN
        v_matches := false;
      END IF;
    END IF;

    -- Apply membership change
    IF v_matches THEN
      -- Compute price from strategy
      v_computed_price := CASE v_price_list.pricing_strategy
        WHEN 'margin_from_mrp'  THEN COALESCE(v_mrp, 0) * (1 - COALESCE(v_price_list.strategy_value, 0) / 100)
        WHEN 'flat_off_base'    THEN COALESCE(v_base_price, 0) - COALESCE(v_price_list.strategy_value, 0)
        WHEN 'percentage'       THEN COALESCE(v_base_price, 0) * (1 - COALESCE(v_price_list.strategy_value, 0) / 100)
        WHEN 'per_item'         THEN COALESCE(v_price_list.strategy_value, 0)
        ELSE                         COALESCE(v_base_price, 0)
      END;

      -- Ensure price is non-negative
      v_computed_price := GREATEST(v_computed_price, 0);

      -- Upsert: insert with min_qty=1 or restore a soft-deleted row
      INSERT INTO app.price_list_items (
        price_list_id, tenant_product_id, price, min_qty
      )
      VALUES (
        v_price_list.id, p_tenant_product_id, v_computed_price, 1
      )
      ON CONFLICT (price_list_id, tenant_product_id, min_qty)
      DO UPDATE SET
        price      = EXCLUDED.price,
        deleted_at = NULL;

    ELSE
      -- Soft-delete the item for min_qty=1 (the auto-managed tier)
      UPDATE app.price_list_items
      SET deleted_at = now()
      WHERE price_list_id      = v_price_list.id
        AND tenant_product_id  = p_tenant_product_id
        AND min_qty            = 1
        AND deleted_at IS NULL;
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."evaluate_product_for_price_lists"("p_tenant_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."get_buyer_home_summary"("p_tenant_id" "uuid", "p_buyer_id" "uuid", "p_as_of" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("gmv_mtd" numeric, "invoice_count_ytd" bigint, "trend_vs_last_month_pct" integer, "outstanding_dues" numeric, "open_invoice_count" bigint, "earliest_due_date" timestamp with time zone, "days_until_earliest_due" integer, "credit_limit" numeric, "available_credit" numeric, "credit_used" numeric, "open_orders_count" bigint, "refreshed_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  WITH bounds AS (
    SELECT
      (p_as_of AT TIME ZONE 'Asia/Kolkata')::date AS today_ist,
      date_trunc('month', p_as_of AT TIME ZONE 'Asia/Kolkata')::date AS month_start_ist,
      make_date(
        EXTRACT(YEAR FROM (p_as_of AT TIME ZONE 'Asia/Kolkata'))::int,
        1,
        1
      ) AS year_start_ist,
      (date_trunc('month', p_as_of AT TIME ZONE 'Asia/Kolkata') - interval '1 month')::date AS prev_month_start_ist,
      (date_trunc('month', p_as_of AT TIME ZONE 'Asia/Kolkata')::date - 1) AS prev_month_end_ist,
      EXTRACT(DAY FROM (p_as_of AT TIME ZONE 'Asia/Kolkata'))::int AS current_day_of_month
  ),
  period_bounds AS (
    SELECT
      today_ist,
      month_start_ist,
      year_start_ist,
      prev_month_start_ist,
      LEAST(prev_month_start_ist + (current_day_of_month - 1), prev_month_end_ist) AS prev_window_end_ist
    FROM bounds
  ),
  buyer_period_rollup AS (
    SELECT
      COALESCE(SUM(k.invoices_gmv) FILTER (
        WHERE k.day BETWEEN pb.month_start_ist AND pb.today_ist
      ), 0) AS gmv_mtd,
      COALESCE(SUM(k.invoices_count) FILTER (
        WHERE k.day BETWEEN pb.year_start_ist AND pb.today_ist
      ), 0)::bigint AS invoice_count_ytd,
      COALESCE(SUM(k.invoices_gmv) FILTER (
        WHERE k.day BETWEEN pb.prev_month_start_ist AND pb.prev_window_end_ist
      ), 0) AS gmv_prev_window
    FROM period_bounds pb
    LEFT JOIN app.kpi_buyers_daily k
      ON k.tenant_id = p_tenant_id
     AND k.buyer_id = p_buyer_id
     AND k.scope = 'tenant'
  )
  SELECT
    rollup.gmv_mtd,
    rollup.invoice_count_ytd,
    CASE
      WHEN rollup.gmv_prev_window > 0
        THEN ROUND(((rollup.gmv_mtd - rollup.gmv_prev_window) / rollup.gmv_prev_window) * 100)::integer
      WHEN rollup.gmv_mtd > 0
        THEN 100
      ELSE 0
    END AS trend_vs_last_month_pct,
    COALESCE(snapshot.outstanding_dues, 0) AS outstanding_dues,
    COALESCE(snapshot.open_invoice_count, 0) AS open_invoice_count,
    snapshot.earliest_due_date,
    CASE
      WHEN snapshot.earliest_due_date IS NULL THEN NULL
      ELSE ((snapshot.earliest_due_date AT TIME ZONE 'Asia/Kolkata')::date - pb.today_ist)::integer
    END AS days_until_earliest_due,
    COALESCE(snapshot.credit_limit, 0) AS credit_limit,
    COALESCE(snapshot.available_credit, 0) AS available_credit,
    COALESCE(snapshot.credit_used, 0) AS credit_used,
    COALESCE(snapshot.open_orders_count, 0) AS open_orders_count,
    snapshot.refreshed_at
  FROM period_bounds pb
  CROSS JOIN buyer_period_rollup rollup
  LEFT JOIN app.buyer_current_snapshot snapshot
    ON snapshot.tenant_id = p_tenant_id
   AND snapshot.buyer_id = p_buyer_id;
$$;


ALTER FUNCTION "app"."get_buyer_home_summary"("p_tenant_id" "uuid", "p_buyer_id" "uuid", "p_as_of" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."get_tenant_integration_runtime_secret"("p_tenant_integration_id" "uuid", "p_expected_integration_type_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app', 'vault'
    AS $$
DECLARE
  v_tenant_integration app.tenant_integrations%ROWTYPE;
  v_secret jsonb;
BEGIN
  IF p_expected_integration_type_id IS NULL OR trim(p_expected_integration_type_id) = '' THEN
    RAISE EXCEPTION 'expected integration type required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = p_tenant_integration_id
    AND ti.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tenant_integration.integration_type_id IS DISTINCT FROM p_expected_integration_type_id THEN
    RAISE EXCEPTION 'integration type mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_tenant_integration.vault_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ds.decrypted_secret::jsonb
  INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.id = v_tenant_integration.vault_secret_id;

  RETURN v_secret;
END;
$$;


ALTER FUNCTION "app"."get_tenant_integration_runtime_secret"("p_tenant_integration_id" "uuid", "p_expected_integration_type_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."get_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app', 'vault'
    AS $$
DECLARE
  v_tenant_integration app.tenant_integrations%ROWTYPE;
  v_secret jsonb;
BEGIN
  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = p_tenant_integration_id
    AND ti.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM app._tenant_integrations_assert_seller_admin(v_tenant_integration.tenant_id, p_actor_user_id);

  IF v_tenant_integration.vault_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ds.decrypted_secret::jsonb
  INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.id = v_tenant_integration.vault_secret_id;

  RETURN v_secret;
END;
$$;


ALTER FUNCTION "app"."get_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."global_search"("p_query" "text", "p_tenant_id" "uuid", "p_role" "text" DEFAULT 'seller_admin'::"text", "p_items_per_group" integer DEFAULT 5, "p_query_embedding" "public"."vector" DEFAULT NULL::"public"."vector") RETURNS TABLE("entity_type" "text", "id" "uuid", "label" "text", "sublabel" "text", "url_path" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'catalog', 'public'
    AS $$
DECLARE
  v_like text;
BEGIN
  IF p_query IS NULL OR trim(p_query) = '' THEN
    RETURN;
  END IF;

  v_like := '%' || lower(trim(p_query)) || '%';

  RETURN QUERY
  WITH all_matches AS (
    SELECT
      'product'::text AS entity_type,
      sp.tenant_product_id AS id,
      sp.product_name AS label,
      concat_ws(' · ', sp.brand_name, sp.sku) AS sublabel,
      '/products'::text AS url_path,
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

    -- Brands
    SELECT
      'brand'::text,
      tb.id,
      cb.name,
      COALESCE(cb.description, ''),
      '/brands'::text,
      CASE WHEN lower(cb.name) LIKE v_like THEN 0.8::float8 ELSE 0.1::float8 END
    FROM app.tenant_brands tb
    JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    WHERE tb.tenant_id = p_tenant_id
      AND tb.is_active = true
      AND lower(cb.name) LIKE v_like

    UNION ALL

    -- Customers
    SELECT
      'customer'::text,
      b.id,
      b.business_name,
      concat_ws(' · ', NULLIF(COALESCE(b.contact_name, ''), ''), NULLIF(COALESCE(b.geography->>'city', ''), '')),
      '/customers'::text,
      CASE
        WHEN b.search_vector @@ plainto_tsquery('english', trim(p_query))
          THEN ts_rank(b.search_vector, plainto_tsquery('english', trim(p_query)))::float8
        ELSE 0.1::float8
      END
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.is_active = true
      AND (
        lower(b.business_name) LIKE v_like
        OR lower(COALESCE(b.contact_name, '')) LIKE v_like
      )

    UNION ALL

    -- Orders
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
      AND lower(o.order_number) LIKE v_like

    UNION ALL

    -- Invoices
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
      AND lower(i.invoice_number) LIKE v_like

    UNION ALL

    -- Estimates (seller_admin only)
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
      AND p_role = 'seller_admin'
      AND lower(COALESCE(e.estimate_number, '')) LIKE v_like
  ),
  ranked AS (
    SELECT
      m.entity_type,
      m.id,
      m.label,
      m.sublabel,
      m.url_path,
      ROW_NUMBER() OVER (PARTITION BY m.entity_type ORDER BY m.rank DESC) AS rn
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


ALTER FUNCTION "app"."global_search"("p_query" "text", "p_tenant_id" "uuid", "p_role" "text", "p_items_per_group" integer, "p_query_embedding" "public"."vector") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."invoice_is_overdue"("p_status" "text", "p_due_date" timestamp with time zone, "p_outstanding_balance" numeric) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT app.invoice_status_has_receivable(p_status, p_outstanding_balance)
    AND p_due_date IS NOT NULL
    AND (p_due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;


ALTER FUNCTION "app"."invoice_is_overdue"("p_status" "text", "p_due_date" timestamp with time zone, "p_outstanding_balance" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."invoice_status_gmv_included"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_status, '') IN (
    'draft',
    'sent',
    'issued',
    'viewed',
    'unpaid',
    'partially_paid',
    'paid',
    'overdue'
  );
$$;


ALTER FUNCTION "app"."invoice_status_gmv_included"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."invoice_status_has_receivable"("p_status" "text", "p_outstanding_balance" numeric) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_outstanding_balance, 0) > 0
    AND COALESCE(p_status, '') IN ('sent', 'issued', 'viewed', 'unpaid', 'partially_paid', 'overdue');
$$;


ALTER FUNCTION "app"."invoice_status_has_receivable"("p_status" "text", "p_outstanding_balance" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."invoice_status_in_flow"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_status, '') NOT IN ('cancelled', 'archived', 'rejected', 'void');
$$;


ALTER FUNCTION "app"."invoice_status_in_flow"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."is_buyer"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(auth.jwt() ->> 'user_role', auth.jwt() ->> 'role')
    IN ('buyer_admin', 'buyer_assistant')
$$;


ALTER FUNCTION "app"."is_buyer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."is_buyer_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(auth.jwt() ->> 'user_role', auth.jwt() ->> 'role') = 'buyer_admin'
$$;


ALTER FUNCTION "app"."is_buyer_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE((auth.jwt() ->> 'is_platform_admin')::boolean, false)
$$;


ALTER FUNCTION "app"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."is_seller"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(auth.jwt() ->> 'user_role', auth.jwt() ->> 'role')
    IN ('seller_admin', 'seller_assistant')
$$;


ALTER FUNCTION "app"."is_seller"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."is_seller_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(auth.jwt() ->> 'user_role', auth.jwt() ->> 'role') = 'seller_admin'
$$;


ALTER FUNCTION "app"."is_seller_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."jsonb_deep_merge"("target" "jsonb", "patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'app', 'pg_catalog'
    AS $$
DECLARE
  result jsonb := COALESCE(target, '{}'::jsonb);
  k text;
  v jsonb;
  existing jsonb;
BEGIN
  IF patch IS NULL OR patch = '{}'::jsonb THEN
    RETURN result;
  END IF;
  FOR k IN SELECT jsonb_object_keys(patch)
  LOOP
    v := patch -> k;
    existing := result -> k;
    IF jsonb_typeof(COALESCE(existing, 'null'::jsonb)) = 'object'
       AND jsonb_typeof(v) = 'object' THEN
      result := jsonb_set(result, ARRAY[k], app.jsonb_deep_merge(existing, v), true);
    ELSE
      result := jsonb_set(result, ARRAY[k], v, true);
    END IF;
  END LOOP;
  RETURN result;
END;
$$;


ALTER FUNCTION "app"."jsonb_deep_merge"("target" "jsonb", "patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."jwt_buyer_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT (auth.jwt() ->> 'buyer_id')::uuid
$$;


ALTER FUNCTION "app"."jwt_buyer_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."jwt_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(auth.jwt() ->> 'user_role', auth.jwt() ->> 'role')
$$;


ALTER FUNCTION "app"."jwt_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."jwt_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid
$$;


ALTER FUNCTION "app"."jwt_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."metric_day_ist"("p_explicit_date" "date", "p_created_at" timestamp with time zone) RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(
    p_explicit_date,
    (p_created_at AT TIME ZONE 'Asia/Kolkata')::date
  );
$$;


ALTER FUNCTION "app"."metric_day_ist"("p_explicit_date" "date", "p_created_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."order_status_in_flow"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_status, '') NOT IN ('cancelled', 'archived', 'rejected', 'void', 'closed');
$$;


ALTER FUNCTION "app"."order_status_in_flow"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."order_status_is_downstream_quality"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_status, '') IN (
    'confirmed',
    'partially_dispatched',
    'dispatched',
    'delivered',
    'invoiced',
    'partially_invoiced',
    'paid',
    'completed'
  );
$$;


ALTER FUNCTION "app"."order_status_is_downstream_quality"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."order_status_is_open"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_status, '') IN (
    'draft',
    'open',
    'accepted',
    'received',
    'confirmed',
    'partially_dispatched',
    'dispatched',
    'partially_invoiced',
    'overdue'
  );
$$;


ALTER FUNCTION "app"."order_status_is_open"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."post_sync_rebuild"("p_tenant_id" "uuid", "p_days" integer DEFAULT 2) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  loc RECORD;
  wh RECORD;
BEGIN
  PERFORM app.refresh_estimates_snapshot(p_tenant_id);
  PERFORM app.refresh_invoices_snapshot(p_tenant_id);
  PERFORM app.refresh_orders_snapshot(p_tenant_id);
  PERFORM app.refresh_buyers_snapshot(p_tenant_id);
  PERFORM app.refresh_products_snapshot(p_tenant_id);
  PERFORM app.refresh_categories_snapshot(p_tenant_id);
  PERFORM app.refresh_brands_snapshot(p_tenant_id);
  PERFORM app.refresh_buyer_current_snapshot(p_tenant_id);
  PERFORM app.rebuild_buyer_app_activity_for_tenant(p_tenant_id, GREATEST(p_days, 365));
  PERFORM app.refresh_buyer_app_snapshot(p_tenant_id);

  FOR loc IN
    SELECT id
    FROM app.locations
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_locations_snapshot(loc.id);
  END LOOP;

  FOR wh IN
    SELECT id
    FROM app.warehouses
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_warehouses_snapshot(wh.id);
  END LOOP;

  PERFORM app.rebuild_kpi_tenant_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_estimates_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_orders_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_invoices_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_buyers_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_brand_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_category_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_product_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_location_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_warehouse_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_buyer_app_daily_for_tenant(p_tenant_id, p_days);
END;
$$;


ALTER FUNCTION "app"."post_sync_rebuild"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."preview_cohort_count"("p_tenant_id" "uuid", "p_rules_json" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_count         integer := 0;
  v_sample_names  text[]  := '{}';
  v_filters       jsonb;
  v_filter        jsonb;
  v_field         text;
  v_operator      text;
  v_value_arr     text[];
  v_bucket_val    text;
  v_geo_cond      text    := NULL;
  v_order_cond    text    := NULL;
  v_gmv_cond      text    := NULL;
  v_needs_orders  boolean := false;
  v_base_cte      text;
  v_where_parts   text[]  := '{}';
  v_query         text;
BEGIN
  v_filters := p_rules_json -> 'filters';

  -- Fast path: no filters → all active buyers
  IF v_filters IS NULL OR jsonb_array_length(v_filters) = 0 THEN
    SELECT COUNT(*), array_agg(sub.business_name ORDER BY sub.business_name)
    INTO v_count, v_sample_names
    FROM (
      SELECT business_name FROM app.buyers
      WHERE tenant_id = p_tenant_id AND is_active = true AND deleted_at IS NULL
      LIMIT 5
    ) sub;
    RETURN jsonb_build_object('count', COALESCE(v_count, 0), 'sample_names', COALESCE(v_sample_names, '{}'));
  END IF;

  -- Parse filters
  FOR i IN 0 .. jsonb_array_length(v_filters) - 1 LOOP
    v_filter   := v_filters -> i;
    v_field    := v_filter ->> 'field';
    v_operator := v_filter ->> 'operator';

    IF v_field = 'geography.city' THEN
      SELECT array_agg(lower(x)) INTO v_value_arr
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_filter -> 'value') = 'array'
             THEN v_filter -> 'value'
             ELSE jsonb_build_array(v_filter -> 'value')
        END
      ) x;
      v_geo_cond := format(
        'lower(geography->>''city'') = ANY(%L::text[])',
        v_value_arr
      );

    ELSIF v_field = 'last_order_bucket' THEN
      v_needs_orders := true;
      v_bucket_val := CASE
        WHEN jsonb_typeof(v_filter -> 'value') = 'array'
        THEN (v_filter -> 'value') ->> 0
        ELSE v_filter ->> 'value'
      END;
      v_order_cond := CASE v_bucket_val
        WHEN 'within_30_days'       THEN 'last_order_bucket = ''within_30_days'''
        WHEN 'within_90_days'       THEN 'last_order_bucket IN (''within_30_days'',''within_90_days'')'
        WHEN 'dormant_90_plus_days' THEN 'last_order_bucket = ''dormant_90_plus_days'''
        ELSE NULL -- 'anytime' → no condition
      END;

    ELSIF v_field = 'gmv_90d_bucket' THEN
      v_needs_orders := true;
      SELECT array_agg(x) INTO v_value_arr
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_filter -> 'value') = 'array'
             THEN v_filter -> 'value'
             ELSE jsonb_build_array(v_filter -> 'value')
        END
      ) x;
      v_gmv_cond := format('gmv_90d_bucket = ANY(%L::text[])', v_value_arr);
    END IF;
  END LOOP;

  IF NOT v_needs_orders THEN
    -- Simple path: only geography filter, no orders join needed
    v_where_parts := ARRAY['is_active = true', 'deleted_at IS NULL', format('tenant_id = %L::uuid', p_tenant_id)];
    IF v_geo_cond IS NOT NULL THEN
      v_where_parts := array_append(v_where_parts, v_geo_cond);
    END IF;

    v_query := 'SELECT COUNT(*) FROM app.buyers WHERE ' || array_to_string(v_where_parts, ' AND ');
    EXECUTE v_query INTO v_count;

    v_query := 'SELECT array_agg(business_name ORDER BY business_name) FROM (SELECT business_name FROM app.buyers WHERE '
      || array_to_string(v_where_parts, ' AND ') || ' LIMIT 5) sub';
    EXECUTE v_query INTO v_sample_names;

  ELSE
    -- Orders-join path: compute buckets via CTE then filter
    v_base_cte := format(
      $CTE$
      WITH buyer_metrics AS (
        SELECT
          b.id,
          b.business_name,
          b.geography,
          MAX(o.placed_at) AS last_order_at,
          COALESCE(SUM(
            CASE WHEN o.placed_at >= now() - INTERVAL '90 days' THEN o.total_amount ELSE 0 END
          ), 0) AS gmv_90d
        FROM app.buyers b
        LEFT JOIN app.orders o
          ON  o.buyer_id   = b.id
          AND o.tenant_id  = %L::uuid
          AND o.deleted_at IS NULL
          AND o.status    != 'cancelled'
        WHERE b.tenant_id = %L::uuid
          AND b.is_active = true
          AND b.deleted_at IS NULL
        GROUP BY b.id, b.business_name, b.geography
      ),
      buyer_buckets AS (
        SELECT
          id, business_name, geography,
          app.derive_last_order_bucket(last_order_at) AS last_order_bucket,
          app.derive_gmv_90d_bucket(gmv_90d)          AS gmv_90d_bucket
        FROM buyer_metrics
      )
      $CTE$,
      p_tenant_id, p_tenant_id
    );

    v_where_parts := '{}';
    IF v_geo_cond   IS NOT NULL THEN v_where_parts := array_append(v_where_parts, v_geo_cond);   END IF;
    IF v_order_cond IS NOT NULL THEN v_where_parts := array_append(v_where_parts, v_order_cond); END IF;
    IF v_gmv_cond   IS NOT NULL THEN v_where_parts := array_append(v_where_parts, v_gmv_cond);   END IF;

    v_query := v_base_cte || ' SELECT COUNT(*) FROM buyer_buckets'
      || CASE WHEN array_length(v_where_parts, 1) > 0
              THEN ' WHERE ' || array_to_string(v_where_parts, ' AND ')
              ELSE '' END;
    EXECUTE v_query INTO v_count;

    v_query := v_base_cte
      || ' SELECT array_agg(business_name ORDER BY business_name) FROM (SELECT business_name FROM buyer_buckets'
      || CASE WHEN array_length(v_where_parts, 1) > 0
              THEN ' WHERE ' || array_to_string(v_where_parts, ' AND ')
              ELSE '' END
      || ' LIMIT 5) sub';
    EXECUTE v_query INTO v_sample_names;
  END IF;

  RETURN jsonb_build_object(
    'count',        COALESCE(v_count, 0),
    'sample_names', COALESCE(v_sample_names, '{}')
  );
END;
$_$;


ALTER FUNCTION "app"."preview_cohort_count"("p_tenant_id" "uuid", "p_rules_json" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."price_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text",
    "valid_from" timestamp with time zone NOT NULL,
    "valid_to" timestamp with time zone,
    "priority" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "pricing_strategy" "text" DEFAULT 'edit_each'::"text" NOT NULL,
    "strategy_value" numeric,
    "filters" "jsonb" DEFAULT '{"brand_names": [], "category_names": []}'::"jsonb" NOT NULL,
    "external_ref" "text",
    "description" "text",
    "pricebook_type" "text",
    "source_updated_at" timestamp with time zone,
    CONSTRAINT "price_lists_pricing_strategy_check" CHECK (("pricing_strategy" = ANY (ARRAY['edit_each'::"text", 'margin_from_mrp'::"text", 'flat_off_base'::"text", 'per_item'::"text", 'percentage'::"text"])))
);


ALTER TABLE "app"."price_lists" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."price_list_archive"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_actor_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "app"."price_lists"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_price_list app.price_lists;
BEGIN
  UPDATE app.price_lists pl
  SET deleted_at = now(),
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE pl.id = p_price_list_id
    AND pl.tenant_id = p_tenant_id
    AND pl.deleted_at IS NULL
  RETURNING pl.* INTO v_price_list;

  IF v_price_list.id IS NULL THEN
    RAISE EXCEPTION 'Price list not found';
  END IF;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'price_list',
    p_price_list_id,
    'delete',
    jsonb_build_object('event', 'price_list_archived'),
    now()
  );

  RETURN v_price_list;
END;
$$;


ALTER FUNCTION "app"."price_list_archive"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."price_list_duplicate"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_actor_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "app"."price_lists"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_source app.price_lists;
  v_copy app.price_lists;
BEGIN
  SELECT * INTO v_source
  FROM app.price_lists
  WHERE id = p_price_list_id
    AND tenant_id = p_tenant_id
    AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Price list not found';
  END IF;

  INSERT INTO app.price_lists (
    tenant_id,
    name,
    currency,
    valid_from,
    valid_to,
    priority,
    is_active,
    pricing_strategy,
    strategy_value,
    filters,
    created_at,
    updated_at,
    created_by,
    updated_by,
    deleted_at
  )
  VALUES (
    v_source.tenant_id,
    v_source.name || ' (copy)',
    v_source.currency,
    now() + interval '1 day',
    v_source.valid_to,
    v_source.priority,
    false,
    v_source.pricing_strategy,
    v_source.strategy_value,
    COALESCE(v_source.filters, '{"brand_names":[],"category_names":[]}'::jsonb),
    now(),
    now(),
    p_actor_user_id,
    p_actor_user_id,
    NULL
  )
  RETURNING * INTO v_copy;

  INSERT INTO app.price_list_items (
    price_list_id,
    tenant_product_id,
    price,
    min_qty,
    max_qty,
    created_at,
    updated_at,
    created_by,
    updated_by,
    deleted_at
  )
  SELECT
    v_copy.id,
    pli.tenant_product_id,
    pli.price,
    pli.min_qty,
    pli.max_qty,
    now(),
    now(),
    p_actor_user_id,
    p_actor_user_id,
    NULL
  FROM app.price_list_items pli
  WHERE pli.price_list_id = p_price_list_id
    AND pli.deleted_at IS NULL;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'price_list',
    v_copy.id,
    'create',
    jsonb_build_object('event', 'price_list_duplicated', 'source_price_list_id', p_price_list_id),
    now()
  );

  RETURN v_copy;
END;
$$;


ALTER FUNCTION "app"."price_list_duplicate"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."price_list_extend_validity"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_valid_to" timestamp with time zone, "p_actor_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "app"."price_lists"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_price_list app.price_lists;
BEGIN
  UPDATE app.price_lists pl
  SET valid_to = p_valid_to,
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE pl.id = p_price_list_id
    AND pl.tenant_id = p_tenant_id
    AND pl.deleted_at IS NULL
  RETURNING pl.* INTO v_price_list;

  IF v_price_list.id IS NULL THEN
    RAISE EXCEPTION 'Price list not found';
  END IF;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'price_list',
    p_price_list_id,
    'update',
    jsonb_build_object('event', 'validity_extended', 'valid_to', p_valid_to),
    now()
  );

  RETURN v_price_list;
END;
$$;


ALTER FUNCTION "app"."price_list_extend_validity"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_valid_to" timestamp with time zone, "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."price_list_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "price_list_id" "uuid" NOT NULL,
    "tenant_product_id" "uuid" NOT NULL,
    "price" numeric NOT NULL,
    "min_qty" numeric DEFAULT 1,
    "max_qty" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text",
    "source_updated_at" timestamp with time zone
);


ALTER TABLE "app"."price_list_items" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."price_list_update_item_price"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_item_id" "uuid", "p_list_price" numeric, "p_actor_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "app"."price_list_items"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_item app.price_list_items;
BEGIN
  IF p_list_price IS NULL OR p_list_price <= 0 THEN
    RAISE EXCEPTION 'List price must be positive';
  END IF;

  UPDATE app.price_list_items pli
  SET price = p_list_price,
      updated_at = now(),
      updated_by = p_actor_user_id
  FROM app.price_lists pl
  WHERE pli.id = p_item_id
    AND pli.price_list_id = p_price_list_id
    AND pl.id = pli.price_list_id
    AND pl.tenant_id = p_tenant_id
    AND pl.deleted_at IS NULL
    AND pli.deleted_at IS NULL
  RETURNING pli.* INTO v_item;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Price list item not found';
  END IF;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'price_list',
    p_price_list_id,
    'update',
    jsonb_build_object('event', 'item_price_updated', 'item_id', p_item_id, 'list_price', p_list_price),
    now()
  );

  RETURN v_item;
END;
$$;


ALTER FUNCTION "app"."price_list_update_item_price"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_item_id" "uuid", "p_list_price" numeric, "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."process_whatsapp_send_queue"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_config app.whatsapp_platform_config%ROWTYPE;
  v_queue_row app.whatsapp_send_queue%ROWTYPE;
  v_message app.whatsapp_messages%ROWTYPE;
  v_cap integer;
  v_sent_today integer;
  v_marketing_today integer;
  v_template_status text;
BEGIN
  SELECT * INTO v_config
  FROM app.whatsapp_platform_config
  WHERE id = 1;

  -- Cursor over pending rows, priority first (1 = transactional highest),
  -- then earliest-scheduled first. FOR UPDATE SKIP LOCKED so overlapping
  -- worker invocations (e.g. a slow run still finishing when the next
  -- 1-5 min cron tick fires) never block on each other or double-process
  -- the same row.
  FOR v_queue_row IN
    SELECT *
    FROM app.whatsapp_send_queue
    WHERE status = 'pending'
      AND scheduled_send_at <= now()
    ORDER BY priority ASC, scheduled_send_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- 1. Kill switch / Red state — blocks broadcast-priority rows only.
    --    Transactional (priority=1) rows always flow regardless of pause
    --    state or quality_rating_state, per §7.3's explicit correction.
    IF v_queue_row.priority > 1
       AND (v_config.broadcast_sending_paused OR v_config.quality_rating_state = 'red')
    THEN
      CONTINUE; -- leave row pending, retried on a later tick once cleared
    END IF;

    SELECT * INTO v_message
    FROM app.whatsapp_messages
    WHERE id = v_queue_row.whatsapp_message_id
    FOR UPDATE;

    IF NOT FOUND THEN
      UPDATE app.whatsapp_send_queue
      SET status = 'failed', failure_reason = 'whatsapp_message row not found', attempt_count = attempt_count + 1
      WHERE id = v_queue_row.id;
      CONTINUE;
    END IF;

    -- 2. Template hygiene (§7.4): never dispatch against an unapproved
    --    template. Messages with no template attached (e.g. ad-hoc OTP
    --    sends that don't reference app.whatsapp_templates) skip this check.
    IF v_message.whatsapp_template_id IS NOT NULL THEN
      SELECT approval_status INTO v_template_status
      FROM app.whatsapp_templates
      WHERE id = v_message.whatsapp_template_id;

      IF v_template_status IS DISTINCT FROM 'approved' THEN
        UPDATE app.whatsapp_send_queue
        SET status = 'failed',
            failure_reason = format('template not approved (status=%s)', COALESCE(v_template_status, 'unknown')),
            attempt_count = attempt_count + 1
        WHERE id = v_queue_row.id;

        UPDATE app.whatsapp_messages
        SET status = 'failed',
            failure_reason = format('template not approved (status=%s)', COALESCE(v_template_status, 'unknown'))
        WHERE id = v_message.id;

        CONTINUE;
      END IF;
    END IF;

    -- 3. Per-tenant daily broadcast cap (broadcast-priority rows only —
    --    transactional sends never count against or are blocked by this cap).
    IF v_queue_row.priority > 1 THEN
      SELECT daily_broadcast_cap INTO v_cap
      FROM app.tenant_broadcast_limits
      WHERE tenant_id = v_queue_row.tenant_id;

      -- No explicit limits row yet for this tenant: fall back to the same
      -- default the table itself declares, so an unconfigured tenant is
      -- still bounded rather than uncapped.
      v_cap := COALESCE(v_cap, 100);

      SELECT count(*) INTO v_sent_today
      FROM app.whatsapp_messages m
      JOIN app.whatsapp_send_queue q ON q.whatsapp_message_id = m.id
      WHERE m.tenant_id = v_queue_row.tenant_id
        AND q.priority > 1
        AND m.status = 'sent'
        AND m.sent_at >= date_trunc('day', now());

      IF v_sent_today >= v_cap THEN
        UPDATE app.whatsapp_send_queue
        SET status = 'failed',
            failure_reason = format('tenant daily broadcast cap reached (%s/%s)', v_sent_today, v_cap),
            attempt_count = attempt_count + 1
        WHERE id = v_queue_row.id;

        UPDATE app.whatsapp_messages
        SET status = 'failed',
            failure_reason = format('tenant daily broadcast cap reached (%s/%s)', v_sent_today, v_cap)
        WHERE id = v_message.id;

        CONTINUE;
      END IF;
    END IF;

    -- 4. Per-recipient 24h marketing cap — Meta's cap is per-user
    --    platform-wide, not per-tenant (§7.2), so this checks across ALL
    --    tenants for this buyer/category, not just the current one.
    IF v_message.meta_category = 'marketing' AND v_message.buyer_id IS NOT NULL THEN
      SELECT count(*) INTO v_marketing_today
      FROM app.whatsapp_messages m
      WHERE m.buyer_id = v_message.buyer_id
        AND m.meta_category = 'marketing'
        AND m.status IN ('sent', 'delivered', 'read')
        AND m.sent_at >= now() - interval '24 hours';

      IF v_marketing_today >= 1 THEN
        UPDATE app.whatsapp_send_queue
        SET status = 'failed',
            failure_reason = 'recipient already received a marketing message in the last 24h',
            attempt_count = attempt_count + 1
        WHERE id = v_queue_row.id;

        UPDATE app.whatsapp_messages
        SET status = 'failed',
            failure_reason = 'recipient already received a marketing message in the last 24h'
        WHERE id = v_message.id;

        CONTINUE;
      END IF;
    END IF;

    -- Mark processing before the wallet debit so a crash mid-loop doesn't
    -- leave a row silently 'pending' forever without a trace of the attempt.
    UPDATE app.whatsapp_send_queue
    SET status = 'processing', attempt_count = attempt_count + 1
    WHERE id = v_queue_row.id;

    -- 5. Wallet balance — re-checked at pop time via the same synchronous
    --    debit RPC Phase B built. If it raises (insufficient balance), this
    --    row fails and the loop MUST continue to the next row rather than
    --    letting the exception propagate and abort the whole batch.
    BEGIN
      PERFORM app.debit_whatsapp_credits(v_message.id);
    EXCEPTION
      WHEN OTHERS THEN
        UPDATE app.whatsapp_send_queue
        SET status = 'failed', failure_reason = format('credit debit failed: %s', SQLERRM)
        WHERE id = v_queue_row.id;

        UPDATE app.whatsapp_messages
        SET status = 'failed', failure_reason = format('credit debit failed: %s', SQLERRM)
        WHERE id = v_message.id;

        CONTINUE;
    END;

    -- 6. Actual Meta dispatch happens in application code (WhatsAppClient),
    --    not here — see function comment above. This function's job ends
    --    at "guardrails passed, credits debited, row is ready to send";
    --    it leaves the row 'processing' for the application-side sender to
    --    pick up and finalize to 'sent'/'failed' after the real HTTP call.
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."process_whatsapp_send_queue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."prune_kpi_daily_old_rows"("p_retention_days" integer DEFAULT 90) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  DELETE FROM app.kpi_tenant_daily     WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_product_daily    WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_category_daily   WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_location_daily   WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_warehouse_daily  WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_brand_daily      WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_buyers_daily     WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_estimates_daily  WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_orders_daily     WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_invoices_daily   WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_buyer_app_daily  WHERE snapshot_date < CURRENT_DATE - p_retention_days;
$$;


ALTER FUNCTION "app"."prune_kpi_daily_old_rows"("p_retention_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reap_stale_sync_jobs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_stale_after interval := interval '10 minutes';
  v_default_per_page int := 200;
BEGIN
  UPDATE app.integration_sync_jobs j
  SET status = 'paused',
      progress = j.progress || jsonb_build_object(
        'next_cursor', jsonb_build_object(
          'phase', j.phase,
          'entity_type', j.phase,
          'page', COALESCE((j.progress->>'pages_fetched')::int, 0) + 1,
          'per_page', v_default_per_page,
          'has_more', true,
          'since', j.since_date
        )
      ),
      updated_at = now()
  WHERE j.status = 'running'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.updated_at < now() - v_stale_after
    AND COALESCE((j.progress->>'pages_fetched')::int, 0) > 0;

  UPDATE app.integration_sync_jobs j
  SET status = 'failed',
      error_log = jsonb_build_object(
        'message', 'reaped: job stalled in running state with no progress for over 10 minutes',
        'timestamp', now()
      ),
      completed_at = now(),
      updated_at = now()
  WHERE j.status = 'running'
    AND j.phase IS DISTINCT FROM 'sync_run'
    AND j.updated_at < now() - v_stale_after
    AND COALESCE((j.progress->>'pages_fetched')::int, 0) = 0;

  -- Halt active master runs that still have stuck running slaves after reaper pass.
  UPDATE app.integration_sync_jobs m
  SET status = 'failed',
      progress = jsonb_set(
        COALESCE(m.progress, '{}'::jsonb),
        '{meta,run_halted}',
        'true'::jsonb,
        true
      ),
      completed_at = now(),
      updated_at = now()
  WHERE m.phase = 'sync_run'
    AND m.status IN ('running', 'paused')
    AND EXISTS (
      SELECT 1 FROM app.integration_sync_jobs s
      WHERE s.progress->'meta'->>'sync_run_id' = m.id::text
        AND s.status = 'running'
        AND s.updated_at < now() - v_stale_after
    );
END;
$$;


ALTER FUNCTION "app"."reap_stale_sync_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_buyer_app_activity_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 365) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  estimate_row RECORD;
  order_row RECORD;
BEGIN
  FOR estimate_row IN
    SELECT e.id
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND (
        app.metric_day_ist(e.estimate_date, e.created_at) >= v_start
        OR e.deleted_at IS NOT NULL
      )
  LOOP
    PERFORM app.sync_buyer_app_activity_from_estimate(estimate_row.id);
  END LOOP;

  FOR order_row IN
    SELECT o.id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND (
        app.metric_day_ist(o.order_date, o.created_at) >= v_start
        OR o.deleted_at IS NOT NULL
      )
  LOOP
    PERFORM app.sync_buyer_app_activity_from_order(order_row.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."rebuild_buyer_app_activity_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_buyer_app_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 2) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days),
      (now() AT TIME ZONE 'Asia/Kolkata')::date,
      interval '1 day'
    )::date
  LOOP
    PERFORM app.refresh_buyer_app_daily(p_tenant_id, d);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."rebuild_buyer_app_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_buyer_users_search_vectors"("p_buyer_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    SET "statement_timeout" TO '60s'
    SET "lock_timeout" TO '30s'
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
    AND (p_buyer_ids IS NULL OR bu.buyer_id = ANY (p_buyer_ids))
    AND (p_ids IS NULL OR bu.id = ANY (p_ids));
$$;


ALTER FUNCTION "app"."rebuild_buyer_users_search_vectors"("p_buyer_ids" "uuid"[], "p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_buyers_search_vectors"("p_tenant_id" "uuid", "p_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    SET "statement_timeout" TO '60s'
    SET "lock_timeout" TO '30s'
    AS $$
  UPDATE app.buyers b
  SET search_vector = to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(b.business_name, ''),
      COALESCE(b.contact_name, ''),
      COALESCE(b.phone, ''),
      COALESCE(b.email, ''),
      COALESCE(b.gstin, ''),
      COALESCE(b.gst_treatment, ''),
      COALESCE(b.status, '')
    )
  )
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND (p_ids IS NULL OR b.id = ANY (p_ids));
$$;


ALTER FUNCTION "app"."rebuild_buyers_search_vectors"("p_tenant_id" "uuid", "p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_aggregates_for_recent_days"("p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days),
      (now() AT TIME ZONE 'Asia/Kolkata')::date,
      interval '1 day'
    )::date
  LOOP
    INSERT INTO app.kpi_tenant_daily (tenant_id, day, orders_count, buyers_count, gmv, items_count)
    SELECT
      o.tenant_id,
      d,
      COUNT(DISTINCT o.id)::int,
      COUNT(DISTINCT o.buyer_id)::int,
      COALESCE(SUM(o.total_amount), 0)::numeric(14,2),
      COALESCE(SUM(oi.qty), 0)::int
    FROM app.orders o
    LEFT JOIN app.order_items oi
      ON oi.order_id = o.id
     AND oi.deleted_at IS NULL
    WHERE o.deleted_at IS NULL
      AND o.status <> 'cancelled'
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d
    GROUP BY o.tenant_id
    ON CONFLICT (tenant_id, day)
    DO UPDATE SET
      orders_count = EXCLUDED.orders_count,
      buyers_count = EXCLUDED.buyers_count,
      gmv = EXCLUDED.gmv,
      items_count = EXCLUDED.items_count,
      updated_at = now();
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_aggregates_for_recent_days"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_brand_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_brand_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  INSERT INTO app.kpi_brand_daily (
    tenant_id, tenant_brand_id, day,
    gmv, orders_count, buyers_count, units_sold, updated_at
  )
  SELECT
    o.tenant_id,
    tp.tenant_brand_id,
    app.metric_day_ist(o.order_date, o.created_at) AS day,
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COUNT(DISTINCT o.id)::bigint,
    COUNT(DISTINCT o.buyer_id)::bigint,
    COALESCE(SUM(oi.qty), 0)::bigint,
    now()
  FROM app.order_items oi
  JOIN app.orders o
    ON o.id = oi.order_id
  JOIN app.tenant_products tp
    ON tp.id = oi.tenant_product_id
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL
    AND tp.deleted_at IS NULL
    AND tp.tenant_brand_id IS NOT NULL
    AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_start AND v_end
  GROUP BY o.tenant_id, tp.tenant_brand_id, app.metric_day_ist(o.order_date, o.created_at);
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_brand_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_brand_daily_recent"("p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days),
      (now() AT TIME ZONE 'Asia/Kolkata')::date,
      interval '1 day'
    )::date
  LOOP
    -- Insert rows only where there is actual brand activity that day (sparse).
    INSERT INTO app.kpi_brand_daily (
      tenant_id, tenant_brand_id, day,
      gmv, orders_count, buyers_count, units_sold, updated_at
    )
    SELECT
      o.tenant_id,
      tp.tenant_brand_id,
      d,
      COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
      COUNT(DISTINCT o.id)::bigint,
      COUNT(DISTINCT o.buyer_id)::bigint,
      COALESCE(SUM(oi.qty), 0)::bigint,
      now()
    FROM app.order_items oi
    JOIN app.orders o  ON o.id  = oi.order_id
    JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
    WHERE o.deleted_at  IS NULL
      AND oi.deleted_at IS NULL
      AND tp.deleted_at IS NULL
      AND tp.tenant_brand_id IS NOT NULL
      AND o.status NOT IN ('cancelled', 'draft')
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d
    GROUP BY o.tenant_id, tp.tenant_brand_id
    ON CONFLICT (tenant_id, tenant_brand_id, day) DO UPDATE SET
      gmv          = EXCLUDED.gmv,
      orders_count = EXCLUDED.orders_count,
      buyers_count = EXCLUDED.buyers_count,
      units_sold   = EXCLUDED.units_sold,
      updated_at   = EXCLUDED.updated_at;
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_brand_daily_recent"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_buyers_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 365) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  day_row RECORD;
BEGIN
  DELETE FROM app.kpi_buyers_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  FOR day_row IN
    SELECT DISTINCT day
    FROM (
      SELECT app.metric_day_ist(e.estimate_date, e.created_at) AS day
      FROM app.estimates e
      WHERE e.tenant_id = p_tenant_id
        AND e.deleted_at IS NULL
        AND e.buyer_id IS NOT NULL
        AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN v_start AND v_end
      UNION
      SELECT app.metric_day_ist(o.order_date, o.created_at) AS day
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.deleted_at IS NULL
        AND o.buyer_id IS NOT NULL
        AND app.order_status_in_flow(o.status)
        AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_start AND v_end
      UNION
      SELECT app.metric_day_ist(i.invoice_date, i.created_at) AS day
      FROM app.invoices i
      WHERE i.tenant_id = p_tenant_id
        AND i.deleted_at IS NULL
        AND i.buyer_id IS NOT NULL
        AND app.invoice_status_in_flow(i.status)
        AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN v_start AND v_end
    ) days
  LOOP
    PERFORM app.refresh_kpi_buyers_daily(p_tenant_id, day_row.day);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_buyers_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_category_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_category_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  INSERT INTO app.kpi_category_daily (
    tenant_id, tenant_category_id, day,
    gmv, units_sold, orders_count, buyers_count, updated_at
  )
  SELECT
    o.tenant_id,
    tp.tenant_category_id,
    app.metric_day_ist(o.order_date, o.created_at) AS day,
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COALESCE(SUM(oi.qty), 0)::bigint,
    COUNT(DISTINCT o.id)::bigint,
    COUNT(DISTINCT o.buyer_id)::bigint,
    now()
  FROM app.order_items oi
  JOIN app.orders o
    ON o.id = oi.order_id
  JOIN app.tenant_products tp
    ON tp.id = oi.tenant_product_id
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL
    AND tp.deleted_at IS NULL
    AND tp.tenant_category_id IS NOT NULL
    AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_start AND v_end
  GROUP BY o.tenant_id, tp.tenant_category_id, app.metric_day_ist(o.order_date, o.created_at);
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_category_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_category_daily_recent"("p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days),
      (now() AT TIME ZONE 'Asia/Kolkata')::date,
      interval '1 day'
    )::date
  LOOP
    INSERT INTO app.kpi_category_daily (
      tenant_id, tenant_category_id, day,
      gmv, units_sold, orders_count, buyers_count, updated_at
    )
    SELECT
      o.tenant_id,
      tp.tenant_category_id,
      d,
      COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
      COALESCE(SUM(oi.qty), 0)::bigint,
      COUNT(DISTINCT o.id)::bigint,
      COUNT(DISTINCT o.buyer_id)::bigint,
      now()
    FROM app.order_items oi
    JOIN app.orders o   ON o.id  = oi.order_id
    JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
    WHERE o.deleted_at  IS NULL
      AND oi.deleted_at IS NULL
      AND tp.deleted_at IS NULL
      AND tp.tenant_category_id IS NOT NULL
      AND o.status NOT IN ('cancelled', 'draft')
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d
    GROUP BY o.tenant_id, tp.tenant_category_id
    ON CONFLICT (tenant_id, tenant_category_id, day) DO UPDATE SET
      gmv          = EXCLUDED.gmv,
      units_sold   = EXCLUDED.units_sold,
      orders_count = EXCLUDED.orders_count,
      buyers_count = EXCLUDED.buyers_count,
      updated_at   = EXCLUDED.updated_at;
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_category_daily_recent"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_estimates_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_estimates_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  INSERT INTO app.kpi_estimates_daily (
    tenant_id, scope, location_id, day,
    estimates_count, buyers_count, gmv, open_count, draft_count, sent_count,
    accepted_count, converted_count, declined_count, expired_count, void_count,
    expiring_soon_count, buyer_app_count, open_buyer_app_count, seller_count, updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*)::bigint,
    COUNT(DISTINCT buyer_id)::bigint,
    COALESCE(SUM(total_amount), 0),
    COUNT(*) FILTER (WHERE app.estimate_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status = 'sent')::bigint,
    COUNT(*) FILTER (WHERE status = 'accepted')::bigint,
    COUNT(*) FILTER (WHERE status IN ('converted', 'invoiced'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('declined', 'rejected'))::bigint,
    COUNT(*) FILTER (WHERE status = 'expired')::bigint,
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE app.estimate_status_is_open(status)
        AND expires_at IS NOT NULL
        AND (expires_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND ((now() AT TIME ZONE 'Asia/Kolkata')::date + 7)
    )::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_estimate = true)::bigint,
    COUNT(*) FILTER (
      WHERE is_buyer_app_estimate = true
        AND app.estimate_status_is_open(status)
    )::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_estimate = false)::bigint,
    now()
  FROM (
    SELECT
      e.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(e.estimate_date, e.created_at) AS day,
      e.buyer_id,
      e.total_amount,
      e.status,
      e.is_buyer_app_estimate,
      e.expires_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN v_start AND v_end

    UNION ALL

    SELECT
      e.tenant_id,
      'location'::text AS scope,
      e.location_id,
      app.metric_day_ist(e.estimate_date, e.created_at) AS day,
      e.buyer_id,
      e.total_amount,
      e.status,
      e.is_buyer_app_estimate,
      e.expires_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.location_id IS NOT NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN v_start AND v_end
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_estimates_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_invoices_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_invoices_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  INSERT INTO app.kpi_invoices_daily (
    tenant_id, scope, location_id, day,
    invoices_count, buyers_count, gmv, draft_count, sent_count, paid_count,
    overdue_count, overdue_amount, void_count, outstanding_count, outstanding_amount, buyer_app_count, updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*) FILTER (WHERE app.invoice_status_in_flow(status))::bigint,
    COUNT(DISTINCT buyer_id) FILTER (WHERE app.invoice_status_in_flow(status))::bigint,
    COALESCE(SUM(total_amount) FILTER (WHERE app.invoice_status_gmv_included(status)), 0),
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('sent', 'issued', 'unpaid', 'viewed', 'partially_paid'))::bigint,
    COUNT(*) FILTER (WHERE status = 'paid')::bigint,
    COUNT(*) FILTER (WHERE app.invoice_is_overdue(status, due_date, outstanding_balance))::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_is_overdue(status, due_date, outstanding_balance)
    ), 0),
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE app.invoice_status_has_receivable(status, outstanding_balance)
    )::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_status_has_receivable(status, outstanding_balance)
    ), 0),
    COUNT(*) FILTER (
      WHERE is_buyer_app_invoice = true
        AND app.invoice_status_in_flow(status)
    )::bigint,
    now()
  FROM (
    SELECT
      i.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(i.invoice_date, i.created_at) AS day,
      i.buyer_id,
      i.total_amount,
      i.status,
      i.is_buyer_app_invoice,
      COALESCE(i.outstanding_balance, 0) AS outstanding_balance,
      i.due_date
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN v_start AND v_end

    UNION ALL

    SELECT
      i.tenant_id,
      'location'::text AS scope,
      i.location_id,
      app.metric_day_ist(i.invoice_date, i.created_at) AS day,
      i.buyer_id,
      i.total_amount,
      i.status,
      i.is_buyer_app_invoice,
      COALESCE(i.outstanding_balance, 0) AS outstanding_balance,
      i.due_date
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.location_id IS NOT NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN v_start AND v_end
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_invoices_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_location_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  d date;
  loc RECORD;
BEGIN
  DELETE FROM app.kpi_location_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  FOR d IN
    SELECT generate_series(v_start, v_end, interval '1 day')::date
  LOOP
    FOR loc IN
      SELECT id
      FROM app.locations
      WHERE tenant_id = p_tenant_id
        AND deleted_at IS NULL
    LOOP
      PERFORM app.refresh_kpi_location_daily(p_tenant_id, loc.id, d);
    END LOOP;
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_location_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_orders_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_orders_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  INSERT INTO app.kpi_orders_daily (
    tenant_id, scope, location_id, day,
    orders_count, buyers_count, gmv, open_count, draft_count, received_count,
    confirmed_count, partially_dispatched_count, dispatched_count, delivered_count,
    invoiced_count, partially_invoiced_count, overdue_count, cancelled_count,
    buyer_app_count, converted_estimate_count, updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COUNT(DISTINCT buyer_id) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COALESCE(SUM(total_amount) FILTER (WHERE app.order_status_in_flow(status)), 0),
    COUNT(*) FILTER (WHERE app.order_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('open', 'accepted', 'received'))::bigint,
    COUNT(*) FILTER (WHERE status = 'confirmed')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE status = 'invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'overdue')::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint,
    COUNT(*) FILTER (
      WHERE is_buyer_app_order = true
        AND app.order_status_in_flow(status)
    )::bigint,
    COUNT(*) FILTER (
      WHERE estimate_id IS NOT NULL
        AND app.order_status_is_downstream_quality(status)
    )::bigint,
    now()
  FROM (
    SELECT
      o.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      o.buyer_id,
      o.total_amount,
      o.status,
      o.is_buyer_app_order,
      o.estimate_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_start AND v_end

    UNION ALL

    SELECT
      o.tenant_id,
      'location'::text AS scope,
      o.location_id,
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      o.buyer_id,
      o.total_amount,
      o.status,
      o.is_buyer_app_order,
      o.estimate_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.location_id IS NOT NULL
      AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_start AND v_end
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_orders_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_product_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  d date;
BEGIN
  DELETE FROM app.kpi_product_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN ((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days) AND (now() AT TIME ZONE 'Asia/Kolkata')::date;

  FOR d IN
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days),
      (now() AT TIME ZONE 'Asia/Kolkata')::date,
      interval '1 day'
    )::date
  LOOP
    INSERT INTO app.kpi_product_daily (
      tenant_id, tenant_product_id, day,
      units_sold, revenue, on_hand, updated_at
    )
    SELECT
      p_tenant_id,
      oi.tenant_product_id,
      d,
      COALESCE(SUM(oi.qty), 0)::int,
      COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
      COALESCE((
        SELECT SUM(ti.qty_available)
        FROM app.tenant_inventory ti
        WHERE ti.tenant_product_id = oi.tenant_product_id
          AND ti.deleted_at IS NULL
      ), 0)::numeric(14,2),
      now()
    FROM app.order_items oi
    JOIN app.orders o
      ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
      AND oi.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) = d
    GROUP BY oi.tenant_product_id
    HAVING COALESCE(SUM(oi.qty), 0) > 0
        OR COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0) > 0;
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_product_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_tenant_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  d date;
BEGIN
  DELETE FROM app.kpi_tenant_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  FOR d IN
    SELECT generate_series(v_start, v_end, interval '1 day')::date
  LOOP
    PERFORM app.refresh_kpi_tenant_daily(p_tenant_id, d);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_tenant_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_kpi_warehouse_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer DEFAULT 62) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  d date;
  wh RECORD;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_warehouse_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN (v_today - p_days) AND v_today;

  FOR d IN
    SELECT generate_series(
      (v_today - p_days),
      v_today,
      interval '1 day'
    )::date
  LOOP
    FOR wh IN
      SELECT id
      FROM app.warehouses
      WHERE tenant_id = p_tenant_id
        AND deleted_at IS NULL
    LOOP
      IF d = v_today OR EXISTS (
        SELECT 1
        FROM app.tenant_inventory ti
        WHERE ti.warehouse_id = wh.id
          AND ti.deleted_at IS NULL
          AND (ti.updated_at AT TIME ZONE 'Asia/Kolkata')::date = d
      ) THEN
        PERFORM app.refresh_kpi_warehouse_daily(p_tenant_id, wh.id, d);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."rebuild_kpi_warehouse_daily_for_tenant"("p_tenant_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rebuild_tenant_products_search_vectors"("p_tenant_id" "uuid", "p_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app', 'catalog'
    AS $$
  UPDATE app.tenant_products tp
  SET search_vector = to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(
        tp.name_override,
        (
          SELECT cp.name
          FROM catalog.products cp
          WHERE cp.id = tp.master_product_id
        ),
        ''
      ),
      COALESCE(tp.internal_sku, ''),
      COALESCE(
        (
          SELECT COALESCE(tb.display_name_override, cb.name)
          FROM app.tenant_brands tb
          LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
          WHERE tb.id = tp.tenant_brand_id
        ),
        ''
      ),
      COALESCE(
        (
          SELECT tc.name
          FROM app.tenant_categories tc
          WHERE tc.id = tp.tenant_category_id
        ),
        ''
      ),
      COALESCE(tp.hsn_code, ''),
      COALESCE(tp.attributes_override::text, ''),
      COALESCE(
        (
          SELECT COALESCE(cp.attributes::text, '')
          FROM catalog.products cp
          WHERE cp.id = tp.master_product_id
        ),
        ''
      )
    )
  )
  WHERE tp.tenant_id = p_tenant_id
    AND tp.deleted_at IS NULL
    AND (p_ids IS NULL OR tp.id = ANY (p_ids));
$$;


ALTER FUNCTION "app"."rebuild_tenant_products_search_vectors"("p_tenant_id" "uuid", "p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_compute_associations"("p_tenant_id" "uuid", "p_window_days" integer DEFAULT 90) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  min_support   int;
  window_start  timestamptz := NOW() - (p_window_days || ' days')::interval;
  invoiced_ids  uuid[];
  total_events  bigint;
BEGIN
  SELECT COALESCE((settings->>'reco_min_support')::int, 3)
  INTO min_support
  FROM app.tenants WHERE id = p_tenant_id;

  SELECT ARRAY(
    SELECT DISTINCT estimate_id
    FROM app.invoices
    WHERE tenant_id = p_tenant_id AND estimate_id IS NOT NULL AND deleted_at IS NULL
  ) INTO invoiced_ids;

  -- Clear stale rows for this window before recomputing
  DELETE FROM app.reco_product_associations
  WHERE tenant_id = p_tenant_id AND time_window_days = p_window_days;

  -- Unified purchase events:
  --   inv:  / inv2: = invoice repeated twice for weight=2
  --   ord:  = order, weight=1
  --   est:  = estimate (not invoiced), weight=1 (min_support threshold compensates for lower quality)
  WITH purchase_events AS (
    -- Invoice copy 1
    SELECT ('inv:' || inv.id::text) AS event_id, inv.buyer_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    -- Invoice copy 2 (doubles weight for co-occurrence counting)
    SELECT ('inv2:' || inv.id::text) AS event_id, inv.buyer_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    -- Orders
    SELECT ('ord:' || o.id::text) AS event_id, o.buyer_id, oi.tenant_product_id
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
      AND o.placed_at >= window_start
    UNION ALL
    -- Estimates NOT converted to invoice
    SELECT ('est:' || e.id::text) AS event_id, e.buyer_id, ei.tenant_product_id
    FROM app.estimate_items ei
    JOIN app.estimates e ON e.id = ei.estimate_id
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND ei.deleted_at IS NULL
      AND e.created_at >= window_start
      AND (
        invoiced_ids IS NULL
        OR array_length(invoiced_ids, 1) IS NULL
        OR e.id <> ALL(invoiced_ids)
      )
  ),
  event_totals AS (
    SELECT COUNT(DISTINCT event_id) AS total_cnt FROM purchase_events
  ),
  -- co_order: products appearing in the same event
  co_event_pairs AS (
    SELECT
      pe1.tenant_product_id AS product_a,
      pe2.tenant_product_id AS product_b,
      COUNT(DISTINCT pe1.event_id) AS co_count
    FROM purchase_events pe1
    JOIN purchase_events pe2
      ON pe1.event_id = pe2.event_id
      AND pe1.tenant_product_id < pe2.tenant_product_id
    GROUP BY pe1.tenant_product_id, pe2.tenant_product_id
    HAVING COUNT(DISTINCT pe1.event_id) >= min_support
  ),
  product_event_counts AS (
    SELECT tenant_product_id, COUNT(DISTINCT event_id) AS event_count
    FROM purchase_events
    GROUP BY tenant_product_id
  )
  INSERT INTO app.reco_product_associations
    (tenant_id, product_a_id, product_b_id, association_type,
     co_occurrence_count, lift_score, confidence, time_window_days)
  -- A → B
  SELECT
    p_tenant_id, p.product_a, p.product_b, 'co_order',
    p.co_count,
    (p.co_count::numeric / NULLIF(t.total_cnt, 0)) /
      NULLIF(
        (pa.event_count::numeric / NULLIF(t.total_cnt, 0)) *
        (pb.event_count::numeric / NULLIF(t.total_cnt, 0)),
        0
      ),
    p.co_count::numeric / NULLIF(pa.event_count, 0),
    p_window_days
  FROM co_event_pairs p
  CROSS JOIN event_totals t
  JOIN product_event_counts pa ON pa.tenant_product_id = p.product_a
  JOIN product_event_counts pb ON pb.tenant_product_id = p.product_b
  UNION ALL
  -- B → A (mirror)
  SELECT
    p_tenant_id, p.product_b, p.product_a, 'co_order',
    p.co_count,
    (p.co_count::numeric / NULLIF(t.total_cnt, 0)) /
      NULLIF(
        (pb.event_count::numeric / NULLIF(t.total_cnt, 0)) *
        (pa.event_count::numeric / NULLIF(t.total_cnt, 0)),
        0
      ),
    p.co_count::numeric / NULLIF(pb.event_count, 0),
    p_window_days
  FROM co_event_pairs p
  CROSS JOIN event_totals t
  JOIN product_event_counts pa ON pa.tenant_product_id = p.product_a
  JOIN product_event_counts pb ON pb.tenant_product_id = p.product_b;

  -- co_buyer: same buyer purchased A and B across different events (invoices + orders only)
  WITH buyer_products AS (
    SELECT DISTINCT buyer_id, tenant_product_id FROM (
      SELECT inv.buyer_id, ii.tenant_product_id
      FROM app.invoice_items ii
      JOIN app.invoices inv ON inv.id = ii.invoice_id
      WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
        AND inv.invoice_date >= window_start
      UNION
      SELECT o.buyer_id, oi.tenant_product_id
      FROM app.order_items oi
      JOIN app.orders o ON o.id = oi.order_id
      WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
        AND o.placed_at >= window_start
    ) src
  ),
  buyer_pairs AS (
    SELECT
      bp1.tenant_product_id AS product_a,
      bp2.tenant_product_id AS product_b,
      COUNT(DISTINCT bp1.buyer_id) AS co_count
    FROM buyer_products bp1
    JOIN buyer_products bp2
      ON bp1.buyer_id = bp2.buyer_id
      AND bp1.tenant_product_id < bp2.tenant_product_id
    GROUP BY bp1.tenant_product_id, bp2.tenant_product_id
    HAVING COUNT(DISTINCT bp1.buyer_id) >= min_support
  )
  INSERT INTO app.reco_product_associations
    (tenant_id, product_a_id, product_b_id, association_type, co_occurrence_count, time_window_days)
  SELECT p_tenant_id, product_a, product_b, 'co_buyer', co_count, p_window_days FROM buyer_pairs
  UNION ALL
  SELECT p_tenant_id, product_b, product_a, 'co_buyer', co_count, p_window_days FROM buyer_pairs;
END;
$$;


ALTER FUNCTION "app"."reco_compute_associations"("p_tenant_id" "uuid", "p_window_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_compute_category_associations"("p_tenant_id" "uuid", "p_window_days" integer DEFAULT 90) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  min_support  int;
  window_start timestamptz := NOW() - (p_window_days || ' days')::interval;
  invoiced_ids uuid[];
  total_events bigint;
BEGIN
  SELECT COALESCE((settings->>'reco_min_support')::int, 3)
  INTO min_support FROM app.tenants WHERE id = p_tenant_id;

  SELECT ARRAY(
    SELECT DISTINCT estimate_id FROM app.invoices
    WHERE tenant_id = p_tenant_id AND estimate_id IS NOT NULL AND deleted_at IS NULL
  ) INTO invoiced_ids;

  DELETE FROM app.reco_category_associations
  WHERE tenant_id = p_tenant_id AND time_window_days = p_window_days;

  WITH purchase_events AS (
    SELECT ('inv:' || inv.id::text) AS event_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    SELECT ('inv2:' || inv.id::text) AS event_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    SELECT ('ord:' || o.id::text) AS event_id, oi.tenant_product_id
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
      AND o.placed_at >= window_start
    UNION ALL
    SELECT ('est:' || e.id::text) AS event_id, ei.tenant_product_id
    FROM app.estimate_items ei
    JOIN app.estimates e ON e.id = ei.estimate_id
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND ei.deleted_at IS NULL
      AND e.created_at >= window_start
      AND (invoiced_ids IS NULL OR array_length(invoiced_ids, 1) IS NULL OR e.id <> ALL(invoiced_ids))
  ),
  event_categories AS (
    SELECT DISTINCT pe.event_id, tp.tenant_category_id
    FROM purchase_events pe
    JOIN app.tenant_products tp ON tp.id = pe.tenant_product_id
    WHERE tp.tenant_category_id IS NOT NULL
  ),
  event_totals AS (
    SELECT COUNT(DISTINCT event_id) AS total_cnt FROM event_categories
  ),
  co_pairs AS (
    SELECT
      ec1.tenant_category_id AS category_a,
      ec2.tenant_category_id AS category_b,
      COUNT(DISTINCT ec1.event_id) AS co_count
    FROM event_categories ec1
    JOIN event_categories ec2
      ON ec1.event_id = ec2.event_id AND ec1.tenant_category_id < ec2.tenant_category_id
    GROUP BY ec1.tenant_category_id, ec2.tenant_category_id
    HAVING COUNT(DISTINCT ec1.event_id) >= min_support
  ),
  cat_event_counts AS (
    SELECT tenant_category_id, COUNT(DISTINCT event_id) AS event_count
    FROM event_categories GROUP BY tenant_category_id
  )
  INSERT INTO app.reco_category_associations
    (tenant_id, category_a_id, category_b_id, co_occurrence_count, lift_score, confidence, time_window_days)
  SELECT p_tenant_id, p.category_a, p.category_b,
    p.co_count,
    (p.co_count::numeric / NULLIF(t.total_cnt, 0)) /
      NULLIF((ca.event_count::numeric / t.total_cnt) * (cb.event_count::numeric / t.total_cnt), 0),
    p.co_count::numeric / NULLIF(ca.event_count, 0),
    p_window_days
  FROM co_pairs p
  CROSS JOIN event_totals t
  JOIN cat_event_counts ca ON ca.tenant_category_id = p.category_a
  JOIN cat_event_counts cb ON cb.tenant_category_id = p.category_b
  UNION ALL
  SELECT p_tenant_id, p.category_b, p.category_a,
    p.co_count,
    (p.co_count::numeric / NULLIF(t.total_cnt, 0)) /
      NULLIF((cb.event_count::numeric / t.total_cnt) * (ca.event_count::numeric / t.total_cnt), 0),
    p.co_count::numeric / NULLIF(cb.event_count, 0),
    p_window_days
  FROM co_pairs p
  CROSS JOIN event_totals t
  JOIN cat_event_counts ca ON ca.tenant_category_id = p.category_a
  JOIN cat_event_counts cb ON cb.tenant_category_id = p.category_b;
END;
$$;


ALTER FUNCTION "app"."reco_compute_category_associations"("p_tenant_id" "uuid", "p_window_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_compute_category_profiles"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  window_start      timestamptz := NOW() - INTERVAL '90 days';
  invoiced_ids      uuid[];
  median_breadth    numeric;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT estimate_id FROM app.invoices
    WHERE tenant_id = p_tenant_id AND estimate_id IS NOT NULL AND deleted_at IS NULL
  ) INTO invoiced_ids;

  -- Build weighted events at category grain using the Phase 1 signal pattern.
  -- invoice copy 1 + copy 2 gives effective weight=2 for invoices.
  WITH purchase_events AS (
    SELECT ('inv:' || inv.id::text) AS event_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    SELECT ('inv2:' || inv.id::text) AS event_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    SELECT ('ord:' || o.id::text) AS event_id, oi.tenant_product_id
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
      AND o.placed_at >= window_start
    UNION ALL
    SELECT ('est:' || e.id::text) AS event_id, ei.tenant_product_id
    FROM app.estimate_items ei
    JOIN app.estimates e ON e.id = ei.estimate_id
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND ei.deleted_at IS NULL
      AND e.created_at >= window_start
      AND (invoiced_ids IS NULL OR array_length(invoiced_ids, 1) IS NULL OR e.id <> ALL(invoiced_ids))
  ),
  -- Map events → categories
  event_categories AS (
    SELECT DISTINCT pe.event_id, tp.tenant_category_id
    FROM purchase_events pe
    JOIN app.tenant_products tp ON tp.id = pe.tenant_product_id
    WHERE tp.tenant_category_id IS NOT NULL
  ),
  -- For each (event, category), count distinct OTHER categories in that event
  event_category_counts AS (
    SELECT event_id, COUNT(DISTINCT tenant_category_id) AS category_count
    FROM event_categories
    GROUP BY event_id
  ),
  -- Per category: weighted event count + solo order rate + co-occurrence breadth
  category_stats AS (
    SELECT
      ec.tenant_category_id,
      COUNT(DISTINCT ec.event_id)                                                     AS weighted_event_count,
      -- solo_order_rate: events where this is the ONLY category
      COUNT(DISTINCT CASE WHEN ecc.category_count = 1 THEN ec.event_id END)::numeric
        / NULLIF(COUNT(DISTINCT ec.event_id), 0)                                      AS solo_order_rate,
      -- co_occurrence_breadth: distinct other categories this one appears alongside
      COUNT(DISTINCT ec2.tenant_category_id)                                          AS co_occurrence_breadth
    FROM event_categories ec
    JOIN event_category_counts ecc ON ecc.event_id = ec.event_id
    LEFT JOIN event_categories ec2
      ON ec2.event_id = ec.event_id AND ec2.tenant_category_id <> ec.tenant_category_id
    GROUP BY ec.tenant_category_id
  ),
  -- Compute median breadth across categories for this tenant
  median_calc AS (
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY co_occurrence_breadth) AS med
    FROM category_stats
  ),
  -- Classification
  classified AS (
    SELECT
      cs.tenant_category_id,
      cs.weighted_event_count,
      cs.solo_order_rate,
      cs.co_occurrence_breadth::int,
      CASE
        -- exclude: zero activity or name matches service patterns
        WHEN cs.weighted_event_count = 0 THEN 'exclude'
        WHEN LOWER(tc.name) ~ '(charge|installation|amc|service|labour|labor|freight|transport|handling)' THEN 'exclude'
        -- companion: almost never bought alone and appears with a very wide variety of categories
        WHEN cs.solo_order_rate < 0.05
          AND cs.co_occurrence_breadth > COALESCE(mc.med * 1.5, 2) THEN 'companion'
        -- anchor: default (conservative — when uncertain, keep in Bestsellers)
        ELSE 'anchor'
      END AS computed_role
    FROM category_stats cs
    JOIN app.tenant_categories tc ON tc.id = cs.tenant_category_id
    CROSS JOIN median_calc mc
  )
  INSERT INTO app.reco_category_profiles
    (tenant_id, tenant_category_id, computed_role, solo_order_rate, co_occurrence_breadth, weighted_event_count, computed_at)
  SELECT
    p_tenant_id,
    tenant_category_id,
    computed_role,
    solo_order_rate,
    co_occurrence_breadth,
    weighted_event_count,
    NOW()
  FROM classified
  ON CONFLICT (tenant_id, tenant_category_id) DO UPDATE SET
    computed_role          = EXCLUDED.computed_role,
    solo_order_rate        = EXCLUDED.solo_order_rate,
    co_occurrence_breadth  = EXCLUDED.co_occurrence_breadth,
    weighted_event_count   = EXCLUDED.weighted_event_count,
    computed_at            = NOW();

  -- Mark categories with zero events as 'exclude' (not seen in classified CTE)
  INSERT INTO app.reco_category_profiles
    (tenant_id, tenant_category_id, computed_role, weighted_event_count, computed_at)
  SELECT p_tenant_id, tc.id, 'exclude', 0, NOW()
  FROM app.tenant_categories tc
  WHERE tc.tenant_id = p_tenant_id
    AND tc.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM app.reco_category_profiles cp
      WHERE cp.tenant_id = p_tenant_id AND cp.tenant_category_id = tc.id
    )
  ON CONFLICT (tenant_id, tenant_category_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "app"."reco_compute_category_profiles"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_compute_popularity"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  window_90d           timestamptz := NOW() - INTERVAL '90 days';
  window_30d           timestamptz := NOW() - INTERVAL '30 days';
  window_7d            timestamptz := NOW() - INTERVAL '7 days';
  invoiced_estimate_ids uuid[];
BEGIN
  -- Collect estimate_ids already converted to an invoice (exclude from estimate signal)
  SELECT ARRAY(
    SELECT DISTINCT estimate_id
    FROM app.invoices
    WHERE tenant_id = p_tenant_id
      AND estimate_id IS NOT NULL
      AND deleted_at IS NULL
  ) INTO invoiced_estimate_ids;

  WITH
  -- Signal A: invoices (weight 2.0)
  invoice_signal AS (
    SELECT
      ii.tenant_product_id,
      inv.buyer_id,
      COUNT(DISTINCT CASE WHEN inv.invoice_date >= window_30d THEN inv.id END) AS cnt_30d,
      COALESCE(SUM(CASE WHEN inv.invoice_date >= window_30d THEN ii.line_total ELSE 0 END), 0) AS rev_30d
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id
      AND inv.deleted_at IS NULL
      AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_90d
    GROUP BY ii.tenant_product_id, inv.buyer_id
  ),
  -- Signal B: orders (weight 1.0)
  order_signal AS (
    SELECT
      oi.tenant_product_id,
      o.buyer_id,
      COUNT(DISTINCT CASE WHEN o.placed_at >= window_7d  THEN o.id END) AS cnt_7d,
      COUNT(DISTINCT CASE WHEN o.placed_at >= window_30d THEN o.id END) AS cnt_30d,
      COUNT(DISTINCT CASE WHEN o.placed_at >= window_90d THEN o.id END) AS cnt_90d
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND oi.deleted_at IS NULL
      AND o.placed_at >= window_90d
    GROUP BY oi.tenant_product_id, o.buyer_id
  ),
  -- Signal C: estimates NOT converted to invoice (weight 0.5)
  estimate_signal AS (
    SELECT
      ei.tenant_product_id,
      e.buyer_id,
      COUNT(DISTINCT CASE WHEN e.created_at >= window_30d THEN e.id END) AS cnt_30d
    FROM app.estimate_items ei
    JOIN app.estimates e ON e.id = ei.estimate_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND ei.deleted_at IS NULL
      AND e.created_at >= window_90d
      AND (
        invoiced_estimate_ids IS NULL
        OR array_length(invoiced_estimate_ids, 1) IS NULL
        OR e.id <> ALL(invoiced_estimate_ids)
      )
    GROUP BY ei.tenant_product_id, e.buyer_id
  ),
  -- Aggregate per product across all signals
  product_agg AS (
    SELECT
      tp.id                                                           AS tenant_product_id,
      tp.tenant_category_id,
      COALESCE(SUM(inv.cnt_30d), 0)::int                             AS invoice_count_30d,
      COALESCE(SUM(ord.cnt_30d), 0)::int                             AS order_count_30d,
      COALESCE(SUM(est.cnt_30d), 0)::int                             AS estimate_count_30d,
      COALESCE(SUM(inv.cnt_30d * 2.0), 0)
        + COALESCE(SUM(ord.cnt_30d * 1.0), 0)
        + COALESCE(SUM(est.cnt_30d * 0.5), 0)                        AS weighted_score_30d,
      COALESCE(SUM(ord.cnt_7d), 0)::int                              AS order_count_7d,
      COALESCE(SUM(ord.cnt_90d), 0)::int                             AS order_count_90d,
      COALESCE(SUM(inv.rev_30d), 0)                                  AS revenue_30d,
      COUNT(DISTINCT COALESCE(inv.buyer_id, ord.buyer_id, est.buyer_id)) AS unique_buyer_count_30d
    FROM app.tenant_products tp
    LEFT JOIN invoice_signal  inv ON inv.tenant_product_id = tp.id
    LEFT JOIN order_signal    ord ON ord.tenant_product_id = tp.id
    LEFT JOIN estimate_signal est ON est.tenant_product_id = tp.id
    WHERE tp.tenant_id = p_tenant_id
      AND (
        COALESCE(inv.cnt_30d, 0) > 0
        OR COALESCE(ord.cnt_30d, 0) > 0
        OR COALESCE(est.cnt_30d, 0) > 0
      )
    GROUP BY tp.id, tp.tenant_category_id
  ),
  -- Apply category rank by weighted_score_30d within each category
  ranked AS (
    SELECT *,
      RANK() OVER (
        PARTITION BY tenant_category_id
        ORDER BY weighted_score_30d DESC
      )::int AS category_rank_30d
    FROM product_agg
  )
  INSERT INTO app.reco_product_popularity (
    tenant_id, tenant_product_id,
    invoice_count_30d, order_count_30d, estimate_count_30d,
    weighted_score_30d,
    order_count_7d, order_count_90d,
    revenue_30d, unique_buyer_count_30d,
    category_rank_30d, computed_at
  )
  SELECT
    p_tenant_id, tenant_product_id,
    invoice_count_30d, order_count_30d, estimate_count_30d,
    weighted_score_30d,
    order_count_7d, order_count_90d,
    revenue_30d, unique_buyer_count_30d,
    category_rank_30d, NOW()
  FROM ranked
  ON CONFLICT (tenant_id, tenant_product_id) DO UPDATE SET
    invoice_count_30d      = EXCLUDED.invoice_count_30d,
    order_count_30d        = EXCLUDED.order_count_30d,
    estimate_count_30d     = EXCLUDED.estimate_count_30d,
    weighted_score_30d     = EXCLUDED.weighted_score_30d,
    order_count_7d         = EXCLUDED.order_count_7d,
    order_count_90d        = EXCLUDED.order_count_90d,
    revenue_30d            = EXCLUDED.revenue_30d,
    unique_buyer_count_30d = EXCLUDED.unique_buyer_count_30d,
    category_rank_30d      = EXCLUDED.category_rank_30d,
    computed_at            = NOW();
END;
$$;


ALTER FUNCTION "app"."reco_compute_popularity"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_get_bestsellers"("p_tenant_id" "uuid", "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 20) RETURNS TABLE("tenant_product_id" "uuid", "weighted_score_30d" numeric, "category_rank_30d" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    pop.tenant_product_id,
    pop.weighted_score_30d,
    pop.category_rank_30d
  FROM app.reco_product_popularity pop
  JOIN app.tenant_products tp ON tp.id = pop.tenant_product_id
  LEFT JOIN app.reco_category_profiles cp
    ON cp.tenant_id = p_tenant_id AND cp.tenant_category_id = tp.tenant_category_id
  LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
  WHERE pop.tenant_id = p_tenant_id
    AND pop.weighted_score_30d > 0
    AND tp.is_active = true
    AND (p_category_id IS NULL OR tp.tenant_category_id = p_category_id)
    -- Phase 2 filter: suppress companion + exclude from global bestsellers.
    -- When browsing a specific category (p_category_id IS NOT NULL), allow all roles.
    AND (
      p_category_id IS NOT NULL
      OR COALESCE(tc.recommendation_role, cp.computed_role, 'anchor') = 'anchor'
    )
  ORDER BY pop.weighted_score_30d DESC
  LIMIT p_limit;
$$;


ALTER FUNCTION "app"."reco_get_bestsellers"("p_tenant_id" "uuid", "p_category_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_get_cart_bundles"("p_tenant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(bundle_row), '[]'::jsonb) INTO result
  FROM (
    SELECT jsonb_build_object(
      'id',    rb.id,
      'name',  rb.name,
      'slots', COALESCE((
        SELECT jsonb_agg(slot_row ORDER BY rbs.display_order)
        FROM app.reco_bundle_slots rbs
        LEFT JOIN LATERAL (
          SELECT pop.tenant_product_id AS top_product_id
          FROM app.reco_product_popularity pop
          JOIN app.tenant_products tp ON tp.id = pop.tenant_product_id
          WHERE pop.tenant_id = p_tenant_id
            AND tp.tenant_category_id = rbs.tenant_category_id
            AND tp.is_active = true
            AND pop.weighted_score_30d > 0
          ORDER BY pop.weighted_score_30d DESC
          LIMIT 1
        ) top_prod ON true
        CROSS JOIN LATERAL (
          SELECT jsonb_build_object(
            'tenant_category_id', rbs.tenant_category_id,
            'slot_label',         rbs.slot_label,
            'is_required',        rbs.is_required,
            'display_order',      rbs.display_order,
            'top_product_id',     top_prod.top_product_id
          ) AS slot_row
        ) _
        WHERE rbs.bundle_id = rb.id
      ), '[]'::jsonb)
    ) AS bundle_row
    FROM app.reco_bundles rb
    WHERE rb.tenant_id = p_tenant_id AND rb.is_active = true
    ORDER BY rb.created_at
  ) bundles;

  RETURN jsonb_build_object('bundles', COALESCE(result, '[]'::jsonb));
END;
$$;


ALTER FUNCTION "app"."reco_get_cart_bundles"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_get_category_roles"("p_tenant_id" "uuid") RETURNS TABLE("category_id" "uuid", "category_name" "text", "override_role" "text", "computed_role" "text", "resolved_role" "text", "is_auto" boolean, "weighted_event_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    tc.id                                                                AS category_id,
    tc.name                                                              AS category_name,
    tc.recommendation_role                                               AS override_role,
    cp.computed_role,
    COALESCE(tc.recommendation_role, cp.computed_role, 'anchor')        AS resolved_role,
    tc.recommendation_role IS NULL                                       AS is_auto,
    COALESCE(cp.weighted_event_count, 0)                                AS weighted_event_count
  FROM app.tenant_categories tc
  LEFT JOIN app.reco_category_profiles cp
    ON cp.tenant_id = p_tenant_id AND cp.tenant_category_id = tc.id
  WHERE tc.tenant_id = p_tenant_id
    AND tc.deleted_at IS NULL
    AND tc.is_active = true
  ORDER BY tc.name;
$$;


ALTER FUNCTION "app"."reco_get_category_roles"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_get_home"("p_tenant_id" "uuid", "p_buyer_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := jsonb_build_object(
    -- W1: Bestsellers — anchor-only (Phase 2 role filter applied)
    'bestsellers',
    COALESCE((
      SELECT jsonb_agg(a.tenant_product_id ORDER BY a.weighted_score_30d DESC)
      FROM (
        SELECT p.tenant_product_id, p.weighted_score_30d
        FROM app.reco_product_popularity p
        JOIN app.tenant_products tp ON tp.id = p.tenant_product_id
        LEFT JOIN app.reco_category_profiles cp
          ON cp.tenant_id = p_tenant_id AND cp.tenant_category_id = tp.tenant_category_id
        LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
        WHERE p.tenant_id = p_tenant_id
          AND p.weighted_score_30d > 0
          AND tp.is_active = true
          AND COALESCE(tc.recommendation_role, cp.computed_role, 'anchor') = 'anchor'
        ORDER BY p.weighted_score_30d DESC
        LIMIT 20
      ) a
    ), '[]'::jsonb),

    -- W4: Buy Again (unchanged)
    'buy_again',
    COALESCE((
      SELECT jsonb_agg((elem->>'product_id')::text)
      FROM app.reco_buyer_profiles bp,
           jsonb_array_elements(bp.top_products) AS elem
      WHERE bp.tenant_id = p_tenant_id
        AND bp.buyer_id = p_buyer_id
    ), '[]'::jsonb)
  );

  RETURN result;
END;
$$;


ALTER FUNCTION "app"."reco_get_home"("p_tenant_id" "uuid", "p_buyer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_get_product_page"("p_tenant_product_id" "uuid", "p_buyer_id" "uuid", "p_widget_types" "text"[] DEFAULT ARRAY['co_order'::"text", 'co_buyer'::"text", 'same_category'::"text"], "p_limit" integer DEFAULT 8) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_tenant_id   uuid;
  v_category_id uuid;
  result        jsonb := '{}'::jsonb;
BEGIN
  v_tenant_id := app.jwt_tenant_id();

  SELECT tp.tenant_category_id INTO v_category_id
  FROM app.tenant_products tp
  WHERE tp.id = p_tenant_product_id AND tp.tenant_id = v_tenant_id;

  -- W2: Frequently Bought Together (co_order associations, lift > 2)
  IF 'co_order' = ANY(p_widget_types) THEN
    result := result || jsonb_build_object(
      'co_order',
      COALESCE((
        SELECT jsonb_agg(a.product_b_id ORDER BY a.lift_score DESC)
        FROM (
          SELECT r.product_b_id, r.lift_score
          FROM app.reco_product_associations r
          JOIN app.tenant_products tp ON tp.id = r.product_b_id
          WHERE r.tenant_id = v_tenant_id
            AND r.product_a_id = p_tenant_product_id
            AND r.association_type = 'co_order'
            AND r.time_window_days = 90
            AND r.lift_score > 2
            AND r.co_occurrence_count >= 3
            AND tp.is_active = true
          ORDER BY r.lift_score DESC
          LIMIT p_limit
        ) a
      ), '[]'::jsonb)
    );
  END IF;

  -- W3: People Also Bought (co_buyer associations, cross-session)
  IF 'co_buyer' = ANY(p_widget_types) THEN
    result := result || jsonb_build_object(
      'co_buyer',
      COALESCE((
        SELECT jsonb_agg(a.product_b_id ORDER BY a.co_occurrence_count DESC)
        FROM (
          SELECT r.product_b_id, r.co_occurrence_count
          FROM app.reco_product_associations r
          JOIN app.tenant_products tp ON tp.id = r.product_b_id
          WHERE r.tenant_id = v_tenant_id
            AND r.product_a_id = p_tenant_product_id
            AND r.association_type = 'co_buyer'
            AND r.time_window_days = 90
            AND tp.is_active = true
          ORDER BY r.co_occurrence_count DESC
          LIMIT p_limit
        ) a
      ), '[]'::jsonb)
    );
  END IF;

  -- W5: More from this Category (ranked by weighted_score_30d within category)
  IF 'same_category' = ANY(p_widget_types) AND v_category_id IS NOT NULL THEN
    result := result || jsonb_build_object(
      'same_category',
      COALESCE((
        SELECT jsonb_agg(a.tenant_product_id ORDER BY a.category_rank_30d ASC)
        FROM (
          SELECT p.tenant_product_id, p.category_rank_30d
          FROM app.reco_product_popularity p
          JOIN app.tenant_products tp ON tp.id = p.tenant_product_id
          WHERE p.tenant_id = v_tenant_id
            AND tp.tenant_category_id = v_category_id
            AND p.tenant_product_id <> p_tenant_product_id
            AND tp.is_active = true
            AND p.weighted_score_30d > 0
          ORDER BY p.category_rank_30d ASC
          LIMIT p_limit
        ) a
      ), '[]'::jsonb)
    );
  END IF;

  RETURN result;
END;
$$;


ALTER FUNCTION "app"."reco_get_product_page"("p_tenant_product_id" "uuid", "p_buyer_id" "uuid", "p_widget_types" "text"[], "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_refresh_buyer_profiles"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT buyer_id FROM (
      SELECT buyer_id FROM app.invoices
      WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
        AND invoice_date >= NOW() - INTERVAL '12 months'
      UNION
      SELECT buyer_id FROM app.orders
      WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
        AND placed_at >= NOW() - INTERVAL '12 months'
    ) buyers
  ) LOOP
    INSERT INTO app.reco_buyer_profiles (tenant_id, buyer_id, top_products, top_categories, refreshed_at)
    VALUES (
      p_tenant_id,
      r.buyer_id,
      -- top_products: ranked by weighted count (invoice×2 + order×1), last 12 months
      COALESCE((
        SELECT jsonb_agg(row_to_json(t))
        FROM (
          SELECT
            src.tenant_product_id                        AS product_id,
            SUM(src.weight_count)                        AS weighted_count,
            MAX(src.event_date)                          AS last_ordered_at,
            MAX(COALESCE(tp.name_override, cp.name))     AS product_name
          FROM (
            SELECT ii.tenant_product_id, 2 AS weight_count, inv.invoice_date AS event_date
            FROM app.invoice_items ii
            JOIN app.invoices inv ON inv.id = ii.invoice_id
            WHERE inv.tenant_id = p_tenant_id AND inv.buyer_id = r.buyer_id
              AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
              AND inv.invoice_date >= NOW() - INTERVAL '12 months'
            UNION ALL
            SELECT oi.tenant_product_id, 1 AS weight_count, o.placed_at AS event_date
            FROM app.order_items oi
            JOIN app.orders o ON o.id = oi.order_id
            WHERE o.tenant_id = p_tenant_id AND o.buyer_id = r.buyer_id
              AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
              AND o.placed_at >= NOW() - INTERVAL '12 months'
          ) src
          JOIN app.tenant_products tp ON tp.id = src.tenant_product_id
          LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
          GROUP BY src.tenant_product_id
          ORDER BY weighted_count DESC, last_ordered_at DESC
          LIMIT 10
        ) t
      ), '[]'::jsonb),
      -- top_categories: by weighted count within the same 12-month window
      COALESCE((
        SELECT jsonb_agg(row_to_json(t))
        FROM (
          SELECT
            tp.tenant_category_id                        AS category_id,
            SUM(src.weight_count)                        AS weighted_count,
            MAX(src.event_date)                          AS last_ordered_at
          FROM (
            SELECT ii.tenant_product_id, 2 AS weight_count, inv.invoice_date AS event_date
            FROM app.invoice_items ii
            JOIN app.invoices inv ON inv.id = ii.invoice_id
            WHERE inv.tenant_id = p_tenant_id AND inv.buyer_id = r.buyer_id
              AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
              AND inv.invoice_date >= NOW() - INTERVAL '12 months'
            UNION ALL
            SELECT oi.tenant_product_id, 1 AS weight_count, o.placed_at AS event_date
            FROM app.order_items oi
            JOIN app.orders o ON o.id = oi.order_id
            WHERE o.tenant_id = p_tenant_id AND o.buyer_id = r.buyer_id
              AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
              AND o.placed_at >= NOW() - INTERVAL '12 months'
          ) src
          JOIN app.tenant_products tp ON tp.id = src.tenant_product_id
          WHERE tp.tenant_category_id IS NOT NULL
          GROUP BY tp.tenant_category_id
          ORDER BY weighted_count DESC
          LIMIT 5
        ) t
      ), '[]'::jsonb),
      NOW()
    )
    ON CONFLICT (tenant_id, buyer_id) DO UPDATE SET
      top_products   = EXCLUDED.top_products,
      top_categories = EXCLUDED.top_categories,
      refreshed_at   = NOW();
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."reco_refresh_buyer_profiles"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_refresh_category_intelligence"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    PERFORM app.reco_compute_category_profiles(t.id);
    PERFORM app.reco_compute_category_associations(t.id, 90);
    PERFORM app.reco_suggest_bundles(t.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."reco_refresh_category_intelligence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_run_all_associations"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    PERFORM app.reco_compute_associations(t.id, 90);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."reco_run_all_associations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_run_all_buyer_profiles"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    PERFORM app.reco_refresh_buyer_profiles(t.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."reco_run_all_buyer_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_run_all_popularity"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    PERFORM app.reco_compute_popularity(t.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."reco_run_all_popularity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reco_suggest_bundles"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO app.reco_bundle_suggestions
    (tenant_id, suggested_name, category_ids, avg_co_occurrence, confidence_score, status, computed_at)
  SELECT
    p_tenant_id,
    -- Generate a suggested bundle name from the category names
    (
      SELECT string_agg(tc2.name, ' + ' ORDER BY tc2.name)
      FROM app.tenant_categories tc2
      WHERE tc2.id = ANY(ARRAY[ca.category_a_id, ca.category_b_id])
    ),
    ARRAY[ca.category_a_id, ca.category_b_id],
    ca.co_occurrence_count,
    ca.confidence,
    'pending',
    NOW()
  FROM app.reco_category_associations ca
  -- Only propose pairs of anchor categories
  JOIN app.reco_category_profiles cpa
    ON cpa.tenant_id = p_tenant_id AND cpa.tenant_category_id = ca.category_a_id
  JOIN app.reco_category_profiles cpb
    ON cpb.tenant_id = p_tenant_id AND cpb.tenant_category_id = ca.category_b_id
  JOIN app.tenant_categories tca ON tca.id = ca.category_a_id AND tca.deleted_at IS NULL
  JOIN app.tenant_categories tcb ON tcb.id = ca.category_b_id AND tcb.deleted_at IS NULL
  WHERE ca.tenant_id = p_tenant_id
    AND ca.time_window_days = 90
    AND ca.confidence >= 0.3
    AND ca.co_occurrence_count >= 5
    -- Skip companion/exclude categories
    AND COALESCE(tca.recommendation_role, cpa.computed_role, 'anchor') = 'anchor'
    AND COALESCE(tcb.recommendation_role, cpb.computed_role, 'anchor') = 'anchor'
    -- Skip pairs that already have a recent suggestion
    AND NOT EXISTS (
      SELECT 1 FROM app.reco_bundle_suggestions bs
      WHERE bs.tenant_id = p_tenant_id
        AND ca.category_a_id = ANY(bs.category_ids)
        AND ca.category_b_id = ANY(bs.category_ids)
        AND bs.computed_at >= NOW() - INTERVAL '60 days'
    )
  -- Top 10 strongest pairs per tenant per run
  ORDER BY ca.confidence DESC
  LIMIT 10
  ON CONFLICT DO NOTHING;
END;
$$;


ALTER FUNCTION "app"."reco_suggest_bundles"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."record_buyer_app_activity"("p_tenant_id" "uuid", "p_buyer_id" "uuid", "p_event_name" "text", "p_occurred_at" timestamp with time zone DEFAULT "now"(), "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_idempotency_key" "text" DEFAULT NULL::"text", "p_qualifies_for_engagement" boolean DEFAULT true) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_claim_tenant uuid := app.jwt_tenant_id();
  v_claim_buyer uuid := app.jwt_buyer_id();
  v_occurred_at timestamptz := COALESCE(p_occurred_at, now());
  v_occurred_day date := (COALESCE(p_occurred_at, now()) AT TIME ZONE 'Asia/Kolkata')::date;
  v_activity_id uuid;
BEGIN
  IF btrim(COALESCE(p_event_name, '')) = '' THEN
    RAISE EXCEPTION 'event_name_required' USING ERRCODE = '22023';
  END IF;

  IF v_claim_tenant IS NOT NULL AND v_claim_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_claim_buyer IS NOT NULL AND v_claim_buyer <> p_buyer_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM app.buyers b
  WHERE b.id = p_buyer_id
    AND b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'buyer_not_found' USING ERRCODE = '22023';
  END IF;

  IF p_location_id IS NOT NULL THEN
    PERFORM 1
    FROM app.locations l
    WHERE l.id = p_location_id
      AND l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'location_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO app.buyer_app_activity (
      tenant_id,
      buyer_id,
      location_id,
      event_name,
      event_source,
      source_entity_id,
      occurred_at,
      occurred_day,
      qualifies_for_engagement,
      metadata,
      idempotency_key,
      created_by,
      updated_by,
      deleted_at
    )
    VALUES (
      p_tenant_id,
      p_buyer_id,
      p_location_id,
      btrim(p_event_name),
      'route',
      NULL,
      v_occurred_at,
      v_occurred_day,
      p_qualifies_for_engagement,
      COALESCE(p_metadata, '{}'::jsonb),
      p_idempotency_key,
      auth.uid(),
      auth.uid(),
      NULL
    )
    ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
    SET
      buyer_id = EXCLUDED.buyer_id,
      location_id = EXCLUDED.location_id,
      event_name = EXCLUDED.event_name,
      occurred_at = EXCLUDED.occurred_at,
      occurred_day = EXCLUDED.occurred_day,
      qualifies_for_engagement = EXCLUDED.qualifies_for_engagement,
      metadata = EXCLUDED.metadata,
      updated_by = auth.uid(),
      deleted_at = NULL
    RETURNING id INTO v_activity_id;
  ELSE
    INSERT INTO app.buyer_app_activity (
      tenant_id,
      buyer_id,
      location_id,
      event_name,
      event_source,
      source_entity_id,
      occurred_at,
      occurred_day,
      qualifies_for_engagement,
      metadata,
      idempotency_key,
      created_by,
      updated_by,
      deleted_at
    )
    VALUES (
      p_tenant_id,
      p_buyer_id,
      p_location_id,
      btrim(p_event_name),
      'route',
      NULL,
      v_occurred_at,
      v_occurred_day,
      p_qualifies_for_engagement,
      COALESCE(p_metadata, '{}'::jsonb),
      NULL,
      auth.uid(),
      auth.uid(),
      NULL
    )
    RETURNING id INTO v_activity_id;
  END IF;

  PERFORM app.refresh_buyer_app_daily(p_tenant_id, v_occurred_day);
  PERFORM app.refresh_buyer_app_snapshot(p_tenant_id);

  RETURN v_activity_id;
END;
$$;


ALTER FUNCTION "app"."record_buyer_app_activity"("p_tenant_id" "uuid", "p_buyer_id" "uuid", "p_event_name" "text", "p_occurred_at" timestamp with time zone, "p_location_id" "uuid", "p_metadata" "jsonb", "p_idempotency_key" "text", "p_qualifies_for_engagement" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_all_buyer_metric_snapshots"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  tenant_row RECORD;
BEGIN
  FOR tenant_row IN
    SELECT id
    FROM app.tenants
    WHERE deleted_at IS NULL
  LOOP
    PERFORM app.refresh_buyers_snapshot(tenant_row.id);
    PERFORM app.refresh_buyer_current_snapshot(tenant_row.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."refresh_all_buyer_metric_snapshots"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_all_dynamic_campaigns"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_product record;
BEGIN
  FOR v_product IN
    SELECT DISTINCT tp.id
    FROM app.tenant_products tp
    WHERE tp.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM app.campaigns c
        WHERE c.tenant_id  = tp.tenant_id
          AND c.is_dynamic = true
          AND c.deleted_at IS NULL
      )
  LOOP
    PERFORM app.evaluate_product_for_campaigns(v_product.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."refresh_all_dynamic_campaigns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_all_dynamic_cohorts"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_cohort record;
BEGIN
  FOR v_cohort IN
    SELECT DISTINCT id FROM app.cohorts
    WHERE is_static = false AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_cohort_by_id(v_cohort.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."refresh_all_dynamic_cohorts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_all_dynamic_price_lists"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_product record;
BEGIN
  FOR v_product IN
    SELECT DISTINCT tp.id
    FROM app.tenant_products tp
    WHERE tp.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM app.price_lists pl
        WHERE pl.tenant_id  = tp.tenant_id
          AND pl.deleted_at IS NULL
          AND pl.filters    IS NOT NULL
          AND pl.pricing_strategy != 'edit_each'
      )
  LOOP
    PERFORM app.evaluate_product_for_price_lists(v_product.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."refresh_all_dynamic_price_lists"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_brand_categories"("p_brand_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE app.tenant_brands
  SET
    categories = COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',    tc.id,
          'name',  tc.name,
          'count', cat.cnt
        ) ORDER BY tc.display_order, tc.name
      )
      FROM (
        SELECT tenant_category_id, COUNT(*) AS cnt
        FROM app.tenant_products
        WHERE tenant_brand_id = p_brand_id
          AND tenant_category_id IS NOT NULL
          AND deleted_at IS NULL
        GROUP BY tenant_category_id
      ) cat
      JOIN app.tenant_categories tc ON tc.id = cat.tenant_category_id
    ), '[]'::jsonb),
    updated_at = now()
  WHERE id = p_brand_id;
END;
$$;


ALTER FUNCTION "app"."refresh_brand_categories"("p_brand_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_brand_embedding"("p_brand_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'catalog'
    AS $$
BEGIN
  -- Placeholder RPC hook for brand embedding refresh.
  -- Until embedding generation is wired, we explicitly clear the embedding.
  UPDATE catalog.brands
  SET embedding = NULL,
      updated_at = now()
  WHERE id = p_brand_id;
END;
$$;


ALTER FUNCTION "app"."refresh_brand_embedding"("p_brand_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_brands_snapshot"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  INSERT INTO app.brands_snapshot (
    tenant_id, total_count, active_count, with_products_count, refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*),
    COUNT(*) FILTER (WHERE is_active = true),
    COUNT(DISTINCT tb.id) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM app.tenant_products tp
        WHERE tp.tenant_brand_id = tb.id
          AND tp.is_active = true
          AND tp.deleted_at IS NULL
      )
    ),
    now()
  FROM app.tenant_brands tb
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count         = EXCLUDED.total_count,
    active_count        = EXCLUDED.active_count,
    with_products_count = EXCLUDED.with_products_count,
    refreshed_at        = EXCLUDED.refreshed_at;
$$;


ALTER FUNCTION "app"."refresh_brands_snapshot"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_buyer_app_daily"("p_tenant_id" "uuid", "p_date" "date") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  DELETE FROM app.kpi_buyer_app_daily
  WHERE tenant_id = p_tenant_id
    AND snapshot_date = p_date;

  WITH metrics AS (
    SELECT
      p_tenant_id AS tenant_id,
      p_date AS snapshot_date,
      COALESCE((
        SELECT SUM(o.total_amount)
        FROM app.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.is_buyer_app_order
          AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) = p_date
          AND o.deleted_at IS NULL
      ), 0) AS app_gmv,
      COALESCE((
        SELECT COUNT(*)
        FROM app.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.is_buyer_app_order
          AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) = p_date
          AND o.deleted_at IS NULL
      ), 0) AS app_orders,
      COALESCE((
        SELECT COUNT(DISTINCT a.buyer_id)
        FROM app.buyer_app_activity a
        JOIN app.buyers b
          ON b.id = a.buyer_id
         AND b.tenant_id = a.tenant_id
        WHERE a.tenant_id = p_tenant_id
          AND a.deleted_at IS NULL
          AND a.qualifies_for_engagement = true
          AND a.occurred_day = p_date
          AND b.deleted_at IS NULL
          AND b.buyer_app_enabled = true
      ), 0) AS active_buyers,
      COALESCE((
        SELECT SUM(e.total_amount)
        FROM app.estimates e
        WHERE e.tenant_id = p_tenant_id
          AND e.is_buyer_app_estimate
          AND app.metric_day_ist(e.estimate_date, e.created_at) = p_date
          AND e.deleted_at IS NULL
      ), 0) AS app_estimates_value,
      COALESCE((
        SELECT COUNT(*)
        FROM app.estimates e
        WHERE e.tenant_id = p_tenant_id
          AND e.is_buyer_app_estimate
          AND app.metric_day_ist(e.estimate_date, e.created_at) = p_date
          AND e.deleted_at IS NULL
      ), 0) AS app_estimates_count,
      COALESCE((
        SELECT SUM(o.total_amount)
        FROM app.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.is_buyer_app_order
          AND app.order_status_is_downstream_quality(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) = p_date
          AND o.deleted_at IS NULL
      ), 0) AS converted_to_order_value,
      COALESCE((
        SELECT COUNT(*)
        FROM app.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.is_buyer_app_order
          AND app.order_status_is_downstream_quality(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) = p_date
          AND o.deleted_at IS NULL
      ), 0) AS converted_to_order_count,
      COALESCE((
        SELECT SUM(i.total_amount)
        FROM app.invoices i
        WHERE i.tenant_id = p_tenant_id
          AND i.is_buyer_app_invoice
          AND app.invoice_status_gmv_included(i.status)
          AND app.metric_day_ist(i.invoice_date, i.created_at) = p_date
          AND i.deleted_at IS NULL
      ), 0) AS invoiced_value,
      COALESCE((
        SELECT COUNT(*)
        FROM app.invoices i
        WHERE i.tenant_id = p_tenant_id
          AND i.is_buyer_app_invoice
          AND app.invoice_status_in_flow(i.status)
          AND app.metric_day_ist(i.invoice_date, i.created_at) = p_date
          AND i.deleted_at IS NULL
      ), 0) AS invoiced_count
  )
  INSERT INTO app.kpi_buyer_app_daily (
    tenant_id,
    snapshot_date,
    app_gmv,
    app_orders,
    active_buyers,
    app_estimates_value,
    app_estimates_count,
    converted_to_order_value,
    converted_to_order_count,
    invoiced_value,
    invoiced_count
  )
  SELECT
    tenant_id,
    snapshot_date,
    app_gmv,
    app_orders,
    active_buyers,
    app_estimates_value,
    app_estimates_count,
    converted_to_order_value,
    converted_to_order_count,
    invoiced_value,
    invoiced_count
  FROM metrics
  WHERE active_buyers > 0
     OR app_orders > 0
     OR app_estimates_count > 0
     OR converted_to_order_count > 0
     OR invoiced_count > 0
     OR app_gmv <> 0
     OR app_estimates_value <> 0
     OR converted_to_order_value <> 0
     OR invoiced_value <> 0;
$$;


ALTER FUNCTION "app"."refresh_buyer_app_daily"("p_tenant_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_buyer_app_snapshot"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_now timestamptz := now();
  v_month_start_ist date := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_next_month_start_ist date := (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date + interval '1 month')::date;
  v_30d_ago timestamptz := now() - interval '30 days';
BEGIN
  INSERT INTO app.buyer_app_snapshot (
    tenant_id,
    enabled_buyers,
    total_buyers,
    opened_app_mtd,
    ordered_mtd,
    repeat_mtd,
    app_gmv_mtd,
    app_orders_mtd,
    total_gmv_mtd,
    estimates_app_value_mtd,
    estimates_app_count_mtd,
    converted_order_value_mtd,
    converted_order_count_mtd,
    invoiced_app_value_mtd,
    invoiced_app_count_mtd,
    not_ordering_buyers,
    top_app_buyers_callout,
    no_app_buyers,
    top_app_buyers_card,
    top_locations,
    refreshed_at
  )
  WITH month_activity AS (
    SELECT
      a.buyer_id,
      COUNT(*)::bigint AS event_count,
      MAX(a.occurred_at) AS last_activity_at
    FROM app.buyer_app_activity a
    JOIN app.buyers b
      ON b.id = a.buyer_id
     AND b.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant_id
      AND a.deleted_at IS NULL
      AND a.qualifies_for_engagement = true
      AND a.occurred_day >= v_month_start_ist
      AND a.occurred_day < v_next_month_start_ist
      AND b.deleted_at IS NULL
      AND b.buyer_app_enabled = true
    GROUP BY a.buyer_id
  ),
  all_activity AS (
    SELECT
      a.buyer_id,
      MAX(a.occurred_at) AS last_activity_at
    FROM app.buyer_app_activity a
    WHERE a.tenant_id = p_tenant_id
      AND a.deleted_at IS NULL
      AND a.qualifies_for_engagement = true
    GROUP BY a.buyer_id
  )
  SELECT
    p_tenant_id,
    (SELECT COUNT(DISTINCT bu.buyer_id)
     FROM app.buyer_users bu
     JOIN app.buyers b ON b.id = bu.buyer_id
     WHERE b.tenant_id = p_tenant_id
       AND bu.is_active = true
       AND b.deleted_at IS NULL),
    (SELECT COUNT(*)
     FROM app.buyers b
     WHERE b.tenant_id = p_tenant_id
       AND b.deleted_at IS NULL
       AND b.is_active = true),
    (SELECT COUNT(*) FROM month_activity),
    (SELECT COUNT(DISTINCT o.buyer_id)
     FROM app.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.is_buyer_app_order
       AND app.order_status_in_flow(o.status)
       AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
       AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
       AND o.deleted_at IS NULL),
    (SELECT COUNT(*) FROM month_activity ma WHERE ma.event_count >= 2),
    COALESCE((SELECT SUM(o.total_amount)
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.is_buyer_app_order
        AND app.order_status_in_flow(o.status)
        AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
        AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
        AND o.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.is_buyer_app_order
       AND app.order_status_in_flow(o.status)
       AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
       AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
       AND o.deleted_at IS NULL),
    COALESCE((SELECT SUM(o.total_amount)
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND app.order_status_in_flow(o.status)
        AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
        AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
        AND o.deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(e.total_amount)
      FROM app.estimates e
      WHERE e.tenant_id = p_tenant_id
        AND e.is_buyer_app_estimate
        AND app.metric_day_ist(e.estimate_date, e.created_at) >= v_month_start_ist
        AND app.metric_day_ist(e.estimate_date, e.created_at) < v_next_month_start_ist
        AND e.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.estimates e
     WHERE e.tenant_id = p_tenant_id
       AND e.is_buyer_app_estimate
       AND app.metric_day_ist(e.estimate_date, e.created_at) >= v_month_start_ist
       AND app.metric_day_ist(e.estimate_date, e.created_at) < v_next_month_start_ist
       AND e.deleted_at IS NULL),
    COALESCE((SELECT SUM(o.total_amount)
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.is_buyer_app_order
        AND app.order_status_is_downstream_quality(o.status)
        AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
        AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
        AND o.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.is_buyer_app_order
       AND app.order_status_is_downstream_quality(o.status)
       AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
       AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
       AND o.deleted_at IS NULL),
    COALESCE((SELECT SUM(i.total_amount)
      FROM app.invoices i
      WHERE i.tenant_id = p_tenant_id
        AND i.is_buyer_app_invoice
        AND app.invoice_status_gmv_included(i.status)
        AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_month_start_ist
        AND app.metric_day_ist(i.invoice_date, i.created_at) < v_next_month_start_ist
        AND i.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.invoices i
     WHERE i.tenant_id = p_tenant_id
       AND i.is_buyer_app_invoice
       AND app.invoice_status_in_flow(i.status)
       AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_month_start_ist
       AND app.metric_day_ist(i.invoice_date, i.created_at) < v_next_month_start_ist
       AND i.deleted_at IS NULL),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s) ORDER BY s.days_inactive DESC)
      FROM (
        SELECT
          b.id AS buyer_id,
          b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          to_char(MIN(bu.created_at), 'DD Mon YYYY') AS enabled_date,
          EXTRACT(DAY FROM v_now - COALESCE(MAX(o.placed_at), aa.last_activity_at, MIN(bu.created_at)))::int AS days_inactive
        FROM app.buyers b
        JOIN app.buyer_users bu
          ON bu.buyer_id = b.id
         AND bu.is_active = true
        LEFT JOIN app.orders o
          ON o.buyer_id = b.id
         AND o.is_buyer_app_order
         AND app.order_status_in_flow(o.status)
         AND o.placed_at >= v_30d_ago
         AND o.deleted_at IS NULL
        LEFT JOIN all_activity aa
          ON aa.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id
          AND b.deleted_at IS NULL
          AND b.is_active = true
        GROUP BY b.id, b.business_name, aa.last_activity_at
        HAVING COUNT(o.id) = 0
        ORDER BY days_inactive DESC
        LIMIT 3
      ) s
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT
          b.id AS buyer_id,
          b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          COALESCE(SUM(o.total_amount), 0) AS gmv,
          COUNT(o.id) AS orders
        FROM app.buyers b
        JOIN app.orders o
          ON o.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id
          AND b.deleted_at IS NULL
          AND o.is_buyer_app_order
          AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
          AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
          AND o.deleted_at IS NULL
        GROUP BY b.id, b.business_name
        ORDER BY gmv DESC
        LIMIT 2
      ) s
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT
          b.id AS buyer_id,
          b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          COALESCE(SUM(o.total_amount), 0) AS offline_gmv
        FROM app.buyers b
        LEFT JOIN app.buyer_users bu
          ON bu.buyer_id = b.id
         AND bu.is_active = true
        LEFT JOIN app.orders o
          ON o.buyer_id = b.id
         AND app.order_status_in_flow(o.status)
         AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
         AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
         AND o.deleted_at IS NULL
        WHERE b.tenant_id = p_tenant_id
          AND b.deleted_at IS NULL
          AND b.is_active = true
          AND bu.id IS NULL
        GROUP BY b.id, b.business_name
        ORDER BY offline_gmv DESC
        LIMIT 3
      ) s
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT
          b.id AS buyer_id,
          b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          COALESCE(b.geography->>'city', '') AS city,
          COALESCE(SUM(o.total_amount), 0) AS gmv,
          COUNT(o.id) AS orders
        FROM app.buyers b
        JOIN app.orders o
          ON o.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id
          AND b.deleted_at IS NULL
          AND o.is_buyer_app_order
          AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
          AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
          AND o.deleted_at IS NULL
        GROUP BY b.id, b.business_name, b.geography
        ORDER BY gmv DESC
        LIMIT 5
      ) s
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT
          l.id AS location_id,
          l.name,
          COUNT(o.id) AS app_orders,
          COALESCE(SUM(o.total_amount), 0) AS app_gmv,
          ROUND(
            100.0 * COALESCE(SUM(o.total_amount), 0)
            / NULLIF((
              SELECT SUM(o2.total_amount)
              FROM app.orders o2
              WHERE o2.tenant_id = p_tenant_id
                AND o2.is_buyer_app_order
                AND app.order_status_in_flow(o2.status)
                AND app.metric_day_ist(o2.order_date, o2.created_at) >= v_month_start_ist
                AND app.metric_day_ist(o2.order_date, o2.created_at) < v_next_month_start_ist
                AND o2.deleted_at IS NULL
            ), 0),
            1
          ) AS share_pct
        FROM app.locations l
        JOIN app.orders o
          ON o.location_id = l.id
        WHERE l.tenant_id = p_tenant_id
          AND l.deleted_at IS NULL
          AND o.is_buyer_app_order
          AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
          AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
          AND o.deleted_at IS NULL
        GROUP BY l.id, l.name
        ORDER BY app_gmv DESC
        LIMIT 5
      ) s
    ), '[]'::jsonb),
    now()
  ON CONFLICT (tenant_id) DO UPDATE
  SET
    enabled_buyers = EXCLUDED.enabled_buyers,
    total_buyers = EXCLUDED.total_buyers,
    opened_app_mtd = EXCLUDED.opened_app_mtd,
    ordered_mtd = EXCLUDED.ordered_mtd,
    repeat_mtd = EXCLUDED.repeat_mtd,
    app_gmv_mtd = EXCLUDED.app_gmv_mtd,
    app_orders_mtd = EXCLUDED.app_orders_mtd,
    total_gmv_mtd = EXCLUDED.total_gmv_mtd,
    estimates_app_value_mtd = EXCLUDED.estimates_app_value_mtd,
    estimates_app_count_mtd = EXCLUDED.estimates_app_count_mtd,
    converted_order_value_mtd = EXCLUDED.converted_order_value_mtd,
    converted_order_count_mtd = EXCLUDED.converted_order_count_mtd,
    invoiced_app_value_mtd = EXCLUDED.invoiced_app_value_mtd,
    invoiced_app_count_mtd = EXCLUDED.invoiced_app_count_mtd,
    not_ordering_buyers = EXCLUDED.not_ordering_buyers,
    top_app_buyers_callout = EXCLUDED.top_app_buyers_callout,
    no_app_buyers = EXCLUDED.no_app_buyers,
    top_app_buyers_card = EXCLUDED.top_app_buyers_card,
    top_locations = EXCLUDED.top_locations,
    refreshed_at = EXCLUDED.refreshed_at;
END;
$$;


ALTER FUNCTION "app"."refresh_buyer_app_snapshot"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_buyer_current_snapshot"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  INSERT INTO app.buyer_current_snapshot (
    tenant_id,
    buyer_id,
    credit_limit,
    outstanding_dues,
    credit_used,
    available_credit,
    open_invoice_count,
    earliest_due_date,
    overdue_invoice_count,
    overdue_amount,
    open_orders_count,
    refreshed_at,
    updated_at
  )
  WITH invoice_rollup AS (
    SELECT
      i.buyer_id,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
      ), 0) AS outstanding_dues,
      COUNT(*) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
      )::bigint AS open_invoice_count,
      MIN(i.due_date) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
          AND i.due_date IS NOT NULL
      ) AS earliest_due_date,
      COUNT(*) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
          AND i.due_date IS NOT NULL
          AND (i.due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      )::bigint AS overdue_invoice_count,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
          AND i.due_date IS NOT NULL
          AND (i.due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      ), 0) AS overdue_amount
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
    GROUP BY i.buyer_id
  ),
  order_rollup AS (
    SELECT
      o.buyer_id,
      COUNT(*) FILTER (
        WHERE o.status IN (
          'draft',
          'open',
          'received',
          'confirmed',
          'partially_dispatched',
          'dispatched',
          'partially_invoiced',
          'overdue'
        )
      )::bigint AS open_orders_count
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
    GROUP BY o.buyer_id
  )
  SELECT
    b.tenant_id,
    b.id,
    COALESCE(b.credit_limit, 0) AS credit_limit,
    COALESCE(ir.outstanding_dues, 0) AS outstanding_dues,
    COALESCE(ir.outstanding_dues, 0) AS credit_used,
    GREATEST(COALESCE(b.credit_limit, 0) - COALESCE(ir.outstanding_dues, 0), 0) AS available_credit,
    COALESCE(ir.open_invoice_count, 0) AS open_invoice_count,
    ir.earliest_due_date,
    COALESCE(ir.overdue_invoice_count, 0) AS overdue_invoice_count,
    COALESCE(ir.overdue_amount, 0) AS overdue_amount,
    COALESCE(orx.open_orders_count, 0) AS open_orders_count,
    now(),
    now()
  FROM app.buyers b
  LEFT JOIN invoice_rollup ir
    ON ir.buyer_id = b.id
  LEFT JOIN order_rollup orx
    ON orx.buyer_id = b.id
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
  ON CONFLICT (tenant_id, buyer_id) DO UPDATE SET
    credit_limit = EXCLUDED.credit_limit,
    outstanding_dues = EXCLUDED.outstanding_dues,
    credit_used = EXCLUDED.credit_used,
    available_credit = EXCLUDED.available_credit,
    open_invoice_count = EXCLUDED.open_invoice_count,
    earliest_due_date = EXCLUDED.earliest_due_date,
    overdue_invoice_count = EXCLUDED.overdue_invoice_count,
    overdue_amount = EXCLUDED.overdue_amount,
    open_orders_count = EXCLUDED.open_orders_count,
    refreshed_at = EXCLUDED.refreshed_at,
    updated_at = EXCLUDED.updated_at;

  DELETE FROM app.buyer_current_snapshot snapshot
  WHERE snapshot.tenant_id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM app.buyers b
      WHERE b.tenant_id = p_tenant_id
        AND b.id = snapshot.buyer_id
        AND b.deleted_at IS NULL
    );
$$;


ALTER FUNCTION "app"."refresh_buyer_current_snapshot"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_buyers_snapshot"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
BEGIN
  DELETE FROM app.buyers_snapshot
  WHERE tenant_id = p_tenant_id;

  WITH base_buyers AS (
    SELECT
      b.id AS buyer_id,
      b.is_active,
      COALESCE(b.credit_limit, 0) AS credit_limit
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
  ),
  tenant_orders AS (
    SELECT
      o.buyer_id,
      COUNT(*) FILTER (
        WHERE o.status IN (
          'draft',
          'open',
          'received',
          'confirmed',
          'partially_dispatched',
          'dispatched',
          'partially_invoiced',
          'overdue'
        )
      )::bigint AS open_orders_count,
      MAX(COALESCE(o.placed_at, o.created_at, (o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'))) AS last_order_at
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.buyer_id IS NOT NULL
    GROUP BY o.buyer_id
  ),
  tenant_estimates AS (
    SELECT
      e.buyer_id,
      MAX(COALESCE((e.estimate_date::timestamp AT TIME ZONE 'Asia/Kolkata'), e.created_at)) AS last_estimate_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.buyer_id IS NOT NULL
    GROUP BY e.buyer_id
  ),
  tenant_invoices AS (
    SELECT
      i.buyer_id,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'issued', 'partially_paid', 'paid', 'overdue', 'unpaid', 'viewed')
      ), 0) AS outstanding_dues,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'issued', 'partially_paid', 'paid', 'overdue', 'unpaid', 'viewed')
          AND i.due_date IS NOT NULL
          AND i.due_date::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      ), 0) AS overdue_amount,
      MAX(COALESCE((i.invoice_date::timestamp AT TIME ZONE 'Asia/Kolkata'), i.created_at)) AS last_invoice_at
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
    GROUP BY i.buyer_id
  ),
  location_orders AS (
    SELECT
      o.buyer_id,
      o.location_id,
      COUNT(*) FILTER (
        WHERE o.status IN (
          'draft',
          'open',
          'received',
          'confirmed',
          'partially_dispatched',
          'dispatched',
          'partially_invoiced',
          'overdue'
        )
      )::bigint AS open_orders_count,
      MAX(COALESCE(o.placed_at, o.created_at, (o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'))) AS last_order_at
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.buyer_id IS NOT NULL
      AND o.location_id IS NOT NULL
    GROUP BY o.buyer_id, o.location_id
  ),
  location_estimates AS (
    SELECT
      e.buyer_id,
      e.location_id,
      MAX(COALESCE((e.estimate_date::timestamp AT TIME ZONE 'Asia/Kolkata'), e.created_at)) AS last_estimate_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.buyer_id IS NOT NULL
      AND e.location_id IS NOT NULL
    GROUP BY e.buyer_id, e.location_id
  ),
  location_invoices AS (
    SELECT
      i.buyer_id,
      i.location_id,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'issued', 'partially_paid', 'paid', 'overdue', 'unpaid', 'viewed')
      ), 0) AS outstanding_dues,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'issued', 'partially_paid', 'paid', 'overdue', 'unpaid', 'viewed')
          AND i.due_date IS NOT NULL
          AND i.due_date::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      ), 0) AS overdue_amount,
      MAX(COALESCE((i.invoice_date::timestamp AT TIME ZONE 'Asia/Kolkata'), i.created_at)) AS last_invoice_at
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
      AND i.location_id IS NOT NULL
    GROUP BY i.buyer_id, i.location_id
  ),
  location_keys AS (
    SELECT buyer_id, location_id FROM location_orders
    UNION
    SELECT buyer_id, location_id FROM location_estimates
    UNION
    SELECT buyer_id, location_id FROM location_invoices
  )
  INSERT INTO app.buyers_snapshot (
    tenant_id,
    buyer_id,
    scope,
    location_id,
    is_active,
    is_dormant,
    outstanding_dues,
    overdue_amount,
    credit_limit,
    open_orders_count,
    last_order_at,
    last_activity_at,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    b.buyer_id,
    'tenant',
    NULL,
    COALESCE(b.is_active, false),
    (
      NULLIF(
        GREATEST(
          COALESCE(o.last_order_at, '-infinity'::timestamptz),
          COALESCE(e.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(i.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) IS NULL
      OR NULLIF(
        GREATEST(
          COALESCE(o.last_order_at, '-infinity'::timestamptz),
          COALESCE(e.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(i.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) < now() - interval '30 days'
    ),
    COALESCE(i.outstanding_dues, 0),
    COALESCE(i.overdue_amount, 0),
    COALESCE(b.credit_limit, 0),
    COALESCE(o.open_orders_count, 0),
    o.last_order_at,
    NULLIF(
      GREATEST(
        COALESCE(o.last_order_at, '-infinity'::timestamptz),
        COALESCE(e.last_estimate_at, '-infinity'::timestamptz),
        COALESCE(i.last_invoice_at, '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ),
    now()
  FROM base_buyers b
  LEFT JOIN tenant_orders o ON o.buyer_id = b.buyer_id
  LEFT JOIN tenant_estimates e ON e.buyer_id = b.buyer_id
  LEFT JOIN tenant_invoices i ON i.buyer_id = b.buyer_id

  UNION ALL

  SELECT
    p_tenant_id,
    b.buyer_id,
    'location',
    lk.location_id,
    COALESCE(b.is_active, false),
    (
      NULLIF(
        GREATEST(
          COALESCE(lo.last_order_at, '-infinity'::timestamptz),
          COALESCE(le.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(li.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) IS NULL
      OR NULLIF(
        GREATEST(
          COALESCE(lo.last_order_at, '-infinity'::timestamptz),
          COALESCE(le.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(li.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) < now() - interval '30 days'
    ),
    COALESCE(li.outstanding_dues, 0),
    COALESCE(li.overdue_amount, 0),
    COALESCE(b.credit_limit, 0),
    COALESCE(lo.open_orders_count, 0),
    lo.last_order_at,
    NULLIF(
      GREATEST(
        COALESCE(lo.last_order_at, '-infinity'::timestamptz),
        COALESCE(le.last_estimate_at, '-infinity'::timestamptz),
        COALESCE(li.last_invoice_at, '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ),
    now()
  FROM base_buyers b
  JOIN location_keys lk
    ON lk.buyer_id = b.buyer_id
  LEFT JOIN location_orders lo
    ON lo.buyer_id = lk.buyer_id
   AND lo.location_id = lk.location_id
  LEFT JOIN location_estimates le
    ON le.buyer_id = lk.buyer_id
   AND le.location_id = lk.location_id
  LEFT JOIN location_invoices li
    ON li.buyer_id = lk.buyer_id
   AND li.location_id = lk.location_id;
END;
$$;


ALTER FUNCTION "app"."refresh_buyers_snapshot"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_categories_snapshot"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  INSERT INTO app.categories_snapshot (
    tenant_id, active_count, low_stock_count, uncategorized_count, refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(DISTINCT tp.tenant_category_id) FILTER (
      WHERE tp.is_active = true AND tp.deleted_at IS NULL AND tp.tenant_category_id IS NOT NULL
    ),
    COUNT(DISTINCT tp.tenant_category_id) FILTER (
      WHERE tp.is_active = true
        AND tp.deleted_at IS NULL
        AND tp.tenant_category_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM app.tenant_inventory ti
          WHERE ti.tenant_product_id = tp.id
            AND ti.deleted_at IS NULL
            AND ti.reorder_point IS NOT NULL
            AND ti.qty_available <= ti.reorder_point
        )
    ),
    COUNT(*) FILTER (
      WHERE tp.is_active = true AND tp.deleted_at IS NULL AND tp.tenant_category_id IS NULL
    ),
    now()
  FROM app.tenant_products tp
  WHERE tp.tenant_id = p_tenant_id
  ON CONFLICT (tenant_id) DO UPDATE SET
    active_count        = EXCLUDED.active_count,
    low_stock_count     = EXCLUDED.low_stock_count,
    uncategorized_count = EXCLUDED.uncategorized_count,
    refreshed_at        = EXCLUDED.refreshed_at;
$$;


ALTER FUNCTION "app"."refresh_categories_snapshot"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_cohort_by_id"("p_cohort_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_tenant_id uuid;
  v_buyer     record;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM app.cohorts
  WHERE id = p_cohort_id AND is_static = false AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_buyer IN
    SELECT id FROM app.buyers
    WHERE tenant_id = v_tenant_id AND deleted_at IS NULL AND is_active = true
  LOOP
    PERFORM app.evaluate_buyer_for_cohorts(v_buyer.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."refresh_cohort_by_id"("p_cohort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_estimates_snapshot"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  INSERT INTO app.estimates_snapshot (
    tenant_id,
    total_count,
    draft_count,
    sent_count,
    accepted_count,
    open_count,
    converted_count,
    expired_count,
    void_count,
    total_value,
    accepted_value,
    expiring_soon,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status = 'sent')::bigint,
    COUNT(*) FILTER (WHERE status = 'accepted')::bigint,
    COUNT(*) FILTER (WHERE app.estimate_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status IN ('converted', 'invoiced'))::bigint,
    COUNT(*) FILTER (WHERE status = 'expired')::bigint,
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'accepted'), 0),
    COUNT(*) FILTER (
      WHERE app.estimate_status_is_open(status)
        AND expires_at IS NOT NULL
        AND (expires_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND ((now() AT TIME ZONE 'Asia/Kolkata')::date + 7)
    )::bigint,
    now()
  FROM app.estimates
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count = EXCLUDED.total_count,
    draft_count = EXCLUDED.draft_count,
    sent_count = EXCLUDED.sent_count,
    accepted_count = EXCLUDED.accepted_count,
    open_count = EXCLUDED.open_count,
    converted_count = EXCLUDED.converted_count,
    expired_count = EXCLUDED.expired_count,
    void_count = EXCLUDED.void_count,
    total_value = EXCLUDED.total_value,
    accepted_value = EXCLUDED.accepted_value,
    expiring_soon = EXCLUDED.expiring_soon,
    refreshed_at = EXCLUDED.refreshed_at;
$$;


ALTER FUNCTION "app"."refresh_estimates_snapshot"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_invoices_snapshot"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  INSERT INTO app.invoices_snapshot (
    tenant_id,
    total_count,
    outstanding_count,
    outstanding_amt,
    overdue_count,
    overdue_amt,
    paid_count,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*) FILTER (WHERE app.invoice_status_in_flow(status))::bigint,
    COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(status, outstanding_balance))::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_status_has_receivable(status, outstanding_balance)
    ), 0),
    COUNT(*) FILTER (
      WHERE app.invoice_is_overdue(status, due_date, outstanding_balance)
    )::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_is_overdue(status, due_date, outstanding_balance)
    ), 0),
    COUNT(*) FILTER (WHERE status = 'paid')::bigint,
    now()
  FROM app.invoices
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count = EXCLUDED.total_count,
    outstanding_count = EXCLUDED.outstanding_count,
    outstanding_amt = EXCLUDED.outstanding_amt,
    overdue_count = EXCLUDED.overdue_count,
    overdue_amt = EXCLUDED.overdue_amt,
    paid_count = EXCLUDED.paid_count,
    refreshed_at = EXCLUDED.refreshed_at;
$$;


ALTER FUNCTION "app"."refresh_invoices_snapshot"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_kpi_brand_daily"("p_tenant_id" "uuid", "p_brand_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_gmv numeric(14,2);
  v_orders_count bigint;
  v_buyers_count bigint;
  v_units_sold bigint;
BEGIN
  DELETE FROM app.kpi_brand_daily
  WHERE tenant_id = p_tenant_id
    AND tenant_brand_id = p_brand_id
    AND day = p_day;

  SELECT
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COUNT(DISTINCT o.id)::bigint,
    COUNT(DISTINCT o.buyer_id)::bigint,
    COALESCE(SUM(oi.qty), 0)::bigint
  INTO v_gmv, v_orders_count, v_buyers_count, v_units_sold
  FROM app.order_items oi
  JOIN app.orders o
    ON o.id = oi.order_id
  JOIN app.tenant_products tp
    ON tp.id = oi.tenant_product_id
  WHERE o.tenant_id = p_tenant_id
    AND tp.tenant_brand_id = p_brand_id
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL
    AND tp.deleted_at IS NULL
    AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) = p_day;

  IF COALESCE(v_orders_count, 0) = 0
     AND COALESCE(v_gmv, 0) = 0
  THEN
    RETURN;
  END IF;

  INSERT INTO app.kpi_brand_daily (
    tenant_id,
    tenant_brand_id,
    day,
    gmv,
    orders_count,
    buyers_count,
    units_sold,
    updated_at
  )
  VALUES (
    p_tenant_id,
    p_brand_id,
    p_day,
    v_gmv,
    v_orders_count,
    v_buyers_count,
    v_units_sold,
    now()
  );
END;
$$;


ALTER FUNCTION "app"."refresh_kpi_brand_daily"("p_tenant_id" "uuid", "p_brand_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_kpi_buyers_daily"("p_tenant_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  DELETE FROM app.kpi_buyers_daily
  WHERE tenant_id = p_tenant_id
    AND day = p_day;

  WITH facts AS (
    SELECT
      p_tenant_id AS tenant_id,
      e.buyer_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(e.estimate_date, e.created_at) AS day,
      1::bigint AS estimates_count,
      0::bigint AS orders_count,
      0::bigint AS invoices_count,
      COALESCE(e.total_amount, 0)::numeric AS estimates_gmv,
      0::numeric AS orders_gmv,
      0::numeric AS invoices_gmv
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.buyer_id IS NOT NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      e.buyer_id,
      'location',
      e.location_id,
      app.metric_day_ist(e.estimate_date, e.created_at),
      1::bigint,
      0::bigint,
      0::bigint,
      COALESCE(e.total_amount, 0)::numeric,
      0::numeric,
      0::numeric
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.buyer_id IS NOT NULL
      AND e.location_id IS NOT NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      o.buyer_id,
      'tenant',
      NULL::uuid,
      app.metric_day_ist(o.order_date, o.created_at),
      0::bigint,
      1::bigint,
      0::bigint,
      0::numeric,
      COALESCE(o.total_amount, 0)::numeric,
      0::numeric
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.buyer_id IS NOT NULL
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      o.buyer_id,
      'location',
      o.location_id,
      app.metric_day_ist(o.order_date, o.created_at),
      0::bigint,
      1::bigint,
      0::bigint,
      0::numeric,
      COALESCE(o.total_amount, 0)::numeric,
      0::numeric
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.buyer_id IS NOT NULL
      AND o.location_id IS NOT NULL
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      i.buyer_id,
      'tenant',
      NULL::uuid,
      app.metric_day_ist(i.invoice_date, i.created_at),
      0::bigint,
      0::bigint,
      1::bigint,
      0::numeric,
      0::numeric,
      CASE
        WHEN app.invoice_status_gmv_included(i.status)
          THEN COALESCE(i.total_amount, 0)::numeric
        ELSE 0::numeric
      END
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
      AND app.invoice_status_in_flow(i.status)
      AND app.metric_day_ist(i.invoice_date, i.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      i.buyer_id,
      'location',
      i.location_id,
      app.metric_day_ist(i.invoice_date, i.created_at),
      0::bigint,
      0::bigint,
      1::bigint,
      0::numeric,
      0::numeric,
      CASE
        WHEN app.invoice_status_gmv_included(i.status)
          THEN COALESCE(i.total_amount, 0)::numeric
        ELSE 0::numeric
      END
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
      AND i.location_id IS NOT NULL
      AND app.invoice_status_in_flow(i.status)
      AND app.metric_day_ist(i.invoice_date, i.created_at) = p_day
  )
  INSERT INTO app.kpi_buyers_daily (
    tenant_id,
    buyer_id,
    scope,
    location_id,
    day,
    estimates_count,
    orders_count,
    invoices_count,
    estimates_gmv,
    orders_gmv,
    invoices_gmv,
    created_at,
    updated_at
  )
  SELECT
    tenant_id,
    buyer_id,
    scope,
    location_id,
    day,
    SUM(estimates_count)::bigint,
    SUM(orders_count)::bigint,
    SUM(invoices_count)::bigint,
    SUM(estimates_gmv)::numeric,
    SUM(orders_gmv)::numeric,
    SUM(invoices_gmv)::numeric,
    now(),
    now()
  FROM facts
  GROUP BY tenant_id, buyer_id, scope, location_id, day;
$$;


ALTER FUNCTION "app"."refresh_kpi_buyers_daily"("p_tenant_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_kpi_category_daily"("p_tenant_id" "uuid", "p_category_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_gmv numeric(14,2);
  v_units_sold bigint;
  v_orders_count bigint;
  v_buyers_count bigint;
BEGIN
  DELETE FROM app.kpi_category_daily
  WHERE tenant_id = p_tenant_id
    AND tenant_category_id = p_category_id
    AND day = p_day;

  SELECT
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COALESCE(SUM(oi.qty), 0)::bigint,
    COUNT(DISTINCT o.id)::bigint,
    COUNT(DISTINCT o.buyer_id)::bigint
  INTO v_gmv, v_units_sold, v_orders_count, v_buyers_count
  FROM app.order_items oi
  JOIN app.orders o
    ON o.id = oi.order_id
  JOIN app.tenant_products tp
    ON tp.id = oi.tenant_product_id
  WHERE o.tenant_id = p_tenant_id
    AND tp.tenant_category_id = p_category_id
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL
    AND tp.deleted_at IS NULL
    AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) = p_day;

  IF COALESCE(v_orders_count, 0) = 0
     AND COALESCE(v_gmv, 0) = 0
  THEN
    RETURN;
  END IF;

  INSERT INTO app.kpi_category_daily (
    tenant_id,
    tenant_category_id,
    day,
    gmv,
    units_sold,
    orders_count,
    buyers_count,
    updated_at
  )
  VALUES (
    p_tenant_id,
    p_category_id,
    p_day,
    v_gmv,
    v_units_sold,
    v_orders_count,
    v_buyers_count,
    now()
  );
END;
$$;


ALTER FUNCTION "app"."refresh_kpi_category_daily"("p_tenant_id" "uuid", "p_category_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_kpi_estimates_daily"("p_tenant_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
BEGIN
  DELETE FROM app.kpi_estimates_daily
  WHERE tenant_id = p_tenant_id
    AND day = p_day;

  INSERT INTO app.kpi_estimates_daily (
    tenant_id,
    scope,
    location_id,
    day,
    estimates_count,
    buyers_count,
    gmv,
    open_count,
    draft_count,
    sent_count,
    accepted_count,
    converted_count,
    declined_count,
    expired_count,
    void_count,
    expiring_soon_count,
    buyer_app_count,
    open_buyer_app_count,
    seller_count,
    updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*)::bigint,
    COUNT(DISTINCT buyer_id)::bigint,
    COALESCE(SUM(total_amount), 0),
    COUNT(*) FILTER (WHERE app.estimate_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status = 'sent')::bigint,
    COUNT(*) FILTER (WHERE status = 'accepted')::bigint,
    COUNT(*) FILTER (WHERE status IN ('converted', 'invoiced'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('declined', 'rejected'))::bigint,
    COUNT(*) FILTER (WHERE status = 'expired')::bigint,
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE app.estimate_status_is_open(status)
        AND expires_at IS NOT NULL
        AND (expires_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND ((now() AT TIME ZONE 'Asia/Kolkata')::date + 7)
    )::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_estimate = true)::bigint,
    COUNT(*) FILTER (
      WHERE is_buyer_app_estimate = true
        AND app.estimate_status_is_open(status)
    )::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_estimate = false)::bigint,
    now()
  FROM (
    SELECT
      e.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(e.estimate_date, e.created_at) AS day,
      e.buyer_id,
      e.total_amount,
      e.status,
      e.is_buyer_app_estimate,
      e.expires_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) = p_day

    UNION ALL

    SELECT
      e.tenant_id,
      'location'::text AS scope,
      e.location_id,
      app.metric_day_ist(e.estimate_date, e.created_at) AS day,
      e.buyer_id,
      e.total_amount,
      e.status,
      e.is_buyer_app_estimate,
      e.expires_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.location_id IS NOT NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) = p_day
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;


ALTER FUNCTION "app"."refresh_kpi_estimates_daily"("p_tenant_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_kpi_invoices_daily"("p_tenant_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
BEGIN
  DELETE FROM app.kpi_invoices_daily
  WHERE tenant_id = p_tenant_id
    AND day = p_day;

  INSERT INTO app.kpi_invoices_daily (
    tenant_id,
    scope,
    location_id,
    day,
    invoices_count,
    buyers_count,
    gmv,
    draft_count,
    sent_count,
    paid_count,
    overdue_count,
    overdue_amount,
    void_count,
    outstanding_count,
    outstanding_amount,
    buyer_app_count,
    updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*) FILTER (WHERE app.invoice_status_in_flow(status))::bigint,
    COUNT(DISTINCT buyer_id) FILTER (WHERE app.invoice_status_in_flow(status))::bigint,
    COALESCE(SUM(total_amount) FILTER (WHERE app.invoice_status_gmv_included(status)), 0),
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('sent', 'issued', 'unpaid', 'viewed', 'partially_paid'))::bigint,
    COUNT(*) FILTER (WHERE status = 'paid')::bigint,
    COUNT(*) FILTER (WHERE app.invoice_is_overdue(status, due_date, outstanding_balance))::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_is_overdue(status, due_date, outstanding_balance)
    ), 0),
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE app.invoice_status_has_receivable(status, outstanding_balance)
    )::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_status_has_receivable(status, outstanding_balance)
    ), 0),
    COUNT(*) FILTER (
      WHERE is_buyer_app_invoice = true
        AND app.invoice_status_in_flow(status)
    )::bigint,
    now()
  FROM (
    SELECT
      i.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(i.invoice_date, i.created_at) AS day,
      i.buyer_id,
      i.total_amount,
      i.status,
      i.is_buyer_app_invoice,
      COALESCE(i.outstanding_balance, 0) AS outstanding_balance,
      i.due_date
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) = p_day

    UNION ALL

    SELECT
      i.tenant_id,
      'location'::text AS scope,
      i.location_id,
      app.metric_day_ist(i.invoice_date, i.created_at) AS day,
      i.buyer_id,
      i.total_amount,
      i.status,
      i.is_buyer_app_invoice,
      COALESCE(i.outstanding_balance, 0) AS outstanding_balance,
      i.due_date
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.location_id IS NOT NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) = p_day
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;


ALTER FUNCTION "app"."refresh_kpi_invoices_daily"("p_tenant_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_kpi_location_daily"("p_tenant_id" "uuid", "p_location_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  DELETE FROM app.kpi_location_daily
  WHERE tenant_id = p_tenant_id
    AND location_id = p_location_id
    AND day = p_day;

  WITH order_facts AS (
    SELECT
      o.id,
      o.buyer_id,
      COALESCE(o.total_amount, 0)::numeric AS total_amount
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.location_id = p_location_id
      AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day
  ),
  item_facts AS (
    SELECT
      oi.order_id,
      COALESCE(SUM(oi.qty), 0)::int AS items_count
    FROM app.order_items oi
    JOIN order_facts ofa
      ON ofa.id = oi.order_id
    WHERE oi.deleted_at IS NULL
    GROUP BY oi.order_id
  )
  INSERT INTO app.kpi_location_daily (
    tenant_id,
    location_id,
    day,
    orders_count,
    buyers_count,
    gmv,
    items_count,
    updated_at
  )
  SELECT
    p_tenant_id,
    p_location_id,
    p_day,
    COUNT(*)::int,
    COUNT(DISTINCT ofa.buyer_id)::int,
    COALESCE(SUM(ofa.total_amount), 0)::numeric(14,2),
    COALESCE(SUM(COALESCE(ifa.items_count, 0)), 0)::int,
    now()
  FROM order_facts ofa
  LEFT JOIN item_facts ifa
    ON ifa.order_id = ofa.id;
$$;


ALTER FUNCTION "app"."refresh_kpi_location_daily"("p_tenant_id" "uuid", "p_location_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_kpi_orders_daily"("p_tenant_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
BEGIN
  DELETE FROM app.kpi_orders_daily
  WHERE tenant_id = p_tenant_id
    AND day = p_day;

  INSERT INTO app.kpi_orders_daily (
    tenant_id,
    scope,
    location_id,
    day,
    orders_count,
    buyers_count,
    gmv,
    open_count,
    draft_count,
    received_count,
    confirmed_count,
    partially_dispatched_count,
    dispatched_count,
    delivered_count,
    invoiced_count,
    partially_invoiced_count,
    overdue_count,
    cancelled_count,
    buyer_app_count,
    converted_estimate_count,
    updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COUNT(DISTINCT buyer_id) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COALESCE(SUM(total_amount) FILTER (WHERE app.order_status_in_flow(status)), 0),
    COUNT(*) FILTER (WHERE app.order_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('open', 'accepted', 'received'))::bigint,
    COUNT(*) FILTER (WHERE status = 'confirmed')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE status = 'invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'overdue')::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint,
    COUNT(*) FILTER (
      WHERE is_buyer_app_order = true
        AND app.order_status_in_flow(status)
    )::bigint,
    COUNT(*) FILTER (
      WHERE estimate_id IS NOT NULL
        AND app.order_status_is_downstream_quality(status)
    )::bigint,
    now()
  FROM (
    SELECT
      o.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      o.buyer_id,
      o.total_amount,
      o.status,
      o.is_buyer_app_order,
      o.estimate_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day

    UNION ALL

    SELECT
      o.tenant_id,
      'location'::text AS scope,
      o.location_id,
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      o.buyer_id,
      o.total_amount,
      o.status,
      o.is_buyer_app_order,
      o.estimate_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.location_id IS NOT NULL
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;


ALTER FUNCTION "app"."refresh_kpi_orders_daily"("p_tenant_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_kpi_product_daily"("p_tenant_id" "uuid", "p_tenant_product_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_units_sold int;
  v_revenue numeric(14,2);
  v_on_hand numeric(14,2);
BEGIN
  DELETE FROM app.kpi_product_daily
  WHERE tenant_id = p_tenant_id
    AND tenant_product_id = p_tenant_product_id
    AND day = p_day;

  SELECT
    COALESCE(SUM(oi.qty), 0)::int,
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COALESCE((
      SELECT SUM(ti.qty_available)
      FROM app.tenant_inventory ti
      WHERE ti.tenant_product_id = p_tenant_product_id
        AND ti.deleted_at IS NULL
    ), 0)::numeric(14,2)
  INTO v_units_sold, v_revenue, v_on_hand
  FROM app.order_items oi
  JOIN app.orders o
    ON o.id = oi.order_id
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND app.order_status_in_flow(o.status)
    AND oi.tenant_product_id = p_tenant_product_id
    AND oi.deleted_at IS NULL
    AND app.metric_day_ist(o.order_date, o.created_at) = p_day;

  IF COALESCE(v_units_sold, 0) = 0
     AND COALESCE(v_revenue, 0) = 0
     AND COALESCE(v_on_hand, 0) = 0
  THEN
    RETURN;
  END IF;

  INSERT INTO app.kpi_product_daily (
    tenant_id,
    tenant_product_id,
    day,
    units_sold,
    revenue,
    on_hand,
    updated_at
  )
  VALUES (
    p_tenant_id,
    p_tenant_product_id,
    p_day,
    COALESCE(v_units_sold, 0),
    COALESCE(v_revenue, 0),
    COALESCE(v_on_hand, 0),
    now()
  );
END;
$$;


ALTER FUNCTION "app"."refresh_kpi_product_daily"("p_tenant_id" "uuid", "p_tenant_product_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_kpi_tenant_daily"("p_tenant_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
BEGIN
  DELETE FROM app.kpi_tenant_daily
  WHERE tenant_id = p_tenant_id
    AND day = p_day;

  WITH order_facts AS (
    SELECT
      o.id,
      o.buyer_id,
      COALESCE(o.total_amount, 0)::numeric AS total_amount
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day
  ),
  item_facts AS (
    SELECT
      oi.order_id,
      COALESCE(SUM(oi.qty), 0)::int AS items_count
    FROM app.order_items oi
    JOIN order_facts ofa
      ON ofa.id = oi.order_id
    WHERE oi.deleted_at IS NULL
    GROUP BY oi.order_id
  )
  INSERT INTO app.kpi_tenant_daily (
    tenant_id,
    day,
    orders_count,
    buyers_count,
    gmv,
    items_count
  )
  SELECT
    p_tenant_id,
    p_day,
    COUNT(*)::int,
    COUNT(DISTINCT ofa.buyer_id)::int,
    COALESCE(SUM(ofa.total_amount), 0)::numeric(14,2),
    COALESCE(SUM(COALESCE(ifa.items_count, 0)), 0)::int
  FROM order_facts ofa
  LEFT JOIN item_facts ifa
    ON ifa.order_id = ofa.id;
END;
$$;


ALTER FUNCTION "app"."refresh_kpi_tenant_daily"("p_tenant_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_kpi_warehouse_daily"("p_tenant_id" "uuid", "p_warehouse_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  WITH posture AS (
    SELECT *
    FROM app.warehouse_inventory_posture(p_warehouse_id)
  ),
  sparse_delete AS (
    DELETE FROM app.kpi_warehouse_daily
    WHERE tenant_id    = p_tenant_id
      AND warehouse_id = p_warehouse_id
      AND day          = p_day
      AND EXISTS (
        SELECT 1 FROM posture
        WHERE tracked_skus = 0
          AND sellable_units = 0
          AND low_stock_skus = 0
          AND stockout_skus = 0
          AND idle_stock_skus = 0
      )
    RETURNING 1
  )
  INSERT INTO app.kpi_warehouse_daily (
    tenant_id,
    warehouse_id,
    day,
    tracked_skus,
    sellable_units,
    low_stock_skus,
    stockout_skus,
    idle_stock_skus,
    updated_at
  )
  SELECT
    p_tenant_id,
    p_warehouse_id,
    p_day,
    posture.tracked_skus,
    posture.sellable_units,
    posture.low_stock_skus,
    posture.stockout_skus,
    posture.idle_stock_skus,
    now()
  FROM posture
  WHERE posture.tracked_skus > 0
     OR posture.sellable_units > 0
     OR posture.low_stock_skus > 0
     OR posture.stockout_skus > 0
     OR posture.idle_stock_skus > 0
  ON CONFLICT (tenant_id, warehouse_id, day) DO UPDATE SET
    tracked_skus    = EXCLUDED.tracked_skus,
    sellable_units  = EXCLUDED.sellable_units,
    low_stock_skus  = EXCLUDED.low_stock_skus,
    stockout_skus   = EXCLUDED.stockout_skus,
    idle_stock_skus = EXCLUDED.idle_stock_skus,
    updated_at      = EXCLUDED.updated_at;
$$;


ALTER FUNCTION "app"."refresh_kpi_warehouse_daily"("p_tenant_id" "uuid", "p_warehouse_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_locations_snapshot"("p_location_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  INSERT INTO app.locations_snapshot (
    location_id, tenant_id,
    sku_count, oos_sku_count, low_stock_sku_count,
    outstanding_dues, oldest_unpaid_days, invoice_count,
    refreshed_at
  )
  SELECT
    l.id,
    l.tenant_id,
    COUNT(DISTINCT ti.tenant_product_id),
    COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE ti.qty_available <= 0),
    COUNT(DISTINCT ti.tenant_product_id) FILTER (
      WHERE ti.qty_available > 0
        AND ti.reorder_point IS NOT NULL
        AND ti.qty_available <= ti.reorder_point
    ),
    COALESCE(SUM(inv.outstanding_balance) FILTER (
      WHERE inv.status IN ('issued', 'partially_paid') AND inv.deleted_at IS NULL
    ), 0),
    MAX(
      EXTRACT(DAY FROM now() - inv.invoice_date)::integer
    ) FILTER (
      WHERE inv.status IN ('issued', 'partially_paid') AND inv.deleted_at IS NULL
    ),
    COUNT(inv.id) FILTER (
      WHERE inv.status IN ('issued', 'partially_paid') AND inv.deleted_at IS NULL
    ),
    now()
  FROM app.locations l
  LEFT JOIN app.warehouses wh
    ON wh.location_id = l.id
   AND wh.deleted_at IS NULL
  LEFT JOIN app.tenant_inventory ti
    ON ti.warehouse_id = wh.id
   AND ti.deleted_at IS NULL
  LEFT JOIN app.invoices inv
    ON inv.location_id = l.id
   AND inv.tenant_id = l.tenant_id
  WHERE l.id = p_location_id
  GROUP BY l.id, l.tenant_id
  ON CONFLICT (location_id) DO UPDATE SET
    tenant_id           = EXCLUDED.tenant_id,
    sku_count           = EXCLUDED.sku_count,
    oos_sku_count       = EXCLUDED.oos_sku_count,
    low_stock_sku_count = EXCLUDED.low_stock_sku_count,
    outstanding_dues    = EXCLUDED.outstanding_dues,
    oldest_unpaid_days  = EXCLUDED.oldest_unpaid_days,
    invoice_count       = EXCLUDED.invoice_count,
    refreshed_at        = EXCLUDED.refreshed_at;
$$;


ALTER FUNCTION "app"."refresh_locations_snapshot"("p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_orders_snapshot"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  INSERT INTO app.orders_snapshot (
    tenant_id,
    total_count,
    buyers_count,
    total_value,
    open_count,
    draft_count,
    received_count,
    confirmed_count,
    partially_dispatched_count,
    dispatched_count,
    delivered_count,
    invoiced_count,
    partially_invoiced_count,
    overdue_count,
    cancelled_count,
    buyer_app_count,
    converted_estimate_count,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COUNT(DISTINCT buyer_id) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COALESCE(SUM(total_amount) FILTER (WHERE app.order_status_in_flow(status)), 0),
    COUNT(*) FILTER (WHERE app.order_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('open', 'accepted', 'received'))::bigint,
    COUNT(*) FILTER (WHERE status = 'confirmed')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE status = 'invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'overdue')::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_order = true AND app.order_status_in_flow(status))::bigint,
    COUNT(*) FILTER (
      WHERE estimate_id IS NOT NULL
        AND app.order_status_is_downstream_quality(status)
    )::bigint,
    now()
  FROM app.orders
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count = EXCLUDED.total_count,
    buyers_count = EXCLUDED.buyers_count,
    total_value = EXCLUDED.total_value,
    open_count = EXCLUDED.open_count,
    draft_count = EXCLUDED.draft_count,
    received_count = EXCLUDED.received_count,
    confirmed_count = EXCLUDED.confirmed_count,
    partially_dispatched_count = EXCLUDED.partially_dispatched_count,
    dispatched_count = EXCLUDED.dispatched_count,
    delivered_count = EXCLUDED.delivered_count,
    invoiced_count = EXCLUDED.invoiced_count,
    partially_invoiced_count = EXCLUDED.partially_invoiced_count,
    overdue_count = EXCLUDED.overdue_count,
    cancelled_count = EXCLUDED.cancelled_count,
    buyer_app_count = EXCLUDED.buyer_app_count,
    converted_estimate_count = EXCLUDED.converted_estimate_count,
    refreshed_at = EXCLUDED.refreshed_at;
$$;


ALTER FUNCTION "app"."refresh_orders_snapshot"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_products_snapshot"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  INSERT INTO app.products_snapshot (
    tenant_id, total_count, active_count, low_stock_count, refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*),
    COUNT(*) FILTER (WHERE is_active = true),
    COUNT(*) FILTER (
      WHERE is_active = true
        AND EXISTS (
          SELECT 1 FROM app.tenant_inventory ti
          WHERE ti.tenant_product_id = tp.id
            AND ti.qty_available <= ti.reorder_point
        )
    ),
    now()
  FROM app.tenant_products tp
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count     = EXCLUDED.total_count,
    active_count    = EXCLUDED.active_count,
    low_stock_count = EXCLUDED.low_stock_count,
    refreshed_at    = EXCLUDED.refreshed_at;
$$;


ALTER FUNCTION "app"."refresh_products_snapshot"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_warehouses_snapshot"("p_warehouse_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  INSERT INTO app.warehouses_snapshot (
    warehouse_id,
    tenant_id,
    tracked_skus,
    sellable_units,
    low_stock_skus,
    stockout_skus,
    idle_stock_skus,
    last_inventory_update,
    refreshed_at
  )
  SELECT
    p_warehouse_id,
    posture.tenant_id,
    posture.tracked_skus,
    posture.sellable_units,
    posture.low_stock_skus,
    posture.stockout_skus,
    posture.idle_stock_skus,
    posture.last_inventory_update,
    now()
  FROM app.warehouse_inventory_posture(p_warehouse_id) AS posture
  ON CONFLICT (warehouse_id) DO UPDATE SET
    tenant_id             = EXCLUDED.tenant_id,
    tracked_skus          = EXCLUDED.tracked_skus,
    sellable_units        = EXCLUDED.sellable_units,
    low_stock_skus        = EXCLUDED.low_stock_skus,
    stockout_skus         = EXCLUDED.stockout_skus,
    idle_stock_skus       = EXCLUDED.idle_stock_skus,
    last_inventory_update = EXCLUDED.last_inventory_update,
    refreshed_at          = EXCLUDED.refreshed_at;
$$;


ALTER FUNCTION "app"."refresh_warehouses_snapshot"("p_warehouse_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."release_order_reservation"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM app.orders o
    WHERE o.id = p_order_id
      AND o.deleted_at IS NULL
      AND o.status = 'cancelled'
  )
  INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'order_not_cancelled_or_missing' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'reservation_not_implemented');
END;
$$;


ALTER FUNCTION "app"."release_order_reservation"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."reserve_inventory_for_invoice"("p_invoice_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
BEGIN
  -- Stub: real reservation when inventory_hold_point = invoice ships with inventory module.
  PERFORM 1 FROM app.invoices WHERE id = p_invoice_id AND deleted_at IS NULL;
END;
$$;


ALTER FUNCTION "app"."reserve_inventory_for_invoice"("p_invoice_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."resolve_broadcast_audience_all"("p_tenant_id" "uuid") RETURNS TABLE("buyer_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL;
$$;


ALTER FUNCTION "app"."resolve_broadcast_audience_all"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."resolve_broadcast_audience_buyer_selection"("p_tenant_id" "uuid", "p_buyer_ids" "uuid"[]) RETURNS TABLE("buyer_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id
    AND b.id = ANY (COALESCE(p_buyer_ids, ARRAY[]::uuid[]))
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL;
$$;


ALTER FUNCTION "app"."resolve_broadcast_audience_buyer_selection"("p_tenant_id" "uuid", "p_buyer_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."resolve_broadcast_audience_cohort"("p_tenant_id" "uuid", "p_cohort_id" "uuid") RETURNS TABLE("buyer_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  JOIN app.cohort_members cm ON cm.buyer_id = b.id
  JOIN app.cohorts c ON c.id = cm.cohort_id
  WHERE c.id = p_cohort_id
    AND c.tenant_id = p_tenant_id
    AND b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL;
$$;


ALTER FUNCTION "app"."resolve_broadcast_audience_cohort"("p_tenant_id" "uuid", "p_cohort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."resolve_broadcast_audience_dormant"("p_tenant_id" "uuid", "p_filter" "jsonb") RETURNS TABLE("buyer_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
  WITH last_order AS (
    SELECT o.buyer_id, MAX(o.placed_at) AS last_placed_at
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
    GROUP BY o.buyer_id
  )
  SELECT b.id AS buyer_id
  FROM app.buyers b
  LEFT JOIN last_order lo ON lo.buyer_id = b.id
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL
    AND (
      lo.last_placed_at IS NULL
      OR lo.last_placed_at < now() - make_interval(days => COALESCE((p_filter->>'dormant_days_gt')::integer, 45))
    );
$$;


ALTER FUNCTION "app"."resolve_broadcast_audience_dormant"("p_tenant_id" "uuid", "p_filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."resolve_broadcast_audience_dues"("p_tenant_id" "uuid", "p_filter" "jsonb" DEFAULT NULL::"jsonb") RETURNS TABLE("buyer_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
  SELECT DISTINCT b.id AS buyer_id
  FROM app.buyers b
  JOIN app.invoices i ON i.buyer_id = b.id AND i.tenant_id = b.tenant_id
  WHERE b.tenant_id = p_tenant_id
    AND i.status IN ('sent', 'unpaid', 'partially_paid', 'overdue', 'viewed')
    AND i.outstanding_balance > 0
    AND i.invoice_date + (b.payment_terms_days || ' days')::interval < now()
    AND (
      p_filter IS NULL OR p_filter->>'overdue_days_gt' IS NULL
      OR i.invoice_date + (b.payment_terms_days || ' days')::interval
           < now() - make_interval(days => (p_filter->>'overdue_days_gt')::integer)
    )
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL;
$$;


ALTER FUNCTION "app"."resolve_broadcast_audience_dues"("p_tenant_id" "uuid", "p_filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."resolve_broadcast_audience_geography"("p_tenant_id" "uuid", "p_filter" "jsonb") RETURNS TABLE("buyer_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL
    AND (p_filter->>'city' IS NULL OR b.geography->>'city' = p_filter->>'city')
    AND (p_filter->>'state' IS NULL OR b.geography->>'state' = p_filter->>'state')
    AND (p_filter->>'pincode' IS NULL OR b.geography->>'pincode' = p_filter->>'pincode')
    AND (p_filter->>'zone' IS NULL OR b.geography->>'zone' = p_filter->>'zone');
$$;


ALTER FUNCTION "app"."resolve_broadcast_audience_geography"("p_tenant_id" "uuid", "p_filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."resolve_price"("p_tenant_product_id" "uuid", "p_buyer_id" "uuid", "p_qty" numeric DEFAULT 1) RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'app', 'catalog', 'public'
    AS $$
DECLARE
  v_price numeric;
BEGIN
  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'buyer'
    AND pla.target_id = p_buyer_id
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  JOIN app.cohort_members cm ON cm.cohort_id = pla.target_id
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'cohort'
    AND cm.buyer_id = p_buyer_id
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'all_buyers'
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT base_selling_price INTO v_price
  FROM app.tenant_products
  WHERE id = p_tenant_product_id;

  RETURN v_price;
END;
$$;


ALTER FUNCTION "app"."resolve_price"("p_tenant_product_id" "uuid", "p_buyer_id" "uuid", "p_qty" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "app"."resolve_price"("p_tenant_product_id" "uuid", "p_buyer_id" "uuid", "p_qty" numeric) IS 'Resolves effective price for a buyer+product+qty. Resolution order: (1) catalog price_override, (2) buyer price list, (3) cohort price list, (4) all_buyers price list, (5) base_selling_price. Returns NULL if none set.';



CREATE OR REPLACE FUNCTION "app"."resolve_prices_batch"("p_tenant_product_ids" "uuid"[], "p_buyer_id" "uuid", "p_qty" numeric DEFAULT 1) RETURNS TABLE("tenant_product_id" "uuid", "unit_price" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'app', 'catalog', 'public'
    AS $$
  SELECT
    unnested.id,
    app.resolve_price(unnested.id, p_buyer_id, p_qty)
  FROM unnest(p_tenant_product_ids) AS unnested(id);
$$;


ALTER FUNCTION "app"."resolve_prices_batch"("p_tenant_product_ids" "uuid"[], "p_buyer_id" "uuid", "p_qty" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."retry_post_sync_rebuild_for_sync_job"("p_job_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_job app.integration_sync_jobs%ROWTYPE;
  v_days int;
BEGIN
  SELECT *
  INTO v_job
  FROM app.integration_sync_jobs
  WHERE id = p_job_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sync_job_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_days := app.sync_job_rebuild_days(v_job.job_type, v_job.since_date, 2);

  PERFORM app.post_sync_rebuild(v_job.tenant_id, v_days);

  UPDATE app.integration_sync_jobs
  SET
    error_log = NULL,
    progress = jsonb_set(
      jsonb_set(COALESCE(progress, '{}'::jsonb), '{meta,post_sync_rebuild_failed}', 'false'::jsonb, true),
      '{meta,post_sync_rebuild_last_retried_at}',
      to_jsonb(now()),
      true
    ),
    updated_at = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', p_job_id,
    'tenant_id', v_job.tenant_id,
    'days_rebuilt', v_days
  );
EXCEPTION WHEN others THEN
  UPDATE app.integration_sync_jobs
  SET
    error_log = jsonb_build_object(
      'message', SQLERRM,
      'stage', 'retry_post_sync_rebuild',
      'timestamp', now()
    ),
    progress = jsonb_set(
      COALESCE(progress, '{}'::jsonb),
      '{meta,post_sync_rebuild_failed}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
  WHERE id = p_job_id;
  RAISE;
END;
$$;


ALTER FUNCTION "app"."retry_post_sync_rebuild_for_sync_job"("p_job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."run_weekly_reco"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  rec record;
BEGIN
  -- Sequential per-tenant to avoid concurrent full table scans on Postgres.
  FOR rec IN
    SELECT DISTINCT ti.tenant_id
    FROM app.tenant_integrations ti
    WHERE ti.status = 'connected'
      AND ti.deleted_at IS NULL
    ORDER BY ti.tenant_id
  LOOP
    BEGIN
      PERFORM app.reco_compute_popularity(rec.tenant_id);
      PERFORM app.reco_compute_associations(rec.tenant_id);
      PERFORM app.reco_refresh_buyer_profiles(rec.tenant_id);
      PERFORM app.reco_compute_category_profiles(rec.tenant_id);
      PERFORM app.reco_compute_category_associations(rec.tenant_id);
      PERFORM app.reco_suggest_bundles(rec.tenant_id);
    EXCEPTION WHEN OTHERS THEN
      -- Skip this tenant on error; continue to the next.
      RAISE WARNING '[run_weekly_reco] tenant % failed: %', rec.tenant_id, SQLERRM;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "app"."run_weekly_reco"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."run_zoho_daily_sync_cron"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_functions_url text := 'https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1/integrations-sync';
BEGIN
  PERFORM net.http_post(
    url := v_functions_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-zoho-cron-token', ts.settings ->> 'zoho_daily_sync_cron_token'
    ),
    body := jsonb_build_object(
      'tenant_integration_id', ti.id,
      'job_type', 'incremental',
      'run_origin', 'scheduled',
      'sync_window', 'Last 24 hours'
    )
  )
  FROM app.tenant_integrations ti
  JOIN app.tenant_settings ts ON ts.tenant_id = ti.tenant_id
  WHERE ti.deleted_at IS NULL
    AND ti.status = 'connected'
    AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory')
    AND COALESCE(ts.settings ->> 'zoho_daily_sync_cron_token', '') <> ''
    AND EXISTS (
      SELECT 1
      FROM app.integration_data_flows f
      WHERE f.tenant_integration_id = ti.id
        AND f.deleted_at IS NULL
        AND f.is_active = true
        AND f.schedule = '0 5 * * *'
    );
END;
$$;


ALTER FUNCTION "app"."run_zoho_daily_sync_cron"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."run_zoho_orchestrator_cron"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_base_url text := 'https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1';
  v_secret   text := current_setting('app.integrations_dispatch_secret', true);
  v_hour     int  := EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Kolkata');
  v_min      int  := EXTRACT(MINUTE FROM now() AT TIME ZONE 'Asia/Kolkata');
  v_since    date := (now() AT TIME ZONE 'Asia/Kolkata')::date - 1;
BEGIN
  PERFORM app.reap_stale_sync_jobs();

  -- Daily incremental sync at 05:00–05:04 IST for tenants without an active master run.
  IF v_hour = 5 AND v_min < 5 THEN
    PERFORM net.http_post(
      url := v_base_url || '/integrations-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-integrations-dispatch-secret', COALESCE(v_secret, '')
      ),
      body := jsonb_build_object(
        'tenant_integration_id', ti.id,
        'job_type', 'incremental',
        'since', to_char(v_since, 'YYYY-MM-DD')
      )
    )
    FROM app.tenant_integrations ti
    WHERE ti.deleted_at IS NULL
      AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory')
      AND NOT EXISTS (
        SELECT 1 FROM app.integration_sync_jobs mj
        WHERE mj.tenant_integration_id = ti.id
          AND mj.phase = 'sync_run'
          AND mj.status IN ('pending', 'running', 'paused')
          AND COALESCE((mj.progress->'meta'->>'run_cancelled')::boolean, false) = false
          AND COALESCE((mj.progress->'meta'->>'run_halted')::boolean, false) = false
      );
  END IF;
END;
$$;


ALTER FUNCTION "app"."run_zoho_orchestrator_cron"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."run_zoho_sync_phase"("p_function_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_base_url text := 'https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1';
  v_secret   text := current_setting('app.integrations_dispatch_secret', true);
BEGIN
  PERFORM net.http_post(
    url := v_base_url || '/' || p_function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-integrations-dispatch-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object(
      'tenant_integration_id', ti.id,
      'job_type', 'incremental'
    )
  )
  FROM app.tenant_integrations ti
  WHERE ti.deleted_at IS NULL
    AND ti.status = 'connected'
    AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory');
END;
$$;


ALTER FUNCTION "app"."run_zoho_sync_phase"("p_function_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."search_products"("p_tenant_id" "uuid", "p_query" "text", "p_buyer_id" "uuid" DEFAULT NULL::"uuid", "p_price_list_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 12, "p_query_embedding" "public"."vector" DEFAULT NULL::"public"."vector", "p_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS TABLE("tenant_product_id" "uuid", "product_name" "text", "sku" "text", "brand_name" "text", "category_name" "text", "hsn_code" "text", "tax_pct" numeric, "on_hand" numeric, "unit_price" numeric, "mrp" numeric, "base_selling_price" numeric, "default_uom" "text", "pack_size" numeric, "search_rank" double precision)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app', 'catalog'
    AS $$
  WITH normalized AS (
    SELECT
      NULLIF(btrim(p_query), '') AS query,
      CASE
        WHEN NULLIF(btrim(p_query), '') IS NULL THEN NULL
        ELSE websearch_to_tsquery('english', NULLIF(btrim(p_query), ''))
      END AS ts_query,
      lower(NULLIF(btrim(p_query), '')) AS like_q,
      p_query_embedding AS query_embedding
  ),
  inventory AS (
    SELECT
      ti.tenant_product_id,
      SUM(COALESCE(ti.qty_available, 0))::numeric AS on_hand
    FROM app.tenant_inventory ti
    JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
    GROUP BY ti.tenant_product_id
  ),
  scoped_products AS (
    SELECT
      tp.id AS tenant_product_id,
      COALESCE(tp.name_override, cp.name, tp.internal_sku) AS product_name,
      tp.internal_sku AS sku,
      COALESCE(tb.display_name_override, cb.name, 'Brand') AS brand_name,
      COALESCE(tc.name, '') AS category_name,
      COALESCE(tp.hsn_code, cp.hsn_code) AS hsn_code,
      COALESCE(tp.gst_rate, cp.gst_rate) AS tax_pct,
      COALESCE(inv.on_hand, 0) AS on_hand,
      COALESCE(
        pl_override.price,
        CASE
          WHEN p_buyer_id IS NOT NULL THEN app.resolve_price(tp.id, p_buyer_id, 1)
          ELSE NULL
        END,
        tp.base_selling_price,
        0
      ) AS unit_price,
      COALESCE(tp.mrp, 0) AS mrp,
      tp.base_selling_price,
      tp.default_uom,
      tp.pack_size,
      tp.search_vector,
      tp.embedding,
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
    LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
    LEFT JOIN inventory inv ON inv.tenant_product_id = tp.id
    LEFT JOIN LATERAL (
      SELECT pli.price
      FROM app.price_list_items pli
      WHERE p_price_list_id IS NOT NULL
        AND pli.price_list_id = p_price_list_id
        AND pli.tenant_product_id = tp.id
        AND pli.deleted_at IS NULL
      ORDER BY pli.min_qty DESC, pli.created_at DESC
      LIMIT 1
    ) pl_override ON true
    WHERE tp.tenant_id = p_tenant_id
      AND tp.is_active = true
      AND tp.deleted_at IS NULL
      AND (p_ids IS NULL OR tp.id = ANY (p_ids))
  )
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
    COALESCE(
      CASE
        WHEN n.ts_query IS NOT NULL AND sp.search_vector @@ n.ts_query
          THEN ts_rank(sp.search_vector, n.ts_query)
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
  WHERE n.query IS NULL
    OR sp.search_text LIKE '%' || n.like_q || '%'
    OR (n.ts_query IS NOT NULL AND sp.search_vector @@ n.ts_query)
    OR (
      n.query_embedding IS NOT NULL
      AND sp.embedding IS NOT NULL
      AND (1 - (sp.embedding OPERATOR(public.<=>) n.query_embedding)) >= 0.15
    )
  ORDER BY
    search_rank DESC,
    sp.product_name ASC,
    sp.sku ASC
  LIMIT GREATEST(p_limit, 1);
$$;


ALTER FUNCTION "app"."search_products"("p_tenant_id" "uuid", "p_query" "text", "p_buyer_id" "uuid", "p_price_list_id" "uuid", "p_limit" integer, "p_query_embedding" "public"."vector", "p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."seed_system_field_mappings"("p_tenant_integration_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM app.tenant_integrations
  WHERE id = p_tenant_integration_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO app.tenant_field_mappings
    (tenant_id, tenant_integration_id, entity_type, zoho_field_name, target_column, transform_type, is_system)
  VALUES
    (v_tenant_id, p_tenant_integration_id, 'customers', 'cf_online_catalogue_status', 'buyer_app_enabled', 'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'estimates', 'cf_catalog_estimate',       'is_buyer_app_estimate', 'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'orders',    'cf_catalog_order',          'is_buyer_app_order',    'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'invoices',  'cf_catalog_invoice',        'is_buyer_app_invoice',  'boolean_from_zoho', true)
  ON CONFLICT (tenant_integration_id, entity_type, zoho_field_name) DO NOTHING;
END;
$$;


ALTER FUNCTION "app"."seed_system_field_mappings"("p_tenant_integration_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."set_is_buyer_app_estimate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.is_buyer_app_estimate := NEW.is_buyer_app_estimate OR (NEW.source = 'buyer_app');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."set_is_buyer_app_estimate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."set_is_buyer_app_invoice"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.is_buyer_app_invoice := NEW.is_buyer_app_invoice
    OR (NEW.order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM app.orders o
          WHERE o.id = NEW.order_id AND o.is_buyer_app_order
        ))
    OR (NEW.estimate_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM app.estimates e
          WHERE e.id = NEW.estimate_id AND e.is_buyer_app_estimate
        ));
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."set_is_buyer_app_invoice"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."set_is_buyer_app_order"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.is_buyer_app_order := NEW.is_buyer_app_order
    OR (NEW.source = 'buyer_app')
    OR (NEW.estimate_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM app.estimates e
          WHERE e.id = NEW.estimate_id AND e.is_buyer_app_estimate
        ));
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."set_is_buyer_app_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if app.sync_trigger_bypass_active() then
    return new;
  end if;

  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "app"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."sync_buyer_app_activity_from_estimate"("p_estimate_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_estimate app.estimates%ROWTYPE;
  v_metric_day date;
  v_occurred_at timestamptz;
BEGIN
  SELECT *
  INTO v_estimate
  FROM app.estimates
  WHERE id = p_estimate_id;

  IF NOT FOUND
     OR v_estimate.deleted_at IS NOT NULL
     OR NOT COALESCE(v_estimate.is_buyer_app_estimate, false)
     OR v_estimate.buyer_id IS NULL
  THEN
    UPDATE app.buyer_app_activity
    SET
      qualifies_for_engagement = false,
      deleted_at = now(),
      updated_by = auth.uid()
    WHERE event_source = 'estimate'
      AND source_entity_id = p_estimate_id
      AND deleted_at IS NULL;
    RETURN;
  END IF;

  v_metric_day := app.metric_day_ist(v_estimate.estimate_date, v_estimate.created_at);
  v_occurred_at := COALESCE(
    CASE
      WHEN v_estimate.estimate_date IS NOT NULL THEN make_timestamptz(
        EXTRACT(YEAR FROM v_estimate.estimate_date)::int,
        EXTRACT(MONTH FROM v_estimate.estimate_date)::int,
        EXTRACT(DAY FROM v_estimate.estimate_date)::int,
        12, 0, 0,
        'Asia/Kolkata'
      )
      ELSE NULL
    END,
    v_estimate.created_at,
    now()
  );

  INSERT INTO app.buyer_app_activity (
    tenant_id,
    buyer_id,
    location_id,
    event_name,
    event_source,
    source_entity_id,
    occurred_at,
    occurred_day,
    qualifies_for_engagement,
    metadata,
    idempotency_key,
    created_by,
    updated_by,
    deleted_at,
    external_ref
  )
  VALUES (
    v_estimate.tenant_id,
    v_estimate.buyer_id,
    v_estimate.location_id,
    'estimate_created',
    'estimate',
    v_estimate.id,
    v_occurred_at,
    v_metric_day,
    true,
    jsonb_build_object(
      'estimate_id', v_estimate.id,
      'is_buyer_app_estimate', v_estimate.is_buyer_app_estimate
    ),
    'estimate:' || v_estimate.id::text,
    COALESCE(v_estimate.created_by, auth.uid()),
    COALESCE(v_estimate.updated_by, auth.uid()),
    NULL,
    v_estimate.external_ref
  )
  ON CONFLICT (tenant_id, event_source, source_entity_id) DO UPDATE
  SET
    buyer_id = EXCLUDED.buyer_id,
    location_id = EXCLUDED.location_id,
    event_name = EXCLUDED.event_name,
    occurred_at = EXCLUDED.occurred_at,
    occurred_day = EXCLUDED.occurred_day,
    qualifies_for_engagement = true,
    metadata = EXCLUDED.metadata,
    updated_by = COALESCE(v_estimate.updated_by, auth.uid()),
    deleted_at = NULL,
    external_ref = EXCLUDED.external_ref;
END;
$$;


ALTER FUNCTION "app"."sync_buyer_app_activity_from_estimate"("p_estimate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."sync_buyer_app_activity_from_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_order app.orders%ROWTYPE;
  v_metric_day date;
  v_occurred_at timestamptz;
BEGIN
  SELECT *
  INTO v_order
  FROM app.orders
  WHERE id = p_order_id;

  IF NOT FOUND
     OR v_order.deleted_at IS NOT NULL
     OR NOT COALESCE(v_order.is_buyer_app_order, false)
     OR v_order.buyer_id IS NULL
  THEN
    UPDATE app.buyer_app_activity
    SET
      qualifies_for_engagement = false,
      deleted_at = now(),
      updated_by = auth.uid()
    WHERE event_source = 'order'
      AND source_entity_id = p_order_id
      AND deleted_at IS NULL;
    RETURN;
  END IF;

  v_metric_day := app.metric_day_ist(v_order.order_date, v_order.created_at);
  v_occurred_at := COALESCE(
    CASE
      WHEN v_order.order_date IS NOT NULL THEN make_timestamptz(
        EXTRACT(YEAR FROM v_order.order_date)::int,
        EXTRACT(MONTH FROM v_order.order_date)::int,
        EXTRACT(DAY FROM v_order.order_date)::int,
        12, 0, 0,
        'Asia/Kolkata'
      )
      ELSE NULL
    END,
    v_order.placed_at,
    v_order.created_at,
    now()
  );

  INSERT INTO app.buyer_app_activity (
    tenant_id,
    buyer_id,
    location_id,
    event_name,
    event_source,
    source_entity_id,
    occurred_at,
    occurred_day,
    qualifies_for_engagement,
    metadata,
    idempotency_key,
    created_by,
    updated_by,
    deleted_at,
    external_ref
  )
  VALUES (
    v_order.tenant_id,
    v_order.buyer_id,
    v_order.location_id,
    'order_created',
    'order',
    v_order.id,
    v_occurred_at,
    v_metric_day,
    true,
    jsonb_build_object(
      'order_id', v_order.id,
      'status', v_order.status,
      'is_buyer_app_order', v_order.is_buyer_app_order
    ),
    'order:' || v_order.id::text,
    COALESCE(v_order.created_by, auth.uid()),
    COALESCE(v_order.updated_by, auth.uid()),
    NULL,
    v_order.external_ref
  )
  ON CONFLICT (tenant_id, event_source, source_entity_id) DO UPDATE
  SET
    buyer_id = EXCLUDED.buyer_id,
    location_id = EXCLUDED.location_id,
    event_name = EXCLUDED.event_name,
    occurred_at = EXCLUDED.occurred_at,
    occurred_day = EXCLUDED.occurred_day,
    qualifies_for_engagement = true,
    metadata = EXCLUDED.metadata,
    updated_by = COALESCE(v_order.updated_by, auth.uid()),
    deleted_at = NULL,
    external_ref = EXCLUDED.external_ref;
END;
$$;


ALTER FUNCTION "app"."sync_buyer_app_activity_from_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."sync_job_rebuild_days"("p_job_type" "text", "p_since_date" timestamp with time zone, "p_default_days" integer DEFAULT 2) RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  SELECT GREATEST(
    CASE p_job_type
      WHEN 'initial_reference' THEN 90
      WHEN 'initial_transactional' THEN 90
      ELSE GREATEST(COALESCE(p_default_days, 2), 2)
    END,
    COALESCE(
      ((now() AT TIME ZONE 'Asia/Kolkata')::date - (p_since_date AT TIME ZONE 'Asia/Kolkata')::date) + 1,
      0
    )
  )::int;
$$;


ALTER FUNCTION "app"."sync_job_rebuild_days"("p_job_type" "text", "p_since_date" timestamp with time zone, "p_default_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."sync_trigger_bypass_active"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
  select coalesce(nullif(current_setting('app.integration_sync_bypass_triggers', true), ''), 'off')
    in ('on', 'true', '1')
$$;


ALTER FUNCTION "app"."sync_trigger_bypass_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."tenant_category_embedding_queue"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_product_id uuid;
BEGIN
  FOR v_product_id IN
    SELECT tp.id
    FROM app.tenant_products tp
    WHERE tp.tenant_category_id = NEW.id
      AND tp.deleted_at IS NULL
  LOOP
    PERFORM catalog.enqueue_embedding('app.tenant_products', v_product_id);
  END LOOP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."tenant_category_embedding_queue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."tenant_product_brand_embedding_queue"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_product_id uuid;
BEGIN
  FOR v_product_id IN
    SELECT tp.id
    FROM app.tenant_products tp
    WHERE tp.tenant_brand_id = NEW.id
      AND tp.deleted_at IS NULL
  LOOP
    PERFORM catalog.enqueue_embedding('app.tenant_products', v_product_id);
  END LOOP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."tenant_product_brand_embedding_queue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."tenant_products_embedding_queue"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM catalog.enqueue_embedding('app.tenant_products', NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."tenant_products_embedding_queue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."tenant_products_search_vector_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_master_name text;
  v_brand_name text;
  v_category_name text;
  v_master_attributes text;
  v_text text;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  SELECT cp.name, COALESCE(cp.attributes::text, '')
  INTO v_master_name, v_master_attributes
  FROM catalog.products cp
  WHERE cp.id = NEW.master_product_id;

  SELECT COALESCE(tb.display_name_override, cb.name)
  INTO v_brand_name
  FROM app.tenant_brands tb
  LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
  WHERE tb.id = NEW.tenant_brand_id;

  SELECT tc.name
  INTO v_category_name
  FROM app.tenant_categories tc
  WHERE tc.id = NEW.tenant_category_id;

  v_text := concat_ws(
    ' ',
    COALESCE(NEW.name_override, v_master_name, ''),
    COALESCE(NEW.internal_sku, ''),
    COALESCE(v_brand_name, ''),
    COALESCE(v_category_name, ''),
    COALESCE(NEW.hsn_code, ''),
    COALESCE(NEW.attributes_override::text, ''),
    COALESCE(v_master_attributes, '')
  );

  NEW.search_vector := to_tsvector('english', v_text);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."tenant_products_search_vector_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_buyer_geography_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.geography IS DISTINCT FROM OLD.geography THEN
    PERFORM app.evaluate_buyer_for_cohorts(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."trg_buyer_geography_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_estimates_refresh_buyer_app_daily"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_tenant uuid;
  target_date   date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' OR NEW.source = 'buyer_app' OR OLD.source = 'buyer_app' THEN
    target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    target_date   := (COALESCE(NEW.created_at, OLD.created_at) AT TIME ZONE 'Asia/Kolkata')::date;
    PERFORM app.refresh_buyer_app_daily(target_tenant, target_date);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_estimates_refresh_buyer_app_daily"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_inventory_campaign_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
BEGIN
  -- Log stock-in event if qty increased
  IF NEW.qty_available > COALESCE(OLD.qty_available, 0) THEN
    INSERT INTO app.stock_in_events (tenant_id, tenant_product_id, qty_delta)
    SELECT tp.tenant_id,
           NEW.tenant_product_id,
           NEW.qty_available - COALESCE(OLD.qty_available, 0)
    FROM app.tenant_products tp
    WHERE tp.id = NEW.tenant_product_id;
  END IF;

  -- Re-evaluate campaign membership for this product
  PERFORM app.evaluate_product_for_campaigns(NEW.tenant_product_id);

  -- Re-evaluate price-list membership for this product (Part 7)
  PERFORM app.evaluate_product_for_price_lists(NEW.tenant_product_id);

  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."trg_inventory_campaign_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_invoices_refresh_buyer_app_daily"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_tenant uuid;
  target_date   date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  target_date   := (COALESCE(NEW.invoice_date, OLD.invoice_date, now()::date)
                    AT TIME ZONE 'Asia/Kolkata')::date;
  PERFORM app.refresh_buyer_app_daily(target_tenant, target_date);
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_invoices_refresh_buyer_app_daily"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_order_buyer_cohort_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (
    TG_OP = 'UPDATE' AND (
      NEW.status        IS DISTINCT FROM OLD.status OR
      NEW.total_amount  IS DISTINCT FROM OLD.total_amount OR
      NEW.placed_at     IS DISTINCT FROM OLD.placed_at
    )
  ) THEN
    PERFORM app.evaluate_buyer_for_cohorts(NEW.buyer_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."trg_order_buyer_cohort_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_orders_refresh_buyer_app_daily"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_tenant uuid;
  target_date   date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' OR NEW.source = 'buyer_app' OR OLD.source = 'buyer_app' THEN
    target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    target_date   := (COALESCE(NEW.placed_at, OLD.placed_at) AT TIME ZONE 'Asia/Kolkata')::date;
    PERFORM app.refresh_buyer_app_daily(target_tenant, target_date);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_orders_refresh_buyer_app_daily"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_post_sync_rebuild"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    SET "statement_timeout" TO '0'
    AS $$
DECLARE
  v_days int;
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    IF NEW.phase IS DISTINCT FROM 'analysis'
       AND (
         NEW.progress->'meta'->>'sync_run_id' IS NOT NULL
         OR NEW.progress->'meta'->>'master_job_id' IS NOT NULL
       ) THEN
      RETURN NEW;
    END IF;

    IF NEW.job_type = 'initial_transactional'
       AND NEW.phase IN ('estimates', 'orders', 'invoices') THEN
      RETURN NEW;
    END IF;

    v_days := app.sync_job_rebuild_days(NEW.job_type, NEW.since_date, 2);

    BEGIN
      PERFORM app.post_sync_rebuild(NEW.tenant_id, v_days);

      UPDATE app.integration_sync_jobs
      SET
        error_log = NULL,
        progress = jsonb_set(
          jsonb_set(COALESCE(progress, '{}'::jsonb), '{meta,post_sync_rebuild_failed}', 'false'::jsonb, true),
          '{meta,post_sync_rebuild_days}',
          to_jsonb(v_days),
          true
        ),
        updated_at = now()
      WHERE id = NEW.id;
    EXCEPTION WHEN others THEN
      UPDATE app.integration_sync_jobs
      SET
        error_log = jsonb_build_object(
          'message', SQLERRM,
          'stage', 'post_sync_rebuild',
          'timestamp', now(),
          'days', v_days
        ),
        progress = jsonb_set(
          jsonb_set(COALESCE(progress, '{}'::jsonb), '{meta,post_sync_rebuild_failed}', 'true'::jsonb, true),
          '{meta,post_sync_rebuild_days}',
          to_jsonb(v_days),
          true
        ),
        updated_at = now()
      WHERE id = NEW.id;

      RAISE WARNING '[trg_post_sync_rebuild] post_sync_rebuild failed for job % (phase=%, type=%): %',
        NEW.id, NEW.phase, NEW.job_type, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."trg_post_sync_rebuild"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_brand_categories_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- When brand changes (re-assignment) or product deleted: refresh OLD brand
  IF TG_OP = 'DELETE' OR (
    TG_OP = 'UPDATE' AND
    OLD.tenant_brand_id IS DISTINCT FROM NEW.tenant_brand_id
  ) THEN
    PERFORM app.refresh_brand_categories(OLD.tenant_brand_id);
  END IF;

  -- For inserts and updates: refresh NEW brand
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM app.refresh_brand_categories(NEW.tenant_brand_id);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "app"."trg_refresh_brand_categories_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_buyer_app_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_tenant uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  PERFORM app.refresh_buyer_app_snapshot(target_tenant);
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_refresh_buyer_app_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_categories_snapshot_from_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_tenant uuid;
BEGIN
  SELECT tp.tenant_id INTO target_tenant
  FROM app.tenant_products tp
  WHERE tp.id = COALESCE(NEW.tenant_product_id, OLD.tenant_product_id);
  IF target_tenant IS NOT NULL THEN
    PERFORM app.refresh_categories_snapshot(target_tenant);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_refresh_categories_snapshot_from_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_categories_snapshot_from_products"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_tenant uuid;
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF target_tenant IS NOT NULL THEN
    PERFORM app.refresh_categories_snapshot(target_tenant);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_refresh_categories_snapshot_from_products"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_customers_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_tenant uuid;
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  PERFORM app.refresh_customers_snapshot(target_tenant);
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_refresh_customers_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_estimates_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
declare
  target_tenant uuid;
begin
  if app.sync_trigger_bypass_active() then
    return null;
  end if;

  target_tenant := coalesce(new.tenant_id, old.tenant_id);
  perform app.refresh_estimates_snapshot(target_tenant);
  return null;
end;
$$;


ALTER FUNCTION "app"."trg_refresh_estimates_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_invoices_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
declare
  target_tenant uuid;
begin
  if app.sync_trigger_bypass_active() then
    return null;
  end if;

  target_tenant := coalesce(new.tenant_id, old.tenant_id);
  perform app.refresh_invoices_snapshot(target_tenant);
  return null;
end;
$$;


ALTER FUNCTION "app"."trg_refresh_invoices_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_kpi_category_from_order_items"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_order_id   uuid;
  target_product_id uuid;
  target_tenant     uuid;
  target_category   uuid;
  target_day        date;
BEGIN
  target_order_id   := COALESCE(NEW.order_id, OLD.order_id);
  target_product_id := COALESCE(NEW.tenant_product_id, OLD.tenant_product_id);

  SELECT o.tenant_id,
         (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date,
         tp.tenant_category_id
    INTO target_tenant, target_day, target_category
  FROM app.orders o
  JOIN app.tenant_products tp ON tp.id = target_product_id
  WHERE o.id = target_order_id;

  IF target_tenant IS NOT NULL AND target_category IS NOT NULL AND target_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_category_daily(target_tenant, target_category, target_day);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "app"."trg_refresh_kpi_category_from_order_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_kpi_from_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  target_product_id uuid;
  target_tenant uuid;
  target_day date;
begin
  if app.sync_trigger_bypass_active() then
    return coalesce(new, old);
  end if;

  target_product_id := coalesce(new.tenant_product_id, old.tenant_product_id);
  target_day := (now() at time zone 'Asia/Kolkata')::date;

  select tp.tenant_id into target_tenant
  from app.tenant_products tp
  where tp.id = target_product_id;

  if target_tenant is not null and target_product_id is not null then
    perform app.refresh_kpi_product_daily(target_tenant, target_product_id, target_day);
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "app"."trg_refresh_kpi_from_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_kpi_from_order_items"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  target_order_id uuid;
  target_product_id uuid;
  target_tenant uuid;
  target_day date;
begin
  if app.sync_trigger_bypass_active() then
    return coalesce(new, old);
  end if;

  target_order_id := coalesce(new.order_id, old.order_id);
  target_product_id := coalesce(new.tenant_product_id, old.tenant_product_id);

  select o.tenant_id, (o.placed_at at time zone 'Asia/Kolkata')::date
    into target_tenant, target_day
  from app.orders o
  where o.id = target_order_id;

  if target_tenant is not null and target_day is not null then
    perform app.refresh_kpi_tenant_daily(target_tenant, target_day);
    if target_product_id is not null then
      perform app.refresh_kpi_product_daily(target_tenant, target_product_id, target_day);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "app"."trg_refresh_kpi_from_order_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_kpi_from_orders"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  target_tenant uuid;
  target_day date;
begin
  if app.sync_trigger_bypass_active() then
    return coalesce(new, old);
  end if;

  target_tenant := coalesce(new.tenant_id, old.tenant_id);
  target_day := (coalesce(new.placed_at, old.placed_at) at time zone 'Asia/Kolkata')::date;

  if target_tenant is not null and target_day is not null then
    perform app.refresh_kpi_tenant_daily(target_tenant, target_day);
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "app"."trg_refresh_kpi_from_orders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_kpi_location_daily"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_tenant   uuid;
  target_location uuid;
  target_day      date;
BEGIN
  target_tenant   := COALESCE(NEW.tenant_id, OLD.tenant_id);
  target_location := COALESCE(NEW.location_id, OLD.location_id);
  target_day      := COALESCE(NEW.placed_at, OLD.placed_at)::date;

  IF target_location IS NOT NULL AND target_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_location_daily(target_tenant, target_location, target_day);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_refresh_kpi_location_daily"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_locations_snapshot_from_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_location uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  target_location := COALESCE(NEW.location_id, OLD.location_id);
  IF target_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(target_location);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_refresh_locations_snapshot_from_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_locations_snapshot_from_invoices"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_location uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  target_location := COALESCE(NEW.location_id, OLD.location_id);
  IF target_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(target_location);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_refresh_locations_snapshot_from_invoices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_refresh_products_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
DECLARE
  target_tenant uuid;
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  PERFORM app.refresh_products_snapshot(target_tenant);
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_refresh_products_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_tenant_integrations_seed_field_mappings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
BEGIN
  IF NEW.integration_type_id = 'zoho_books' THEN
    PERFORM app.seed_system_field_mappings(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "app"."trg_tenant_integrations_seed_field_mappings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."update_tenant_settings"("p_tenant_id" "uuid", "p_actor_user_id" "uuid", "p_patch" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_prev jsonb;
  v_next jsonb;
BEGIN
  PERFORM app._tenant_settings_assert_seller_admin(p_tenant_id, p_actor_user_id);

  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RETURN;
  END IF;

  SELECT ts.settings INTO v_prev
  FROM app.tenant_settings ts
  WHERE ts.tenant_id = p_tenant_id
  FOR UPDATE;

  v_next := app.jsonb_deep_merge(COALESCE(v_prev, '{}'::jsonb), p_patch);

  INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
  VALUES (p_tenant_id, v_next, p_actor_user_id)
  ON CONFLICT (tenant_id) DO UPDATE SET
    settings   = EXCLUDED.settings,
    updated_at = now(),
    updated_by = p_actor_user_id;

  INSERT INTO app.audit_log (
    tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts
  ) VALUES (
    p_tenant_id,
    p_actor_user_id,
    'tenant_settings',
    p_tenant_id,
    'update',
    p_patch,
    now()
  );
END;
$$;


ALTER FUNCTION "app"."update_tenant_settings"("p_tenant_id" "uuid", "p_actor_user_id" "uuid", "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."upsert_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid", "p_secret" "jsonb", "p_secret_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app', 'vault'
    AS $$
DECLARE
  v_tenant_integration app.tenant_integrations%ROWTYPE;
  v_secret_id uuid;
BEGIN
  IF p_secret IS NULL OR p_secret = '{}'::jsonb THEN
    RAISE EXCEPTION 'secret payload required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = p_tenant_integration_id
    AND ti.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM app._tenant_integrations_assert_seller_admin(v_tenant_integration.tenant_id, p_actor_user_id);

  IF v_tenant_integration.vault_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets
    WHERE id = v_tenant_integration.vault_secret_id;
  END IF;

  SELECT vault.create_secret(
    p_secret::text,
    COALESCE(p_secret_name, v_tenant_integration.integration_type_id || '_' || v_tenant_integration.tenant_id::text)
  )
  INTO v_secret_id;

  UPDATE app.tenant_integrations
  SET
    vault_secret_id = v_secret_id,
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE id = p_tenant_integration_id;

  RETURN v_secret_id;
END;
$$;


ALTER FUNCTION "app"."upsert_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid", "p_secret" "jsonb", "p_secret_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."warehouse_inventory_posture"("p_warehouse_id" "uuid") RETURNS TABLE("tenant_id" "uuid", "tracked_skus" bigint, "sellable_units" bigint, "low_stock_skus" bigint, "stockout_skus" bigint, "idle_stock_skus" bigint, "last_inventory_update" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
  WITH inv AS (
    SELECT
      ti.tenant_product_id,
      GREATEST(0, COALESCE(ti.qty_available, 0) - COALESCE(ti.qty_reserved, 0)) AS sellable,
      ti.reorder_point,
      ti.updated_at,
      demand.last_demand_at
    FROM app.tenant_inventory ti
    LEFT JOIN LATERAL (
      SELECT MAX(o.placed_at) AS last_demand_at
      FROM app.order_items oi
      JOIN app.orders o ON o.id = oi.order_id
      WHERE oi.tenant_product_id = ti.tenant_product_id
        AND o.deleted_at IS NULL
        AND oi.deleted_at IS NULL
        AND o.status NOT IN ('cancelled', 'draft')
    ) demand ON true
    WHERE ti.warehouse_id = p_warehouse_id
      AND ti.deleted_at IS NULL
  )
  SELECT
    wh.tenant_id,
    COUNT(inv.tenant_product_id)::bigint,
    COALESCE(SUM(inv.sellable), 0)::bigint,
    COUNT(inv.tenant_product_id) FILTER (
      WHERE inv.sellable > 0
        AND inv.reorder_point IS NOT NULL
        AND inv.sellable < inv.reorder_point
    )::bigint,
    COUNT(inv.tenant_product_id) FILTER (
      WHERE inv.sellable <= 0
    )::bigint,
    COUNT(inv.tenant_product_id) FILTER (
      WHERE inv.sellable > 0
        AND (
          inv.last_demand_at IS NULL
          OR inv.last_demand_at < (now() - interval '30 days')
        )
    )::bigint,
    MAX(inv.updated_at)
  FROM app.warehouses wh
  LEFT JOIN inv ON true
  WHERE wh.id = p_warehouse_id
    AND wh.deleted_at IS NULL
  GROUP BY wh.tenant_id;
$$;


ALTER FUNCTION "app"."warehouse_inventory_posture"("p_warehouse_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."audit_log" (
    "id" bigint NOT NULL,
    "tenant_id" "uuid",
    "actor_user_id" "uuid",
    "entity_type" "text",
    "entity_id" "uuid",
    "action" "text",
    "diff" "jsonb",
    "ts" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "audit_log_action_check" CHECK (("action" = ANY (ARRAY['create'::"text", 'update'::"text", 'delete'::"text", 'publish'::"text", 'status_change'::"text"])))
);


ALTER TABLE "app"."audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "app"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "app"."audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "app"."audit_log_id_seq" OWNED BY "app"."audit_log"."id";



CREATE TABLE IF NOT EXISTS "app"."brands_snapshot" (
    "tenant_id" "uuid" NOT NULL,
    "total_count" bigint DEFAULT 0 NOT NULL,
    "active_count" bigint DEFAULT 0 NOT NULL,
    "with_products_count" bigint DEFAULT 0 NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."brands_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."buyer_app_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "event_name" "text" NOT NULL,
    "event_source" "text" DEFAULT 'route'::"text" NOT NULL,
    "source_entity_id" "uuid",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "occurred_day" "date" NOT NULL,
    "qualifies_for_engagement" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "idempotency_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text",
    CONSTRAINT "buyer_app_activity_event_name_check" CHECK (("btrim"("event_name") <> ''::"text")),
    CONSTRAINT "buyer_app_activity_event_source_check" CHECK (("event_source" = ANY (ARRAY['route'::"text", 'estimate'::"text", 'order'::"text"]))),
    CONSTRAINT "buyer_app_activity_route_source_entity_check" CHECK (((("event_source" = 'route'::"text") AND ("source_entity_id" IS NULL)) OR (("event_source" = ANY (ARRAY['estimate'::"text", 'order'::"text"])) AND ("source_entity_id" IS NOT NULL))))
);


ALTER TABLE "app"."buyer_app_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."buyer_app_snapshot" (
    "tenant_id" "uuid" NOT NULL,
    "enabled_buyers" bigint DEFAULT 0 NOT NULL,
    "total_buyers" bigint DEFAULT 0 NOT NULL,
    "opened_app_mtd" bigint DEFAULT 0 NOT NULL,
    "ordered_mtd" bigint DEFAULT 0 NOT NULL,
    "repeat_mtd" bigint DEFAULT 0 NOT NULL,
    "app_gmv_mtd" numeric DEFAULT 0 NOT NULL,
    "app_orders_mtd" bigint DEFAULT 0 NOT NULL,
    "total_gmv_mtd" numeric DEFAULT 0 NOT NULL,
    "estimates_app_value_mtd" numeric DEFAULT 0 NOT NULL,
    "estimates_app_count_mtd" bigint DEFAULT 0 NOT NULL,
    "converted_order_value_mtd" numeric DEFAULT 0 NOT NULL,
    "converted_order_count_mtd" bigint DEFAULT 0 NOT NULL,
    "invoiced_app_value_mtd" numeric DEFAULT 0 NOT NULL,
    "invoiced_app_count_mtd" bigint DEFAULT 0 NOT NULL,
    "not_ordering_buyers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "top_app_buyers_callout" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "no_app_buyers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "top_app_buyers_card" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "top_locations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."buyer_app_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."buyer_current_snapshot" (
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "credit_limit" numeric DEFAULT 0 NOT NULL,
    "outstanding_dues" numeric DEFAULT 0 NOT NULL,
    "credit_used" numeric DEFAULT 0 NOT NULL,
    "available_credit" numeric DEFAULT 0 NOT NULL,
    "open_invoice_count" bigint DEFAULT 0 NOT NULL,
    "earliest_due_date" timestamp with time zone,
    "overdue_invoice_count" bigint DEFAULT 0 NOT NULL,
    "overdue_amount" numeric DEFAULT 0 NOT NULL,
    "open_orders_count" bigint DEFAULT 0 NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."buyer_current_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."buyer_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "role" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "phone" "text",
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "designation" "text",
    "department" "text",
    "external_ref" "text",
    "search_vector" "tsvector",
    CONSTRAINT "buyer_users_role_check" CHECK (("role" = ANY (ARRAY['buyer_admin'::"text", 'buyer_assistant'::"text"])))
);


ALTER TABLE "app"."buyer_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."buyers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "business_name" "text" NOT NULL,
    "contact_name" "text",
    "phone" "text",
    "email" "text",
    "gstin" "text",
    "geography" "jsonb",
    "credit_limit" numeric DEFAULT 0,
    "payment_terms_days" integer DEFAULT 0,
    "tier" "text",
    "external_ref" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "default_cohort_id" "uuid",
    "buyer_app_enabled" boolean DEFAULT false NOT NULL,
    "search_vector" "tsvector",
    "gst_treatment" "text",
    "status" "text",
    "billing_address" "jsonb",
    "shipping_address" "jsonb",
    "whatsapp_consent_at" timestamp with time zone,
    "whatsapp_consent_method" "text" DEFAULT 'explicit_checkbox_first_login'::"text",
    "whatsapp_opt_out_at" timestamp with time zone,
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "buyers_phone_format" CHECK ((("phone" IS NULL) OR ("phone" ~ '^[0-9]{10}$'::"text"))),
    CONSTRAINT "buyers_tier_check" CHECK (("tier" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text"])))
);


ALTER TABLE "app"."buyers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."buyers_snapshot" (
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "scope" "text" NOT NULL,
    "location_id" "uuid",
    "is_active" boolean DEFAULT false NOT NULL,
    "is_dormant" boolean DEFAULT false NOT NULL,
    "outstanding_dues" numeric DEFAULT 0 NOT NULL,
    "overdue_amount" numeric DEFAULT 0 NOT NULL,
    "credit_limit" numeric DEFAULT 0 NOT NULL,
    "open_orders_count" bigint DEFAULT 0 NOT NULL,
    "last_order_at" timestamp with time zone,
    "last_activity_at" timestamp with time zone,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "buyers_snapshot_check" CHECK (((("scope" = 'tenant'::"text") AND ("location_id" IS NULL)) OR (("scope" = 'location'::"text") AND ("location_id" IS NOT NULL)))),
    CONSTRAINT "buyers_snapshot_scope_check" CHECK (("scope" = ANY (ARRAY['tenant'::"text", 'location'::"text"])))
);


ALTER TABLE "app"."buyers_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."campaign_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "tenant_product_id" "uuid" NOT NULL,
    "is_featured" boolean DEFAULT false,
    "display_order" integer,
    "price_override" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "app"."campaign_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."campaign_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "view_date" "date" DEFAULT ("timezone"('UTC'::"text", "now"()))::"date" NOT NULL,
    CONSTRAINT "catalog_views_source_check" CHECK (("source" = ANY (ARRAY['buyer_app'::"text", 'guest_link'::"text", 'cockpit'::"text"])))
);


ALTER TABLE "app"."campaign_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "scope_type" "text" NOT NULL,
    "scope_value" "jsonb",
    "valid_from" timestamp with time zone NOT NULL,
    "valid_to" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text",
    "hero_image_url" "text",
    "message" "text",
    "share_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "r2_hero_original_key" "text",
    "r2_hero_medium_key" "text",
    "is_dynamic" boolean DEFAULT false NOT NULL,
    "dynamic_rules" "jsonb",
    CONSTRAINT "published_catalogs_scope_type_check" CHECK (("scope_type" = ANY (ARRAY['cohort'::"text", 'buyer'::"text", 'geography'::"text", 'all'::"text"]))),
    CONSTRAINT "published_catalogs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);

ALTER TABLE ONLY "app"."campaigns" REPLICA IDENTITY FULL;


ALTER TABLE "app"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."categories_snapshot" (
    "tenant_id" "uuid" NOT NULL,
    "active_count" bigint DEFAULT 0 NOT NULL,
    "low_stock_count" bigint DEFAULT 0 NOT NULL,
    "uncategorized_count" bigint DEFAULT 0 NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."categories_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."cohort_members" (
    "cohort_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL
);


ALTER TABLE "app"."cohort_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."cohorts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "rules" "jsonb",
    "is_static" boolean DEFAULT false,
    "cached_member_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "allowed_tenant_brand_ids" "uuid"[],
    "last_refreshed_at" timestamp with time zone
);


ALTER TABLE "app"."cohorts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."credit_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "invoice_id" "uuid",
    "amount" numeric NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "credit_notes_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "credit_notes_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'issued'::"text", 'applied'::"text", 'void'::"text"])))
);


ALTER TABLE "app"."credit_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."email_verification_otps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "otp" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "verified_at" timestamp with time zone,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "app"."email_verification_otps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."estimate_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "estimate_id" "uuid" NOT NULL,
    "tenant_product_id" "uuid" NOT NULL,
    "qty" numeric NOT NULL,
    "unit_price" numeric NOT NULL,
    "tax_rate" numeric,
    "line_total" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "discount_pct" numeric DEFAULT 0,
    "disc_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "tax_pct" numeric(5,2),
    "scheme_tag" "text",
    "external_ref" "text",
    "sku" "text",
    "hsn_code" "text",
    "item_order" integer
);


ALTER TABLE "app"."estimate_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."estimates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid",
    "estimate_number" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "campaign_id" "uuid",
    "subtotal" numeric,
    "tax_amount" numeric,
    "total_amount" numeric,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "notes" "text",
    "cart_hash" "text",
    "source" "text" DEFAULT 'buyer_app'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "converted_to_order_id" "uuid",
    "converted_to_invoice_id" "uuid",
    "external_ref" "text",
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "valid_until" "date" DEFAULT (CURRENT_DATE + 14),
    "estimate_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "buyer_po_ref" "text",
    "discount_flat" numeric(12,2) DEFAULT 0 NOT NULL,
    "freight" numeric(12,2) DEFAULT 0 NOT NULL,
    "round_off" numeric(12,2) DEFAULT 0 NOT NULL,
    "sent_channel" "text",
    "viewed_at" timestamp with time zone,
    "viewed_by_name" "text",
    "voided_at" timestamp with time zone,
    "estimate_version" integer DEFAULT 1 NOT NULL,
    "seller_note" "text",
    "place_of_supply" "text" DEFAULT 'Unknown'::"text" NOT NULL,
    "location_id" "uuid",
    "estimate_url" "text",
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_buyer_app_estimate" boolean DEFAULT false NOT NULL,
    CONSTRAINT "estimates_sent_channel_check" CHECK ((("sent_channel" IS NULL) OR ("sent_channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text", 'download'::"text"])))),
    CONSTRAINT "estimates_source_check" CHECK (("source" = ANY (ARRAY['buyer_app'::"text", 'seller'::"text", 'zoho_import'::"text"]))),
    CONSTRAINT "estimates_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text", 'invoiced'::"text", 'converted'::"text", 'void'::"text"])))
);

ALTER TABLE ONLY "app"."estimates" REPLICA IDENTITY FULL;


ALTER TABLE "app"."estimates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."estimates_snapshot" (
    "tenant_id" "uuid" NOT NULL,
    "total_count" bigint DEFAULT 0 NOT NULL,
    "draft_count" bigint DEFAULT 0 NOT NULL,
    "sent_count" bigint DEFAULT 0 NOT NULL,
    "accepted_count" bigint DEFAULT 0 NOT NULL,
    "total_value" numeric DEFAULT 0 NOT NULL,
    "accepted_value" numeric DEFAULT 0 NOT NULL,
    "expiring_soon" bigint DEFAULT 0 NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "open_count" bigint DEFAULT 0 NOT NULL,
    "converted_count" bigint DEFAULT 0 NOT NULL,
    "expired_count" bigint DEFAULT 0 NOT NULL,
    "void_count" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "app"."estimates_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."integration_data_flows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_integration_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "trigger_type" "text" NOT NULL,
    "schedule" "text",
    "webhook_id" "uuid",
    "field_mappings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_run_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text",
    CONSTRAINT "integration_data_flows_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text", 'bidirectional'::"text"]))),
    CONSTRAINT "integration_data_flows_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['locations'::"text", 'warehouses'::"text", 'categories'::"text", 'brands'::"text", 'products'::"text", 'pricelists'::"text", 'customers'::"text", 'contact_persons'::"text", 'estimates'::"text", 'orders'::"text", 'invoices'::"text", 'price_lists'::"text", 'price_list_items'::"text", 'buyer_users'::"text", 'tenant_inventory'::"text", 'estimate_items'::"text", 'order_items'::"text", 'invoice_items'::"text"]))),
    CONSTRAINT "integration_data_flows_schedule_required_check" CHECK ((("trigger_type" <> 'scheduled'::"text") OR ("schedule" IS NOT NULL))),
    CONSTRAINT "integration_data_flows_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['webhook'::"text", 'scheduled'::"text", 'event'::"text"]))),
    CONSTRAINT "integration_data_flows_webhook_required_check" CHECK ((("trigger_type" <> 'webhook'::"text") OR ("webhook_id" IS NOT NULL)))
);


ALTER TABLE "app"."integration_data_flows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."integration_entity_map" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_integration_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "internal_id" "uuid" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "sync_status" "text",
    "external_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text",
    "error_reason" "text",
    "source_payload" "jsonb",
    CONSTRAINT "integration_entity_map_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['locations'::"text", 'warehouses'::"text", 'categories'::"text", 'brands'::"text", 'products'::"text", 'pricelists'::"text", 'customers'::"text", 'contact_persons'::"text", 'estimates'::"text", 'orders'::"text", 'invoices'::"text", 'price_lists'::"text", 'price_list_items'::"text", 'buyer_users'::"text", 'tenant_inventory'::"text", 'estimate_items'::"text", 'order_items'::"text", 'invoice_items'::"text"]))),
    CONSTRAINT "integration_entity_map_sync_status_check" CHECK ((("sync_status" IS NULL) OR ("sync_status" = ANY (ARRAY['synced'::"text", 'pending_push'::"text", 'conflict'::"text", 'error'::"text"]))))
);


ALTER TABLE "app"."integration_entity_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."integration_oauth_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_token" "text" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "integration_type_id" "text" NOT NULL,
    "org_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval) NOT NULL,
    "requested_by" "uuid"
);


ALTER TABLE "app"."integration_oauth_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."integration_sync_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_integration_id" "uuid" NOT NULL,
    "job_type" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "progress" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_log" "jsonb",
    "summary" "jsonb",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "triggered_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text",
    "phase" "text",
    "records_synced" integer,
    "since_date" timestamp with time zone,
    CONSTRAINT "integration_sync_jobs_job_type_check" CHECK (("job_type" = ANY (ARRAY['initial_reference'::"text", 'initial_transactional'::"text", 'incremental'::"text", 'manual'::"text"]))),
    CONSTRAINT "integration_sync_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'queued'::"text", 'running'::"text", 'paused'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "app"."integration_sync_jobs" REPLICA IDENTITY FULL;


ALTER TABLE "app"."integration_sync_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."integration_webhook_echo_guards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_integration_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "local_entity_id" "uuid",
    "external_entity_id" "text",
    "protected_fields" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text"
);


ALTER TABLE "app"."integration_webhook_echo_guards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."integration_webhook_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_integration_id" "uuid" NOT NULL,
    "integration_webhook_event_id" "uuid",
    "integration_webhook_id" "uuid",
    "provider" "text" DEFAULT 'zoho'::"text" NOT NULL,
    "entity_type" "text",
    "event_type" "text",
    "stage" "text" NOT NULL,
    "reason_code" "text",
    "message" "text" NOT NULL,
    "retryable" boolean DEFAULT false NOT NULL,
    "debug_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text"
);


ALTER TABLE "app"."integration_webhook_errors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."integration_webhook_event_changes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_integration_id" "uuid" NOT NULL,
    "integration_webhook_event_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "target_table" "text" NOT NULL,
    "target_entity_type" "text" NOT NULL,
    "target_row_id" "uuid",
    "operation" "text" NOT NULL,
    "merge_decision" "text",
    "before_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "after_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "delta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text",
    CONSTRAINT "integration_webhook_event_changes_operation_check" CHECK (("operation" = ANY (ARRAY['create'::"text", 'update'::"text", 'soft_delete'::"text", 'skip'::"text", 'conflict'::"text"])))
);


ALTER TABLE "app"."integration_webhook_event_changes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."integration_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_integration_id" "uuid" NOT NULL,
    "integration_webhook_id" "uuid",
    "provider" "text" DEFAULT 'zoho'::"text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "event_type" "text",
    "external_entity_id" "text",
    "remote_webhook_id" "text",
    "request_headers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "request_query" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "normalized_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "processing_status" "text" DEFAULT 'received'::"text" NOT NULL,
    "source_created_at" timestamp with time zone,
    "source_updated_at" timestamp with time zone,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "replay_count" integer DEFAULT 0 NOT NULL,
    "replay_of_event_id" "uuid",
    "runtime_meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text",
    CONSTRAINT "integration_webhook_events_status_check" CHECK (("processing_status" = ANY (ARRAY['received'::"text", 'processing'::"text", 'processed'::"text", 'failed'::"text", 'ignored'::"text"])))
);


ALTER TABLE "app"."integration_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."integration_webhooks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_integration_id" "uuid" NOT NULL,
    "endpoint_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_types" "text"[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text",
    "provider" "text" DEFAULT 'zoho'::"text" NOT NULL,
    "entity_type" "text",
    "remote_webhook_id" "text",
    "secret" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "webhook_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_verified_at" timestamp with time zone,
    "last_received_at" timestamp with time zone,
    "rule_type" "text",
    CONSTRAINT "integration_webhooks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'failed'::"text", 'disabled'::"text"])))
);


ALTER TABLE "app"."integration_webhooks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "tenant_product_id" "uuid" NOT NULL,
    "qty" numeric NOT NULL,
    "unit_price" numeric NOT NULL,
    "tax_rate" numeric,
    "line_total" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "sku" "text",
    "hsn_code" "text",
    "disc_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "tax_pct" numeric(5,2),
    "scheme_tag" "text",
    "external_ref" "text",
    "item_order" integer
);


ALTER TABLE "app"."invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid",
    "order_id" "uuid",
    "invoice_number" "text" NOT NULL,
    "invoice_date" "date" NOT NULL,
    "status" "text" NOT NULL,
    "subtotal" numeric DEFAULT 0,
    "tax_amount" numeric DEFAULT 0,
    "total_amount" numeric DEFAULT 0,
    "outstanding_balance" numeric DEFAULT 0,
    "external_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "due_date" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "estimate_id" "uuid",
    "notes" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "buyer_po_ref" "text",
    "discount_flat" numeric(12,2) DEFAULT 0 NOT NULL,
    "freight" numeric(12,2) DEFAULT 0 NOT NULL,
    "round_off" numeric(12,2) DEFAULT 0 NOT NULL,
    "sent_at" timestamp with time zone,
    "sent_channel" "text",
    "gstin_locked" boolean DEFAULT false NOT NULL,
    "hsn_locked" boolean DEFAULT false NOT NULL,
    "voided_at" timestamp with time zone,
    "void_reason" "text",
    "amount_paid" numeric(12,2) DEFAULT 0 NOT NULL,
    "payment_reference" "text",
    "viewed_at" timestamp with time zone,
    "viewed_by_name" "text",
    "last_reminder_at" timestamp with time zone,
    "payment_method" "text",
    "intra_state_tax" boolean DEFAULT true NOT NULL,
    "place_of_supply" "text" DEFAULT 'Unknown'::"text" NOT NULL,
    "notes_for_buyer" "text",
    "seller_note" "text",
    "location_id" "uuid",
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_buyer_app_invoice" boolean DEFAULT false NOT NULL,
    CONSTRAINT "invoices_sent_channel_check" CHECK ((("sent_channel" IS NULL) OR ("sent_channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text", 'download'::"text"])))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'paid'::"text", 'overdue'::"text", 'void'::"text", 'unpaid'::"text", 'partially_paid'::"text", 'viewed'::"text"])))
);

ALTER TABLE ONLY "app"."invoices" REPLICA IDENTITY FULL;


ALTER TABLE "app"."invoices" OWNER TO "postgres";


COMMENT ON COLUMN "app"."invoices"."payment_reference" IS 'Optional reference when marking invoice paid (e.g. UPI ref).';



COMMENT ON COLUMN "app"."invoices"."viewed_at" IS 'When buyer first opened invoice link (optional).';



COMMENT ON COLUMN "app"."invoices"."viewed_by_name" IS 'Display name for viewed-by line in DocStatusBand.';



COMMENT ON COLUMN "app"."invoices"."last_reminder_at" IS 'Last reminder sent (WhatsApp/email).';



COMMENT ON COLUMN "app"."invoices"."payment_method" IS 'UPI / Bank transfer / Cheque / Cash when paid.';



COMMENT ON COLUMN "app"."invoices"."intra_state_tax" IS 'Snapshot: CGST+SGST vs IGST; set when gstin_locked at send.';



CREATE TABLE IF NOT EXISTS "app"."invoices_snapshot" (
    "tenant_id" "uuid" NOT NULL,
    "total_count" bigint DEFAULT 0 NOT NULL,
    "outstanding_amt" numeric DEFAULT 0 NOT NULL,
    "overdue_count" bigint DEFAULT 0 NOT NULL,
    "overdue_amt" numeric DEFAULT 0 NOT NULL,
    "paid_count" bigint DEFAULT 0 NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "outstanding_count" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "app"."invoices_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."kpi_brand_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_brand_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "gmv" numeric(14,2) DEFAULT 0 NOT NULL,
    "orders_count" bigint DEFAULT 0 NOT NULL,
    "buyers_count" bigint DEFAULT 0 NOT NULL,
    "units_sold" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."kpi_brand_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."kpi_buyer_app_daily" (
    "tenant_id" "uuid" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "app_gmv" numeric DEFAULT 0 NOT NULL,
    "app_orders" bigint DEFAULT 0 NOT NULL,
    "active_buyers" bigint DEFAULT 0 NOT NULL,
    "app_estimates_value" numeric DEFAULT 0 NOT NULL,
    "app_estimates_count" bigint DEFAULT 0 NOT NULL,
    "converted_to_order_value" numeric DEFAULT 0 NOT NULL,
    "converted_to_order_count" bigint DEFAULT 0 NOT NULL,
    "invoiced_value" numeric DEFAULT 0 NOT NULL,
    "invoiced_count" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "app"."kpi_buyer_app_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."kpi_buyers_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "scope" "text" NOT NULL,
    "location_id" "uuid",
    "day" "date" NOT NULL,
    "estimates_count" bigint DEFAULT 0 NOT NULL,
    "orders_count" bigint DEFAULT 0 NOT NULL,
    "invoices_count" bigint DEFAULT 0 NOT NULL,
    "estimates_gmv" numeric DEFAULT 0 NOT NULL,
    "orders_gmv" numeric DEFAULT 0 NOT NULL,
    "invoices_gmv" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kpi_buyers_daily_check" CHECK (((("scope" = 'tenant'::"text") AND ("location_id" IS NULL)) OR (("scope" = 'location'::"text") AND ("location_id" IS NOT NULL)))),
    CONSTRAINT "kpi_buyers_daily_scope_check" CHECK (("scope" = ANY (ARRAY['tenant'::"text", 'location'::"text"])))
);


ALTER TABLE "app"."kpi_buyers_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."kpi_category_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_category_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "gmv" numeric(14,2) DEFAULT 0 NOT NULL,
    "units_sold" bigint DEFAULT 0 NOT NULL,
    "orders_count" bigint DEFAULT 0 NOT NULL,
    "buyers_count" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."kpi_category_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."kpi_estimates_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "scope" "text" NOT NULL,
    "location_id" "uuid",
    "day" "date" NOT NULL,
    "estimates_count" bigint DEFAULT 0 NOT NULL,
    "buyers_count" bigint DEFAULT 0 NOT NULL,
    "gmv" numeric DEFAULT 0 NOT NULL,
    "open_count" bigint DEFAULT 0 NOT NULL,
    "draft_count" bigint DEFAULT 0 NOT NULL,
    "sent_count" bigint DEFAULT 0 NOT NULL,
    "accepted_count" bigint DEFAULT 0 NOT NULL,
    "converted_count" bigint DEFAULT 0 NOT NULL,
    "declined_count" bigint DEFAULT 0 NOT NULL,
    "expired_count" bigint DEFAULT 0 NOT NULL,
    "void_count" bigint DEFAULT 0 NOT NULL,
    "expiring_soon_count" bigint DEFAULT 0 NOT NULL,
    "buyer_app_count" bigint DEFAULT 0 NOT NULL,
    "open_buyer_app_count" bigint DEFAULT 0 NOT NULL,
    "seller_count" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kpi_estimates_daily_check" CHECK (((("scope" = 'tenant'::"text") AND ("location_id" IS NULL)) OR (("scope" = 'location'::"text") AND ("location_id" IS NOT NULL)))),
    CONSTRAINT "kpi_estimates_daily_scope_check" CHECK (("scope" = ANY (ARRAY['tenant'::"text", 'location'::"text"])))
);


ALTER TABLE "app"."kpi_estimates_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."kpi_invoices_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "scope" "text" NOT NULL,
    "location_id" "uuid",
    "day" "date" NOT NULL,
    "invoices_count" bigint DEFAULT 0 NOT NULL,
    "buyers_count" bigint DEFAULT 0 NOT NULL,
    "gmv" numeric DEFAULT 0 NOT NULL,
    "draft_count" bigint DEFAULT 0 NOT NULL,
    "sent_count" bigint DEFAULT 0 NOT NULL,
    "paid_count" bigint DEFAULT 0 NOT NULL,
    "overdue_count" bigint DEFAULT 0 NOT NULL,
    "overdue_amount" numeric DEFAULT 0 NOT NULL,
    "void_count" bigint DEFAULT 0 NOT NULL,
    "outstanding_count" bigint DEFAULT 0 NOT NULL,
    "outstanding_amount" numeric DEFAULT 0 NOT NULL,
    "buyer_app_count" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kpi_invoices_daily_check" CHECK (((("scope" = 'tenant'::"text") AND ("location_id" IS NULL)) OR (("scope" = 'location'::"text") AND ("location_id" IS NOT NULL)))),
    CONSTRAINT "kpi_invoices_daily_scope_check" CHECK (("scope" = ANY (ARRAY['tenant'::"text", 'location'::"text"])))
);


ALTER TABLE "app"."kpi_invoices_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."kpi_location_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "orders_count" integer DEFAULT 0 NOT NULL,
    "buyers_count" integer DEFAULT 0 NOT NULL,
    "gmv" numeric(14,2) DEFAULT 0 NOT NULL,
    "items_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."kpi_location_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."kpi_orders_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "scope" "text" NOT NULL,
    "location_id" "uuid",
    "day" "date" NOT NULL,
    "orders_count" bigint DEFAULT 0 NOT NULL,
    "buyers_count" bigint DEFAULT 0 NOT NULL,
    "gmv" numeric DEFAULT 0 NOT NULL,
    "open_count" bigint DEFAULT 0 NOT NULL,
    "draft_count" bigint DEFAULT 0 NOT NULL,
    "received_count" bigint DEFAULT 0 NOT NULL,
    "confirmed_count" bigint DEFAULT 0 NOT NULL,
    "partially_dispatched_count" bigint DEFAULT 0 NOT NULL,
    "dispatched_count" bigint DEFAULT 0 NOT NULL,
    "delivered_count" bigint DEFAULT 0 NOT NULL,
    "invoiced_count" bigint DEFAULT 0 NOT NULL,
    "partially_invoiced_count" bigint DEFAULT 0 NOT NULL,
    "overdue_count" bigint DEFAULT 0 NOT NULL,
    "cancelled_count" bigint DEFAULT 0 NOT NULL,
    "buyer_app_count" bigint DEFAULT 0 NOT NULL,
    "converted_estimate_count" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kpi_orders_daily_check" CHECK (((("scope" = 'tenant'::"text") AND ("location_id" IS NULL)) OR (("scope" = 'location'::"text") AND ("location_id" IS NOT NULL)))),
    CONSTRAINT "kpi_orders_daily_scope_check" CHECK (("scope" = ANY (ARRAY['tenant'::"text", 'location'::"text"])))
);


ALTER TABLE "app"."kpi_orders_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."kpi_product_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_product_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "units_sold" integer DEFAULT 0 NOT NULL,
    "revenue" numeric(14,2) DEFAULT 0 NOT NULL,
    "on_hand" numeric(14,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text"
);


ALTER TABLE "app"."kpi_product_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."kpi_tenant_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "orders_count" integer DEFAULT 0 NOT NULL,
    "buyers_count" integer DEFAULT 0 NOT NULL,
    "gmv" numeric(14,2) DEFAULT 0 NOT NULL,
    "items_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text"
);


ALTER TABLE "app"."kpi_tenant_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."kpi_warehouse_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "tracked_skus" bigint DEFAULT 0 NOT NULL,
    "sellable_units" bigint DEFAULT 0 NOT NULL,
    "low_stock_skus" bigint DEFAULT 0 NOT NULL,
    "stockout_skus" bigint DEFAULT 0 NOT NULL,
    "idle_stock_skus" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."kpi_warehouse_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "jsonb",
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text",
    "lat" numeric(10,7),
    "lng" numeric(10,7),
    "phone_number" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "associated_users" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "locations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "app"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."locations_snapshot" (
    "location_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "sku_count" bigint DEFAULT 0 NOT NULL,
    "oos_sku_count" bigint DEFAULT 0 NOT NULL,
    "low_stock_sku_count" bigint DEFAULT 0 NOT NULL,
    "outstanding_dues" numeric DEFAULT 0 NOT NULL,
    "oldest_unpaid_days" integer,
    "invoice_count" bigint DEFAULT 0 NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."locations_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "tenant_product_id" "uuid" NOT NULL,
    "qty" numeric NOT NULL,
    "unit_price" numeric NOT NULL,
    "tax_rate" numeric,
    "line_total" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "disc_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "tax_pct" numeric(5,2),
    "scheme_tag" "text",
    "on_hand_at_confirm" integer,
    "external_ref" "text",
    "sku" "text",
    "hsn_code" "text",
    "item_order" integer
);


ALTER TABLE "app"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid",
    "placed_by" "uuid",
    "order_number" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text",
    "source" "text",
    "campaign_id" "uuid",
    "subtotal" numeric,
    "tax_amount" numeric,
    "total_amount" numeric,
    "currency" "text" DEFAULT 'INR'::"text",
    "notes" "text",
    "placed_at" timestamp with time zone,
    "external_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "estimate_id" "uuid",
    "buyer_po_ref" "text",
    "discount_flat" numeric(12,2) DEFAULT 0 NOT NULL,
    "freight" numeric(12,2) DEFAULT 0 NOT NULL,
    "round_off" numeric(12,2) DEFAULT 0 NOT NULL,
    "has_backorder" boolean DEFAULT false NOT NULL,
    "expected_delivery" "date",
    "received_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "dispatched_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "carrier" "text",
    "dispatch_notes" "text",
    "cancel_reason" "text",
    "seller_note" "text",
    "tally_export_id" "uuid",
    "tally_exported_at" timestamp with time zone,
    "location_id" "uuid",
    "place_of_supply" "text" DEFAULT 'Unknown'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "sent_channel" "text",
    "order_date" "date" DEFAULT (("now"() AT TIME ZONE 'Asia/Kolkata'::"text"))::"date" NOT NULL,
    "is_buyer_app_order" boolean DEFAULT false NOT NULL,
    "order_url" "text",
    CONSTRAINT "orders_sent_channel_check" CHECK ((("sent_channel" IS NULL) OR ("sent_channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text", 'download'::"text"])))),
    CONSTRAINT "orders_source_check" CHECK (("source" = ANY (ARRAY['buyer_app'::"text", 'cockpit_manual'::"text", 'csv_import'::"text", 'zoho_import'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'received'::"text", 'confirmed'::"text", 'partially_dispatched'::"text", 'dispatched'::"text", 'delivered'::"text", 'cancelled'::"text", 'open'::"text", 'invoiced'::"text", 'partially_invoiced'::"text", 'overdue'::"text"])))
);

ALTER TABLE ONLY "app"."orders" REPLICA IDENTITY FULL;


ALTER TABLE "app"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."orders_snapshot" (
    "tenant_id" "uuid" NOT NULL,
    "total_count" bigint DEFAULT 0 NOT NULL,
    "buyers_count" bigint DEFAULT 0 NOT NULL,
    "total_value" numeric DEFAULT 0 NOT NULL,
    "open_count" bigint DEFAULT 0 NOT NULL,
    "draft_count" bigint DEFAULT 0 NOT NULL,
    "received_count" bigint DEFAULT 0 NOT NULL,
    "confirmed_count" bigint DEFAULT 0 NOT NULL,
    "partially_dispatched_count" bigint DEFAULT 0 NOT NULL,
    "dispatched_count" bigint DEFAULT 0 NOT NULL,
    "delivered_count" bigint DEFAULT 0 NOT NULL,
    "invoiced_count" bigint DEFAULT 0 NOT NULL,
    "partially_invoiced_count" bigint DEFAULT 0 NOT NULL,
    "overdue_count" bigint DEFAULT 0 NOT NULL,
    "cancelled_count" bigint DEFAULT 0 NOT NULL,
    "buyer_app_count" bigint DEFAULT 0 NOT NULL,
    "converted_estimate_count" bigint DEFAULT 0 NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."orders_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."otp_sessions" (
    "ref_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "otp" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "expires_at" bigint NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "candidates" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "otp_sessions_kind_check" CHECK (("kind" = ANY (ARRAY['pending'::"text", 'verified'::"text"])))
);


ALTER TABLE "app"."otp_sessions" OWNER TO "postgres";


COMMENT ON TABLE "app"."otp_sessions" IS 'Temporary OTP session records for phone-based login flow. Designed to work across serverless instances.';



CREATE TABLE IF NOT EXISTS "app"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "invoice_id" "uuid",
    "amount" numeric NOT NULL,
    "status" "text" DEFAULT 'recorded'::"text" NOT NULL,
    "mode" "text",
    "paid_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "payments_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['recorded'::"text", 'pending'::"text", 'cleared'::"text", 'failed'::"text", 'void'::"text"])))
);


ALTER TABLE "app"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."platform_admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "app"."platform_admins" OWNER TO "postgres";


COMMENT ON TABLE "app"."platform_admins" IS 'DealFlow platform operators who can write to catalog.* (master catalog promotion). Bootstrap: INSERT INTO app.platform_admins (user_id) VALUES (''<auth.users.id>'');';



CREATE TABLE IF NOT EXISTS "app"."price_list_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "price_list_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text",
    "source_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "price_list_assignments_target_type_check" CHECK (("target_type" = ANY (ARRAY['buyer'::"text", 'cohort'::"text", 'all_buyers'::"text"])))
);


ALTER TABLE "app"."price_list_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."products_snapshot" (
    "tenant_id" "uuid" NOT NULL,
    "total_count" bigint DEFAULT 0 NOT NULL,
    "active_count" bigint DEFAULT 0 NOT NULL,
    "low_stock_count" bigint DEFAULT 0 NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."products_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."reco_bundle_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bundle_id" "uuid" NOT NULL,
    "tenant_category_id" "uuid" NOT NULL,
    "slot_label" "text",
    "is_required" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "app"."reco_bundle_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."reco_bundle_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "suggested_name" "text",
    "category_ids" "uuid"[] NOT NULL,
    "avg_co_occurrence" integer NOT NULL,
    "confidence_score" numeric(5,4) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    CONSTRAINT "reco_bundle_suggestions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "app"."reco_bundle_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."reco_bundles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "reco_bundles_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'auto_suggested'::"text"])))
);


ALTER TABLE "app"."reco_bundles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."reco_buyer_profiles" (
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "top_products" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "top_categories" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."reco_buyer_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."reco_category_associations" (
    "id" bigint NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "category_a_id" "uuid" NOT NULL,
    "category_b_id" "uuid" NOT NULL,
    "co_occurrence_count" integer DEFAULT 0 NOT NULL,
    "lift_score" numeric(10,6),
    "confidence" numeric(10,6),
    "time_window_days" integer NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."reco_category_associations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "app"."reco_category_associations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "app"."reco_category_associations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "app"."reco_category_associations_id_seq" OWNED BY "app"."reco_category_associations"."id";



CREATE TABLE IF NOT EXISTS "app"."reco_category_profiles" (
    "tenant_id" "uuid" NOT NULL,
    "tenant_category_id" "uuid" NOT NULL,
    "computed_role" "text" DEFAULT 'anchor'::"text" NOT NULL,
    "solo_order_rate" numeric(5,4),
    "co_occurrence_breadth" integer,
    "weighted_event_count" integer DEFAULT 0 NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reco_category_profiles_computed_role_check" CHECK (("computed_role" = ANY (ARRAY['anchor'::"text", 'companion'::"text", 'exclude'::"text"])))
);


ALTER TABLE "app"."reco_category_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."reco_product_associations" (
    "id" bigint NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "product_a_id" "uuid" NOT NULL,
    "product_b_id" "uuid" NOT NULL,
    "association_type" "text" NOT NULL,
    "co_occurrence_count" integer DEFAULT 0 NOT NULL,
    "lift_score" numeric(10,6),
    "confidence" numeric(10,6),
    "time_window_days" integer NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reco_product_associations_association_type_check" CHECK (("association_type" = ANY (ARRAY['co_order'::"text", 'co_buyer'::"text"])))
);


ALTER TABLE "app"."reco_product_associations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "app"."reco_product_associations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "app"."reco_product_associations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "app"."reco_product_associations_id_seq" OWNED BY "app"."reco_product_associations"."id";



CREATE TABLE IF NOT EXISTS "app"."reco_product_popularity" (
    "tenant_id" "uuid" NOT NULL,
    "tenant_product_id" "uuid" NOT NULL,
    "invoice_count_30d" integer DEFAULT 0 NOT NULL,
    "order_count_30d" integer DEFAULT 0 NOT NULL,
    "estimate_count_30d" integer DEFAULT 0 NOT NULL,
    "weighted_score_30d" numeric(10,2) DEFAULT 0 NOT NULL,
    "order_count_7d" integer DEFAULT 0 NOT NULL,
    "order_count_90d" integer DEFAULT 0 NOT NULL,
    "revenue_30d" numeric(14,2) DEFAULT 0 NOT NULL,
    "unique_buyer_count_30d" integer DEFAULT 0 NOT NULL,
    "repeat_buyer_count_30d" integer DEFAULT 0 NOT NULL,
    "category_rank_30d" integer,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."reco_product_popularity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."stock_in_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_product_id" "uuid" NOT NULL,
    "qty_delta" numeric NOT NULL,
    "event_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_in_events_qty_delta_check" CHECK (("qty_delta" > (0)::numeric))
);


ALTER TABLE "app"."stock_in_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."tenant_brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "master_brand_id" "uuid",
    "display_name_override" "text",
    "margin_pct" numeric,
    "exclusivity" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "external_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "description_override" "text",
    "logo_url_override" "text",
    "deleted_at" timestamp with time zone,
    "logo_url" "text",
    "principal_name" "text",
    "principal_email" "text",
    "principal_phone" "text",
    "principal_location" "text",
    "contact_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "default_cohort_id" "uuid",
    "r2_logo_original_key" "text",
    "r2_logo_medium_key" "text",
    "r2_logo_thumb_key" "text",
    "slug" "text",
    "description" "text",
    "categories" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "app"."tenant_brands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."tenant_broadcast_limits" (
    "tenant_id" "uuid" NOT NULL,
    "daily_broadcast_cap" integer DEFAULT 100 NOT NULL,
    "plan_tier_source" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "app"."tenant_broadcast_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."tenant_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "master_category_id" "uuid",
    "parent_tenant_category_id" "uuid",
    "promoted_catalog_category_id" "uuid",
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "external_ref" "text",
    "review_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "display_order" integer DEFAULT 0 NOT NULL,
    "r2_image_original_key" "text",
    "r2_image_medium_key" "text",
    "r2_image_thumb_key" "text",
    "recommendation_role" "text",
    CONSTRAINT "tenant_categories_recommendation_role_check" CHECK (("recommendation_role" = ANY (ARRAY['anchor'::"text", 'companion'::"text", 'exclude'::"text"]))),
    CONSTRAINT "tenant_categories_review_status_check" CHECK (("review_status" = ANY (ARRAY['draft'::"text", 'in_review'::"text", 'approved'::"text", 'rejected'::"text", 'promoted'::"text"])))
);


ALTER TABLE "app"."tenant_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."tenant_category_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_category_id" "uuid" NOT NULL,
    "image_type" "text" DEFAULT 'icon'::"text" NOT NULL,
    "is_primary" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "r2_original_key" "text",
    "r2_medium_key" "text",
    "r2_thumb_key" "text",
    "status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "tenant_category_images_image_type_check" CHECK (("image_type" = ANY (ARRAY['icon'::"text", 'banner'::"text"]))),
    CONSTRAINT "tenant_category_images_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "app"."tenant_category_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."tenant_field_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_integration_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "zoho_field_name" "text" NOT NULL,
    "target_column" "text" NOT NULL,
    "transform_type" "text" DEFAULT 'boolean_from_zoho'::"text" NOT NULL,
    "transform_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "tenant_field_mappings_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['customers'::"text", 'estimates'::"text", 'invoices'::"text", 'orders'::"text"]))),
    CONSTRAINT "tenant_field_mappings_transform_type_check" CHECK (("transform_type" = ANY (ARRAY['boolean_from_zoho'::"text", 'copy'::"text", 'enum_map'::"text"])))
);


ALTER TABLE "app"."tenant_field_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."tenant_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "integration_type_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending_setup'::"text" NOT NULL,
    "vault_secret_id" "uuid",
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_health_check_at" timestamp with time zone,
    "health_status" "text",
    "connected_at" timestamp with time zone,
    "connected_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "external_ref" "text",
    CONSTRAINT "tenant_integrations_health_status_check" CHECK ((("health_status" IS NULL) OR ("health_status" = ANY (ARRAY['ok'::"text", 'expired'::"text", 'invalid'::"text"])))),
    CONSTRAINT "tenant_integrations_status_check" CHECK (("status" = ANY (ARRAY['pending_setup'::"text", 'connected'::"text", 'syncing'::"text", 'sync_failed'::"text", 'disconnected'::"text"])))
);

ALTER TABLE ONLY "app"."tenant_integrations" REPLICA IDENTITY FULL;


ALTER TABLE "app"."tenant_integrations" OWNER TO "postgres";


COMMENT ON COLUMN "app"."tenant_integrations"."status" IS 'OAuth handshake state: pending_setup | connected | syncing | disconnected. Sync job outcomes are tracked on app.integration_sync_jobs.';



CREATE TABLE IF NOT EXISTS "app"."tenant_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_product_id" "uuid" NOT NULL,
    "qty_available" numeric DEFAULT 0,
    "qty_reserved" numeric DEFAULT 0,
    "reorder_point" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "warehouse_id" "uuid" NOT NULL
);


ALTER TABLE "app"."tenant_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."tenant_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tenant_brand_id" "uuid" NOT NULL,
    "master_product_id" "uuid",
    "internal_sku" "text" NOT NULL,
    "name_override" "text",
    "attributes_override" "jsonb" DEFAULT '{}'::"jsonb",
    "mrp" numeric,
    "base_selling_price" numeric,
    "cost_price" numeric,
    "default_uom" "text",
    "pack_size" numeric,
    "image_urls" "text"[],
    "is_active" boolean DEFAULT true,
    "external_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "hsn_code" "text",
    "gst_rate" numeric,
    "r2_original_key" "text",
    "r2_large_key" "text",
    "r2_medium_key" "text",
    "r2_small_key" "text",
    "r2_thumb_key" "text",
    "description" "text",
    "tenant_category_id" "uuid",
    "search_vector" "tsvector",
    "embedding" "public"."vector"(1536)
);


ALTER TABLE "app"."tenant_products" OWNER TO "postgres";


COMMENT ON COLUMN "app"."tenant_products"."hsn_code" IS 'Optional override; falls back to catalog.products.hsn_code';



COMMENT ON COLUMN "app"."tenant_products"."gst_rate" IS 'Optional override; falls back to catalog.products.gst_rate';



COMMENT ON COLUMN "app"."tenant_products"."description" IS 'Optional tenant-specific product description override';



CREATE TABLE IF NOT EXISTS "app"."tenant_settings" (
    "tenant_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "app"."tenant_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."tenant_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "invited_at" timestamp with time zone,
    "joined_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "location_ids" "uuid"[],
    "phone" "text",
    "whatsapp_consent_at" timestamp with time zone,
    "whatsapp_consent_method" "text" DEFAULT 'implicit_first_login'::"text",
    CONSTRAINT "chk_assistant_has_location" CHECK ((("role" <> 'seller_assistant'::"text") OR (("location_ids" IS NOT NULL) AND ("cardinality"("location_ids") > 0)))),
    CONSTRAINT "tenant_users_role_check" CHECK (("role" = ANY (ARRAY['seller_admin'::"text", 'seller_assistant'::"text"])))
);


ALTER TABLE "app"."tenant_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "business_name" "text" NOT NULL,
    "gstin" "text",
    "primary_state" "text",
    "subdomain" "text",
    "plan" "text" DEFAULT 'starter'::"text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "whatsapp_credits_balance" integer DEFAULT 1000 NOT NULL,
    "whatsapp_credits_purchased" integer DEFAULT 1000 NOT NULL,
    "email_verified_at" timestamp with time zone,
    CONSTRAINT "tenants_plan_check" CHECK (("plan" = ANY (ARRAY['starter'::"text", 'growth'::"text", 'scale'::"text"])))
);


ALTER TABLE "app"."tenants" OWNER TO "postgres";


COMMENT ON COLUMN "app"."tenants"."whatsapp_credits_balance" IS 'Remaining WhatsApp OTP/notification credits';



COMMENT ON COLUMN "app"."tenants"."whatsapp_credits_purchased" IS 'Total purchased credits (denominator for balance UI)';



CREATE TABLE IF NOT EXISTS "app"."user_profiles" (
    "user_id" "uuid" NOT NULL,
    "r2_avatar_orig_key" "text",
    "r2_avatar_small_key" "text",
    "r2_avatar_thumb_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "app"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."warehouses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "name" "text" NOT NULL,
    "external_ref" "text",
    "address" "jsonb",
    "phone_number" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_default" boolean DEFAULT false,
    "associated_users" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "lat" numeric(10,7),
    "lng" numeric(10,7),
    CONSTRAINT "warehouses_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "app"."warehouses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."warehouses_snapshot" (
    "warehouse_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tracked_skus" bigint DEFAULT 0 NOT NULL,
    "sellable_units" bigint DEFAULT 0 NOT NULL,
    "low_stock_skus" bigint DEFAULT 0 NOT NULL,
    "stockout_skus" bigint DEFAULT 0 NOT NULL,
    "idle_stock_skus" bigint DEFAULT 0 NOT NULL,
    "last_inventory_update" timestamp with time zone,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."warehouses_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."whatsapp_broadcasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "whatsapp_template_id" "uuid",
    "use_case" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_cohort_id" "uuid",
    "target_filter" "jsonb",
    "target_buyer_ids" "uuid"[],
    "linked_campaign_id" "uuid",
    "variable_bindings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "estimated_recipient_count" integer,
    "actual_recipient_count" integer,
    "daily_cap_at_creation" integer,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "meta_header_media_id" "text",
    "header_image_source" "text",
    CONSTRAINT "whatsapp_broadcasts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_review'::"text", 'scheduled'::"text", 'sending'::"text", 'completed'::"text", 'partially_failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "whatsapp_broadcasts_target_type_check" CHECK (("target_type" = ANY (ARRAY['cohort'::"text", 'buyer_selection'::"text", 'geography_filter'::"text", 'dormant_filter'::"text", 'dues_filter'::"text", 'all_buyers'::"text"])))
);


ALTER TABLE "app"."whatsapp_broadcasts" OWNER TO "postgres";


COMMENT ON COLUMN "app"."whatsapp_broadcasts"."meta_header_media_id" IS 'Meta Cloud API media id for campaign header image, uploaded once per broadcast';



COMMENT ON COLUMN "app"."whatsapp_broadcasts"."header_image_source" IS 'campaign | tenant_logo | platform_default — which fallback supplied the header image';



CREATE TABLE IF NOT EXISTS "app"."whatsapp_credit_pricing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "credit_price_inr" numeric(6,4) NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "app"."whatsapp_credit_pricing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."whatsapp_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "buyer_id" "uuid",
    "recipient_phone" "text" NOT NULL,
    "whatsapp_template_id" "uuid",
    "meta_category" "text" NOT NULL,
    "whatsapp_broadcast_id" "uuid",
    "trigger_source" "text" NOT NULL,
    "provider_message_id" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "failure_reason" "text",
    "credits_charged" numeric(6,2),
    "meta_cost_inr" numeric(10,4),
    "billed_amount" numeric(10,4),
    "wallet_transaction_id" "uuid",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "send_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "related_entity_type" "text",
    "related_entity_id" "uuid",
    CONSTRAINT "whatsapp_messages_meta_category_check" CHECK (("meta_category" = ANY (ARRAY['marketing'::"text", 'utility'::"text", 'authentication'::"text", 'service'::"text"]))),
    CONSTRAINT "whatsapp_messages_related_entity_type_check" CHECK ((("related_entity_type" IS NULL) OR ("related_entity_type" = ANY (ARRAY['estimates'::"text", 'orders'::"text"])))),
    CONSTRAINT "whatsapp_messages_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text", 'blocked_by_recipient'::"text", 'opted_out'::"text"])))
);


ALTER TABLE "app"."whatsapp_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."whatsapp_platform_config" (
    "id" integer DEFAULT 1 NOT NULL,
    "broadcast_sending_paused" boolean DEFAULT false NOT NULL,
    "quality_rating_state" "text" DEFAULT 'green'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "whatsapp_platform_config_id_check" CHECK (("id" = 1)),
    CONSTRAINT "whatsapp_platform_config_quality_rating_state_check" CHECK (("quality_rating_state" = ANY (ARRAY['green'::"text", 'yellow'::"text", 'red'::"text"])))
);


ALTER TABLE "app"."whatsapp_platform_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."whatsapp_rate_card" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meta_category" "text" NOT NULL,
    "meta_cost_inr" numeric(10,4) NOT NULL,
    "credits_per_message" numeric(5,2) DEFAULT 1 NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "whatsapp_rate_card_meta_category_check" CHECK (("meta_category" = ANY (ARRAY['marketing'::"text", 'utility'::"text", 'authentication'::"text"])))
);


ALTER TABLE "app"."whatsapp_rate_card" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."whatsapp_send_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "whatsapp_message_id" "uuid" NOT NULL,
    "priority" integer DEFAULT 5 NOT NULL,
    "scheduled_send_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attempt_count" integer DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "whatsapp_send_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "app"."whatsapp_send_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."whatsapp_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "meta_template_name" "text" NOT NULL,
    "meta_template_id" "text",
    "meta_category" "text" NOT NULL,
    "use_case" "text" NOT NULL,
    "locale" "text" DEFAULT 'en'::"text",
    "body" "text" NOT NULL,
    "variables" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "button_config" "jsonb",
    "approval_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_platform_managed" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "header_config" "jsonb",
    "footer_text" "text",
    "buttons_config" "jsonb",
    CONSTRAINT "whatsapp_templates_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'disabled'::"text"]))),
    CONSTRAINT "whatsapp_templates_meta_category_check" CHECK (("meta_category" = ANY (ARRAY['marketing'::"text", 'utility'::"text", 'authentication'::"text"]))),
    CONSTRAINT "whatsapp_templates_use_case_check" CHECK (("use_case" = ANY (ARRAY['payment_reminder'::"text", 'new_stock'::"text", 'campaign_announcement'::"text", 'beat_route'::"text", 'buyer_app_nudge'::"text", 'dormant_reengagement'::"text", 'order_notification'::"text", 'estimate_notification'::"text", 'otp'::"text", 'otp_login'::"text"])))
);


ALTER TABLE "app"."whatsapp_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."zoho_token_cache" (
    "tenant_integration_id" "uuid" NOT NULL,
    "access_token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."zoho_token_cache" OWNER TO "postgres";


ALTER TABLE ONLY "app"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"app"."audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "app"."reco_category_associations" ALTER COLUMN "id" SET DEFAULT "nextval"('"app"."reco_category_associations_id_seq"'::"regclass");



ALTER TABLE ONLY "app"."reco_product_associations" ALTER COLUMN "id" SET DEFAULT "nextval"('"app"."reco_product_associations_id_seq"'::"regclass");



ALTER TABLE ONLY "app"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."brands_snapshot"
    ADD CONSTRAINT "brands_snapshot_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "app"."buyer_app_activity"
    ADD CONSTRAINT "buyer_app_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."buyer_app_activity"
    ADD CONSTRAINT "buyer_app_activity_tenant_idempotency_unique" UNIQUE ("tenant_id", "idempotency_key");



ALTER TABLE ONLY "app"."buyer_app_activity"
    ADD CONSTRAINT "buyer_app_activity_tenant_source_entity_unique" UNIQUE ("tenant_id", "event_source", "source_entity_id");



ALTER TABLE ONLY "app"."kpi_buyer_app_daily"
    ADD CONSTRAINT "buyer_app_daily_pkey" PRIMARY KEY ("tenant_id", "snapshot_date");



ALTER TABLE ONLY "app"."buyer_app_snapshot"
    ADD CONSTRAINT "buyer_app_snapshot_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "app"."buyer_current_snapshot"
    ADD CONSTRAINT "buyer_current_snapshot_pkey" PRIMARY KEY ("tenant_id", "buyer_id");



ALTER TABLE ONLY "app"."buyer_users"
    ADD CONSTRAINT "buyer_users_buyer_id_user_id_key" UNIQUE ("buyer_id", "user_id");



ALTER TABLE ONLY "app"."buyer_users"
    ADD CONSTRAINT "buyer_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."buyers"
    ADD CONSTRAINT "buyers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."buyers"
    ADD CONSTRAINT "buyers_tenant_id_external_ref_key" UNIQUE ("tenant_id", "external_ref");



ALTER TABLE ONLY "app"."campaign_items"
    ADD CONSTRAINT "campaign_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."campaign_views"
    ADD CONSTRAINT "catalog_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."categories_snapshot"
    ADD CONSTRAINT "categories_snapshot_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "app"."cohort_members"
    ADD CONSTRAINT "cohort_members_pkey" PRIMARY KEY ("cohort_id", "buyer_id");



ALTER TABLE ONLY "app"."cohorts"
    ADD CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."credit_notes"
    ADD CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."credit_notes"
    ADD CONSTRAINT "credit_notes_tenant_id_external_ref_key" UNIQUE ("tenant_id", "external_ref");



ALTER TABLE ONLY "app"."email_verification_otps"
    ADD CONSTRAINT "email_verification_otps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."estimate_items"
    ADD CONSTRAINT "estimate_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."estimates"
    ADD CONSTRAINT "estimates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."estimates_snapshot"
    ADD CONSTRAINT "estimates_snapshot_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "app"."integration_data_flows"
    ADD CONSTRAINT "integration_data_flows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."integration_data_flows"
    ADD CONSTRAINT "integration_data_flows_tenant_integration_entity_unique" UNIQUE ("tenant_id", "tenant_integration_id", "entity_type");



ALTER TABLE ONLY "app"."integration_entity_map"
    ADD CONSTRAINT "integration_entity_map_external_unique" UNIQUE ("tenant_id", "tenant_integration_id", "entity_type", "external_id");



ALTER TABLE ONLY "app"."integration_entity_map"
    ADD CONSTRAINT "integration_entity_map_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."integration_oauth_states"
    ADD CONSTRAINT "integration_oauth_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."integration_oauth_states"
    ADD CONSTRAINT "integration_oauth_states_state_token_key" UNIQUE ("state_token");



ALTER TABLE ONLY "app"."integration_sync_jobs"
    ADD CONSTRAINT "integration_sync_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."integration_webhook_echo_guards"
    ADD CONSTRAINT "integration_webhook_echo_guards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."integration_webhook_errors"
    ADD CONSTRAINT "integration_webhook_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."integration_webhook_event_changes"
    ADD CONSTRAINT "integration_webhook_event_changes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."integration_webhook_events"
    ADD CONSTRAINT "integration_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."integration_webhooks"
    ADD CONSTRAINT "integration_webhooks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."invoices_snapshot"
    ADD CONSTRAINT "invoices_snapshot_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "app"."invoices"
    ADD CONSTRAINT "invoices_tenant_id_external_ref_key" UNIQUE ("tenant_id", "external_ref");



ALTER TABLE ONLY "app"."invoices"
    ADD CONSTRAINT "invoices_tenant_id_invoice_number_key" UNIQUE ("tenant_id", "invoice_number");



ALTER TABLE ONLY "app"."kpi_brand_daily"
    ADD CONSTRAINT "kpi_brand_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."kpi_brand_daily"
    ADD CONSTRAINT "kpi_brand_daily_tenant_id_tenant_brand_id_day_key" UNIQUE ("tenant_id", "tenant_brand_id", "day");



ALTER TABLE ONLY "app"."kpi_buyers_daily"
    ADD CONSTRAINT "kpi_buyers_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."kpi_category_daily"
    ADD CONSTRAINT "kpi_category_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."kpi_category_daily"
    ADD CONSTRAINT "kpi_category_daily_tenant_id_tenant_category_id_day_key" UNIQUE ("tenant_id", "tenant_category_id", "day");



ALTER TABLE ONLY "app"."kpi_estimates_daily"
    ADD CONSTRAINT "kpi_estimates_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."kpi_invoices_daily"
    ADD CONSTRAINT "kpi_invoices_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."kpi_location_daily"
    ADD CONSTRAINT "kpi_location_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."kpi_location_daily"
    ADD CONSTRAINT "kpi_location_daily_tenant_id_location_id_day_key" UNIQUE ("tenant_id", "location_id", "day");



ALTER TABLE ONLY "app"."kpi_orders_daily"
    ADD CONSTRAINT "kpi_orders_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."kpi_product_daily"
    ADD CONSTRAINT "kpi_product_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."kpi_product_daily"
    ADD CONSTRAINT "kpi_product_daily_tenant_id_tenant_product_id_day_key" UNIQUE ("tenant_id", "tenant_product_id", "day");



ALTER TABLE ONLY "app"."kpi_tenant_daily"
    ADD CONSTRAINT "kpi_tenant_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."kpi_tenant_daily"
    ADD CONSTRAINT "kpi_tenant_daily_tenant_id_day_key" UNIQUE ("tenant_id", "day");



ALTER TABLE ONLY "app"."kpi_warehouse_daily"
    ADD CONSTRAINT "kpi_warehouse_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."kpi_warehouse_daily"
    ADD CONSTRAINT "kpi_warehouse_daily_tenant_id_warehouse_id_day_key" UNIQUE ("tenant_id", "warehouse_id", "day");



ALTER TABLE ONLY "app"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."locations_snapshot"
    ADD CONSTRAINT "locations_snapshot_pkey" PRIMARY KEY ("location_id");



ALTER TABLE ONLY "app"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."orders_snapshot"
    ADD CONSTRAINT "orders_snapshot_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "app"."orders"
    ADD CONSTRAINT "orders_tenant_id_order_number_key" UNIQUE ("tenant_id", "order_number");



ALTER TABLE ONLY "app"."otp_sessions"
    ADD CONSTRAINT "otp_sessions_pkey" PRIMARY KEY ("ref_id");



ALTER TABLE ONLY "app"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."payments"
    ADD CONSTRAINT "payments_tenant_id_external_ref_key" UNIQUE ("tenant_id", "external_ref");



ALTER TABLE ONLY "app"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "app"."price_list_assignments"
    ADD CONSTRAINT "price_list_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."price_list_items"
    ADD CONSTRAINT "price_list_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."price_list_items"
    ADD CONSTRAINT "price_list_items_price_list_id_tenant_product_id_min_qty_key" UNIQUE ("price_list_id", "tenant_product_id", "min_qty");



ALTER TABLE ONLY "app"."price_lists"
    ADD CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."products_snapshot"
    ADD CONSTRAINT "products_snapshot_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "app"."campaign_items"
    ADD CONSTRAINT "published_catalog_items_catalog_id_tenant_product_id_key" UNIQUE ("campaign_id", "tenant_product_id");



ALTER TABLE ONLY "app"."campaigns"
    ADD CONSTRAINT "published_catalogs_share_token_key" UNIQUE ("share_token");



ALTER TABLE ONLY "app"."reco_bundle_slots"
    ADD CONSTRAINT "reco_bundle_slots_bundle_id_tenant_category_id_key" UNIQUE ("bundle_id", "tenant_category_id");



ALTER TABLE ONLY "app"."reco_bundle_slots"
    ADD CONSTRAINT "reco_bundle_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."reco_bundle_suggestions"
    ADD CONSTRAINT "reco_bundle_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."reco_bundles"
    ADD CONSTRAINT "reco_bundles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."reco_bundles"
    ADD CONSTRAINT "reco_bundles_tenant_id_name_key" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "app"."reco_buyer_profiles"
    ADD CONSTRAINT "reco_buyer_profiles_pkey" PRIMARY KEY ("tenant_id", "buyer_id");



ALTER TABLE ONLY "app"."reco_category_associations"
    ADD CONSTRAINT "reco_category_associations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."reco_category_associations"
    ADD CONSTRAINT "reco_category_associations_tenant_id_category_a_id_category_key" UNIQUE ("tenant_id", "category_a_id", "category_b_id", "time_window_days");



ALTER TABLE ONLY "app"."reco_category_profiles"
    ADD CONSTRAINT "reco_category_profiles_pkey" PRIMARY KEY ("tenant_id", "tenant_category_id");



ALTER TABLE ONLY "app"."reco_product_associations"
    ADD CONSTRAINT "reco_product_associations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."reco_product_associations"
    ADD CONSTRAINT "reco_product_associations_tenant_id_product_a_id_product_b__key" UNIQUE ("tenant_id", "product_a_id", "product_b_id", "association_type", "time_window_days");



ALTER TABLE ONLY "app"."reco_product_popularity"
    ADD CONSTRAINT "reco_product_popularity_pkey" PRIMARY KEY ("tenant_id", "tenant_product_id");



ALTER TABLE ONLY "app"."stock_in_events"
    ADD CONSTRAINT "stock_in_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."tenant_brands"
    ADD CONSTRAINT "tenant_brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."tenant_brands"
    ADD CONSTRAINT "tenant_brands_tenant_id_master_brand_id_key" UNIQUE ("tenant_id", "master_brand_id");



ALTER TABLE ONLY "app"."tenant_broadcast_limits"
    ADD CONSTRAINT "tenant_broadcast_limits_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "app"."tenant_categories"
    ADD CONSTRAINT "tenant_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."tenant_category_images"
    ADD CONSTRAINT "tenant_category_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."tenant_field_mappings"
    ADD CONSTRAINT "tenant_field_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."tenant_field_mappings"
    ADD CONSTRAINT "tenant_field_mappings_unique" UNIQUE ("tenant_integration_id", "entity_type", "zoho_field_name");



ALTER TABLE ONLY "app"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_id_tenant_unique" UNIQUE ("id", "tenant_id");



ALTER TABLE ONLY "app"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_tenant_integration_unique" UNIQUE ("tenant_id", "integration_type_id");



ALTER TABLE ONLY "app"."tenant_inventory"
    ADD CONSTRAINT "tenant_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."tenant_products"
    ADD CONSTRAINT "tenant_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."tenant_products"
    ADD CONSTRAINT "tenant_products_tenant_id_internal_sku_key" UNIQUE ("tenant_id", "internal_sku");



ALTER TABLE ONLY "app"."tenant_settings"
    ADD CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "app"."tenant_users"
    ADD CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."tenant_users"
    ADD CONSTRAINT "tenant_users_tenant_id_user_id_key" UNIQUE ("tenant_id", "user_id");



ALTER TABLE ONLY "app"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "app"."tenants"
    ADD CONSTRAINT "tenants_subdomain_key" UNIQUE ("subdomain");



ALTER TABLE ONLY "app"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "app"."warehouses"
    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."warehouses_snapshot"
    ADD CONSTRAINT "warehouses_snapshot_pkey" PRIMARY KEY ("warehouse_id");



ALTER TABLE ONLY "app"."whatsapp_broadcasts"
    ADD CONSTRAINT "whatsapp_broadcasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."whatsapp_credit_pricing"
    ADD CONSTRAINT "whatsapp_credit_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."whatsapp_credit_transactions"
    ADD CONSTRAINT "whatsapp_credit_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."whatsapp_platform_config"
    ADD CONSTRAINT "whatsapp_platform_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."whatsapp_rate_card"
    ADD CONSTRAINT "whatsapp_rate_card_meta_category_key" UNIQUE ("meta_category");



ALTER TABLE ONLY "app"."whatsapp_rate_card"
    ADD CONSTRAINT "whatsapp_rate_card_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."whatsapp_send_queue"
    ADD CONSTRAINT "whatsapp_send_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."whatsapp_templates"
    ADD CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."whatsapp_templates"
    ADD CONSTRAINT "whatsapp_templates_tenant_name_unique" UNIQUE ("tenant_id", "meta_template_name");



ALTER TABLE ONLY "app"."zoho_token_cache"
    ADD CONSTRAINT "zoho_token_cache_pkey" PRIMARY KEY ("tenant_integration_id");



CREATE UNIQUE INDEX "buyer_users_buyer_external_ref_unfiltered_upsert" ON "app"."buyer_users" USING "btree" ("buyer_id", "external_ref");



CREATE UNIQUE INDEX "buyer_users_buyer_external_ref_upsert" ON "app"."buyer_users" USING "btree" ("buyer_id", "external_ref") WHERE ("external_ref" IS NOT NULL);



CREATE UNIQUE INDEX "buyers_tenant_external_ref_upsert" ON "app"."buyers" USING "btree" ("tenant_id", "external_ref");



CREATE UNIQUE INDEX "estimate_items_estimate_external_ref_upsert" ON "app"."estimate_items" USING "btree" ("estimate_id", "external_ref");



CREATE UNIQUE INDEX "estimates_tenant_external_ref_upsert" ON "app"."estimates" USING "btree" ("tenant_id", "external_ref");



CREATE INDEX "idx_app_buyers_deleted_at" ON "app"."buyers" USING "btree" ("deleted_at");



CREATE INDEX "idx_app_cohorts_deleted_at" ON "app"."cohorts" USING "btree" ("deleted_at");



CREATE INDEX "idx_app_orders_deleted_at" ON "app"."orders" USING "btree" ("deleted_at");



CREATE INDEX "idx_app_price_lists_deleted_at" ON "app"."price_lists" USING "btree" ("deleted_at");



CREATE INDEX "idx_app_published_catalogs_deleted_at" ON "app"."campaigns" USING "btree" ("deleted_at");



CREATE INDEX "idx_app_tenant_products_deleted_at" ON "app"."tenant_products" USING "btree" ("deleted_at");



CREATE INDEX "idx_audit_log_entity" ON "app"."audit_log" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_audit_log_tenant_id" ON "app"."audit_log" USING "btree" ("tenant_id");



CREATE INDEX "idx_audit_log_ts" ON "app"."audit_log" USING "btree" ("ts");



CREATE INDEX "idx_buyer_app_activity_buyer_lookup" ON "app"."buyer_app_activity" USING "btree" ("tenant_id", "buyer_id", "occurred_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_buyer_app_activity_day_lookup" ON "app"."buyer_app_activity" USING "btree" ("tenant_id", "occurred_day", "buyer_id") WHERE (("deleted_at" IS NULL) AND ("qualifies_for_engagement" = true));



CREATE INDEX "idx_buyer_app_activity_source_lookup" ON "app"."buyer_app_activity" USING "btree" ("tenant_id", "event_source", "source_entity_id") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "idx_buyer_app_activity_tenant_external_ref" ON "app"."buyer_app_activity" USING "btree" ("tenant_id", "external_ref") WHERE ("external_ref" IS NOT NULL);



CREATE INDEX "idx_buyer_app_daily_date_brin" ON "app"."kpi_buyer_app_daily" USING "brin" ("snapshot_date");



CREATE INDEX "idx_buyer_app_daily_tenant_date" ON "app"."kpi_buyer_app_daily" USING "btree" ("tenant_id", "snapshot_date" DESC);



CREATE INDEX "idx_buyer_current_snapshot_buyer" ON "app"."buyer_current_snapshot" USING "btree" ("buyer_id");



CREATE INDEX "idx_buyer_current_snapshot_refreshed_at" ON "app"."buyer_current_snapshot" USING "btree" ("tenant_id", "refreshed_at" DESC);



CREATE INDEX "idx_buyer_users_buyer_id" ON "app"."buyer_users" USING "btree" ("buyer_id");



CREATE INDEX "idx_buyer_users_phone_active" ON "app"."buyer_users" USING "btree" ("phone", "is_active") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_buyer_users_search_vector" ON "app"."buyer_users" USING "gin" ("search_vector");



CREATE INDEX "idx_buyer_users_user_id" ON "app"."buyer_users" USING "btree" ("user_id");



CREATE INDEX "idx_buyers_default_cohort_id" ON "app"."buyers" USING "btree" ("default_cohort_id");



CREATE INDEX "idx_buyers_email" ON "app"."buyers" USING "btree" ("email");



CREATE INDEX "idx_buyers_phone" ON "app"."buyers" USING "btree" ("phone");



CREATE INDEX "idx_buyers_phone_buyer_app" ON "app"."buyers" USING "btree" ("phone", "buyer_app_enabled", "is_active") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_buyers_search_vector" ON "app"."buyers" USING "gin" ("search_vector");



CREATE UNIQUE INDEX "idx_buyers_snapshot_location_unique" ON "app"."buyers_snapshot" USING "btree" ("tenant_id", "buyer_id", "location_id") WHERE ("scope" = 'location'::"text");



CREATE INDEX "idx_buyers_snapshot_scope_lookup" ON "app"."buyers_snapshot" USING "btree" ("tenant_id", "scope", "location_id", "buyer_id");



CREATE UNIQUE INDEX "idx_buyers_snapshot_tenant_unique" ON "app"."buyers_snapshot" USING "btree" ("tenant_id", "buyer_id") WHERE ("scope" = 'tenant'::"text");



CREATE INDEX "idx_buyers_tenant_active" ON "app"."buyers" USING "btree" ("tenant_id", "is_active") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_buyers_tenant_id" ON "app"."buyers" USING "btree" ("tenant_id");



CREATE INDEX "idx_buyers_tenant_name" ON "app"."buyers" USING "btree" ("tenant_id", "business_name") WHERE (("is_active" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_buyers_tier" ON "app"."buyers" USING "btree" ("tier");



CREATE INDEX "idx_campaign_items_campaign_id" ON "app"."campaign_items" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_views_campaign_id" ON "app"."campaign_views" USING "btree" ("campaign_id");



CREATE UNIQUE INDEX "idx_campaign_views_daily_unique" ON "app"."campaign_views" USING "btree" ("tenant_id", "buyer_id", "campaign_id", "view_date") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_campaign_views_tenant_buyer_viewed" ON "app"."campaign_views" USING "btree" ("tenant_id", "buyer_id", "viewed_at");



CREATE INDEX "idx_campaigns_share_token" ON "app"."campaigns" USING "btree" ("share_token");



CREATE INDEX "idx_campaigns_status" ON "app"."campaigns" USING "btree" ("status");



CREATE INDEX "idx_campaigns_tenant_id" ON "app"."campaigns" USING "btree" ("tenant_id");



CREATE INDEX "idx_catalogs_tenant_created" ON "app"."campaigns" USING "btree" ("tenant_id", "created_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_cohort_members_buyer_id" ON "app"."cohort_members" USING "btree" ("buyer_id");



CREATE INDEX "idx_cohort_members_cohort_id" ON "app"."cohort_members" USING "btree" ("cohort_id");



CREATE INDEX "idx_cohorts_tenant_id" ON "app"."cohorts" USING "btree" ("tenant_id");



CREATE INDEX "idx_credit_notes_issued_at" ON "app"."credit_notes" USING "btree" ("issued_at");



CREATE INDEX "idx_credit_notes_tenant_buyer" ON "app"."credit_notes" USING "btree" ("tenant_id", "buyer_id");



CREATE INDEX "idx_email_verification_otps_user" ON "app"."email_verification_otps" USING "btree" ("user_id");



CREATE INDEX "idx_email_verification_otps_user_channel" ON "app"."email_verification_otps" USING "btree" ("user_id", "channel") WHERE ("verified_at" IS NULL);



CREATE INDEX "idx_estimate_items_estimate_id" ON "app"."estimate_items" USING "btree" ("estimate_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_estimate_items_tenant_product_id" ON "app"."estimate_items" USING "btree" ("tenant_product_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_estimates_buyer_id" ON "app"."estimates" USING "btree" ("buyer_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_estimates_cart_hash" ON "app"."estimates" USING "btree" ("buyer_id", "cart_hash") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_estimates_expires_at" ON "app"."estimates" USING "btree" ("expires_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_estimates_is_buyer_app" ON "app"."estimates" USING "btree" ("tenant_id", "is_buyer_app_estimate") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_estimates_tenant_created" ON "app"."estimates" USING "btree" ("tenant_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "idx_estimates_tenant_external_ref" ON "app"."estimates" USING "btree" ("tenant_id", "external_ref") WHERE (("external_ref" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_estimates_tenant_id" ON "app"."estimates" USING "btree" ("tenant_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_estimates_tenant_location_created_at" ON "app"."estimates" USING "btree" ("tenant_id", "location_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_estimates_tenant_status" ON "app"."estimates" USING "btree" ("tenant_id", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_estimates_tenant_status_valid_until" ON "app"."estimates" USING "btree" ("tenant_id", "status", "valid_until") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_integration_webhook_echo_guards_active" ON "app"."integration_webhook_echo_guards" USING "btree" ("tenant_integration_id", "entity_type", "external_entity_id", "expires_at") WHERE (("deleted_at" IS NULL) AND ("consumed_at" IS NULL));



CREATE INDEX "idx_integration_webhook_errors_event" ON "app"."integration_webhook_errors" USING "btree" ("integration_webhook_event_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_integration_webhook_event_changes_event" ON "app"."integration_webhook_event_changes" USING "btree" ("integration_webhook_event_id", "created_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_integration_webhook_events_lookup" ON "app"."integration_webhook_events" USING "btree" ("tenant_integration_id", "integration_webhook_id", "entity_type", "event_type") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_integration_webhook_events_tenant_received_at" ON "app"."integration_webhook_events" USING "btree" ("tenant_id", "received_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_inventory_product_live" ON "app"."tenant_inventory" USING "btree" ("tenant_product_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_invoice_items_invoice_id" ON "app"."invoice_items" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoice_items_tenant_product_id" ON "app"."invoice_items" USING "btree" ("tenant_product_id");



CREATE INDEX "idx_invoices_buyer_id" ON "app"."invoices" USING "btree" ("buyer_id");



CREATE INDEX "idx_invoices_due_date" ON "app"."invoices" USING "btree" ("due_date") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_invoices_estimate_id" ON "app"."invoices" USING "btree" ("estimate_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_invoices_invoice_date" ON "app"."invoices" USING "btree" ("invoice_date");



CREATE INDEX "idx_invoices_is_buyer_app" ON "app"."invoices" USING "btree" ("tenant_id", "is_buyer_app_invoice") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_invoices_order_id" ON "app"."invoices" USING "btree" ("order_id");



CREATE INDEX "idx_invoices_status" ON "app"."invoices" USING "btree" ("status");



CREATE INDEX "idx_invoices_tenant_date" ON "app"."invoices" USING "btree" ("tenant_id", "invoice_date" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_invoices_tenant_id" ON "app"."invoices" USING "btree" ("tenant_id");



CREATE INDEX "idx_invoices_tenant_location_invoice_date" ON "app"."invoices" USING "btree" ("tenant_id", "location_id", "invoice_date" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_invoices_tenant_status_due" ON "app"."invoices" USING "btree" ("tenant_id", "status", "due_date") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_kpi_brand_daily_day_brin" ON "app"."kpi_brand_daily" USING "brin" ("day");



CREATE INDEX "idx_kpi_brand_daily_lookup" ON "app"."kpi_brand_daily" USING "btree" ("tenant_id", "tenant_brand_id", "day");



CREATE INDEX "idx_kpi_brand_daily_tenant_day" ON "app"."kpi_brand_daily" USING "btree" ("tenant_id", "day");



CREATE UNIQUE INDEX "idx_kpi_buyers_daily_location_unique" ON "app"."kpi_buyers_daily" USING "btree" ("tenant_id", "buyer_id", "location_id", "day") WHERE ("scope" = 'location'::"text");



CREATE INDEX "idx_kpi_buyers_daily_rollup" ON "app"."kpi_buyers_daily" USING "btree" ("tenant_id", "scope", "day", "buyer_id", "location_id");



CREATE UNIQUE INDEX "idx_kpi_buyers_daily_tenant_unique" ON "app"."kpi_buyers_daily" USING "btree" ("tenant_id", "buyer_id", "day") WHERE ("scope" = 'tenant'::"text");



CREATE INDEX "idx_kpi_category_daily_day_brin" ON "app"."kpi_category_daily" USING "brin" ("day");



CREATE INDEX "idx_kpi_category_daily_lookup" ON "app"."kpi_category_daily" USING "btree" ("tenant_id", "tenant_category_id", "day");



CREATE INDEX "idx_kpi_category_daily_tenant_day" ON "app"."kpi_category_daily" USING "btree" ("tenant_id", "day");



CREATE UNIQUE INDEX "idx_kpi_estimates_daily_location_unique" ON "app"."kpi_estimates_daily" USING "btree" ("tenant_id", "location_id", "day") WHERE ("scope" = 'location'::"text");



CREATE INDEX "idx_kpi_estimates_daily_lookup" ON "app"."kpi_estimates_daily" USING "btree" ("tenant_id", "scope", "day", "location_id");



CREATE UNIQUE INDEX "idx_kpi_estimates_daily_tenant_unique" ON "app"."kpi_estimates_daily" USING "btree" ("tenant_id", "day") WHERE ("scope" = 'tenant'::"text");



CREATE UNIQUE INDEX "idx_kpi_invoices_daily_location_unique" ON "app"."kpi_invoices_daily" USING "btree" ("tenant_id", "location_id", "day") WHERE ("scope" = 'location'::"text");



CREATE INDEX "idx_kpi_invoices_daily_lookup" ON "app"."kpi_invoices_daily" USING "btree" ("tenant_id", "scope", "day", "location_id");



CREATE UNIQUE INDEX "idx_kpi_invoices_daily_tenant_unique" ON "app"."kpi_invoices_daily" USING "btree" ("tenant_id", "day") WHERE ("scope" = 'tenant'::"text");



CREATE INDEX "idx_kpi_location_daily_day_brin" ON "app"."kpi_location_daily" USING "brin" ("day");



CREATE INDEX "idx_kpi_location_daily_lookup" ON "app"."kpi_location_daily" USING "btree" ("tenant_id", "location_id", "day");



CREATE UNIQUE INDEX "idx_kpi_orders_daily_location_unique" ON "app"."kpi_orders_daily" USING "btree" ("tenant_id", "location_id", "day") WHERE ("scope" = 'location'::"text");



CREATE INDEX "idx_kpi_orders_daily_lookup" ON "app"."kpi_orders_daily" USING "btree" ("tenant_id", "scope", "day", "location_id");



CREATE UNIQUE INDEX "idx_kpi_orders_daily_tenant_unique" ON "app"."kpi_orders_daily" USING "btree" ("tenant_id", "day") WHERE ("scope" = 'tenant'::"text");



CREATE INDEX "idx_kpi_product_daily_day_brin" ON "app"."kpi_product_daily" USING "brin" ("day");



CREATE INDEX "idx_kpi_product_daily_lookup" ON "app"."kpi_product_daily" USING "btree" ("tenant_id", "tenant_product_id", "day") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_kpi_tenant_daily_day_brin" ON "app"."kpi_tenant_daily" USING "brin" ("day");



CREATE INDEX "idx_kpi_tenant_daily_lookup" ON "app"."kpi_tenant_daily" USING "btree" ("tenant_id", "day") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_kpi_warehouse_daily_day_brin" ON "app"."kpi_warehouse_daily" USING "brin" ("day");



CREATE INDEX "idx_kpi_warehouse_daily_lookup" ON "app"."kpi_warehouse_daily" USING "btree" ("tenant_id", "warehouse_id", "day");



CREATE INDEX "idx_locations_snapshot_tenant" ON "app"."locations_snapshot" USING "btree" ("tenant_id");



CREATE INDEX "idx_locations_tenant_id" ON "app"."locations" USING "btree" ("tenant_id");



CREATE INDEX "idx_order_items_order_id" ON "app"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_order_product" ON "app"."order_items" USING "btree" ("order_id", "tenant_product_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_order_items_tenant_product_id" ON "app"."order_items" USING "btree" ("tenant_product_id");



CREATE INDEX "idx_orders_buyer_id" ON "app"."orders" USING "btree" ("buyer_id");



CREATE INDEX "idx_orders_estimate_id" ON "app"."orders" USING "btree" ("estimate_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_orders_estimate_id_ep17_sales_orders" ON "app"."orders" USING "btree" ("estimate_id") WHERE (("deleted_at" IS NULL) AND ("estimate_id" IS NOT NULL));



CREATE INDEX "idx_orders_estimate_id_tx_docs" ON "app"."orders" USING "btree" ("estimate_id") WHERE (("deleted_at" IS NULL) AND ("estimate_id" IS NOT NULL));



CREATE INDEX "idx_orders_is_buyer_app" ON "app"."orders" USING "btree" ("tenant_id", "is_buyer_app_order");



CREATE INDEX "idx_orders_placed_at" ON "app"."orders" USING "btree" ("placed_at");



CREATE INDEX "idx_orders_snapshot_refreshed_at" ON "app"."orders_snapshot" USING "btree" ("refreshed_at");



CREATE INDEX "idx_orders_status" ON "app"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_tenant_date_status" ON "app"."orders" USING "btree" ("tenant_id", "placed_at", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_orders_tenant_id" ON "app"."orders" USING "btree" ("tenant_id");



CREATE INDEX "idx_orders_tenant_location_placed_at" ON "app"."orders" USING "btree" ("tenant_id", "location_id", "placed_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_orders_tenant_status_placed" ON "app"."orders" USING "btree" ("tenant_id", "status", "placed_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_otp_sessions_deleted_at" ON "app"."otp_sessions" USING "btree" ("deleted_at");



CREATE INDEX "idx_otp_sessions_expires_at" ON "app"."otp_sessions" USING "btree" ("expires_at");



CREATE INDEX "idx_otp_sessions_ref_id" ON "app"."otp_sessions" USING "btree" ("ref_id");



CREATE INDEX "idx_payments_invoice_id" ON "app"."payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_payments_paid_at" ON "app"."payments" USING "btree" ("paid_at");



CREATE INDEX "idx_payments_tenant_buyer" ON "app"."payments" USING "btree" ("tenant_id", "buyer_id");



CREATE INDEX "idx_price_list_assignments_price_list_id" ON "app"."price_list_assignments" USING "btree" ("price_list_id");



CREATE INDEX "idx_price_list_assignments_target" ON "app"."price_list_assignments" USING "btree" ("target_type", "target_id");



CREATE INDEX "idx_price_list_items_price_list_id" ON "app"."price_list_items" USING "btree" ("price_list_id");



CREATE INDEX "idx_price_list_items_tenant_product_id" ON "app"."price_list_items" USING "btree" ("tenant_product_id");



CREATE INDEX "idx_price_lists_tenant_id" ON "app"."price_lists" USING "btree" ("tenant_id");



CREATE INDEX "idx_price_lists_valid_from" ON "app"."price_lists" USING "btree" ("valid_from");



CREATE INDEX "idx_reco_assoc_lookup" ON "app"."reco_product_associations" USING "btree" ("tenant_id", "product_a_id", "association_type", "time_window_days");



CREATE INDEX "idx_reco_assoc_product_b" ON "app"."reco_product_associations" USING "btree" ("tenant_id", "product_b_id");



CREATE INDEX "idx_reco_bundle_slots_bundle" ON "app"."reco_bundle_slots" USING "btree" ("bundle_id", "display_order");



CREATE INDEX "idx_reco_bundle_sugg_tenant_status" ON "app"."reco_bundle_suggestions" USING "btree" ("tenant_id", "status", "computed_at" DESC);



CREATE INDEX "idx_reco_bundles_tenant_active" ON "app"."reco_bundles" USING "btree" ("tenant_id", "is_active");



CREATE INDEX "idx_reco_buyer_profiles_refreshed" ON "app"."reco_buyer_profiles" USING "btree" ("tenant_id", "refreshed_at");



CREATE INDEX "idx_reco_cat_assoc_lookup" ON "app"."reco_category_associations" USING "btree" ("tenant_id", "category_a_id", "time_window_days");



CREATE INDEX "idx_reco_cat_profiles_tenant_role" ON "app"."reco_category_profiles" USING "btree" ("tenant_id", "computed_role");



CREATE INDEX "idx_reco_popularity_category_rank" ON "app"."reco_product_popularity" USING "btree" ("tenant_id", "category_rank_30d") WHERE ("weighted_score_30d" > (0)::numeric);



CREATE INDEX "idx_reco_popularity_trending" ON "app"."reco_product_popularity" USING "btree" ("tenant_id", "weighted_score_30d" DESC) WHERE ("weighted_score_30d" > (0)::numeric);



CREATE INDEX "idx_stock_in_events_product_event_at" ON "app"."stock_in_events" USING "btree" ("tenant_product_id", "event_at");



CREATE INDEX "idx_stock_in_events_tenant_event_at" ON "app"."stock_in_events" USING "btree" ("tenant_id", "event_at");



CREATE INDEX "idx_tenant_brands_default_cohort_id" ON "app"."tenant_brands" USING "btree" ("default_cohort_id");



CREATE INDEX "idx_tenant_brands_master_brand_id" ON "app"."tenant_brands" USING "btree" ("master_brand_id");



CREATE UNIQUE INDEX "idx_tenant_brands_slug_unique" ON "app"."tenant_brands" USING "btree" ("tenant_id", "slug") WHERE (("deleted_at" IS NULL) AND ("slug" IS NOT NULL));



CREATE INDEX "idx_tenant_brands_tenant_id" ON "app"."tenant_brands" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_categories_master_category_id" ON "app"."tenant_categories" USING "btree" ("master_category_id");



CREATE INDEX "idx_tenant_categories_parent_id" ON "app"."tenant_categories" USING "btree" ("parent_tenant_category_id");



CREATE INDEX "idx_tenant_categories_promoted_category_id" ON "app"."tenant_categories" USING "btree" ("promoted_catalog_category_id");



CREATE INDEX "idx_tenant_categories_tenant_review_deleted" ON "app"."tenant_categories" USING "btree" ("tenant_id", "review_status", "deleted_at");



CREATE UNIQUE INDEX "idx_tenant_categories_tenant_slug_unique" ON "app"."tenant_categories" USING "btree" ("tenant_id", "slug") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_tenant_category_images_category_sort" ON "app"."tenant_category_images" USING "btree" ("tenant_category_id", "deleted_at", "sort_order");



CREATE UNIQUE INDEX "idx_tenant_category_images_primary_per_type" ON "app"."tenant_category_images" USING "btree" ("tenant_category_id", "image_type") WHERE (("is_primary" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_tenant_field_mappings_lookup" ON "app"."tenant_field_mappings" USING "btree" ("tenant_id", "tenant_integration_id", "entity_type") WHERE ("is_active" = true);



CREATE INDEX "idx_tenant_inventory_tenant_product_id" ON "app"."tenant_inventory" USING "btree" ("tenant_product_id");



CREATE INDEX "idx_tenant_products_category_id" ON "app"."tenant_products" USING "btree" ("tenant_category_id");



CREATE INDEX "idx_tenant_products_embedding" ON "app"."tenant_products" USING "hnsw" ("embedding" "public"."vector_cosine_ops");



CREATE INDEX "idx_tenant_products_internal_sku" ON "app"."tenant_products" USING "btree" ("internal_sku");



CREATE INDEX "idx_tenant_products_master_product_id" ON "app"."tenant_products" USING "btree" ("master_product_id");



CREATE INDEX "idx_tenant_products_search_vector" ON "app"."tenant_products" USING "gin" ("search_vector");



CREATE INDEX "idx_tenant_products_tenant_brand_id" ON "app"."tenant_products" USING "btree" ("tenant_brand_id");



CREATE INDEX "idx_tenant_products_tenant_created" ON "app"."tenant_products" USING "btree" ("tenant_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_tenant_products_tenant_id" ON "app"."tenant_products" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_settings_updated_at" ON "app"."tenant_settings" USING "btree" ("updated_at");



CREATE INDEX "idx_tenant_users_role" ON "app"."tenant_users" USING "btree" ("role");



CREATE INDEX "idx_tenant_users_tenant_id" ON "app"."tenant_users" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_users_tenant_user_active" ON "app"."tenant_users" USING "btree" ("tenant_id", "user_id", "is_active");



CREATE INDEX "idx_tenant_users_user_id" ON "app"."tenant_users" USING "btree" ("user_id");



CREATE INDEX "idx_tenants_slug" ON "app"."tenants" USING "btree" ("slug");



CREATE INDEX "idx_tenants_subdomain" ON "app"."tenants" USING "btree" ("subdomain");



CREATE INDEX "idx_user_profiles_deleted_at" ON "app"."user_profiles" USING "btree" ("deleted_at");



CREATE INDEX "idx_warehouses_location_id" ON "app"."warehouses" USING "btree" ("location_id");



CREATE INDEX "idx_warehouses_snapshot_tenant" ON "app"."warehouses_snapshot" USING "btree" ("tenant_id");



CREATE INDEX "idx_warehouses_tenant_id" ON "app"."warehouses" USING "btree" ("tenant_id");



CREATE INDEX "idx_whatsapp_broadcasts_tenant_created" ON "app"."whatsapp_broadcasts" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_whatsapp_broadcasts_tenant_id" ON "app"."whatsapp_broadcasts" USING "btree" ("tenant_id");



CREATE INDEX "idx_whatsapp_broadcasts_tenant_status" ON "app"."whatsapp_broadcasts" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_whatsapp_credit_transactions_tenant_created" ON "app"."whatsapp_credit_transactions" USING "btree" ("tenant_id", "created_at");



CREATE INDEX "idx_whatsapp_messages_tenant_broadcast" ON "app"."whatsapp_messages" USING "btree" ("tenant_id", "whatsapp_broadcast_id");



CREATE INDEX "idx_whatsapp_messages_tenant_category_sent" ON "app"."whatsapp_messages" USING "btree" ("tenant_id", "meta_category", "sent_at");



CREATE UNIQUE INDEX "idx_whatsapp_messages_transaction_idempotency" ON "app"."whatsapp_messages" USING "btree" ("tenant_id", "trigger_source", "related_entity_id", "recipient_phone") WHERE (("related_entity_id" IS NOT NULL) AND ("status" <> 'failed'::"text"));



CREATE INDEX "idx_whatsapp_send_queue_pending_priority" ON "app"."whatsapp_send_queue" USING "btree" ("priority", "scheduled_send_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_whatsapp_send_queue_processing" ON "app"."whatsapp_send_queue" USING "btree" ("priority", "created_at") WHERE ("status" = 'processing'::"text");



CREATE INDEX "idx_whatsapp_send_queue_tenant_status" ON "app"."whatsapp_send_queue" USING "btree" ("tenant_id", "status");



CREATE INDEX "integration_data_flows_active_idx" ON "app"."integration_data_flows" USING "btree" ("tenant_id", "tenant_integration_id", "is_active");



CREATE UNIQUE INDEX "integration_data_flows_tenant_external_ref_unique" ON "app"."integration_data_flows" USING "btree" ("tenant_id", "external_ref") WHERE (("external_ref" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "integration_entity_map_lookup_idx" ON "app"."integration_entity_map" USING "btree" ("tenant_id", "entity_type", "internal_id");



CREATE UNIQUE INDEX "integration_entity_map_tenant_external_ref_unique" ON "app"."integration_entity_map" USING "btree" ("tenant_id", "external_ref") WHERE (("external_ref" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "integration_oauth_states_token_idx" ON "app"."integration_oauth_states" USING "btree" ("state_token");



CREATE INDEX "integration_sync_jobs_integration_created_at_idx" ON "app"."integration_sync_jobs" USING "btree" ("tenant_integration_id", "created_at" DESC);



CREATE INDEX "integration_sync_jobs_phase_idx" ON "app"."integration_sync_jobs" USING "btree" ("tenant_integration_id", "phase", "created_at" DESC);



CREATE INDEX "integration_sync_jobs_status_created_at_idx" ON "app"."integration_sync_jobs" USING "btree" ("status", "created_at");



CREATE INDEX "integration_sync_jobs_tenant_created_at_idx" ON "app"."integration_sync_jobs" USING "btree" ("tenant_id", "created_at" DESC);



CREATE UNIQUE INDEX "integration_sync_jobs_tenant_external_ref_unique" ON "app"."integration_sync_jobs" USING "btree" ("tenant_id", "external_ref") WHERE (("external_ref" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "integration_webhooks_endpoint_token_unique" ON "app"."integration_webhooks" USING "btree" ("endpoint_token");



CREATE UNIQUE INDEX "integration_webhooks_entity_rule_unique" ON "app"."integration_webhooks" USING "btree" ("tenant_integration_id", "provider", "entity_type", "rule_type") WHERE (("deleted_at" IS NULL) AND ("entity_type" IS NOT NULL) AND ("rule_type" IS NOT NULL));



CREATE INDEX "integration_webhooks_lookup_idx" ON "app"."integration_webhooks" USING "btree" ("tenant_id", "tenant_integration_id", "provider", "entity_type") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "integration_webhooks_tenant_external_ref_unique" ON "app"."integration_webhooks" USING "btree" ("tenant_id", "external_ref") WHERE (("external_ref" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "invoice_items_invoice_external_ref_upsert" ON "app"."invoice_items" USING "btree" ("invoice_id", "external_ref");



CREATE UNIQUE INDEX "locations_one_default_per_tenant" ON "app"."locations" USING "btree" ("tenant_id") WHERE (("is_default" = true) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "locations_tenant_external_ref_unique" ON "app"."locations" USING "btree" ("tenant_id", "external_ref") WHERE (("external_ref" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "locations_tenant_external_ref_upsert" ON "app"."locations" USING "btree" ("tenant_id", "external_ref");



CREATE UNIQUE INDEX "order_items_order_external_ref_upsert" ON "app"."order_items" USING "btree" ("order_id", "external_ref");



CREATE UNIQUE INDEX "orders_tenant_external_ref_upsert" ON "app"."orders" USING "btree" ("tenant_id", "external_ref");



CREATE UNIQUE INDEX "price_list_assignments_zoho_upsert" ON "app"."price_list_assignments" USING "btree" ("price_list_id", "target_type", "target_id", "external_ref");



CREATE UNIQUE INDEX "price_lists_tenant_external_ref_unfiltered_upsert" ON "app"."price_lists" USING "btree" ("tenant_id", "external_ref");



CREATE UNIQUE INDEX "tenant_brands_tenant_external_ref_upsert" ON "app"."tenant_brands" USING "btree" ("tenant_id", "external_ref");



CREATE UNIQUE INDEX "tenant_categories_tenant_external_ref_upsert" ON "app"."tenant_categories" USING "btree" ("tenant_id", "external_ref");



CREATE UNIQUE INDEX "tenant_integrations_tenant_external_ref_unique" ON "app"."tenant_integrations" USING "btree" ("tenant_id", "external_ref") WHERE (("external_ref" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "tenant_inventory_product_warehouse_upsert" ON "app"."tenant_inventory" USING "btree" ("tenant_product_id", "warehouse_id");



CREATE UNIQUE INDEX "tenant_products_tenant_external_ref_upsert" ON "app"."tenant_products" USING "btree" ("tenant_id", "external_ref");



CREATE UNIQUE INDEX "warehouses_tenant_external_ref_upsert" ON "app"."warehouses" USING "btree" ("tenant_id", "external_ref");



CREATE OR REPLACE TRIGGER "buyer_app_activity_updated_at" BEFORE UPDATE ON "app"."buyer_app_activity" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "buyer_users_search_vector_update" BEFORE INSERT OR UPDATE ON "app"."buyer_users" FOR EACH ROW EXECUTE FUNCTION "app"."buyer_users_search_vector_update"();



CREATE OR REPLACE TRIGGER "buyers_search_vector_update" BEFORE INSERT OR UPDATE OF "business_name", "contact_name" ON "app"."buyers" FOR EACH ROW EXECUTE FUNCTION "app"."buyers_search_vector_update"();



CREATE OR REPLACE TRIGGER "buyers_updated_at" BEFORE UPDATE ON "app"."buyers" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_views_updated_at" BEFORE UPDATE ON "app"."campaign_views" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campaigns_updated_at" BEFORE UPDATE ON "app"."campaigns" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "cohorts_updated_at" BEFORE UPDATE ON "app"."cohorts" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "credit_notes_updated_at" BEFORE UPDATE ON "app"."credit_notes" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "estimate_items_updated_at" BEFORE UPDATE ON "app"."estimate_items" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "estimates_updated_at" BEFORE UPDATE ON "app"."estimates" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "integration_data_flows_tenant_consistency" BEFORE INSERT OR UPDATE ON "app"."integration_data_flows" FOR EACH ROW EXECUTE FUNCTION "app"."_assert_integration_child_tenant_consistency"();



CREATE OR REPLACE TRIGGER "integration_data_flows_updated_at" BEFORE UPDATE ON "app"."integration_data_flows" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "integration_data_flows_validate_webhook" BEFORE INSERT OR UPDATE ON "app"."integration_data_flows" FOR EACH ROW EXECUTE FUNCTION "app"."_validate_integration_data_flow_webhook"();



CREATE OR REPLACE TRIGGER "integration_entity_map_tenant_consistency" BEFORE INSERT OR UPDATE ON "app"."integration_entity_map" FOR EACH ROW EXECUTE FUNCTION "app"."_assert_integration_child_tenant_consistency"();



CREATE OR REPLACE TRIGGER "integration_entity_map_updated_at" BEFORE UPDATE ON "app"."integration_entity_map" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "integration_sync_jobs_tenant_consistency" BEFORE INSERT OR UPDATE ON "app"."integration_sync_jobs" FOR EACH ROW EXECUTE FUNCTION "app"."_assert_integration_child_tenant_consistency"();



CREATE OR REPLACE TRIGGER "integration_sync_jobs_updated_at" BEFORE UPDATE ON "app"."integration_sync_jobs" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "integration_webhook_echo_guards_tenant_consistency" BEFORE INSERT OR UPDATE ON "app"."integration_webhook_echo_guards" FOR EACH ROW EXECUTE FUNCTION "app"."_assert_integration_child_tenant_consistency"();



CREATE OR REPLACE TRIGGER "integration_webhook_echo_guards_updated_at" BEFORE UPDATE ON "app"."integration_webhook_echo_guards" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "integration_webhook_errors_tenant_consistency" BEFORE INSERT OR UPDATE ON "app"."integration_webhook_errors" FOR EACH ROW EXECUTE FUNCTION "app"."_assert_integration_child_tenant_consistency"();



CREATE OR REPLACE TRIGGER "integration_webhook_errors_updated_at" BEFORE UPDATE ON "app"."integration_webhook_errors" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "integration_webhook_event_changes_tenant_consistency" BEFORE INSERT OR UPDATE ON "app"."integration_webhook_event_changes" FOR EACH ROW EXECUTE FUNCTION "app"."_assert_integration_child_tenant_consistency"();



CREATE OR REPLACE TRIGGER "integration_webhook_event_changes_updated_at" BEFORE UPDATE ON "app"."integration_webhook_event_changes" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "integration_webhook_events_tenant_consistency" BEFORE INSERT OR UPDATE ON "app"."integration_webhook_events" FOR EACH ROW EXECUTE FUNCTION "app"."_assert_integration_child_tenant_consistency"();



CREATE OR REPLACE TRIGGER "integration_webhook_events_updated_at" BEFORE UPDATE ON "app"."integration_webhook_events" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "integration_webhooks_tenant_consistency" BEFORE INSERT OR UPDATE ON "app"."integration_webhooks" FOR EACH ROW EXECUTE FUNCTION "app"."_assert_integration_child_tenant_consistency"();



CREATE OR REPLACE TRIGGER "integration_webhooks_updated_at" BEFORE UPDATE ON "app"."integration_webhooks" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "invoice_items_updated_at" BEFORE UPDATE ON "app"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "invoices_updated_at" BEFORE UPDATE ON "app"."invoices" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "orders_updated_at" BEFORE UPDATE ON "app"."orders" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "payments_updated_at" BEFORE UPDATE ON "app"."payments" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "price_lists_updated_at" BEFORE UPDATE ON "app"."price_lists" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "push-estimate-to-zoho" AFTER INSERT ON "app"."estimates" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1/push-estimate-to-zoho', 'POST', '{"Content-type":"application/json","x-push-secret":"G3QJ8najVWNzgSyqhGwYZVX6TdQVlyub8rcHFTppfTN1ye60I7gbr6x8WdN6rvCn"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "push-order-to-zoho" AFTER INSERT ON "app"."orders" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1/push-order-to-zoho', 'POST', '{"Content-type":"application/json","x-push-secret":"G3QJ8najVWNzgSyqhGwYZVX6TdQVlyub8rcHFTppfTN1ye60I7gbr6x8WdN6rvCn"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "tenant_brands_updated_at" BEFORE UPDATE ON "app"."tenant_brands" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_broadcast_limits_updated_at" BEFORE UPDATE ON "app"."tenant_broadcast_limits" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_categories_updated_at" BEFORE UPDATE ON "app"."tenant_categories" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_category_embedding_queue" AFTER INSERT OR UPDATE OF "name" ON "app"."tenant_categories" FOR EACH ROW EXECUTE FUNCTION "app"."tenant_category_embedding_queue"();



CREATE OR REPLACE TRIGGER "tenant_category_images_updated_at" BEFORE UPDATE ON "app"."tenant_category_images" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_field_mappings_updated_at" BEFORE UPDATE ON "app"."tenant_field_mappings" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_integrations_updated_at" BEFORE UPDATE ON "app"."tenant_integrations" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_product_brand_embedding_queue" AFTER INSERT OR UPDATE OF "display_name_override", "master_brand_id" ON "app"."tenant_brands" FOR EACH ROW EXECUTE FUNCTION "app"."tenant_product_brand_embedding_queue"();



CREATE OR REPLACE TRIGGER "tenant_products_embedding_queue" AFTER INSERT OR UPDATE OF "name_override", "internal_sku", "attributes_override", "tenant_brand_id", "tenant_category_id", "master_product_id", "hsn_code" ON "app"."tenant_products" FOR EACH ROW EXECUTE FUNCTION "app"."tenant_products_embedding_queue"();



CREATE OR REPLACE TRIGGER "tenant_products_search_vector_update" BEFORE INSERT OR UPDATE OF "name_override", "internal_sku", "master_product_id", "tenant_brand_id", "tenant_category_id", "attributes_override", "hsn_code" ON "app"."tenant_products" FOR EACH ROW EXECUTE FUNCTION "app"."tenant_products_search_vector_update"();



CREATE OR REPLACE TRIGGER "tenant_products_updated_at" BEFORE UPDATE ON "app"."tenant_products" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_settings_updated_at" BEFORE UPDATE ON "app"."tenant_settings" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_users_updated_at" BEFORE UPDATE ON "app"."tenant_users" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tenants_updated_at" BEFORE UPDATE ON "app"."tenants" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_buyer_geography_cohort_refresh" AFTER UPDATE OF "geography" ON "app"."buyers" FOR EACH ROW EXECUTE FUNCTION "app"."trg_buyer_geography_changed"();



CREATE OR REPLACE TRIGGER "trg_buyer_users_dispatch" AFTER INSERT OR DELETE OR UPDATE ON "app"."buyer_users" FOR EACH ROW EXECUTE FUNCTION "app"."dispatch_from_buyer_users"();



CREATE OR REPLACE TRIGGER "trg_buyers_dispatch" AFTER INSERT OR DELETE OR UPDATE ON "app"."buyers" FOR EACH ROW EXECUTE FUNCTION "app"."dispatch_from_buyers"();



CREATE OR REPLACE TRIGGER "trg_estimates_dispatch" AFTER INSERT OR DELETE OR UPDATE ON "app"."estimates" FOR EACH ROW EXECUTE FUNCTION "app"."dispatch_from_estimates"();



CREATE OR REPLACE TRIGGER "trg_integration_sync_jobs_post_rebuild" AFTER UPDATE ON "app"."integration_sync_jobs" FOR EACH ROW EXECUTE FUNCTION "app"."trg_post_sync_rebuild"();



CREATE OR REPLACE TRIGGER "trg_inventory_campaign_refresh" AFTER INSERT OR UPDATE OF "qty_available" ON "app"."tenant_inventory" FOR EACH ROW EXECUTE FUNCTION "app"."trg_inventory_campaign_refresh"();



CREATE OR REPLACE TRIGGER "trg_inventory_dispatch" AFTER INSERT OR DELETE OR UPDATE ON "app"."tenant_inventory" FOR EACH ROW EXECUTE FUNCTION "app"."dispatch_from_inventory"();



CREATE OR REPLACE TRIGGER "trg_invoices_dispatch" AFTER INSERT OR DELETE OR UPDATE ON "app"."invoices" FOR EACH ROW EXECUTE FUNCTION "app"."dispatch_from_invoices"();



CREATE OR REPLACE TRIGGER "trg_kpi_brand_daily_updated_at" BEFORE UPDATE ON "app"."kpi_brand_daily" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_kpi_category_daily_updated_at" BEFORE UPDATE ON "app"."kpi_category_daily" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_kpi_estimates_daily_updated_at" BEFORE UPDATE ON "app"."kpi_estimates_daily" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_kpi_invoices_daily_updated_at" BEFORE UPDATE ON "app"."kpi_invoices_daily" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_kpi_location_daily_updated_at" BEFORE UPDATE ON "app"."kpi_location_daily" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_kpi_orders_daily_updated_at" BEFORE UPDATE ON "app"."kpi_orders_daily" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_kpi_product_daily_updated_at" BEFORE UPDATE ON "app"."kpi_product_daily" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_kpi_tenant_daily_updated_at" BEFORE UPDATE ON "app"."kpi_tenant_daily" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_kpi_warehouse_daily_updated_at" BEFORE UPDATE ON "app"."kpi_warehouse_daily" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_order_buyer_cohort_refresh" AFTER INSERT OR UPDATE OF "status", "total_amount", "placed_at" ON "app"."orders" FOR EACH ROW EXECUTE FUNCTION "app"."trg_order_buyer_cohort_refresh"();



CREATE OR REPLACE TRIGGER "trg_order_items_dispatch" AFTER INSERT OR DELETE OR UPDATE ON "app"."order_items" FOR EACH ROW EXECUTE FUNCTION "app"."dispatch_from_order_items"();



CREATE OR REPLACE TRIGGER "trg_orders_dispatch" AFTER INSERT OR DELETE OR UPDATE ON "app"."orders" FOR EACH ROW EXECUTE FUNCTION "app"."dispatch_from_orders"();



CREATE OR REPLACE TRIGGER "trg_refresh_brand_categories" AFTER INSERT OR DELETE OR UPDATE OF "tenant_category_id", "tenant_brand_id", "deleted_at" ON "app"."tenant_products" FOR EACH ROW EXECUTE FUNCTION "app"."trg_refresh_brand_categories_fn"();



CREATE OR REPLACE TRIGGER "trg_set_is_buyer_app_estimate" BEFORE INSERT OR UPDATE ON "app"."estimates" FOR EACH ROW EXECUTE FUNCTION "app"."set_is_buyer_app_estimate"();



CREATE OR REPLACE TRIGGER "trg_set_is_buyer_app_invoice" BEFORE INSERT OR UPDATE ON "app"."invoices" FOR EACH ROW EXECUTE FUNCTION "app"."set_is_buyer_app_invoice"();



CREATE OR REPLACE TRIGGER "trg_set_is_buyer_app_order" BEFORE INSERT OR UPDATE ON "app"."orders" FOR EACH ROW EXECUTE FUNCTION "app"."set_is_buyer_app_order"();



CREATE OR REPLACE TRIGGER "trg_tenant_brands_dispatch" AFTER INSERT OR DELETE OR UPDATE ON "app"."tenant_brands" FOR EACH ROW EXECUTE FUNCTION "app"."dispatch_from_tenant_brands"();



CREATE OR REPLACE TRIGGER "trg_tenant_integrations_seed_field_mappings" AFTER INSERT ON "app"."tenant_integrations" FOR EACH ROW EXECUTE FUNCTION "app"."trg_tenant_integrations_seed_field_mappings"();



CREATE OR REPLACE TRIGGER "trg_tenant_products_dispatch" AFTER INSERT OR DELETE OR UPDATE ON "app"."tenant_products" FOR EACH ROW EXECUTE FUNCTION "app"."dispatch_from_tenant_products"();



CREATE OR REPLACE TRIGGER "user_profiles_updated_at" BEFORE UPDATE ON "app"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "whatsapp_broadcasts_updated_at" BEFORE UPDATE ON "app"."whatsapp_broadcasts" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "whatsapp_credit_pricing_updated_at" BEFORE UPDATE ON "app"."whatsapp_credit_pricing" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "whatsapp_credit_transactions_updated_at" BEFORE UPDATE ON "app"."whatsapp_credit_transactions" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "whatsapp_messages_updated_at" BEFORE UPDATE ON "app"."whatsapp_messages" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "whatsapp_platform_config_updated_at" BEFORE UPDATE ON "app"."whatsapp_platform_config" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "whatsapp_rate_card_updated_at" BEFORE UPDATE ON "app"."whatsapp_rate_card" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "whatsapp_send_queue_updated_at" BEFORE UPDATE ON "app"."whatsapp_send_queue" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



CREATE OR REPLACE TRIGGER "whatsapp_templates_updated_at" BEFORE UPDATE ON "app"."whatsapp_templates" FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();



ALTER TABLE ONLY "app"."brands_snapshot"
    ADD CONSTRAINT "brands_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."buyer_app_activity"
    ADD CONSTRAINT "buyer_app_activity_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."buyer_app_activity"
    ADD CONSTRAINT "buyer_app_activity_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."buyer_app_activity"
    ADD CONSTRAINT "buyer_app_activity_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."buyer_app_activity"
    ADD CONSTRAINT "buyer_app_activity_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."buyer_app_activity"
    ADD CONSTRAINT "buyer_app_activity_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."kpi_buyer_app_daily"
    ADD CONSTRAINT "buyer_app_daily_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."buyer_app_snapshot"
    ADD CONSTRAINT "buyer_app_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."buyer_current_snapshot"
    ADD CONSTRAINT "buyer_current_snapshot_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."buyer_current_snapshot"
    ADD CONSTRAINT "buyer_current_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."buyer_users"
    ADD CONSTRAINT "buyer_users_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."buyer_users"
    ADD CONSTRAINT "buyer_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."buyers"
    ADD CONSTRAINT "buyers_default_cohort_id_fkey" FOREIGN KEY ("default_cohort_id") REFERENCES "app"."cohorts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."buyers_snapshot"
    ADD CONSTRAINT "buyers_snapshot_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."buyers_snapshot"
    ADD CONSTRAINT "buyers_snapshot_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."buyers_snapshot"
    ADD CONSTRAINT "buyers_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."buyers"
    ADD CONSTRAINT "buyers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."campaign_views"
    ADD CONSTRAINT "catalog_views_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."campaign_views"
    ADD CONSTRAINT "catalog_views_catalog_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "app"."campaigns"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."campaign_views"
    ADD CONSTRAINT "catalog_views_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."categories_snapshot"
    ADD CONSTRAINT "categories_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."cohort_members"
    ADD CONSTRAINT "cohort_members_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."cohort_members"
    ADD CONSTRAINT "cohort_members_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "app"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."cohorts"
    ADD CONSTRAINT "cohorts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."credit_notes"
    ADD CONSTRAINT "credit_notes_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."credit_notes"
    ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."credit_notes"
    ADD CONSTRAINT "credit_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."email_verification_otps"
    ADD CONSTRAINT "email_verification_otps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."email_verification_otps"
    ADD CONSTRAINT "email_verification_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."estimate_items"
    ADD CONSTRAINT "estimate_items_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "app"."estimates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."estimate_items"
    ADD CONSTRAINT "estimate_items_tenant_product_id_fkey" FOREIGN KEY ("tenant_product_id") REFERENCES "app"."tenant_products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."estimates"
    ADD CONSTRAINT "estimates_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."estimates"
    ADD CONSTRAINT "estimates_catalog_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "app"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "app"."estimates"
    ADD CONSTRAINT "estimates_converted_to_order_id_fkey" FOREIGN KEY ("converted_to_order_id") REFERENCES "app"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "app"."estimates"
    ADD CONSTRAINT "estimates_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."estimates_snapshot"
    ADD CONSTRAINT "estimates_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."estimates"
    ADD CONSTRAINT "estimates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."integration_data_flows"
    ADD CONSTRAINT "integration_data_flows_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_data_flows"
    ADD CONSTRAINT "integration_data_flows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_data_flows"
    ADD CONSTRAINT "integration_data_flows_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "app"."tenant_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_data_flows"
    ADD CONSTRAINT "integration_data_flows_tenant_integration_tenant_fkey" FOREIGN KEY ("tenant_integration_id", "tenant_id") REFERENCES "app"."tenant_integrations"("id", "tenant_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_data_flows"
    ADD CONSTRAINT "integration_data_flows_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_data_flows"
    ADD CONSTRAINT "integration_data_flows_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "app"."integration_webhooks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_entity_map"
    ADD CONSTRAINT "integration_entity_map_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_entity_map"
    ADD CONSTRAINT "integration_entity_map_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_entity_map"
    ADD CONSTRAINT "integration_entity_map_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "app"."tenant_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_entity_map"
    ADD CONSTRAINT "integration_entity_map_tenant_integration_tenant_fkey" FOREIGN KEY ("tenant_integration_id", "tenant_id") REFERENCES "app"."tenant_integrations"("id", "tenant_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_entity_map"
    ADD CONSTRAINT "integration_entity_map_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_oauth_states"
    ADD CONSTRAINT "integration_oauth_states_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_oauth_states"
    ADD CONSTRAINT "integration_oauth_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."integration_sync_jobs"
    ADD CONSTRAINT "integration_sync_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_sync_jobs"
    ADD CONSTRAINT "integration_sync_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_sync_jobs"
    ADD CONSTRAINT "integration_sync_jobs_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "app"."tenant_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_sync_jobs"
    ADD CONSTRAINT "integration_sync_jobs_tenant_integration_tenant_fkey" FOREIGN KEY ("tenant_integration_id", "tenant_id") REFERENCES "app"."tenant_integrations"("id", "tenant_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_sync_jobs"
    ADD CONSTRAINT "integration_sync_jobs_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_sync_jobs"
    ADD CONSTRAINT "integration_sync_jobs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_webhook_echo_guards"
    ADD CONSTRAINT "integration_webhook_echo_guards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_webhook_echo_guards"
    ADD CONSTRAINT "integration_webhook_echo_guards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_echo_guards"
    ADD CONSTRAINT "integration_webhook_echo_guards_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "app"."tenant_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_echo_guards"
    ADD CONSTRAINT "integration_webhook_echo_guards_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_webhook_errors"
    ADD CONSTRAINT "integration_webhook_errors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_webhook_errors"
    ADD CONSTRAINT "integration_webhook_errors_integration_webhook_event_id_fkey" FOREIGN KEY ("integration_webhook_event_id") REFERENCES "app"."integration_webhook_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_errors"
    ADD CONSTRAINT "integration_webhook_errors_integration_webhook_id_fkey" FOREIGN KEY ("integration_webhook_id") REFERENCES "app"."integration_webhooks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_errors"
    ADD CONSTRAINT "integration_webhook_errors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_errors"
    ADD CONSTRAINT "integration_webhook_errors_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "app"."tenant_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_errors"
    ADD CONSTRAINT "integration_webhook_errors_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_webhook_event_changes"
    ADD CONSTRAINT "integration_webhook_event_cha_integration_webhook_event_id_fkey" FOREIGN KEY ("integration_webhook_event_id") REFERENCES "app"."integration_webhook_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_event_changes"
    ADD CONSTRAINT "integration_webhook_event_changes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_webhook_event_changes"
    ADD CONSTRAINT "integration_webhook_event_changes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_event_changes"
    ADD CONSTRAINT "integration_webhook_event_changes_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "app"."tenant_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_event_changes"
    ADD CONSTRAINT "integration_webhook_event_changes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_webhook_events"
    ADD CONSTRAINT "integration_webhook_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_webhook_events"
    ADD CONSTRAINT "integration_webhook_events_integration_webhook_id_fkey" FOREIGN KEY ("integration_webhook_id") REFERENCES "app"."integration_webhooks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_events"
    ADD CONSTRAINT "integration_webhook_events_replay_of_event_id_fkey" FOREIGN KEY ("replay_of_event_id") REFERENCES "app"."integration_webhook_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_events"
    ADD CONSTRAINT "integration_webhook_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_events"
    ADD CONSTRAINT "integration_webhook_events_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "app"."tenant_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhook_events"
    ADD CONSTRAINT "integration_webhook_events_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_webhooks"
    ADD CONSTRAINT "integration_webhooks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."integration_webhooks"
    ADD CONSTRAINT "integration_webhooks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhooks"
    ADD CONSTRAINT "integration_webhooks_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "app"."tenant_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhooks"
    ADD CONSTRAINT "integration_webhooks_tenant_integration_tenant_fkey" FOREIGN KEY ("tenant_integration_id", "tenant_id") REFERENCES "app"."tenant_integrations"("id", "tenant_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."integration_webhooks"
    ADD CONSTRAINT "integration_webhooks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."invoice_items"
    ADD CONSTRAINT "invoice_items_tenant_product_id_fkey" FOREIGN KEY ("tenant_product_id") REFERENCES "app"."tenant_products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."invoices"
    ADD CONSTRAINT "invoices_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."invoices"
    ADD CONSTRAINT "invoices_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "app"."estimates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."invoices"
    ADD CONSTRAINT "invoices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."invoices"
    ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "app"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."invoices_snapshot"
    ADD CONSTRAINT "invoices_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."invoices"
    ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."kpi_buyers_daily"
    ADD CONSTRAINT "kpi_buyers_daily_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."kpi_buyers_daily"
    ADD CONSTRAINT "kpi_buyers_daily_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."kpi_buyers_daily"
    ADD CONSTRAINT "kpi_buyers_daily_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."kpi_estimates_daily"
    ADD CONSTRAINT "kpi_estimates_daily_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."kpi_estimates_daily"
    ADD CONSTRAINT "kpi_estimates_daily_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."kpi_invoices_daily"
    ADD CONSTRAINT "kpi_invoices_daily_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."kpi_invoices_daily"
    ADD CONSTRAINT "kpi_invoices_daily_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."kpi_orders_daily"
    ADD CONSTRAINT "kpi_orders_daily_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."kpi_orders_daily"
    ADD CONSTRAINT "kpi_orders_daily_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."kpi_warehouse_daily"
    ADD CONSTRAINT "kpi_warehouse_daily_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "app"."warehouses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."locations_snapshot"
    ADD CONSTRAINT "locations_snapshot_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."locations_snapshot"
    ADD CONSTRAINT "locations_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."locations"
    ADD CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "app"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."order_items"
    ADD CONSTRAINT "order_items_tenant_product_id_fkey" FOREIGN KEY ("tenant_product_id") REFERENCES "app"."tenant_products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."orders"
    ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."orders"
    ADD CONSTRAINT "orders_catalog_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "app"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "app"."orders"
    ADD CONSTRAINT "orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."orders"
    ADD CONSTRAINT "orders_placed_by_fkey" FOREIGN KEY ("placed_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."orders_snapshot"
    ADD CONSTRAINT "orders_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."orders"
    ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."payments"
    ADD CONSTRAINT "payments_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."payments"
    ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."platform_admins"
    ADD CONSTRAINT "platform_admins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "app"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."price_list_assignments"
    ADD CONSTRAINT "price_list_assignments_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "app"."price_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."price_list_items"
    ADD CONSTRAINT "price_list_items_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "app"."price_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."price_list_items"
    ADD CONSTRAINT "price_list_items_tenant_product_id_fkey" FOREIGN KEY ("tenant_product_id") REFERENCES "app"."tenant_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."price_lists"
    ADD CONSTRAINT "price_lists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."products_snapshot"
    ADD CONSTRAINT "products_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."campaign_items"
    ADD CONSTRAINT "published_catalog_items_catalog_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "app"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."campaign_items"
    ADD CONSTRAINT "published_catalog_items_tenant_product_id_fkey" FOREIGN KEY ("tenant_product_id") REFERENCES "app"."tenant_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."campaigns"
    ADD CONSTRAINT "published_catalogs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_bundle_slots"
    ADD CONSTRAINT "reco_bundle_slots_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "app"."reco_bundles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_bundle_slots"
    ADD CONSTRAINT "reco_bundle_slots_tenant_category_id_fkey" FOREIGN KEY ("tenant_category_id") REFERENCES "app"."tenant_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_bundle_suggestions"
    ADD CONSTRAINT "reco_bundle_suggestions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."reco_bundle_suggestions"
    ADD CONSTRAINT "reco_bundle_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_bundles"
    ADD CONSTRAINT "reco_bundles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."reco_bundles"
    ADD CONSTRAINT "reco_bundles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_buyer_profiles"
    ADD CONSTRAINT "reco_buyer_profiles_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_buyer_profiles"
    ADD CONSTRAINT "reco_buyer_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_category_associations"
    ADD CONSTRAINT "reco_category_associations_category_a_id_fkey" FOREIGN KEY ("category_a_id") REFERENCES "app"."tenant_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_category_associations"
    ADD CONSTRAINT "reco_category_associations_category_b_id_fkey" FOREIGN KEY ("category_b_id") REFERENCES "app"."tenant_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_category_associations"
    ADD CONSTRAINT "reco_category_associations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_category_profiles"
    ADD CONSTRAINT "reco_category_profiles_tenant_category_id_fkey" FOREIGN KEY ("tenant_category_id") REFERENCES "app"."tenant_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_category_profiles"
    ADD CONSTRAINT "reco_category_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_product_associations"
    ADD CONSTRAINT "reco_product_associations_product_a_id_fkey" FOREIGN KEY ("product_a_id") REFERENCES "app"."tenant_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_product_associations"
    ADD CONSTRAINT "reco_product_associations_product_b_id_fkey" FOREIGN KEY ("product_b_id") REFERENCES "app"."tenant_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_product_associations"
    ADD CONSTRAINT "reco_product_associations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_product_popularity"
    ADD CONSTRAINT "reco_product_popularity_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."reco_product_popularity"
    ADD CONSTRAINT "reco_product_popularity_tenant_product_id_fkey" FOREIGN KEY ("tenant_product_id") REFERENCES "app"."tenant_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."stock_in_events"
    ADD CONSTRAINT "stock_in_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."stock_in_events"
    ADD CONSTRAINT "stock_in_events_tenant_product_id_fkey" FOREIGN KEY ("tenant_product_id") REFERENCES "app"."tenant_products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_brands"
    ADD CONSTRAINT "tenant_brands_default_cohort_id_fkey" FOREIGN KEY ("default_cohort_id") REFERENCES "app"."cohorts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_brands"
    ADD CONSTRAINT "tenant_brands_master_brand_id_fkey" FOREIGN KEY ("master_brand_id") REFERENCES "catalog"."brands"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_brands"
    ADD CONSTRAINT "tenant_brands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."tenant_broadcast_limits"
    ADD CONSTRAINT "tenant_broadcast_limits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_categories"
    ADD CONSTRAINT "tenant_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_categories"
    ADD CONSTRAINT "tenant_categories_master_category_id_fkey" FOREIGN KEY ("master_category_id") REFERENCES "catalog"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_categories"
    ADD CONSTRAINT "tenant_categories_parent_tenant_category_id_fkey" FOREIGN KEY ("parent_tenant_category_id") REFERENCES "app"."tenant_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_categories"
    ADD CONSTRAINT "tenant_categories_promoted_catalog_category_id_fkey" FOREIGN KEY ("promoted_catalog_category_id") REFERENCES "catalog"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_categories"
    ADD CONSTRAINT "tenant_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_categories"
    ADD CONSTRAINT "tenant_categories_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_category_images"
    ADD CONSTRAINT "tenant_category_images_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_category_images"
    ADD CONSTRAINT "tenant_category_images_tenant_category_id_fkey" FOREIGN KEY ("tenant_category_id") REFERENCES "app"."tenant_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_category_images"
    ADD CONSTRAINT "tenant_category_images_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_field_mappings"
    ADD CONSTRAINT "tenant_field_mappings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."tenant_field_mappings"
    ADD CONSTRAINT "tenant_field_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_field_mappings"
    ADD CONSTRAINT "tenant_field_mappings_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "app"."tenant_integrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_field_mappings"
    ADD CONSTRAINT "tenant_field_mappings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_integration_type_id_fkey" FOREIGN KEY ("integration_type_id") REFERENCES "catalog"."integration_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."tenant_inventory"
    ADD CONSTRAINT "tenant_inventory_tenant_product_id_fkey" FOREIGN KEY ("tenant_product_id") REFERENCES "app"."tenant_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."tenant_inventory"
    ADD CONSTRAINT "tenant_inventory_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "app"."warehouses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "app"."tenant_products"
    ADD CONSTRAINT "tenant_products_master_product_id_fkey" FOREIGN KEY ("master_product_id") REFERENCES "catalog"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_products"
    ADD CONSTRAINT "tenant_products_tenant_brand_id_fkey" FOREIGN KEY ("tenant_brand_id") REFERENCES "app"."tenant_brands"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."tenant_products"
    ADD CONSTRAINT "tenant_products_tenant_category_id_fkey" FOREIGN KEY ("tenant_category_id") REFERENCES "app"."tenant_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_products"
    ADD CONSTRAINT "tenant_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."tenant_settings"
    ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."tenant_settings"
    ADD CONSTRAINT "tenant_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "app"."tenant_users"
    ADD CONSTRAINT "tenant_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."tenant_users"
    ADD CONSTRAINT "tenant_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."user_profiles"
    ADD CONSTRAINT "user_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."user_profiles"
    ADD CONSTRAINT "user_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."warehouses"
    ADD CONSTRAINT "warehouses_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "app"."warehouses_snapshot"
    ADD CONSTRAINT "warehouses_snapshot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."warehouses_snapshot"
    ADD CONSTRAINT "warehouses_snapshot_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "app"."warehouses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."warehouses"
    ADD CONSTRAINT "warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."whatsapp_broadcasts"
    ADD CONSTRAINT "whatsapp_broadcasts_linked_campaign_id_fkey" FOREIGN KEY ("linked_campaign_id") REFERENCES "app"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "app"."whatsapp_broadcasts"
    ADD CONSTRAINT "whatsapp_broadcasts_target_cohort_id_fkey" FOREIGN KEY ("target_cohort_id") REFERENCES "app"."cohorts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."whatsapp_broadcasts"
    ADD CONSTRAINT "whatsapp_broadcasts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."whatsapp_broadcasts"
    ADD CONSTRAINT "whatsapp_broadcasts_whatsapp_template_id_fkey" FOREIGN KEY ("whatsapp_template_id") REFERENCES "app"."whatsapp_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."whatsapp_credit_transactions"
    ADD CONSTRAINT "whatsapp_credit_transactions_related_message_id_fkey" FOREIGN KEY ("related_message_id") REFERENCES "app"."whatsapp_messages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."whatsapp_credit_transactions"
    ADD CONSTRAINT "whatsapp_credit_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "app"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_wallet_transaction_id_fkey" FOREIGN KEY ("wallet_transaction_id") REFERENCES "app"."whatsapp_credit_transactions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_whatsapp_broadcast_id_fkey" FOREIGN KEY ("whatsapp_broadcast_id") REFERENCES "app"."whatsapp_broadcasts"("id");



ALTER TABLE ONLY "app"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_whatsapp_template_id_fkey" FOREIGN KEY ("whatsapp_template_id") REFERENCES "app"."whatsapp_templates"("id");



ALTER TABLE ONLY "app"."whatsapp_send_queue"
    ADD CONSTRAINT "whatsapp_send_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."whatsapp_send_queue"
    ADD CONSTRAINT "whatsapp_send_queue_whatsapp_message_id_fkey" FOREIGN KEY ("whatsapp_message_id") REFERENCES "app"."whatsapp_messages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "app"."whatsapp_templates"
    ADD CONSTRAINT "whatsapp_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id");



ALTER TABLE ONLY "app"."zoho_token_cache"
    ADD CONSTRAINT "zoho_token_cache_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id") REFERENCES "app"."tenant_integrations"("id") ON DELETE CASCADE;



ALTER TABLE "app"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_seller_admin_select" ON "app"."audit_log" FOR SELECT USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."brands_snapshot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."buyer_app_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."buyer_app_snapshot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."buyer_current_snapshot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."buyer_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "buyer_users_buyer_admin_delete" ON "app"."buyer_users" FOR DELETE USING (("app"."is_buyer_admin"() AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "buyer_users_buyer_admin_insert" ON "app"."buyer_users" FOR INSERT WITH CHECK (("app"."is_buyer_admin"() AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "buyer_users_buyer_admin_update" ON "app"."buyer_users" FOR UPDATE USING (("app"."is_buyer_admin"() AND ("buyer_id" = "app"."jwt_buyer_id"()))) WITH CHECK (("app"."is_buyer_admin"() AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "buyer_users_buyer_select" ON "app"."buyer_users" FOR SELECT USING (("app"."is_buyer"() AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "buyer_users_seller_select" ON "app"."buyer_users" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."buyers" "b"
  WHERE (("b"."id" = "buyer_users"."buyer_id") AND ("b"."tenant_id" = "app"."jwt_tenant_id"()))))));



ALTER TABLE "app"."buyers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "buyers_buyer_select" ON "app"."buyers" FOR SELECT USING (("app"."is_buyer"() AND ("id" = "app"."jwt_buyer_id"())));



CREATE POLICY "buyers_delete" ON "app"."buyers" FOR DELETE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "buyers_insert" ON "app"."buyers" FOR INSERT WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "buyers_seller_select" ON "app"."buyers" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."buyers_snapshot" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "buyers_update" ON "app"."buyers" FOR UPDATE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."campaign_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_items_buyer_select" ON "app"."campaign_items" FOR SELECT USING (("app"."is_buyer"() AND (EXISTS ( SELECT 1
   FROM "app"."campaigns" "c"
  WHERE (("c"."id" = "campaign_items"."campaign_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()) AND ("c"."status" = 'published'::"text") AND (("c"."valid_to" IS NULL) OR ("c"."valid_to" > "now"())))))));



CREATE POLICY "campaign_items_seller_delete" ON "app"."campaign_items" FOR DELETE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."campaigns" "c"
  WHERE (("c"."id" = "campaign_items"."campaign_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "campaign_items_seller_insert" ON "app"."campaign_items" FOR INSERT WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."campaigns" "c"
  WHERE (("c"."id" = "campaign_items"."campaign_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "campaign_items_seller_select" ON "app"."campaign_items" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."campaigns" "c"
  WHERE (("c"."id" = "campaign_items"."campaign_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "campaign_items_seller_update" ON "app"."campaign_items" FOR UPDATE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."campaigns" "c"
  WHERE (("c"."id" = "campaign_items"."campaign_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"())))))) WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."campaigns" "c"
  WHERE (("c"."id" = "campaign_items"."campaign_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()))))));



ALTER TABLE "app"."campaign_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_views_buyer_insert" ON "app"."campaign_views" FOR INSERT WITH CHECK (("app"."is_buyer"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "campaign_views_buyer_select" ON "app"."campaign_views" FOR SELECT USING (("app"."is_buyer"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "campaign_views_seller_admin_delete" ON "app"."campaign_views" FOR DELETE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "campaign_views_seller_admin_insert" ON "app"."campaign_views" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "campaign_views_seller_admin_update" ON "app"."campaign_views" FOR UPDATE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "campaign_views_seller_select" ON "app"."campaign_views" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaigns_buyer_select" ON "app"."campaigns" FOR SELECT USING (("app"."is_buyer"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("status" = 'published'::"text") AND (("valid_to" IS NULL) OR ("valid_to" > "now"()))));



CREATE POLICY "campaigns_seller_delete" ON "app"."campaigns" FOR DELETE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "campaigns_seller_insert" ON "app"."campaigns" FOR INSERT WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "campaigns_seller_select" ON "app"."campaigns" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "campaigns_seller_update" ON "app"."campaigns" FOR UPDATE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."categories_snapshot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."cohort_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cohort_members_seller_admin_delete" ON "app"."cohort_members" FOR DELETE USING (("app"."is_seller_admin"() AND (EXISTS ( SELECT 1
   FROM "app"."cohorts" "c"
  WHERE (("c"."id" = "cohort_members"."cohort_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "cohort_members_seller_admin_insert" ON "app"."cohort_members" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND (EXISTS ( SELECT 1
   FROM "app"."cohorts" "c"
  WHERE (("c"."id" = "cohort_members"."cohort_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "cohort_members_seller_select" ON "app"."cohort_members" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."cohorts" "c"
  WHERE (("c"."id" = "cohort_members"."cohort_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()))))));



ALTER TABLE "app"."cohorts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cohorts_seller_admin_delete" ON "app"."cohorts" FOR DELETE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "cohorts_seller_admin_insert" ON "app"."cohorts" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "cohorts_seller_admin_update" ON "app"."cohorts" FOR UPDATE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "cohorts_seller_select" ON "app"."cohorts" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."credit_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_notes_seller_admin_delete" ON "app"."credit_notes" FOR DELETE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "credit_notes_seller_admin_insert" ON "app"."credit_notes" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "credit_notes_seller_admin_update" ON "app"."credit_notes" FOR UPDATE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "credit_notes_seller_select" ON "app"."credit_notes" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."email_verification_otps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."estimate_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "estimate_items_buyer_insert" ON "app"."estimate_items" FOR INSERT WITH CHECK (("app"."is_buyer"() AND (EXISTS ( SELECT 1
   FROM "app"."estimates" "e"
  WHERE (("e"."id" = "estimate_items"."estimate_id") AND ("e"."tenant_id" = "app"."jwt_tenant_id"()) AND ("e"."buyer_id" = "app"."jwt_buyer_id"()))))));



CREATE POLICY "estimate_items_buyer_select" ON "app"."estimate_items" FOR SELECT USING (("app"."is_buyer"() AND (EXISTS ( SELECT 1
   FROM "app"."estimates" "e"
  WHERE (("e"."id" = "estimate_items"."estimate_id") AND ("e"."tenant_id" = "app"."jwt_tenant_id"()) AND ("e"."buyer_id" = "app"."jwt_buyer_id"()))))));



CREATE POLICY "estimate_items_seller_delete" ON "app"."estimate_items" FOR DELETE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."estimates" "e"
  WHERE (("e"."id" = "estimate_items"."estimate_id") AND ("e"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "estimate_items_seller_insert" ON "app"."estimate_items" FOR INSERT WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."estimates" "e"
  WHERE (("e"."id" = "estimate_items"."estimate_id") AND ("e"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "estimate_items_seller_select" ON "app"."estimate_items" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."estimates" "e"
  WHERE (("e"."id" = "estimate_items"."estimate_id") AND ("e"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "estimate_items_seller_update" ON "app"."estimate_items" FOR UPDATE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."estimates" "e"
  WHERE (("e"."id" = "estimate_items"."estimate_id") AND ("e"."tenant_id" = "app"."jwt_tenant_id"()))))));



ALTER TABLE "app"."estimates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "estimates_buyer_admin_update" ON "app"."estimates" FOR UPDATE USING (("app"."is_buyer_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("buyer_id" = "app"."jwt_buyer_id"()))) WITH CHECK (("app"."is_buyer_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "estimates_buyer_insert" ON "app"."estimates" FOR INSERT WITH CHECK (("app"."is_buyer"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "estimates_buyer_select" ON "app"."estimates" FOR SELECT USING (("app"."is_buyer"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "estimates_seller_delete" ON "app"."estimates" FOR DELETE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "estimates_seller_insert" ON "app"."estimates" FOR INSERT WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "estimates_seller_select" ON "app"."estimates" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "estimates_seller_update" ON "app"."estimates" FOR UPDATE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."estimates_snapshot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."integration_data_flows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_data_flows_select" ON "app"."integration_data_flows" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."integration_entity_map" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_entity_map_select" ON "app"."integration_entity_map" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."integration_oauth_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."integration_sync_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_sync_jobs_select" ON "app"."integration_sync_jobs" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."integration_webhook_echo_guards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_webhook_echo_guards_select" ON "app"."integration_webhook_echo_guards" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."integration_webhook_errors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_webhook_errors_select" ON "app"."integration_webhook_errors" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."integration_webhook_event_changes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_webhook_event_changes_select" ON "app"."integration_webhook_event_changes" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."integration_webhook_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_webhook_events_select" ON "app"."integration_webhook_events" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."integration_webhooks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_webhooks_select" ON "app"."integration_webhooks" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."invoice_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_items_buyer_select" ON "app"."invoice_items" FOR SELECT USING (("app"."is_buyer"() AND (EXISTS ( SELECT 1
   FROM "app"."invoices" "inv"
  WHERE (("inv"."id" = "invoice_items"."invoice_id") AND ("inv"."tenant_id" = "app"."jwt_tenant_id"()) AND ("inv"."buyer_id" = "app"."jwt_buyer_id"()))))));



CREATE POLICY "invoice_items_seller_delete" ON "app"."invoice_items" FOR DELETE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."invoices" "inv"
  WHERE (("inv"."id" = "invoice_items"."invoice_id") AND ("inv"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "invoice_items_seller_insert" ON "app"."invoice_items" FOR INSERT WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."invoices" "inv"
  WHERE (("inv"."id" = "invoice_items"."invoice_id") AND ("inv"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "invoice_items_seller_select" ON "app"."invoice_items" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."invoices" "inv"
  WHERE (("inv"."id" = "invoice_items"."invoice_id") AND ("inv"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "invoice_items_seller_update" ON "app"."invoice_items" FOR UPDATE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."invoices" "inv"
  WHERE (("inv"."id" = "invoice_items"."invoice_id") AND ("inv"."tenant_id" = "app"."jwt_tenant_id"()))))));



ALTER TABLE "app"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_buyer_select" ON "app"."invoices" FOR SELECT USING (("app"."is_buyer"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "invoices_seller_delete" ON "app"."invoices" FOR DELETE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "invoices_seller_insert" ON "app"."invoices" FOR INSERT WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "invoices_seller_select" ON "app"."invoices" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "invoices_seller_update" ON "app"."invoices" FOR UPDATE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."invoices_snapshot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."kpi_brand_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."kpi_buyer_app_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."kpi_buyers_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."kpi_category_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."kpi_estimates_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."kpi_invoices_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."kpi_location_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."kpi_orders_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."kpi_product_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpi_product_daily_seller_select" ON "app"."kpi_product_daily" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."kpi_tenant_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpi_tenant_daily_seller_select" ON "app"."kpi_tenant_daily" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."kpi_warehouse_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_delete" ON "app"."locations" FOR DELETE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "locations_insert" ON "app"."locations" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "locations_select" ON "app"."locations" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."locations_snapshot" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_update" ON "app"."locations" FOR UPDATE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_buyer_insert" ON "app"."order_items" FOR INSERT WITH CHECK (("app"."is_buyer"() AND (EXISTS ( SELECT 1
   FROM "app"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "app"."jwt_tenant_id"()) AND ("o"."buyer_id" = "app"."jwt_buyer_id"()))))));



CREATE POLICY "order_items_buyer_select" ON "app"."order_items" FOR SELECT USING (("app"."is_buyer"() AND (EXISTS ( SELECT 1
   FROM "app"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "app"."jwt_tenant_id"()) AND ("o"."buyer_id" = "app"."jwt_buyer_id"()))))));



CREATE POLICY "order_items_seller_delete" ON "app"."order_items" FOR DELETE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "order_items_seller_insert" ON "app"."order_items" FOR INSERT WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "order_items_seller_select" ON "app"."order_items" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "order_items_seller_update" ON "app"."order_items" FOR UPDATE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."tenant_id" = "app"."jwt_tenant_id"()))))));



ALTER TABLE "app"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_buyer_admin_update" ON "app"."orders" FOR UPDATE USING (("app"."is_buyer_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("buyer_id" = "app"."jwt_buyer_id"()))) WITH CHECK (("app"."is_buyer_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "orders_buyer_insert" ON "app"."orders" FOR INSERT WITH CHECK (("app"."is_buyer"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "orders_buyer_select" ON "app"."orders" FOR SELECT USING (("app"."is_buyer"() AND ("tenant_id" = "app"."jwt_tenant_id"()) AND ("buyer_id" = "app"."jwt_buyer_id"())));



CREATE POLICY "orders_seller_delete" ON "app"."orders" FOR DELETE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "orders_seller_insert" ON "app"."orders" FOR INSERT WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "orders_seller_select" ON "app"."orders" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "orders_seller_update" ON "app"."orders" FOR UPDATE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."orders_snapshot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."otp_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "otp_sessions_public" ON "app"."otp_sessions" USING (true) WITH CHECK (true);



ALTER TABLE "app"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_seller_admin_delete" ON "app"."payments" FOR DELETE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "payments_seller_admin_insert" ON "app"."payments" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "payments_seller_admin_update" ON "app"."payments" FOR UPDATE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "payments_seller_select" ON "app"."payments" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."platform_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."price_list_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "price_list_assignments_seller_admin_delete" ON "app"."price_list_assignments" FOR DELETE USING (("app"."is_seller_admin"() AND (EXISTS ( SELECT 1
   FROM "app"."price_lists" "pl"
  WHERE (("pl"."id" = "price_list_assignments"."price_list_id") AND ("pl"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "price_list_assignments_seller_admin_insert" ON "app"."price_list_assignments" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND (EXISTS ( SELECT 1
   FROM "app"."price_lists" "pl"
  WHERE (("pl"."id" = "price_list_assignments"."price_list_id") AND ("pl"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "price_list_assignments_seller_admin_update" ON "app"."price_list_assignments" FOR UPDATE USING (("app"."is_seller_admin"() AND (EXISTS ( SELECT 1
   FROM "app"."price_lists" "pl"
  WHERE (("pl"."id" = "price_list_assignments"."price_list_id") AND ("pl"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "price_list_assignments_seller_select" ON "app"."price_list_assignments" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."price_lists" "pl"
  WHERE (("pl"."id" = "price_list_assignments"."price_list_id") AND ("pl"."tenant_id" = "app"."jwt_tenant_id"()))))));



ALTER TABLE "app"."price_list_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "price_list_items_seller_admin_delete" ON "app"."price_list_items" FOR DELETE USING (("app"."is_seller_admin"() AND (EXISTS ( SELECT 1
   FROM "app"."price_lists" "pl"
  WHERE (("pl"."id" = "price_list_items"."price_list_id") AND ("pl"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "price_list_items_seller_admin_insert" ON "app"."price_list_items" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND (EXISTS ( SELECT 1
   FROM "app"."price_lists" "pl"
  WHERE (("pl"."id" = "price_list_items"."price_list_id") AND ("pl"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "price_list_items_seller_admin_update" ON "app"."price_list_items" FOR UPDATE USING (("app"."is_seller_admin"() AND (EXISTS ( SELECT 1
   FROM "app"."price_lists" "pl"
  WHERE (("pl"."id" = "price_list_items"."price_list_id") AND ("pl"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "price_list_items_seller_select" ON "app"."price_list_items" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."price_lists" "pl"
  WHERE (("pl"."id" = "price_list_items"."price_list_id") AND ("pl"."tenant_id" = "app"."jwt_tenant_id"()))))));



ALTER TABLE "app"."price_lists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "price_lists_seller_admin_delete" ON "app"."price_lists" FOR DELETE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "price_lists_seller_admin_insert" ON "app"."price_lists" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "price_lists_seller_admin_update" ON "app"."price_lists" FOR UPDATE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "price_lists_seller_select" ON "app"."price_lists" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."products_snapshot" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reco_assoc_service_write" ON "app"."reco_product_associations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "reco_assoc_tenant_read" ON "app"."reco_product_associations" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



ALTER TABLE "app"."reco_bundle_slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reco_bundle_slots_service_write" ON "app"."reco_bundle_slots" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "reco_bundle_slots_tenant_read" ON "app"."reco_bundle_slots" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "app"."reco_bundles" "rb"
  WHERE (("rb"."id" = "reco_bundle_slots"."bundle_id") AND ("rb"."tenant_id" = "app"."jwt_tenant_id"())))));



CREATE POLICY "reco_bundle_sugg_service_write" ON "app"."reco_bundle_suggestions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "reco_bundle_sugg_tenant_read" ON "app"."reco_bundle_suggestions" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



ALTER TABLE "app"."reco_bundle_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."reco_bundles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reco_bundles_service_write" ON "app"."reco_bundles" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "reco_bundles_tenant_read" ON "app"."reco_bundles" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



ALTER TABLE "app"."reco_buyer_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reco_buyer_profiles_service_write" ON "app"."reco_buyer_profiles" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "reco_buyer_profiles_tenant_read" ON "app"."reco_buyer_profiles" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "reco_cat_assoc_service_write" ON "app"."reco_category_associations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "reco_cat_assoc_tenant_read" ON "app"."reco_category_associations" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "reco_cat_profiles_service_write" ON "app"."reco_category_profiles" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "reco_cat_profiles_tenant_read" ON "app"."reco_category_profiles" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



ALTER TABLE "app"."reco_category_associations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."reco_category_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reco_popularity_service_write" ON "app"."reco_product_popularity" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "reco_popularity_tenant_read" ON "app"."reco_product_popularity" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



ALTER TABLE "app"."reco_product_associations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."reco_product_popularity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_only" ON "app"."zoho_token_cache" AS RESTRICTIVE TO "authenticated" USING (false);



ALTER TABLE "app"."stock_in_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_in_events_seller_select" ON "app"."stock_in_events" FOR SELECT TO "authenticated" USING (("tenant_id" = "app"."jwt_tenant_id"()));



CREATE POLICY "stock_in_events_service_role" ON "app"."stock_in_events" TO "service_role" USING (true);



CREATE POLICY "tenant members can read brands_snapshot" ON "app"."brands_snapshot" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read buyer_app_activity" ON "app"."buyer_app_activity" FOR SELECT USING ((("app"."jwt_tenant_id"() = "tenant_id") AND (("app"."jwt_buyer_id"() IS NULL) OR ("app"."jwt_buyer_id"() = "buyer_id"))));



CREATE POLICY "tenant members can read buyer_app_snapshot" ON "app"."buyer_app_snapshot" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read buyer_current_snapshot" ON "app"."buyer_current_snapshot" FOR SELECT USING ((("app"."jwt_tenant_id"() = "tenant_id") AND (("app"."jwt_buyer_id"() IS NULL) OR ("app"."jwt_buyer_id"() = "buyer_id"))));



CREATE POLICY "tenant members can read buyers_snapshot" ON "app"."buyers_snapshot" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read categories_snapshot" ON "app"."categories_snapshot" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read estimates_snapshot" ON "app"."estimates_snapshot" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read invoices_snapshot" ON "app"."invoices_snapshot" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read kpi_brand_daily" ON "app"."kpi_brand_daily" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read kpi_buyer_app_daily" ON "app"."kpi_buyer_app_daily" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read kpi_buyers_daily" ON "app"."kpi_buyers_daily" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read kpi_category_daily" ON "app"."kpi_category_daily" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read kpi_estimates_daily" ON "app"."kpi_estimates_daily" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read kpi_invoices_daily" ON "app"."kpi_invoices_daily" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read kpi_location_daily" ON "app"."kpi_location_daily" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read kpi_orders_daily" ON "app"."kpi_orders_daily" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read kpi_product_daily" ON "app"."kpi_product_daily" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read kpi_tenant_daily" ON "app"."kpi_tenant_daily" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read kpi_warehouse_daily" ON "app"."kpi_warehouse_daily" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read locations_snapshot" ON "app"."locations_snapshot" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read orders_snapshot" ON "app"."orders_snapshot" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read products_snapshot" ON "app"."products_snapshot" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



CREATE POLICY "tenant members can read warehouses_snapshot" ON "app"."warehouses_snapshot" FOR SELECT USING (("app"."jwt_tenant_id"() = "tenant_id"));



ALTER TABLE "app"."tenant_brands" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_brands_delete" ON "app"."tenant_brands" FOR DELETE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_brands_insert" ON "app"."tenant_brands" FOR INSERT WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_brands_select" ON "app"."tenant_brands" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_brands_update" ON "app"."tenant_brands" FOR UPDATE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."tenant_broadcast_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_broadcast_limits_select" ON "app"."tenant_broadcast_limits" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."tenant_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_categories_delete" ON "app"."tenant_categories" FOR DELETE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_categories_insert" ON "app"."tenant_categories" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_categories_select" ON "app"."tenant_categories" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_categories_update" ON "app"."tenant_categories" FOR UPDATE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."tenant_category_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_category_images_delete" ON "app"."tenant_category_images" FOR DELETE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_categories" "tc"
  WHERE (("tc"."id" = "tenant_category_images"."tenant_category_id") AND ("tc"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "tenant_category_images_insert" ON "app"."tenant_category_images" FOR INSERT WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_categories" "tc"
  WHERE (("tc"."id" = "tenant_category_images"."tenant_category_id") AND ("tc"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "tenant_category_images_select" ON "app"."tenant_category_images" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_categories" "tc"
  WHERE (("tc"."id" = "tenant_category_images"."tenant_category_id") AND ("tc"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "tenant_category_images_update" ON "app"."tenant_category_images" FOR UPDATE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_categories" "tc"
  WHERE (("tc"."id" = "tenant_category_images"."tenant_category_id") AND ("tc"."tenant_id" = "app"."jwt_tenant_id"())))))) WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_categories" "tc"
  WHERE (("tc"."id" = "tenant_category_images"."tenant_category_id") AND ("tc"."tenant_id" = "app"."jwt_tenant_id"()))))));



ALTER TABLE "app"."tenant_field_mappings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_field_mappings_seller_admin_delete" ON "app"."tenant_field_mappings" FOR DELETE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_field_mappings_seller_admin_insert" ON "app"."tenant_field_mappings" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_field_mappings_seller_admin_update" ON "app"."tenant_field_mappings" FOR UPDATE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_field_mappings_seller_select" ON "app"."tenant_field_mappings" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."tenant_integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_integrations_select" ON "app"."tenant_integrations" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."tenant_inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_inventory_delete" ON "app"."tenant_inventory" FOR DELETE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_products" "tp"
  WHERE (("tp"."id" = "tenant_inventory"."tenant_product_id") AND ("tp"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "tenant_inventory_insert" ON "app"."tenant_inventory" FOR INSERT WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_products" "tp"
  WHERE (("tp"."id" = "tenant_inventory"."tenant_product_id") AND ("tp"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "tenant_inventory_select" ON "app"."tenant_inventory" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_products" "tp"
  WHERE (("tp"."id" = "tenant_inventory"."tenant_product_id") AND ("tp"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "tenant_inventory_update" ON "app"."tenant_inventory" FOR UPDATE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_products" "tp"
  WHERE (("tp"."id" = "tenant_inventory"."tenant_product_id") AND ("tp"."tenant_id" = "app"."jwt_tenant_id"()))))));



ALTER TABLE "app"."tenant_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_products_buyer_select" ON "app"."tenant_products" FOR SELECT USING (("app"."is_buyer"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_products_delete" ON "app"."tenant_products" FOR DELETE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_products_insert" ON "app"."tenant_products" FOR INSERT WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_products_seller_select" ON "app"."tenant_products" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_products_update" ON "app"."tenant_products" FOR UPDATE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."tenant_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_settings_insert" ON "app"."tenant_settings" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_settings_select" ON "app"."tenant_settings" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_settings_update" ON "app"."tenant_settings" FOR UPDATE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."tenant_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_users_delete" ON "app"."tenant_users" FOR DELETE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_users_insert" ON "app"."tenant_users" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_users_select" ON "app"."tenant_users" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "tenant_users_update" ON "app"."tenant_users" FOR UPDATE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenants_select" ON "app"."tenants" FOR SELECT USING (("id" = "app"."jwt_tenant_id"()));



CREATE POLICY "tenants_update" ON "app"."tenants" FOR UPDATE USING (("app"."is_seller_admin"() AND ("id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."user_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_profiles_delete" ON "app"."user_profiles" FOR DELETE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_users" "tu"
  WHERE (("tu"."user_id" = "user_profiles"."user_id") AND ("tu"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "user_profiles_insert" ON "app"."user_profiles" FOR INSERT WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_users" "tu"
  WHERE (("tu"."user_id" = "user_profiles"."user_id") AND ("tu"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "user_profiles_select" ON "app"."user_profiles" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_users" "tu"
  WHERE (("tu"."user_id" = "user_profiles"."user_id") AND ("tu"."tenant_id" = "app"."jwt_tenant_id"()))))));



CREATE POLICY "user_profiles_update" ON "app"."user_profiles" FOR UPDATE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_users" "tu"
  WHERE (("tu"."user_id" = "user_profiles"."user_id") AND ("tu"."tenant_id" = "app"."jwt_tenant_id"())))))) WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."tenant_users" "tu"
  WHERE (("tu"."user_id" = "user_profiles"."user_id") AND ("tu"."tenant_id" = "app"."jwt_tenant_id"()))))));



ALTER TABLE "app"."warehouses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warehouses_delete" ON "app"."warehouses" FOR DELETE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "warehouses_insert" ON "app"."warehouses" FOR INSERT WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "warehouses_select" ON "app"."warehouses" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."warehouses_snapshot" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warehouses_update" ON "app"."warehouses" FOR UPDATE USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."whatsapp_broadcasts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_broadcasts_insert" ON "app"."whatsapp_broadcasts" FOR INSERT WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "whatsapp_broadcasts_select" ON "app"."whatsapp_broadcasts" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "whatsapp_broadcasts_update" ON "app"."whatsapp_broadcasts" FOR UPDATE USING (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"()))) WITH CHECK (("app"."is_seller_admin"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."whatsapp_credit_pricing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_credit_pricing_select" ON "app"."whatsapp_credit_pricing" FOR SELECT USING ("app"."is_seller"());



ALTER TABLE "app"."whatsapp_credit_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_credit_transactions_select" ON "app"."whatsapp_credit_transactions" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."whatsapp_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_messages_insert" ON "app"."whatsapp_messages" FOR INSERT WITH CHECK (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



CREATE POLICY "whatsapp_messages_select" ON "app"."whatsapp_messages" FOR SELECT USING (("app"."is_seller"() AND ("tenant_id" = "app"."jwt_tenant_id"())));



ALTER TABLE "app"."whatsapp_platform_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_platform_config_select" ON "app"."whatsapp_platform_config" FOR SELECT USING ("app"."is_seller"());



ALTER TABLE "app"."whatsapp_rate_card" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."whatsapp_send_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."whatsapp_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_templates_select" ON "app"."whatsapp_templates" FOR SELECT USING (("app"."is_seller"() AND (("tenant_id" IS NULL) OR ("tenant_id" = "app"."jwt_tenant_id"()))));



ALTER TABLE "app"."zoho_token_cache" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "app" TO "supabase_auth_admin";
GRANT USAGE ON SCHEMA "app" TO "service_role";
GRANT USAGE ON SCHEMA "app" TO "authenticated";
GRANT USAGE ON SCHEMA "app" TO "anon";



REVOKE ALL ON FUNCTION "app"."_assert_integration_child_tenant_consistency"() FROM PUBLIC;



GRANT ALL ON FUNCTION "app"."_estimate_assert_seller_admin"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "app"."_estimate_assert_seller_admin"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "app"."_tenant_integrations_assert_seller_admin"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "app"."_tenant_settings_assert_seller_admin"("p_tenant_id" "uuid", "p_actor_user_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "app"."_validate_integration_data_flow_webhook"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "app"."bulk_persist_jsonb_records"("p_table" "text", "p_rows" "jsonb", "p_conflict_cols" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."bulk_persist_jsonb_records"("p_table" "text", "p_rows" "jsonb", "p_conflict_cols" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "app"."cancel_tenant_integration_sync_job"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."cancel_tenant_integration_sync_job"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "app"."cancel_tenant_integration_sync_job"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."confirm_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "app"."confirm_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."create_tenant_and_admin"("p_user_id" "uuid", "p_slug" "text", "p_business_name" "text", "p_business_phone" "text", "p_business_email" "text", "p_whatsapp_phone" "text", "p_primary_state" "text", "p_gstin" "text", "p_initial_settings" "jsonb") TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."whatsapp_credit_transactions" TO "authenticated";
GRANT ALL ON TABLE "app"."whatsapp_credit_transactions" TO "service_role";



REVOKE ALL ON FUNCTION "app"."debit_whatsapp_credits"("p_whatsapp_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."debit_whatsapp_credits"("p_whatsapp_message_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "app"."delete_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."delete_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."dequeue_embeddings"("p_batch_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "app"."ensure_zoho_sync_cron_scheduled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."ensure_zoho_sync_cron_scheduled"() TO "service_role";



GRANT ALL ON FUNCTION "app"."estimate_accept"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "app"."estimate_accept"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."estimate_convert_to_invoice"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_invoice_date" "date", "p_invoice_number_override" "text", "p_qty_overrides" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "app"."estimate_convert_to_invoice"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_invoice_date" "date", "p_invoice_number_override" "text", "p_qty_overrides" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_expected_delivery" "date", "p_order_number_override" "text") TO "authenticated";
GRANT ALL ON FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_expected_delivery" "date", "p_order_number_override" "text") TO "service_role";



GRANT ALL ON FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_expected_delivery" "date", "p_order_number_override" "text", "p_qty_overrides" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_expected_delivery" "date", "p_order_number_override" "text", "p_qty_overrides" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_expected_delivery" "date", "p_order_number_override" "text", "p_qty_overrides" "jsonb", "p_order_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "app"."estimate_convert_to_order"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid", "p_line_ids" "uuid"[], "p_expected_delivery" "date", "p_order_number_override" "text", "p_qty_overrides" "jsonb", "p_order_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "app"."estimate_decline"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "app"."estimate_decline"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."estimate_duplicate"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "app"."estimate_duplicate"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."estimate_send"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "app"."estimate_send"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."estimate_void"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "app"."estimate_void"("p_tenant_id" "uuid", "p_estimate_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."evaluate_buyer_for_cohorts"("p_buyer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."evaluate_product_for_campaigns"("p_tenant_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."evaluate_product_for_price_lists"("p_tenant_product_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "app"."get_tenant_integration_runtime_secret"("p_tenant_integration_id" "uuid", "p_expected_integration_type_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."get_tenant_integration_runtime_secret"("p_tenant_integration_id" "uuid", "p_expected_integration_type_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "app"."get_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."get_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "app"."global_search"("p_query" "text", "p_tenant_id" "uuid", "p_role" "text", "p_items_per_group" integer, "p_query_embedding" "public"."vector") TO "authenticated";



GRANT ALL ON FUNCTION "app"."is_buyer"() TO "anon";
GRANT ALL ON FUNCTION "app"."is_buyer"() TO "authenticated";
GRANT ALL ON FUNCTION "app"."is_buyer"() TO "service_role";



GRANT ALL ON FUNCTION "app"."is_buyer_admin"() TO "anon";
GRANT ALL ON FUNCTION "app"."is_buyer_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "app"."is_buyer_admin"() TO "service_role";



GRANT ALL ON FUNCTION "app"."is_seller"() TO "anon";
GRANT ALL ON FUNCTION "app"."is_seller"() TO "authenticated";
GRANT ALL ON FUNCTION "app"."is_seller"() TO "service_role";



GRANT ALL ON FUNCTION "app"."is_seller_admin"() TO "anon";
GRANT ALL ON FUNCTION "app"."is_seller_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "app"."is_seller_admin"() TO "service_role";



GRANT ALL ON FUNCTION "app"."jwt_buyer_id"() TO "anon";
GRANT ALL ON FUNCTION "app"."jwt_buyer_id"() TO "authenticated";
GRANT ALL ON FUNCTION "app"."jwt_buyer_id"() TO "service_role";



GRANT ALL ON FUNCTION "app"."jwt_role"() TO "anon";
GRANT ALL ON FUNCTION "app"."jwt_role"() TO "authenticated";
GRANT ALL ON FUNCTION "app"."jwt_role"() TO "service_role";



GRANT ALL ON FUNCTION "app"."jwt_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "app"."jwt_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "app"."jwt_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "app"."preview_cohort_count"("p_tenant_id" "uuid", "p_rules_json" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "app"."preview_cohort_count"("p_tenant_id" "uuid", "p_rules_json" "jsonb") TO "authenticated";



GRANT ALL ON TABLE "app"."price_lists" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."price_lists" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."price_lists" TO "anon";



GRANT ALL ON TABLE "app"."price_list_items" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."price_list_items" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."price_list_items" TO "anon";



REVOKE ALL ON FUNCTION "app"."process_whatsapp_send_queue"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."process_whatsapp_send_queue"() TO "service_role";



REVOKE ALL ON FUNCTION "app"."reap_stale_sync_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."reap_stale_sync_jobs"() TO "service_role";



REVOKE ALL ON FUNCTION "app"."record_buyer_app_activity"("p_tenant_id" "uuid", "p_buyer_id" "uuid", "p_event_name" "text", "p_occurred_at" timestamp with time zone, "p_location_id" "uuid", "p_metadata" "jsonb", "p_idempotency_key" "text", "p_qualifies_for_engagement" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."record_buyer_app_activity"("p_tenant_id" "uuid", "p_buyer_id" "uuid", "p_event_name" "text", "p_occurred_at" timestamp with time zone, "p_location_id" "uuid", "p_metadata" "jsonb", "p_idempotency_key" "text", "p_qualifies_for_engagement" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "app"."record_buyer_app_activity"("p_tenant_id" "uuid", "p_buyer_id" "uuid", "p_event_name" "text", "p_occurred_at" timestamp with time zone, "p_location_id" "uuid", "p_metadata" "jsonb", "p_idempotency_key" "text", "p_qualifies_for_engagement" boolean) TO "service_role";



GRANT ALL ON FUNCTION "app"."refresh_all_dynamic_campaigns"() TO "service_role";



GRANT ALL ON FUNCTION "app"."refresh_all_dynamic_cohorts"() TO "service_role";



GRANT ALL ON FUNCTION "app"."refresh_all_dynamic_price_lists"() TO "service_role";



GRANT ALL ON FUNCTION "app"."refresh_brand_embedding"("p_brand_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "app"."refresh_cohort_by_id"("p_cohort_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "app"."refresh_cohort_by_id"("p_cohort_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "app"."release_order_reservation"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."release_order_reservation"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "app"."reserve_inventory_for_invoice"("p_invoice_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."reserve_inventory_for_invoice"("p_invoice_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "app"."resolve_broadcast_audience_all"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_all"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_all"("p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "app"."resolve_broadcast_audience_buyer_selection"("p_tenant_id" "uuid", "p_buyer_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_buyer_selection"("p_tenant_id" "uuid", "p_buyer_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_buyer_selection"("p_tenant_id" "uuid", "p_buyer_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "app"."resolve_broadcast_audience_cohort"("p_tenant_id" "uuid", "p_cohort_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_cohort"("p_tenant_id" "uuid", "p_cohort_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_cohort"("p_tenant_id" "uuid", "p_cohort_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "app"."resolve_broadcast_audience_dormant"("p_tenant_id" "uuid", "p_filter" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_dormant"("p_tenant_id" "uuid", "p_filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_dormant"("p_tenant_id" "uuid", "p_filter" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "app"."resolve_broadcast_audience_dues"("p_tenant_id" "uuid", "p_filter" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_dues"("p_tenant_id" "uuid", "p_filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_dues"("p_tenant_id" "uuid", "p_filter" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "app"."resolve_broadcast_audience_geography"("p_tenant_id" "uuid", "p_filter" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_geography"("p_tenant_id" "uuid", "p_filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "app"."resolve_broadcast_audience_geography"("p_tenant_id" "uuid", "p_filter" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "app"."run_zoho_daily_sync_cron"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "app"."run_zoho_sync_phase"("p_function_name" "text") FROM PUBLIC;



GRANT ALL ON FUNCTION "app"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "app"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "app"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "app"."sync_buyer_app_activity_from_estimate"("p_estimate_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "app"."sync_buyer_app_activity_from_order"("p_order_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "app"."update_tenant_settings"("p_tenant_id" "uuid", "p_actor_user_id" "uuid", "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."update_tenant_settings"("p_tenant_id" "uuid", "p_actor_user_id" "uuid", "p_patch" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "app"."upsert_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid", "p_secret" "jsonb", "p_secret_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."upsert_tenant_integration_secret"("p_tenant_integration_id" "uuid", "p_actor_user_id" "uuid", "p_secret" "jsonb", "p_secret_name" "text") TO "service_role";



GRANT ALL ON TABLE "app"."audit_log" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."audit_log" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."audit_log" TO "anon";



GRANT ALL ON SEQUENCE "app"."audit_log_id_seq" TO "service_role";
GRANT SELECT,USAGE ON SEQUENCE "app"."audit_log_id_seq" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."brands_snapshot" TO "authenticated";
GRANT ALL ON TABLE "app"."brands_snapshot" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."buyer_app_activity" TO "authenticated";
GRANT ALL ON TABLE "app"."buyer_app_activity" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."buyer_app_snapshot" TO "authenticated";
GRANT ALL ON TABLE "app"."buyer_app_snapshot" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."buyer_current_snapshot" TO "authenticated";
GRANT ALL ON TABLE "app"."buyer_current_snapshot" TO "service_role";



GRANT SELECT ON TABLE "app"."buyer_users" TO "supabase_auth_admin";
GRANT ALL ON TABLE "app"."buyer_users" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."buyer_users" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."buyer_users" TO "anon";



GRANT SELECT ON TABLE "app"."buyers" TO "supabase_auth_admin";
GRANT ALL ON TABLE "app"."buyers" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."buyers" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."buyers" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."buyers_snapshot" TO "authenticated";
GRANT ALL ON TABLE "app"."buyers_snapshot" TO "service_role";



GRANT ALL ON TABLE "app"."campaign_items" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."campaign_items" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."campaign_items" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."campaign_views" TO "authenticated";
GRANT ALL ON TABLE "app"."campaign_views" TO "service_role";



GRANT ALL ON TABLE "app"."campaigns" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."campaigns" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."campaigns" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."categories_snapshot" TO "authenticated";
GRANT ALL ON TABLE "app"."categories_snapshot" TO "service_role";



GRANT ALL ON TABLE "app"."cohort_members" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."cohort_members" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."cohort_members" TO "anon";



GRANT ALL ON TABLE "app"."cohorts" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."cohorts" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."cohorts" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."credit_notes" TO "authenticated";
GRANT ALL ON TABLE "app"."credit_notes" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."email_verification_otps" TO "authenticated";
GRANT ALL ON TABLE "app"."email_verification_otps" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."estimate_items" TO "authenticated";
GRANT ALL ON TABLE "app"."estimate_items" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."estimates" TO "authenticated";
GRANT ALL ON TABLE "app"."estimates" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."estimates_snapshot" TO "authenticated";
GRANT ALL ON TABLE "app"."estimates_snapshot" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."integration_data_flows" TO "authenticated";
GRANT ALL ON TABLE "app"."integration_data_flows" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."integration_entity_map" TO "authenticated";
GRANT ALL ON TABLE "app"."integration_entity_map" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."integration_oauth_states" TO "authenticated";
GRANT ALL ON TABLE "app"."integration_oauth_states" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."integration_sync_jobs" TO "authenticated";
GRANT ALL ON TABLE "app"."integration_sync_jobs" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."integration_webhook_echo_guards" TO "authenticated";
GRANT ALL ON TABLE "app"."integration_webhook_echo_guards" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."integration_webhook_errors" TO "authenticated";
GRANT ALL ON TABLE "app"."integration_webhook_errors" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."integration_webhook_event_changes" TO "authenticated";
GRANT ALL ON TABLE "app"."integration_webhook_event_changes" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."integration_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "app"."integration_webhook_events" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."integration_webhooks" TO "authenticated";
GRANT ALL ON TABLE "app"."integration_webhooks" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "app"."invoice_items" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."invoices" TO "authenticated";
GRANT ALL ON TABLE "app"."invoices" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."invoices_snapshot" TO "authenticated";
GRANT ALL ON TABLE "app"."invoices_snapshot" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."kpi_brand_daily" TO "authenticated";
GRANT ALL ON TABLE "app"."kpi_brand_daily" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."kpi_buyer_app_daily" TO "authenticated";
GRANT ALL ON TABLE "app"."kpi_buyer_app_daily" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."kpi_buyers_daily" TO "authenticated";
GRANT ALL ON TABLE "app"."kpi_buyers_daily" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."kpi_category_daily" TO "authenticated";
GRANT ALL ON TABLE "app"."kpi_category_daily" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."kpi_estimates_daily" TO "authenticated";
GRANT ALL ON TABLE "app"."kpi_estimates_daily" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."kpi_invoices_daily" TO "authenticated";
GRANT ALL ON TABLE "app"."kpi_invoices_daily" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."kpi_location_daily" TO "authenticated";
GRANT ALL ON TABLE "app"."kpi_location_daily" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."kpi_orders_daily" TO "authenticated";
GRANT ALL ON TABLE "app"."kpi_orders_daily" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."kpi_product_daily" TO "authenticated";
GRANT ALL ON TABLE "app"."kpi_product_daily" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."kpi_tenant_daily" TO "authenticated";
GRANT ALL ON TABLE "app"."kpi_tenant_daily" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."kpi_warehouse_daily" TO "authenticated";
GRANT ALL ON TABLE "app"."kpi_warehouse_daily" TO "service_role";



GRANT ALL ON TABLE "app"."locations" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."locations" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."locations" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."locations_snapshot" TO "authenticated";
GRANT ALL ON TABLE "app"."locations_snapshot" TO "service_role";



GRANT ALL ON TABLE "app"."order_items" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."order_items" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."order_items" TO "anon";



GRANT ALL ON TABLE "app"."orders" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."orders" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."orders" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."orders_snapshot" TO "authenticated";
GRANT ALL ON TABLE "app"."orders_snapshot" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."otp_sessions" TO "authenticated";
GRANT ALL ON TABLE "app"."otp_sessions" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."payments" TO "authenticated";
GRANT ALL ON TABLE "app"."payments" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."platform_admins" TO "authenticated";
GRANT ALL ON TABLE "app"."platform_admins" TO "service_role";
GRANT SELECT ON TABLE "app"."platform_admins" TO "supabase_auth_admin";



GRANT ALL ON TABLE "app"."price_list_assignments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."price_list_assignments" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."price_list_assignments" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."products_snapshot" TO "authenticated";
GRANT ALL ON TABLE "app"."products_snapshot" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."reco_bundle_slots" TO "authenticated";
GRANT ALL ON TABLE "app"."reco_bundle_slots" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."reco_bundle_suggestions" TO "authenticated";
GRANT ALL ON TABLE "app"."reco_bundle_suggestions" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."reco_bundles" TO "authenticated";
GRANT ALL ON TABLE "app"."reco_bundles" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."reco_buyer_profiles" TO "authenticated";
GRANT ALL ON TABLE "app"."reco_buyer_profiles" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."reco_category_associations" TO "authenticated";
GRANT ALL ON TABLE "app"."reco_category_associations" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "app"."reco_category_associations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "app"."reco_category_associations_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."reco_category_profiles" TO "authenticated";
GRANT ALL ON TABLE "app"."reco_category_profiles" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."reco_product_associations" TO "authenticated";
GRANT ALL ON TABLE "app"."reco_product_associations" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "app"."reco_product_associations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "app"."reco_product_associations_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."reco_product_popularity" TO "authenticated";
GRANT ALL ON TABLE "app"."reco_product_popularity" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."stock_in_events" TO "authenticated";
GRANT ALL ON TABLE "app"."stock_in_events" TO "service_role";



GRANT ALL ON TABLE "app"."tenant_brands" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_brands" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_brands" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_broadcast_limits" TO "authenticated";
GRANT ALL ON TABLE "app"."tenant_broadcast_limits" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_categories" TO "authenticated";
GRANT ALL ON TABLE "app"."tenant_categories" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_category_images" TO "authenticated";
GRANT ALL ON TABLE "app"."tenant_category_images" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_field_mappings" TO "authenticated";
GRANT ALL ON TABLE "app"."tenant_field_mappings" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_integrations" TO "authenticated";
GRANT ALL ON TABLE "app"."tenant_integrations" TO "service_role";



GRANT ALL ON TABLE "app"."tenant_inventory" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_inventory" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_inventory" TO "anon";



GRANT ALL ON TABLE "app"."tenant_products" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_products" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_products" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_settings" TO "authenticated";
GRANT ALL ON TABLE "app"."tenant_settings" TO "service_role";



GRANT SELECT ON TABLE "app"."tenant_users" TO "supabase_auth_admin";
GRANT ALL ON TABLE "app"."tenant_users" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_users" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenant_users" TO "anon";



GRANT SELECT ON TABLE "app"."tenants" TO "supabase_auth_admin";
GRANT ALL ON TABLE "app"."tenants" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenants" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."tenants" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "app"."user_profiles" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."warehouses" TO "authenticated";
GRANT ALL ON TABLE "app"."warehouses" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."warehouses_snapshot" TO "authenticated";
GRANT ALL ON TABLE "app"."warehouses_snapshot" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."whatsapp_broadcasts" TO "authenticated";
GRANT ALL ON TABLE "app"."whatsapp_broadcasts" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."whatsapp_credit_pricing" TO "authenticated";
GRANT ALL ON TABLE "app"."whatsapp_credit_pricing" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."whatsapp_messages" TO "authenticated";
GRANT ALL ON TABLE "app"."whatsapp_messages" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."whatsapp_platform_config" TO "authenticated";
GRANT ALL ON TABLE "app"."whatsapp_platform_config" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."whatsapp_rate_card" TO "authenticated";
GRANT ALL ON TABLE "app"."whatsapp_rate_card" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."whatsapp_send_queue" TO "authenticated";
GRANT ALL ON TABLE "app"."whatsapp_send_queue" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."whatsapp_templates" TO "authenticated";
GRANT ALL ON TABLE "app"."whatsapp_templates" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."zoho_token_cache" TO "authenticated";
GRANT ALL ON TABLE "app"."zoho_token_cache" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "app" GRANT SELECT,USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "app" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "app" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "app" GRANT ALL ON TABLES TO "service_role";



