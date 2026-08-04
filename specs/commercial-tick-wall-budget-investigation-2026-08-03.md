# Commercial domain `tick_wall_budget_exceeded` — investigation handoff

Companion to `specs/kpi-fix-execution-log.md` (full detail there). This is the condensed
resumption point — read this first before re-investigating, so a fresh dive doesn't repeat
already-ruled-out hypotheses or re-fix already-fixed bugs.

**Target:** project `hcpzbnmumbykdqveyjhr`, tenant `d601c35c-1a78-4506-a556-a82118d72893`
(live, `commercial` domain). pg_cron job `metrics-v2-refresh-tick` (jobid 76 as of this writing —
job gets re-created with a new numeric id each time it's unscheduled/rescheduled, jobname stays
constant).

## Symptom

`app._metrics_v4_refresh_claimed_periods(..., 'commercial')` intermittently/mostly exceeds the
hard 5000ms `tick_wall_budget_ms` ceiling. Not a hard deadlock (unlike the separate
`buyer_key_budget_exceeded` bug, now fixed) — the queue does drain, just slowly, with most ticks
failing and retrying.

## Bugs already found and fixed — do not re-investigate these

1. **`metrics_v4_buyer_key_budget_exceeded` — FIXED, confirmed 0 occurrences post-fix.** Separate
   bug from the wall-budget one. Root cause: (a) buyer/product/location key collection ran
   unconditionally regardless of domain — a `buyer_app` tick paid for a collection its own branch
   never reads; (b) the collection fanned out per dirty day to every buyer transacting tenant-wide
   that day, uncapped (4 days → 434 buyers on ordinary volume, no spike). Fixed via domain-gating
   the collection + capping it to a single dirty day
   (`app.metrics_tenant_top80_cache`... no — see `metrics_v4_key_collection_days`) + gating
   `buyer_app_activity` dirty-marking on `buyer_app_enabled`. Files:
   `20260803101451_fix_buyer_key_budget_domain_scope_and_day_cap.sql`,
   `20260803101652_gate_buyer_app_activity_dirty_marking.sql`.
