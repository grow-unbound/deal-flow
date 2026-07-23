-- Root-cause fix: bulk Zoho/CSV inventory syncs go through app.bulk_persist_jsonb_records,
-- which sets app.integration_sync_bypass_triggers for the transaction -- so
-- trg_inventory_campaign_refresh (the per-row trigger that logs stock_in_events and
-- re-evaluates automatic price-list/campaign membership) never fires for synced rows. A
-- reconciliation-only fix would leave automatic product membership stale for up to a day
-- after every sync, so this patches the bulk-persist path itself: after persisting a batch of
-- tenant_inventory rows, diff qty_available against a pre-fetched snapshot, batch-insert
-- stock_in_events for increases, and call the batched evaluator once for the whole touched
-- set (not a per-row loop).

CREATE OR REPLACE FUNCTION "app"."reconcile_inventory_bulk_sync"(
    "p_tenant_id" "uuid",
    "p_persisted" "jsonb",
    "p_pre_qty" "jsonb"
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_row               jsonb;
  v_id                uuid;
  v_tenant_product_id uuid;
  v_new_qty           numeric;
  v_old_qty           numeric;
  v_touched_products  uuid[] := '{}';
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_persisted)
  LOOP
    v_id                := (v_row ->> 'id')::uuid;
    v_tenant_product_id := (v_row ->> 'tenant_product_id')::uuid;
    v_new_qty           := (v_row ->> 'qty_available')::numeric;

    IF v_tenant_product_id IS NULL OR v_new_qty IS NULL THEN
      CONTINUE;
    END IF;

    v_old_qty := COALESCE((p_pre_qty ->> v_id::text)::numeric, 0);

    IF v_new_qty > v_old_qty THEN
      INSERT INTO app.stock_in_events (tenant_id, tenant_product_id, qty_delta)
      VALUES (p_tenant_id, v_tenant_product_id, v_new_qty - v_old_qty);
    END IF;

    v_touched_products := array_append(v_touched_products, v_tenant_product_id);
  END LOOP;

  IF array_length(v_touched_products, 1) > 0 THEN
    PERFORM app.evaluate_products_for_price_lists_and_campaigns_batch(
      ARRAY(SELECT DISTINCT unnest(v_touched_products))
    );
  END IF;
END;
$$;

ALTER FUNCTION "app"."reconcile_inventory_bulk_sync"("uuid", "jsonb", "jsonb") OWNER TO "postgres";
GRANT ALL ON FUNCTION "app"."reconcile_inventory_bulk_sync"("uuid", "jsonb", "jsonb") TO "service_role";


