-- Run every 10-15 s in a second terminal during a load test (supabase db query --linked -f ...).
-- Pass: connections < 35, no lock waits, temp_files unchanged, cache hit > 99%, WAL growth modest.
SELECT now()::time(0) t,
  (SELECT count(*) FROM pg_stat_activity) conns,
  (SELECT count(*) FROM pg_stat_activity WHERE state='active' AND backend_type='client backend') active,
  (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock') lock_waits,
  (SELECT temp_files FROM pg_stat_database WHERE datname=current_database()) temp_files,
  pg_size_pretty((SELECT wal_bytes FROM pg_stat_wal)::bigint) wal_total,
  (SELECT round(100.0*sum(heap_blks_hit)/nullif(sum(heap_blks_hit+heap_blks_read),0),2) FROM pg_statio_user_tables) heap_hit_pct,
  (SELECT count(*) FROM app.public_catalog_rate_limits) limiter_rows;
