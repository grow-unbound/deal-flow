INSERT INTO metrics_v2_phase1a.run_samples (sample_label, payload)
SELECT
  'after',
  jsonb_build_object(
    'pg_stat_user_tables',
    (
      SELECT jsonb_agg(to_jsonb(s) ORDER BY relname)
      FROM (
        SELECT
          relname,
          n_live_tup,
          n_dead_tup,
          n_tup_ins,
          n_tup_upd,
          n_tup_del,
          autovacuum_count
        FROM pg_stat_user_tables
        WHERE schemaname = 'app'
          AND relname IN (
            'buyers_snapshot',
            'buyer_current_snapshot',
            'buyer_app_snapshot',
            'orders',
            'order_items',
            'estimates',
            'estimate_items',
            'invoices',
            'invoice_items',
            'buyers',
            'tenant_products',
            'tenant_inventory'
          )
      ) s
    ),
    'locks',
    (
      SELECT jsonb_agg(to_jsonb(l) ORDER BY relation_name, mode)
      FROM (
        SELECT
          COALESCE(c.relname, 'unknown') AS relation_name,
          mode,
          granted,
          count(*) AS lock_count
        FROM pg_locks l
        LEFT JOIN pg_class c
          ON c.oid = l.relation
        GROUP BY c.relname, mode, granted
      ) l
    )
  );

SELECT
  sample_label,
  sampled_at,
  payload
FROM metrics_v2_phase1a.run_samples
ORDER BY id DESC
LIMIT 4;
