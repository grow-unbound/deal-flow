# DB change guidance — lessons from the 2026-07-13 Zoho sync investigation

Source: a stuck initial Zoho sync led to a DB observability pass (DNS misconfig →
realtime WAL overhead → RLS/trigger/index audit). This doc captures what was
fixed, what's flagged for later, and rules to apply to future DB/migration work
so the same classes of bug don't recur.

## What shipped this session

| Migration | Fixes |
|---|---|
| `20260713133345_fix_functions_base_url.sql` | `app.get_functions_base_url()` fell back to a hardcoded dead project-ref host — every `sync-coordinator` dispatch failed at DNS, silently stalling all syncs. |
| `20260713141953_fix_push_to_zoho_webhook_url.sql` | Same stale-host bug, independently hardcoded into the `push-order-to-zoho`/`push-estimate-to-zoho` triggers. Also added a `WHEN (NEW.source IS DISTINCT FROM 'zoho_import')` guard so Zoho-sourced inserts skip the webhook at the Postgres level instead of round-tripping to the edge function just to self-skip. |
| `20260713142124_add_sync_realtime_pause_resume.sql` | `app.pause_sync_realtime()`/`resume_sync_realtime()` — automates dropping/re-adding sync-heavy tables from `supabase_realtime` around a sync run. The realtime WAL-decode consumer was the single biggest cumulative `pg_stat_statements` cost during bulk sync writes. |
| `20260713142254_gate_order_buyer_cohort_refresh_trigger.sql` | `trg_order_buyer_cohort_refresh` was the one dispatch-style trigger NOT gated by `app.sync_trigger_bypass_active()` — fired an expensive cohort re-evaluation on every synced-in order. |
| `20260713142325_drop_duplicate_indexes.sql` | 2 confirmed byte-identical duplicate indexes (`buyers`, `orders`). |
| `20260713143809_resume_realtime_on_manual_cancel.sql` | `resume_sync_realtime()` was only called from the coordinator's `mark_complete`/`halt_failed` terminal actions — a manual cancel (Settings "stop sync") never resumed it. |

## Known architectural issue — NOT fixed, needs a deliberate rewrite

### `app.refresh_buyers_snapshot(p_tenant_id)` / `app.refresh_buyer_current_snapshot(p_tenant_id)`

**The problem is not bloat.** Dead-tuple ratios on `buyers_snapshot`/`buyer_current_snapshot`
looked alarming mid-investigation (up to 100% dead) but autovacuum was catching up fine —
checked later, `n_dead_tup` was back to 0 after 14–16 autovacuum runs. Don't chase a VACUUM/PK
fix here, that's not the real lever.

**The actual problem: both functions take only `p_tenant_id`, not a buyer scope, and
recompute the snapshot for every buyer under that tenant on every single order/invoice/estimate
write** — not just the buyer whose row changed. Confirmed via `pg_stat_user_tables`:

- `buyers_snapshot`: **1,405,362 cumulative inserts + 681,065 deletes** for a table that only
  ever holds ~5 live rows. `refresh_buyers_snapshot` does `DELETE FROM buyers_snapshot WHERE
  tenant_id = ...` then a full multi-CTE re-`INSERT` of every buyer × scope combination, every
  call.
- `buyer_current_snapshot`: **343,449 inserts + 371,719 updates** for ~4 live rows.
  `refresh_buyer_current_snapshot` already uses `INSERT ... ON CONFLICT (tenant_id, buyer_id)
  DO UPDATE`, which is the right primitive — but it's still recomputing and upserting *every*
  buyer's row on every write, not just the one that changed.

Both are called from `app.dispatch_from_orders()` / `dispatch_from_invoices()` /
`dispatch_from_estimates()` with only `v_tenant`, on every non-bypassed write. This is
O(tenant's total buyer count) work triggered by a single-row write, on every order status
change, every invoice, every estimate, tenant-wide — not sync-specific, this is live
production traffic too.

**When revising this logic, consider:**
- Change both functions' signature to accept the specific `buyer_id` (or small set of
  `buyer_id`s) actually affected by the triggering write, and scope the recompute/upsert to
  just those buyers. `refresh_buyer_current_snapshot`'s `ON CONFLICT DO UPDATE` primitive is
  already right for this — it just needs a `WHERE b.id = p_buyer_id` instead of `WHERE
  b.tenant_id = p_tenant_id`.
