-- MANUAL, ONE-TIME - NOT part of supabase/migrations.
--
-- Before running, edit the single config row below:
-- - set target_tenant_id; this script intentionally permits tenant-at-a-time execution only
--
-- Run with autocommit enabled. The temporary procedures commit each batch and
-- cannot be called from an explicit BEGIN/COMMIT transaction block.

CREATE TEMP TABLE _search_vector_backfill_config (
  target_tenant_id uuid,
  batch_size integer NOT NULL CHECK (batch_size BETWEEN 1 AND 250),
  pause_ms integer NOT NULL CHECK (pause_ms BETWEEN 0 AND 5000),
  max_rows_per_table integer NOT NULL CHECK (max_rows_per_table > 0)
) ON COMMIT PRESERVE ROWS;

-- SAFETY DEFAULT: this refuses to run until a tenant is supplied.
INSERT INTO pg_temp._search_vector_backfill_config (
  target_tenant_id,
  batch_size,
  pause_ms,
  max_rows_per_table
)
VALUES (
  NULL,  -- replace with 'tenant-uuid'::uuid for tenant-at-a-time execution
  100,
  100,
  10000
);

CREATE OR REPLACE PROCEDURE pg_temp._run_backfill(
  p_table regclass,
  p_id_column text,
  p_tenant_column text,
  p_rpc_name text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_config pg_temp._search_vector_backfill_config%ROWTYPE;
  v_tenant_id uuid;
  v_ids uuid[];
  v_processed integer := 0;
  v_still_missing integer;
  v_sql text;
BEGIN
  SELECT * INTO STRICT v_config FROM pg_temp._search_vector_backfill_config;

  IF v_config.target_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Set target_tenant_id before running; all-tenant sweeps are intentionally disabled';
  END IF;

  FOR v_tenant_id IN SELECT v_config.target_tenant_id
  LOOP
    LOOP
      EXIT WHEN v_processed >= v_config.max_rows_per_table;

      PERFORM set_config('lock_timeout', '2s', true);
      v_sql := format(
        'SELECT array_agg(%1$I ORDER BY %1$I)
         FROM (
           SELECT %1$I
           FROM %2$s
           WHERE deleted_at IS NULL
             AND %3$I = $1
             AND search_vector IS NULL
           ORDER BY %1$I
           LIMIT %4$s
           FOR UPDATE SKIP LOCKED
         ) pending',
        p_id_column,
        p_table,
        p_tenant_column,
        LEAST(v_config.batch_size, v_config.max_rows_per_table - v_processed)
      );
      EXECUTE v_sql INTO v_ids USING v_tenant_id;

      EXIT WHEN COALESCE(cardinality(v_ids), 0) = 0;

      EXECUTE format('SELECT app.%I($1, $2)', p_rpc_name) USING v_tenant_id, v_ids;

      v_sql := format(
        'SELECT count(*)
         FROM %1$s
         WHERE %2$I = ANY ($1)
           AND search_vector IS NULL',
        p_table,
        p_id_column
      );
      EXECUTE v_sql INTO v_still_missing USING v_ids;
      IF v_still_missing > 0 THEN
        RAISE EXCEPTION '% left % selected rows without vectors', p_table, v_still_missing;
      END IF;

      v_processed := v_processed + cardinality(v_ids);
      RAISE NOTICE '% tenant %: % rows completed', p_table, v_tenant_id, v_processed;
      COMMIT;

      IF v_config.pause_ms > 0 THEN
        PERFORM pg_sleep(v_config.pause_ms / 1000.0);
      END IF;
    END LOOP;
  END LOOP;

  EXECUTE format(
    'SELECT count(*) FROM (
       SELECT 1
       FROM %1$s
       WHERE deleted_at IS NULL
         AND %2$I = $1
         AND search_vector IS NULL
       LIMIT 1001
     ) residual_probe',
    p_table,
    p_tenant_column
  ) INTO v_still_missing USING v_config.target_tenant_id;

  RAISE NOTICE '% complete for this run: processed %, residual %', p_table, v_processed, v_still_missing;
END;
$$;