2. **`_metrics_v4_refresh_landing_kpis` tail call — ruled out as the wall-budget bottleneck.**
   Measured directly (isolated call, no fencing needed): ~300ms–1.5s depending on cache warmth,
   well under 5s. Already domain-scoped (only recomputes the calling domain's owned pages) from
   an earlier pass. Added day-overlap scoping to its 7-iteration period-selector loop (skip a
   selector period if no dirty day falls inside it) — verified the skip logic itself works
   correctly (0 rows contributed for a non-overlapping day vs. full recompute for an overlapping
   one), but **deploying it did not change the failure rate** — confirms this function was never
   the dominant cost. File: `20260803121327_scope_landing_kpis_loop_by_dirty_day_overlap.sql` +
   call-site update `20260803121617_pass_dirty_days_to_landing_kpis_call.sql`.
3. **Unrelated bug caught in passing, fixed:** `CREATE OR REPLACE FUNCTION` does not replace
   across an arity change — every earlier migration that appended a parameter to
   `_metrics_v4_refresh_landing_kpis` (`p_domain`, then `p_dirty_days`) left the older-arity
   version as a live orphaned overload instead of replacing it in place. Harmless in production
   (the one real caller always passed the full arg list) but caused "function is not unique" for
   any 3-arg-style call. Dropped both stale overloads:
   `20260803121810_drop_orphaned_landing_kpis_overloads.sql`. **If continuing cleanup work, check
   other functions touched this session for the same leftover-overload pattern.**

## Hypotheses considered and ruled out

- **Backfill / bulk import spike.** Ruled out — checked invoice `created_at` distribution for the
  affected days, evenly spread across business hours, no burst.
- **Wide reconciliation date ranges as a poison pill.** Confirmed real, not ruled out — a single
  90-day `metrics_mark_reconciliation` call caused instant 100% failure (period-key fan-out from
  one wide range, not the entity collection which is already capped). Fixed operationally by
  chunking to ≤7-day windows, not a code bug. **Any future reconciliation marking must chunk
  ≤7 days — this is a process rule now, not a system guarantee.**
- **`_metrics_v4_refresh_landing_kpis` tail call as dominant cost.** Ruled out, see bug #2 above.
- **7-iteration period-selector loop as dominant cost.** Ruled out, see bug #2 above.
- **Traffic growth as the current cause.** Not confirmed either way — plausible long-term risk
  (cost scales with daily transaction density, which grows with adoption) but not shown to be
  today's actual trigger; today's failures happen at current, unremarkable volume.

## Not yet investigated — where to look next

The remaining suspect is **inside `_metrics_v4_refresh_claimed_periods`'s `commercial` branch
itself**, not its landing_kpis tail call:
- `metrics_tenant_period_summary` INSERT (LATERAL over `metrics_v4_period_keys`, invoice/estimate/
  order header+item aggregates)
- `metrics_buyer_period_summary` INSERT + DELETE guard (per buyer × month/quarter — scales with
  how many distinct buyers the capped day touches, ~100–200+ on this tenant's ordinary days)
- `metrics_product_period_summary` INSERT + DELETE guard (per product × month/quarter, same
  scaling concern)
- Brand/category rollups (`JOIN app.metrics_product_period_summary ps ... WHERE
  ps.invoice_count > 0` — scans the full product-period set for that grain/period, cost scales
  with distinct products invoiced that period)
- `metrics_buyer_now_summary` / `metrics_location_now_summary` (smaller, likely not the driver)

None of these have been isolated and timed directly yet — only the tail call has (that approach
was easy since it needs no fencing token; these live inside the fenced function).

**Also worth checking before profiling:** the 27 small reconciliation chunks marked this session
(last 90 days for `d601c35c` + full history for the demo tenant, `550e8400-e29b-41d4-a716-446655440501`)
are still draining. They may be inflating current batch sizes independent of any code issue — get
a clean read after they fully drain (`app.metrics_inspect`) before trusting a new profiling
baseline.

## RESOLVED (2026-08-03, later session) — root cause found and fixed

**Root cause: the parent document scan was never hoisted out of the per-product
`LATERAL` in the `metrics_product_period_summary` INSERT and its DELETE guard.**

The earlier `MATERIALIZED` fix (noted in `20260802060714`) pinned the *item*-side join
order correctly, but the *parent* side — the `tenant_id + metric_day_ist` range scan of
`invoices`/`estimates`/`orders` — was still re-executed once per product × grain key.

Profiled on `d601c35c`, 100 products × 2 grains:

```
old: Execution 961ms   shared hit=625328
     Index Scan on invoices ... rows=2624 loops=188   buffers=447850   <-- re-scanned 188x
new: Execution 132ms   shared hit=33749
```

Cost was `O(products × period_rows)`; it is now `O(period_rows + item_rows)`. At the
configured 250-key budget the old shape cost ~2.4 s for this one block alone.

Fix: `supabase/migrations/20260803130704_fix_product_period_hoist_doc_scan.sql` —
materializes per-`(product, grain, period)` aggregates once into
`pg_temp.metrics_v4_product_agg`, which both the INSERT and the DELETE guard then read.
Pure rewrite of the same computation; still reads raw source tables, so the self-healing
property is preserved. Verified equal to the old formulation across day/month/quarter:
540 rows, 0 mismatches on units/value/count/buyer_count.

**Result:** ticks went from 100% failure (201 consecutive `tick_wall_budget_exceeded`,
queue fully stalled for ~1 h) to succeeding at ~2.8 s avg / 4.3 s max, queue draining.

### Hypotheses tested and rejected this session (do not re-investigate)

- **Sort/hash spill from small `work_mem`.** `work_mem` is only 2184 kB and the database
  has spilled 172 GB of temp files lifetime — but the tick's own sorts measured
  520 kB–1221 kB, i.e. under the limit. The temp spill belongs to other workloads. Not
  the tick's problem *today* (it would become one as the quarter fills).
- **Missing/unusable indexes.** `app.metric_day_ist` is `IMMUTABLE` and matching
  expression indexes exist on all three doc tables. Date predicates index correctly.
- **Lock contention.** `lock_timeout` is 100 ms inside the tick, so contention aborts
  fast with a different SQLSTATE. It cannot produce a 5 s wall-budget overrun.
- **Temp-table catalog churn.** `pg_class` / `pg_attribute` are normal size.
- **Tuning the runtime-control knobs.** `max_dirty_sources_per_tick` 100→10 made it
  *worse* (7.5 s), because cost tracks product×period rows, not dirty sources.
  `max_refresh_keys_per_tick` cannot be lowered as a throttle — exceeding it *raises*
  `metrics_v4_*_key_budget_exceeded` rather than truncating the batch. And
  `tick_wall_budget_ms` is capped at 5000 by the
  `metrics_runtime_control_budget_check` CHECK constraint, so there is no config bridge.
  Config was returned to defaults; no tuning drift left in place.

### Still open / lower priority

- `metrics_dirty_work` write amplification: `n_tup_hot_upd` = 0 across 948,704 updates,
  because `metrics_dirty_work_tenant_domain_updated_idx` indexes `updated_at` and every
  UPDATE sets it. Causes index bloat (824 kB partial index over 748 live rows) and 3,810
  autovacuums. Fix: drop `updated_at` from that index key, set `fillfactor=70`, reindex.
- `metrics_buyer_now_summary` / `metrics_location_now_summary` scan **all-time**
  invoices/estimates/orders per entity every 15 s, filtering for open/overdue only after
  the scan. `invoices_metrics_tenant_due_idx` (partial on `outstanding_balance > 0`) is
  unusable as written; pushing that predicate into the `WHERE` is semantically free.
- Planning time is significant: measured 11–290 ms *per statement*, and pg_cron opens a
  fresh backend per run so nothing is ever plan-cached. ~30 statements/tick.
- `app.metrics_prune_operational_history` exists but is not scheduled;
  `metrics_execution_history` grows unbounded (26,470 rows).

## SEPARATE BUG FOUND (2026-08-03) — estimate predicate deployed without backfill

`20260803080607_add_estimate_status_counts_as_demand_predicate.sql` changed the demand
predicate but nothing re-marked historical periods, so stored estimate metrics never
caught up. Measured: **2,008 estimates missing** from `metrics_tenant_period_summary` on
`d601c35c` at every grain (123/125 day rows, 18/19 week, 5/5 month, 2/2 quarter wrong),
plus 7 on the demo tenant `550e8400-…0501`. Invoice metrics are unaffected — that
predicate did not change.

This is a data-correctness bug, not a performance one, and it is why day-grain rows
could not be used to validate a derivation. **Repair still pending**: re-mark the
affected ranges in ≤7-day chunks (standing process rule) once the queue is healthy.

## Recommended next step

Same technique that found the buyer-key bug: `cron.unschedule('metrics-v2-refresh-tick')` to stop
racing the tick, manually claim a real `commercial` batch via
`app.metrics_claim_dirty_work(gen_random_uuid())`, reconstruct the exact temp-table state
(`dirty_days`, `key_collection_days`, `buyer_ids`, `product_ids`, `period_keys`) the function
would build, then time each major INSERT's underlying SELECT standalone via a
`clock_timestamp()`-diff CTE (same pattern used throughout this investigation) to find which
block(s) actually dominate. Reschedule the cron afterward (same jobname, new jobid is fine).

## Current live state (superseded — see "RESOLVED" section above)

- All migrations above pushed and confirmed applied via `supabase migration list --linked`.
- `app.metrics_runtime_control` back at defaults (`max_dirty_sources_per_tick=100`,
  `max_refresh_keys_per_tick=250`) — no non-default tuning left in place from earlier
  investigation.
- Cron active, queue draining (slowly, due to the still-open wall-budget issue).

---

# Final state after the fix session (2026-08-03)

## Migrations added

| File | What |
|---|---|
| `20260803130704_fix_product_period_hoist_doc_scan.sql` | **The fix.** Hoists the parent doc scan out of the per-product LATERAL (INSERT + DELETE guard). |
| `20260803131322_metrics_dirty_work_hot_updates_and_prune_cron.sql` | Restores HOT-update eligibility, fillfactor/autovacuum tuning, schedules the prune job. |
| `20260803131547_bound_now_summary_lifetime_scans.sql` | Bounds the two `*_now_summary` all-time scans + 4 partial indexes. |
| `20260803133952_skip_noop_summary_upserts.sql` | Makes all 11 summary upserts no-ops when the recomputed values match what is stored. |
| `20260803170133_fix_tick_failure_bookkeeping_lost_on_rollback.sql` | Makes tick failures visible and retryable instead of silently looping. |
| `20260803170807_tenant_period_single_scan_all_grains.sql` | `metrics_tenant_period_summary`: one scan per doc type instead of one per grain. |

## Measured results

| Metric | Before | After |
|---|---|---|
| Tick outcome | **201 consecutive failures**, queue stalled ~1 h | succeeding |
| Tick duration | 6.0–8.4 s (over the 5 s budget) | **294 ms avg, ~1.9 s max** on normal load |
| `metrics_product_period_summary` block | 962 ms / 625,328 buffers | 132 ms / 33,749 buffers |
| `metrics_location_now_summary` block | 124 ms / 15,135 buffers | 35 ms / 731 buffers |
| `metrics_dirty_work` index footprint | ~2.6 MB over 748 live rows | ~390 kB |

## ⚠ Outstanding — must be actioned

1. **Runtime control is back at documented defaults** — verified:
   `max_dirty_sources_per_tick=100`, `max_refresh_keys_per_tick=250`,
   `tick_wall_budget_ms=5000`, `lease_ttl_seconds=15`, `statement_timeout_ms=3000`,
   `lock_timeout_ms=100`, `max_statement_groups_per_tick=25`. **No tuning drift left in
   place.** (`max_dirty_sources_per_tick` was temporarily 10, then 2, during the session;
   both were reverted.)

   **Correction to an intermediate diagnosis made during this session:** the stalled
   reconciliation batch was *not* caused by many chunks being claimed at once.
   `app.metrics_claim_dirty_work` charges any row with a non-NULL `dirty_from` a
   `key_cost` equal to the *entire* `max_refresh_keys_per_tick`, and then claims only
   while `cumulative_keys <= max_refresh_keys_per_tick` — so **exactly one reconciliation
   row is ever claimed per tick**, regardless of `max_dirty_sources_per_tick`. A single
   7-day chunk was blowing the 5 s budget on its own, pre-fix. Lowering
   `max_dirty_sources_per_tick` therefore had no effect on reconciliation drain rate and
   was never the right lever.

2. **The rollback-hides-the-failure behaviour is real and still unfixed.** When compute
   exceeds the wall budget, the claim and the compute share one transaction, so the
   rollback also undoes the claim: `attempts` stays 0, `last_error` stays NULL, and the
   row is re-claimed unchanged on the next tick. A tick that is merely *too slow* thus
   retries forever and never reaches `dead_letter`, and `metrics_dirty_work` shows no
   evidence of the problem — only `cron.job_run_details` does. Worth fixing: record the
   attempt outside the aborted transaction, or bound a claim by dirty-day span.

3. **Estimate backfill: COMPLETE and verified.** `d601c35c` is exact at all four grains
   (0 rows wrong, 0 missing, from 2,008 missing). Full cross-measure gate over all four
   tenants — invoice count/value/buyer_count, estimate count/value, order count — is
   clean except for the current in-flight day/week/month/quarter on the live tenant,
   which differ by exactly one document (normal eventual-consistency lag, absorbed by the
   next tick).

4. **Phase 3b not done.** The `*_now_summary` blocks are now cheap but still run every
   15 s. Moving them to a 1–5 min job was deliberately skipped: 3a removed the cost, and
   3b would make buyer-facing credit/overdue figures up to minutes stale.

5. **`source_watermark` narrowed** on `metrics_buyer_now_summary` and
   `metrics_location_now_summary` — it now tracks only unsettled/open documents. Justified
   in the migration header; do not take an all-documents watermark from those two tables.

## Second pass (same day) — remaining planned items

### P1.4 — no-op summary upserts (`20260803133952`)

Every `ON CONFLICT ... DO UPDATE` fired unconditionally, rewriting identical rows every
15 s (`metrics_product_period_summary`: 419,081 updates over 2,122 live rows). All 11
upserts now compare measures + `source_watermark` with `IS DISTINCT FROM` and skip when
unchanged. `computed_at`/`updated_at`/`generation_id` are excluded (they change every
run by construction); `source_watermark` is excluded for `metrics_campaign_period_summary`
and `metrics_cohort_period_summary` only, because those two set it to `v_now` rather than
a MAX over source rows — including it there would have made the guard dead code.

**Verified:** forced a full reconciliation of an unchanged day. The tick recomputed
everything and wrote **zero** row updates — all counters frozen (product 465,908,
buyer 406,890, buyer_now 204,320, tenant 8,223).

### Tick failures were invisible AND unretryable (`20260803170133`)

Two compounding bugs in the pg_cron job body:

1. `EXCEPTION WHEN OTHERS` never caught the wall-budget abort. It is raised with
   ERRCODE `57014` (`query_canceled`), which PL/pgSQL deliberately excludes from
   `WHEN OTHERS`. The `fail` stage was never reached for the *only* error actually
   occurring. (`_metrics_v4_backfill_driver` had already hit and fixed this; the cron
   body never got the same treatment.)
2. The trailing bare `RAISE;` re-threw after `fail`/`release` ran, aborting the
   transaction and discarding that bookkeeping *and* the claim.

Net: a merely-too-slow tick looped forever, never incremented `attempts`, never set
`last_error`, never reached `dead_letter`, and left `metrics_dirty_work` looking healthy.

Fixed by handling `query_canceled` explicitly and replacing `RAISE;` with `RAISE WARNING`
so the transaction commits. **Trade-off:** `cron.job_run_details` now records these runs
as `succeeded`; the authoritative failure record is `app.metrics_execution_history`
(`status='failed'`) and `app.metrics_dirty_work` (`attempts`/`last_error`).

**Verified** by temporarily setting `tick_wall_budget_ms = 1`: produced
`state='retry', attempts=2, last_error='metrics_compute_failed'` with exponential backoff
and a matching `failed` history row. After restoring the budget the rows retried and
completed on their own. Budget restored to 5000.

### Phase 2 — `metrics_tenant_period_summary` (`20260803170807`)

The block ran six correlated LATERALs *per period key*. One dirty day yields four keys
(day/week/month/quarter) and each re-scanned the same rows — day ⊂ week ⊂ month ⊂ quarter,
so the quarter scan already contained everything.

```
old: 565ms, shared hit=45055   (invoices rows=1488 loops=4;
                                estimate-item loop 123ms x 4 = 30032 buffers,
                                11156 heap fetches)
new: 58ms / 4653 buffers for the invoice-header portion, rows=5278 loops=1
```

Now each document type is pulled **once** over `MIN(period_start)..MAX(period_end_exclusive)`
into a `MATERIALIZED` CTE, then joined back to the period keys and grouped by
`(grain, period_start)` — all grains derived in one pass. Header and item aggregates stay
separate (joining them would fan `total_amount` out per line item).

**This deliberately does NOT derive month/quarter from stored day rows.** It still reads
raw source, so a dirty period is always recomputed from truth and the self-healing
property is unchanged — which matters given the predicate-change incident above.

**Verified:** all 151 stored rows for `d601c35c` exact against raw source across 4 grains
× 9 measures (invoice count/value/buyer_count/units/product_count, estimate
count/value/units, app_estimate_count). Zero mismatches.

Also ran `VACUUM (ANALYZE) app.estimate_items` — its visibility map was stale, causing
11,156 heap fetches on what should be index-only scans.

## Third pass — pre-cutover correctness audit + full rebuild

### A retracted finding, recorded so it is not "rediscovered"

I initially reported that `get_landing_metrics_v4` was serving a `today` estimates KPI
19x too low (₹380,443 vs ₹7,161,593). **That was wrong.** The snapshot's unique key
includes `period_start`, and the read pins `s.period_start = v_bounds.period_start`
recomputed from `p_as_of` — so a previous day's row can never be selected. I compared a
stale row's payload against truth without checking the selection predicate.

The read path is correct. Verified: `dashboard / this_month` invoiced_sales returns
2,412,141, exactly matching `metrics_tenant_period_summary`.

What *is* real from that thread: because the key includes `period_start`, every rollover
of a relative window (`today`, `this_week`, `last_week`, `now`) leaves a **permanently
orphaned row** — never updated, never read, never pruned. ~5–10 rows/day of pure growth.
Needs a prune, not a correctness fix.

### The real defect: reconciliation could not repair buyer summaries

768 `metrics_buyer_period_summary` rows (442 month + 326 quarter) carried pre-predicate
values, all `computed_at = 2026-08-02`. Root cause: `metrics_v4_key_collection_days` is
capped to a **single day**, so an N-day reconciliation chunk only collects buyers active
on day 1. Buyers transacting on days 2..N are never recomputed.

**Consequence for any future backfill: `p_chunk_days` MUST be 1.** With chunk_days=1 each
chunk's only dirty day is its key-collection day, so every affected buyer is covered.
A wider chunk silently reintroduces this hole — that is exactly why the earlier 7-day
chunk backfill left these rows stale while fixing tenant and product rows.

### Full rebuild performed (live tenant, 2026-04-01 → today)

- Wipe deliberately **not** performed. Evidence: 442 orphan rows existed but were
  **all-zero** (`stale_nonzero = 0`) and none on the live tenant; no row anywhere carried
  a stale non-zero value. A wipe would have been an irreversible step that fixed nothing.
- `cron.unschedule` during the run rather than `metrics_set_dispatch_enabled(false)` —
  **pausing dispatch would have broken the backfill**: the driver drains via the same
  `metrics_refresh_tick('claim')` path, which returns `'disabled'`, and the driver treats
  that as `CONTINUE` without incrementing its idle counter → 20,000 empty iterations.
- Useful trick: calling `_metrics_v4_backfill_driver` with `p_backfill_start` in the
  **future** skips the marking phase entirely and gives a pure drain loop. Each call
  drains ~110 rows before the client statement timeout; repeat until the queue is empty.
  Far faster than waiting on cron, which only ever claims one reconciliation row per tick.

### Post-rebuild gate — all green

| Table | Rows verified | Bad |
|---|---|---|
| `metrics_buyer_period_summary` | 14,035 | **0** |
| `metrics_product_period_summary` | 2,107 | **0** |
| `metrics_category_period_summary` | 160 | **0** |
| `metrics_tenant_period_summary` | 151 | **0** |
| `metrics_brand_period_summary` | 92 | **0** |
| `metrics_cohort_period_summary` | 7 | **0** |
| **Total** | **16,552** | **0** |

Queue backlog 0, dead_letter 0, cron restored to 15s, runtime control at defaults.

### Known, accepted gap

v4 holds no data before **2026-04-01** for `d601c35c`, while raw invoices go back to
**2025-08-18** — ~226 days absent. Scoped out by explicit decision; re-run the driver
with an earlier `p_backfill_start` (and `p_chunk_days => 1`) if that history is needed.

## Still worth doing (not blocking)

- Planning time is 11–290 ms *per statement* and pg_cron opens a fresh backend per run, so
  nothing is ever plan-cached — roughly 0.5 s/tick of pure planning across ~30 statements.
  Worth investigating a long-lived worker or fewer/simpler statements.
- `work_mem` is 2184 kB. The tick's own sorts currently peak at ~1.2 MB, so it is not
  spilling *yet*, but the quarter-grain sorts grow through the quarter and will cross it.
  A transaction-local `set_config('work_mem', ...)` in `metrics_refresh_tick` is a cheap
  pre-emptive fix.
- The buyer block still uses per-buyer correlated LATERALs. They are index-driven and
  cheap today (~41 ms for 200 keys), but they are the same shape that made the product
  block pathological, and they scale with the buyer key budget.
