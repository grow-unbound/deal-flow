-- Restore bulk_persist_jsonb_records to its correct state.
--
-- Migration 20260705170000 used CREATE OR REPLACE FUNCTION which clears any
-- proconfig entries set via ALTER FUNCTION AND overwrites the function body.
-- That migration lost two critical things from the original 20260623040841:
--
--   1. SET statement_timeout = '60s'  (added via ALTER FUNCTION in 20260704170049)
--      — cleared by CREATE OR REPLACE, bulk upserts now hit the authenticator's 8s limit
--
--   2. PERFORM set_config('app.integration_sync_bypass_triggers', 'on', true)
--      — was in the original function body; absent in 20260705170000's rewrite.
--      Without this call, sync_trigger_bypass_active() always returns false, so
--      ALL the bypass gates in dispatcher trigger functions are permanently inactive —
--      every row upserted fires the full snapshot/KPI refresh chain regardless.
--
-- Fix: restore both inline so future CREATE OR REPLACE won't lose them silently.

CREATE OR REPLACE FUNCTION app.bulk_persist_jsonb_records(
  p_table text,
  p_rows jsonb,
  p_conflict_cols text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
SET statement_timeout = '60s'
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION app.bulk_persist_jsonb_records(text, jsonb, text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.bulk_persist_jsonb_records(text, jsonb, text[]) TO service_role;
