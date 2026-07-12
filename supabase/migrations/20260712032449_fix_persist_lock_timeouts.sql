-- Replace the blanket statement_timeout=60s on persist_with_natural_key_lock
-- with a split lock_timeout + higher statement_timeout.
--
-- Root cause of the 43 estimate webhook statement-timeout failures:
-- pg_advisory_xact_lock is a BLOCKING call — it waits until any concurrent
-- holder (e.g. the daily sync processing a 50-estimate batch) releases the
-- lock. That wait counts against statement_timeout. If the sync's batch took
-- >60s the webhook's lock-wait exceeded the limit and threw "statement timeout",
-- causing the event to stay "received" (when caught at the HTTP layer) or fail.
--
-- Fix:
--   lock_timeout  = 30s  — fail fast if the advisory lock is unavailable after
--                          30s; produces a clear "lock timeout" error that the
--                          caller retries cleanly, rather than a misleading
--                          "statement timeout" after 60s of silent waiting
--   statement_timeout = 90s — protects against truly runaway SQL within the
--                          function body once the lock is held; generous enough
--                          for bulk upserts of 50+ rows
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

  v_persisted := '[]'::jsonb;
  IF jsonb_array_length(v_matched_by_id) > 0 THEN
    v_persisted := v_persisted || app.bulk_persist_jsonb_records(p_table, v_matched_by_id, ARRAY['id']);
  END IF;
  IF jsonb_array_length(v_new_rows) > 0 THEN
    v_persisted := v_persisted || app.bulk_persist_jsonb_records(p_table, v_new_rows, p_conflict_cols);
  END IF;

  RETURN jsonb_build_object('rows', v_persisted, 'conflicts', v_conflicts);
END;
$function$;

REVOKE EXECUTE ON FUNCTION app.persist_with_natural_key_lock(text, uuid, jsonb, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.persist_with_natural_key_lock(text, uuid, jsonb, text, text[]) TO service_role;