CREATE OR REPLACE FUNCTION app.persist_with_natural_key_lock(
  p_table text,
  p_tenant_id uuid,
  p_rows jsonb,
  p_natural_key_col text,
  p_conflict_cols text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
SET lock_timeout TO '30s'
SET statement_timeout TO '90s'
AS $function$
DECLARE
  v_table_ident text := format('app.%I', p_table);
  v_nk_literal  text := quote_literal(p_natural_key_col);
  v_nk_ident    text := format('%I', p_natural_key_col);
  v_lock_keys   bigint[];
  v_sql         text;
  v_matched     jsonb;
  v_resolved_rows jsonb := '[]'::jsonb;
  v_conflicts     jsonb := '[]'::jsonb;
  v_matched_by_id jsonb := '[]'::jsonb;
  v_new_rows      jsonb := '[]'::jsonb;
  v_persisted     jsonb;
  v_is_inventory  boolean := (p_table = 'tenant_inventory');
  v_pre_qty       jsonb := '{}'::jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'conflicts', '[]'::jsonb);
  END IF;

  SELECT array_agg(k ORDER BY k)
  INTO v_lock_keys
  FROM (
    SELECT DISTINCT hashtextextended(p_tenant_id::text || ':' || p_table || ':' || (elem ->> p_natural_key_col), 0) AS k
    FROM jsonb_array_elements(p_rows) AS elem
    WHERE elem ->> p_natural_key_col IS NOT NULL
  ) sub;

  IF v_lock_keys IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(k) FROM unnest(v_lock_keys) AS k;
  END IF;

  v_sql := format(
    $q$
    WITH input AS (
      SELECT ordinality - 1 AS idx, elem,
             elem ->> 'external_ref' AS external_ref,
             elem ->> %s AS natural_key
      FROM jsonb_array_elements($1) WITH ORDINALITY AS t(elem, ordinality)
    ),
    ref_groups AS (
      SELECT t.external_ref,
             count(*) FILTER (WHERE t.deleted_at IS NULL) AS active_count,
             (array_agg(t.id ORDER BY (t.deleted_at IS NULL) DESC))[1] AS best_id
      FROM %s t
      WHERE t.tenant_id = $2
        AND t.external_ref IN (SELECT DISTINCT external_ref FROM input WHERE external_ref IS NOT NULL)
      GROUP BY t.external_ref
    ),
    nk_groups AS (
      SELECT t.%s AS natural_key,
             count(*) FILTER (WHERE t.deleted_at IS NULL) AS active_count,
             (array_agg(t.id ORDER BY (t.deleted_at IS NULL) DESC))[1] AS best_id
      FROM %s t
      WHERE t.tenant_id = $2
        AND t.%s IN (SELECT DISTINCT natural_key FROM input WHERE natural_key IS NOT NULL)
      GROUP BY t.%s
    ),
    matched AS (
      SELECT
        i.idx, i.elem, i.external_ref, i.natural_key,
        rg.best_id AS ref_id, rg.active_count AS ref_active_count,
        ng.best_id AS nk_id, ng.active_count AS nk_active_count
      FROM input i
      LEFT JOIN ref_groups rg ON rg.external_ref = i.external_ref
      LEFT JOIN nk_groups ng ON ng.natural_key = i.natural_key
    )
    SELECT jsonb_agg(
      CASE
        WHEN coalesce(ref_active_count, 0) > 1 OR coalesce(nk_active_count, 0) > 1
          THEN jsonb_build_object('conflict', true, 'reason', 'multiple existing rows matched the same key', 'external_ref', external_ref, 'natural_key', natural_key)
        WHEN ref_id IS NOT NULL AND nk_id IS NOT NULL AND ref_id <> nk_id
          THEN jsonb_build_object('conflict', true, 'reason', 'external_ref and natural key matched different rows', 'external_ref', external_ref, 'natural_key', natural_key)
        WHEN coalesce(ref_id, nk_id) IS NOT NULL
          THEN elem || jsonb_build_object('id', coalesce(ref_id, nk_id))
        ELSE elem
      END
      ORDER BY idx
    )
    FROM matched
    $q$,
    v_nk_literal, v_table_ident, v_nk_ident, v_table_ident, v_nk_ident, v_nk_ident
  );

  EXECUTE v_sql INTO v_matched USING p_rows, p_tenant_id;

  SELECT
    coalesce(jsonb_agg(elem) FILTER (WHERE (elem ->> 'conflict') IS DISTINCT FROM 'true'), '[]'::jsonb),
    coalesce(jsonb_agg(elem) FILTER (WHERE elem ->> 'conflict' = 'true'), '[]'::jsonb)
  INTO v_resolved_rows, v_conflicts
  FROM jsonb_array_elements(coalesce(v_matched, '[]'::jsonb)) AS elem;

  SELECT
    coalesce(jsonb_agg(elem) FILTER (WHERE elem ? 'id'), '[]'::jsonb),
    coalesce(jsonb_agg(elem) FILTER (WHERE NOT (elem ? 'id')), '[]'::jsonb)
  INTO v_matched_by_id, v_new_rows
  FROM jsonb_array_elements(v_resolved_rows) AS elem;

  -- Capture the pre-image of qty_available for rows that already exist, so the post-persist
  -- reconciliation below can tell an increase from a decrease/no-op.
  IF v_is_inventory AND jsonb_array_length(v_matched_by_id) > 0 THEN
    SELECT coalesce(jsonb_object_agg(ti.id::text, ti.qty_available), '{}'::jsonb)
    INTO v_pre_qty
    FROM app.tenant_inventory ti
    WHERE ti.id IN (
      SELECT (elem ->> 'id')::uuid FROM jsonb_array_elements(v_matched_by_id) elem
    );
  END IF;

  v_persisted := '[]'::jsonb;
  IF jsonb_array_length(v_matched_by_id) > 0 THEN
    v_persisted := v_persisted || app.bulk_persist_jsonb_records(p_table, v_matched_by_id, ARRAY['id']);
  END IF;
  IF jsonb_array_length(v_new_rows) > 0 THEN
    v_persisted := v_persisted || app.bulk_persist_jsonb_records(p_table, v_new_rows, p_conflict_cols);
  END IF;

  IF v_is_inventory AND jsonb_array_length(v_persisted) > 0 THEN
    PERFORM app.reconcile_inventory_bulk_sync(p_tenant_id, v_persisted, v_pre_qty);
  END IF;

  RETURN jsonb_build_object('rows', v_persisted, 'conflicts', v_conflicts);
END;
$function$;

REVOKE EXECUTE ON FUNCTION app.persist_with_natural_key_lock(text, uuid, jsonb, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.persist_with_natural_key_lock(text, uuid, jsonb, text, text[]) TO service_role;
