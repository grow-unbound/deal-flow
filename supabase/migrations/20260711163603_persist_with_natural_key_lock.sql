-- app.persist_with_natural_key_lock: closes a TOCTOU race between two
-- writers (the bulk sync pipeline and the incoming webhook handler) both
-- upserting the same table concurrently.
--
-- Root cause: the JS-side helper this replaces (resolveRowsByExternalRefOrNaturalKey
-- in integrations-persist.ts) did a SELECT to find an existing row by
-- external_ref OR a secondary natural key (invoice_number, estimate_number,
-- order_number, slug, internal_sku), then — as a SEPARATE round trip —
-- called app.bulk_persist_jsonb_records to INSERT ... ON CONFLICT
-- (tenant_id, external_ref) DO UPDATE. Postgres's ON CONFLICT only
-- suppresses a conflict on the SPECIFIED unique index; if the row also
-- violates a DIFFERENT unique constraint (e.g. invoices_tenant_id_invoice_number_key),
-- that's a hard, uncaught error. Two concurrent callers resolving the same
-- natural key in the gap between their SELECT and their INSERT both decide
-- "not found, insert new" and race — one wins, the other gets
-- "duplicate key value violates unique constraint ...".
--
-- Fix: do the resolve AND the insert inside ONE function call (one
-- transaction, guaranteed on a single connection — Supabase's PostgREST/
-- Supavisor connections are pooled per-call, so a lock taken in one RPC
-- round trip would NOT reliably still be held during a second, separate
-- round trip). A pg_advisory_xact_lock per distinct (tenant, table, natural
-- key) value in the batch serializes any other caller resolving the same
-- key concurrently; it's transaction-scoped so it auto-releases on
-- commit/rollback regardless of connection reuse afterward.
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
SET statement_timeout TO '60s'
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

  -- One lock per distinct natural-key value in this batch, acquired in
  -- sorted order so two concurrent calls locking overlapping key sets can
  -- never deadlock against each other.
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

  -- Resolve each row's id by external_ref OR natural key, now inside the
  -- lock so no concurrent writer can commit a colliding row in between this
  -- resolve and the insert below. Mirrors the previous JS semantics: prefer
  -- an active (not soft-deleted) match, fall back to any match; flag a
  -- conflict if more than one active row matches the same key, or if
  -- external_ref and the natural key resolve to two different rows.
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

  -- Split resolved rows by whether an existing id was matched. A row with a
  -- resolved id must be upserted ON CONFLICT (id) — routing it through
  -- ON CONFLICT (tenant_id, external_ref) instead only catches a conflict on
  -- THAT constraint; when the row's external_ref differs from the matched
  -- row's (the exact natural-key-collision case this function exists for),
  -- Postgres attempts a genuine INSERT with the explicit id and hits the
  -- primary key constraint instead, uncaught, same bug one level deeper. A
  -- row with NO resolved id is genuinely new — insert it ON CONFLICT
  -- (tenant_id, external_ref), the safety net for two writers racing to
  -- insert the same never-before-seen external_ref (now additionally
  -- protected by the advisory lock above when it shares a natural key with
  -- another row in the same call, and by Postgres's own conflict handling
  -- otherwise).
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

-- SECURITY DEFINER + default Postgres grants EXECUTE to PUBLIC on a newly
-- created function — revoke that (matching bulk_persist_jsonb_records's
-- existing posture) so only the service role can call this.
REVOKE EXECUTE ON FUNCTION app.persist_with_natural_key_lock(text, uuid, jsonb, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.persist_with_natural_key_lock(text, uuid, jsonb, text, text[]) TO service_role;