- `refresh_buyers_snapshot`'s per-buyer *and* per-location rows make buyer-scoping slightly
  more involved (a buyer's location-scope rows span multiple `location_id`s), but the same
  principle applies — scope to the affected buyer's own rows, not the whole tenant.
- All three call sites (`dispatch_from_orders`, `dispatch_from_invoices`,
  `dispatch_from_estimates`) need to pass the buyer id through — check whether `NEW.buyer_id`
  is always available at call time (it is for orders/invoices/estimates, all buyer-scoped
  tables).
- This is financial/credit-limit computation logic — validate any rewrite against the existing
  CTEs' exact output for a sample tenant before shipping (row-for-row diff, not just "looks
  right").

## Unaddressed observations — track for future fixes as scale grows

Not fixed, not currently in flight, ranked roughly by when they'll start to matter:

1. **RLS `multiple_permissive_policies` (168 advisor warnings)** — separate buyer/seller
   policy pairs per table/action force Postgres to evaluate every permissive policy per row
   and OR the results. Prime suspect for `app.orders` showing 233,059 `seq_scan` against 69
   live rows. Being worked in a follow-up sweep (see below) — if that sweep didn't cover a
   table, it's still open.
2. **103 unindexed FKs**, concentrated on integration/webhook tables (`integration_data_flows`,
   `integration_webhook_errors`, `buyer_app_activity`, `integration_entity_map`,
   `integration_sync_jobs`, `integration_webhook_event_changes`/`events`,
   `tenant_integrations`, `whatsapp_messages`). Slows FK-referencing DELETE/UPDATE checks and
   joins. Being worked in the same follow-up sweep.
3. **118 unused indexes** — pure write overhead, no read benefit *in this dataset's traffic
   history so far*. Don't mass-drop off a low-traffic dev DB's advisor snapshot; only safe to
   drop ones that are also redundant subsets of another index. Needs a fresh advisor check once
   there's real production query traffic before trusting the "unused" signal.
4. **`integration_sync_jobs` heartbeat/progress churn** — high dead-tuple ratio from repeated
   small-table UPDATEs during a sync run. Autovacuum keeps up fine at 1-tenant volume; scales
   linearly with (concurrent tenant syncs × active phases × 15s coordinator ticks). Re-check
   once multiple tenants run initial syncs concurrently.
5. **Instance sizing** — `shared_buffers` ~224MB, `work_mem` ~2.1MB, `max_connections` 60
   (Micro/Small tier). Cache hit ratio is 99.998% today because the whole DB still fits in
   RAM. This stops being true as tenant count/data volume grows — watch `pg_stat_database`
   cache hit ratio and `pg_stat_statements` temp-file spillage (`temp_blks_written`) as leading
   indicators that it's time to upgrade tier, not something to act on preemptively.
6. **Webhook secret hardcoded in migration SQL** — the `x-push-secret` value for
   `push-order-to-zoho`/`push-estimate-to-zoho` triggers is plaintext in the migration file.
   Not a performance item, but worth moving to Vault/env-based secret if that's an accepted
   pattern elsewhere in this repo.

## Rules for future DB/migration work (derived from the above)

- **Any hardcoded `https://<project-ref>.supabase.co` URL is a landmine.** Two independent
  copies of the same stale ref caused two separate outages this session
  (`app.get_functions_base_url()`'s fallback, and the push-to-zoho triggers). Grep for
  `supabase.co` across `supabase/migrations/*.sql` before shipping any migration that touches
  triggers/functions calling out to edge functions — if you find a literal project-ref host,
  route it through `app.get_functions_base_url()` instead of hardcoding it again.
- **A trigger firing during bulk sync writes must check `app.sync_trigger_bypass_active()`
  unless it's a genuine data-integrity check** (like `_assert_integration_child_tenant_consistency`,
  which correctly stays ungated). When adding a new trigger to `orders`/`invoices`/`estimates`/
  `tenant_products`/`tenant_inventory`, default to gating it and only skip the guard with a
  stated reason.
- **A `refresh_*`/snapshot-rebuild function that takes only `tenant_id` is a scaling red flag.**
  If it's called from a per-row trigger, it needs to be scoped to the specific row(s) that
  changed, not recompute the whole tenant. Check `pg_stat_user_tables.n_tup_ins`/`n_tup_upd`
  relative to `n_live_tup` for any snapshot/materialized table — a ratio in the thousands
  means something is re-deriving the whole table on every write.
- **Before adding a new RLS policy for a role/action pair that already has one, check whether
  it can be OR'd into the existing policy instead of added alongside it** — `multiple_permissive_policies`
  compounds linearly with policy count, and it's cheap to avoid at write-time vs. expensive to
  unwind later once app code depends on the split policies' exact behavior.
- **Realtime publication membership (`supabase_realtime`) should stay minimal.** Every table
  added multiplies WAL-decode cost per write. Before adding a table to the publication, confirm
  it actually needs live client updates — don't add it "just in case."
- **When investigating `pg_stat_statements`/`pg_stat_user_tables` numbers, always check
  `last_autovacuum`/`autovacuum_count` before concluding something is bloated** — a bad dead-tuple
  ratio caught mid-burst can look like a permanent problem when autovacuum is actually keeping
  up over a longer window (this is exactly what happened with `buyers_snapshot` in this
  session — first read looked like critical bloat, second read minutes later showed 0 dead
  tuples).