CREATE OR REPLACE PROCEDURE pg_temp._run_buyer_user_backfill()
LANGUAGE plpgsql
AS $$
DECLARE
  v_config pg_temp._search_vector_backfill_config%ROWTYPE;
  v_tenant_id uuid;
  v_ids uuid[];
  v_processed integer := 0;
  v_still_missing integer;
BEGIN
  SELECT * INTO STRICT v_config FROM pg_temp._search_vector_backfill_config;

  IF v_config.target_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Set target_tenant_id before running; all-tenant sweeps are intentionally disabled';
  END IF;

  FOR v_tenant_id IN SELECT v_config.target_tenant_id
  LOOP
    LOOP
      EXIT WHEN v_processed >= v_config.max_rows_per_table;
      PERFORM set_config('lock_timeout', '2s', true);

      SELECT array_agg(id ORDER BY id)
      INTO v_ids
      FROM (
        SELECT bu.id
        FROM app.buyer_users bu
        JOIN app.buyers b ON b.id = bu.buyer_id
        WHERE b.tenant_id = v_tenant_id
          AND bu.deleted_at IS NULL
          AND bu.search_vector IS NULL
        ORDER BY bu.id
        LIMIT LEAST(v_config.batch_size, v_config.max_rows_per_table - v_processed)
        FOR UPDATE OF bu SKIP LOCKED
      ) pending;

      EXIT WHEN COALESCE(cardinality(v_ids), 0) = 0;

      PERFORM app.rebuild_buyer_users_search_vectors(NULL, v_ids);

      SELECT count(*)
      INTO v_still_missing
      FROM app.buyer_users bu
      WHERE bu.id = ANY (v_ids)
        AND bu.search_vector IS NULL;
      IF v_still_missing > 0 THEN
        RAISE EXCEPTION 'app.buyer_users left % selected rows without vectors', v_still_missing;
      END IF;

      v_processed := v_processed + cardinality(v_ids);
      RAISE NOTICE 'app.buyer_users tenant %: % rows completed', v_tenant_id, v_processed;
      COMMIT;

      IF v_config.pause_ms > 0 THEN
        PERFORM pg_sleep(v_config.pause_ms / 1000.0);
      END IF;
    END LOOP;
  END LOOP;

  SELECT count(*)
  INTO v_still_missing
  FROM (
    SELECT 1
    FROM app.buyer_users bu
    JOIN app.buyers b ON b.id = bu.buyer_id
    WHERE bu.deleted_at IS NULL
      AND b.tenant_id = v_config.target_tenant_id
      AND bu.search_vector IS NULL
    LIMIT 1001
  ) residual_probe;

  RAISE NOTICE 'app.buyer_users complete for this run: processed %, residual %', v_processed, v_still_missing;
END;
$$;

CALL pg_temp._run_backfill('app.tenant_products', 'id', 'tenant_id', 'rebuild_tenant_products_search_vectors');
CALL pg_temp._run_backfill('app.buyers', 'id', 'tenant_id', 'rebuild_buyers_search_vectors');
CALL pg_temp._run_buyer_user_backfill();
CALL pg_temp._run_backfill('app.tenant_brands', 'id', 'tenant_id', 'rebuild_tenant_brands_search_vectors');
CALL pg_temp._run_backfill('app.tenant_categories', 'id', 'tenant_id', 'rebuild_tenant_categories_search_vectors');
CALL pg_temp._run_backfill('app.locations', 'id', 'tenant_id', 'rebuild_locations_search_vectors');
CALL pg_temp._run_backfill('app.warehouses', 'id', 'tenant_id', 'rebuild_warehouses_search_vectors');
CALL pg_temp._run_backfill('app.cohorts', 'id', 'tenant_id', 'rebuild_cohorts_search_vectors');
CALL pg_temp._run_backfill('app.campaigns', 'id', 'tenant_id', 'rebuild_campaigns_search_vectors');
CALL pg_temp._run_backfill('app.price_lists', 'id', 'tenant_id', 'rebuild_price_lists_search_vectors');

DROP PROCEDURE pg_temp._run_buyer_user_backfill();
DROP PROCEDURE pg_temp._run_backfill(regclass, text, text, text);
