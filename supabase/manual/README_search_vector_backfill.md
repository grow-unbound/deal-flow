# Search Vector Manual Backfill

Run [RUN_ONCE_incremental_search_vector_backfill.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/manual/RUN_ONCE_incremental_search_vector_backfill.sql) only after deploying the incremental search-vector migration.

## Required configuration

Edit the `_search_vector_backfill_config` row before execution.

- Set `target_tenant_id = '<tenant uuid>'`; the script intentionally refuses all-tenant sweeps.
- The script intentionally processes only `NULL` vectors. Empty vectors can be legitimate when all source text consists of language stop words; investigate and rebuild explicitly identified stale IDs with the scoped rebuild RPCs instead of sweeping all empty values.
- The default batch is 100 rows, followed by a 100 ms pause.
- `max_rows_per_table` is a per-run circuit breaker. Rerun the script to continue when residual rows remain.

## Executor requirements

- Use a dedicated database session with autocommit enabled.
- Do not wrap the script in `BEGIN` / `COMMIT`. The temporary procedures commit each batch and PostgreSQL rejects procedure transaction control inside an explicit transaction block.
- Supabase SQL Editor behavior can vary by execution mode. If it transaction-wraps the script, run it through a direct `psql` session or a CLI command that preserves top-level `CALL` execution.
- The script creates only session-local temporary objects and does not modify migration history.

## Load controls

- Each batch selects only rows whose vector is still null, so completed rows naturally disappear from subsequent batches.
- `FOR UPDATE SKIP LOCKED` avoids waiting behind hot rows; a previously locked row can be selected by a later batch or rerun.
- Lock acquisition is limited to two seconds per batch.
- Each batch is committed independently and paced by `pause_ms`.
- The rebuild RPCs accept only explicit IDs and cannot fall back to tenant-wide sweeps.
- No trigger-bypass setting is enabled. The RPCs update only `search_vector`, so search-field triggers and cross-entity cascades do not fire.

## Monitoring

Run the following per target tenant before and after. Replace `<tenant-id>`.

```sql
SELECT 'tenant_products' AS entity, count(*) AS null_vectors
FROM app.tenant_products
WHERE tenant_id = '<tenant-id>'::uuid AND deleted_at IS NULL AND search_vector IS NULL
UNION ALL
SELECT 'buyers', count(*) FROM app.buyers
WHERE tenant_id = '<tenant-id>'::uuid AND deleted_at IS NULL AND search_vector IS NULL
UNION ALL
SELECT 'buyer_users', count(*)
FROM app.buyer_users bu
JOIN app.buyers b ON b.id = bu.buyer_id
WHERE b.tenant_id = '<tenant-id>'::uuid AND bu.deleted_at IS NULL AND bu.search_vector IS NULL
UNION ALL
SELECT 'tenant_brands', count(*) FROM app.tenant_brands
WHERE tenant_id = '<tenant-id>'::uuid AND deleted_at IS NULL AND search_vector IS NULL
UNION ALL
SELECT 'tenant_categories', count(*) FROM app.tenant_categories
WHERE tenant_id = '<tenant-id>'::uuid AND deleted_at IS NULL AND search_vector IS NULL
UNION ALL
SELECT 'locations', count(*) FROM app.locations
WHERE tenant_id = '<tenant-id>'::uuid AND deleted_at IS NULL AND search_vector IS NULL
UNION ALL
SELECT 'warehouses', count(*) FROM app.warehouses
WHERE tenant_id = '<tenant-id>'::uuid AND deleted_at IS NULL AND search_vector IS NULL
UNION ALL
SELECT 'cohorts', count(*) FROM app.cohorts
WHERE tenant_id = '<tenant-id>'::uuid AND deleted_at IS NULL AND search_vector IS NULL
UNION ALL
SELECT 'campaigns', count(*) FROM app.campaigns
WHERE tenant_id = '<tenant-id>'::uuid AND deleted_at IS NULL AND search_vector IS NULL
UNION ALL
SELECT 'price_lists', count(*) FROM app.price_lists
WHERE tenant_id = '<tenant-id>'::uuid AND deleted_at IS NULL AND search_vector IS NULL;
```

Inspect empty vectors separately before opting them into the backfill:

```sql
SELECT id, search_vector
FROM app.tenant_products
WHERE tenant_id = '<tenant-id>'::uuid
  AND deleted_at IS NULL
  AND search_vector = ''::tsvector
LIMIT 100;
```

Every procedure emits per-batch progress and a bounded final residual probe. A value of `1001` means "at least 1001" rather than an unbounded count. A nonzero residual means rows were locked, the row ceiling was reached, or another writer changed them; rerun later under monitoring.
