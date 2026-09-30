-- Bound recommendation association cache growth, keep old Realtime message
-- partitions compact, and stop RLS auto-enable from logging every pg_temp table.

CREATE OR REPLACE FUNCTION app.reco_compute_associations(p_tenant_id uuid, p_window_days integer DEFAULT 90)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app', 'catalog', 'public'
AS $function$
DECLARE
  min_support   int;
  window_start  timestamptz := NOW() - (p_window_days || ' days')::interval;
  invoiced_ids  uuid[];
BEGIN
  SELECT GREATEST(COALESCE((settings->>'reco_min_support')::int, 2), 2)
  INTO min_support
  FROM app.tenants WHERE id = p_tenant_id;

  SELECT ARRAY(
    SELECT DISTINCT estimate_id
    FROM app.invoices
    WHERE tenant_id = p_tenant_id AND estimate_id IS NOT NULL AND deleted_at IS NULL
  ) INTO invoiced_ids;

  DELETE FROM app.reco_product_associations
  WHERE tenant_id = p_tenant_id AND time_window_days = p_window_days;

  WITH purchase_events AS (
    SELECT ('inv:' || inv.id::text) AS event_id, inv.buyer_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    SELECT ('inv2:' || inv.id::text) AS event_id, inv.buyer_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    SELECT ('ord:' || o.id::text) AS event_id, o.buyer_id, oi.tenant_product_id
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
      AND o.placed_at >= window_start
    UNION ALL
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
  ),
  directional AS (
    SELECT
      p_tenant_id AS tenant_id,
      p.product_a AS product_a_id,
      p.product_b AS product_b_id,
      'co_order'::text AS association_type,
      p.co_count::integer AS co_occurrence_count,
      (p.co_count::numeric / NULLIF(t.total_cnt, 0)) /
        NULLIF(
          (pa.event_count::numeric / NULLIF(t.total_cnt, 0)) *
          (pb.event_count::numeric / NULLIF(t.total_cnt, 0)),
          0
        ) AS lift_score,
      p.co_count::numeric / NULLIF(pa.event_count, 0) AS confidence,
      p_window_days AS time_window_days
    FROM co_event_pairs p
    CROSS JOIN event_totals t
    JOIN product_event_counts pa ON pa.tenant_product_id = p.product_a
    JOIN product_event_counts pb ON pb.tenant_product_id = p.product_b
    UNION ALL
    SELECT
      p_tenant_id,
      p.product_b,
      p.product_a,
      'co_order',
      p.co_count::integer,
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
    JOIN product_event_counts pb ON pb.tenant_product_id = p.product_b
  ),
  ranked AS (
    SELECT d.*,
      row_number() OVER (
        PARTITION BY d.product_a_id, d.association_type, d.time_window_days
        ORDER BY d.confidence DESC NULLS LAST,
                 d.lift_score DESC NULLS LAST,
                 d.co_occurrence_count DESC,
                 d.product_b_id
      ) AS rn
    FROM directional d
  )
  INSERT INTO app.reco_product_associations
    (tenant_id, product_a_id, product_b_id, association_type,
     co_occurrence_count, lift_score, confidence, time_window_days)
  SELECT tenant_id, product_a_id, product_b_id, association_type,
         co_occurrence_count, lift_score, confidence, time_window_days
  FROM ranked
  WHERE rn <= 10;

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
  ),
  directional AS (
    SELECT p_tenant_id AS tenant_id, product_a AS product_a_id, product_b AS product_b_id,
           'co_buyer'::text AS association_type, co_count::integer AS co_occurrence_count,
           p_window_days AS time_window_days
    FROM buyer_pairs
    UNION ALL
    SELECT p_tenant_id, product_b, product_a, 'co_buyer', co_count::integer, p_window_days
    FROM buyer_pairs
  ),
  ranked AS (
    SELECT d.*,
      row_number() OVER (
        PARTITION BY d.product_a_id, d.association_type, d.time_window_days
        ORDER BY d.co_occurrence_count DESC, d.product_b_id
      ) AS rn
    FROM directional d
  )
  INSERT INTO app.reco_product_associations
    (tenant_id, product_a_id, product_b_id, association_type, co_occurrence_count, time_window_days)
  SELECT tenant_id, product_a_id, product_b_id, association_type, co_occurrence_count, time_window_days
  FROM ranked
  WHERE rn <= 10;
END;
$function$;

ALTER FUNCTION app.reco_compute_associations(uuid, integer) OWNER TO postgres;

CREATE OR REPLACE FUNCTION app.prune_realtime_message_partitions(p_keep_days integer DEFAULT 2)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'realtime', 'app'
AS $function$
DECLARE
  part record;
  cutoff_date date := current_date - GREATEST(p_keep_days, 1);
  truncated_count integer := 0;
BEGIN
  FOR part IN
    SELECT c.relname,
           to_date(replace(substring(c.relname from '^messages_([0-9]{4}_[0-9]{2}_[0-9]{2})$'), '_', '-'), 'YYYY-MM-DD') AS part_date
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime'
      AND c.relkind = 'r'
      AND c.relname ~ '^messages_[0-9]{4}_[0-9]{2}_[0-9]{2}$'
  LOOP
    IF part.part_date < cutoff_date THEN
      EXECUTE format('TRUNCATE TABLE %I.%I', 'realtime', part.relname);
      truncated_count := truncated_count + 1;
    END IF;
  END LOOP;

  RETURN truncated_count;
END;
$function$;

ALTER FUNCTION app.prune_realtime_message_partitions(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.prune_realtime_message_partitions(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.prune_realtime_message_partitions(integer) TO service_role;

DO $do$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'realtime-messages-partition-truncate'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'realtime-messages-partition-truncate',
    '20 21 * * *',
    $cmd$SELECT app.prune_realtime_message_partitions(2);$cmd$
  );
END $do$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
    IF cmd.schema_name IS NULL
       OR cmd.schema_name IN ('pg_catalog','information_schema')
       OR cmd.schema_name LIKE 'pg_toast%'
       OR cmd.schema_name LIKE 'pg_temp%' THEN
      CONTINUE;
    END IF;

    IF cmd.schema_name IN ('public') THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    END IF;
  END LOOP;
END;
$function$;

ALTER FUNCTION public.rls_auto_enable() OWNER TO postgres;
