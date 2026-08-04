# Spec: derive month/quarter tenant metrics from day + entity summaries

**Status:** proposed, not implemented
**Author context:** follows `specs/commercial-tick-wall-budget-investigation-2026-08-03.md`
**Target:** `app._metrics_v4_refresh_claimed_periods`, commercial branch

---

## 1. Problem

`metrics_tenant_period_summary` recomputes every grain from raw source tables on
every tick. Because the raw scan is bounded by
`MIN(period_start) .. MAX(period_end_exclusive)` across all four period keys, and the
quarter key is always one of them, **every tick scans from the start of the current
quarter to today** — regardless of how little changed.

That window grows monotonically until the quarter rolls over. Measured on the live
tenant (`d601c35c`), one dirty day producing four period keys:

| Scan window | Docs read | Buffers | Time |
|---|---|---|---|
| All 4 grains (bounded by quarter) — **Q3 today, ~40% full** | 5,278 | — | 58 ms (invoice header) |
| All 4 grains — **Q2, a complete quarter** | 14,018 | 8,826 | **651 ms**, spilling to disk |
| **Day + week only** | **1,089** | **758** | **~38 ms** |

Two things follow:

1. A complete quarter costs ~11x a day+week window, and Q3 currently holds only ~40%
   of Q2's volume — so this roughly 2.5x's again before 30 Sep.
2. The observed peak tick during the 2026-08-03 Zoho sync was **4,541 ms against a
   hard 5,000 ms `tick_wall_budget_ms`** (enforced by a CHECK constraint, so it cannot
   be tuned around). There is not enough headroom to absorb that growth.

`work_mem` was raised to 32 MB per-function (migration `20260804033955`), which removed
the disk spill (529 ms → 228 ms on the item block). That buys time; it does not change
the complexity.

## 2. Approach

Split the tenant period write by grain:

- **`day` and `week` stay on raw.** Their windows are bounded by the dirty-day span
  (+6 days for the enclosing week), never by quarter position. This is the self-healing
  path and it stays.
- **`month` and `quarter` are derived** from summaries the tick already maintains:
  - **additive measures** ← `SUM` over this tenant's `day` rows inside the window
  - **distinct counts** ← `COUNT(*)` over `metrics_buyer_period_summary` /
    `metrics_product_period_summary` at the *same grain and period_start*

The second point is the key one. A distinct count cannot be summed from day rows —
a buyer active on 12 days must count once, not twice. But the per-entity tables already
hold exactly that de-duplication, and **they are already maintained at `month` and
`quarter` grain and no other** (`metrics_v4_buyer_period_keys` /
`metrics_v4_product_period_keys` are populated `WHERE p.grain IN ('month','quarter')`).
The grains we need to derive are precisely the grains those tables cover.

Resulting cost is `O(dirty days + entities touched)` — independent of quarter size.

### Why not incremental deltas (`agg = agg - OLD + NEW`)

Considered and rejected. It gives a similar cost curve but a materially worse failure
mode:

- **Not idempotent.** The tick is at-least-once: claim → compute → acknowledge, with
  the whole thing rolling back and retrying on failure. On 2026-08-03 that path executed
  **201 consecutive times**. Under recompute those produced *stale* values; under delta
  they would have produced permanently *wrong* ones, silently and unrecoverably.
- **No delta exists for a definition change.** When
  `estimate_status_counts_as_demand` changed, every historical aggregate was invalidated.
  There is no `-OLD +NEW` for "the predicate changed" — a full recompute path is required
  regardless, so it would have to be built and maintained anyway.
- Distinct counts still could not be delta-maintained without carrying per-entity
  multiplicity, which is the per-entity summary table again.

The rollup keeps every value a *recompute*, so it stays idempotent: the failure mode is
staleness (repaired by re-marking a day), never drift.

## 3. Column mapping

All rows below were **verified against live data before writing this spec** — the
derivation reproduces every currently-stored `month` and `quarter` row exactly (7 rows,
8 measures spot-checked including all three distinct counts).

| Target column | Source | Verified |
|---|---|---|
| `invoice_count` / `invoice_value` / `invoice_units` | `SUM` over `day` rows | ✅ |
| `estimate_count` / `estimate_value` / `estimate_units` | `SUM` over `day` rows | ✅ |
| `order_count` / `order_value` / `order_units` | `SUM` over `day` rows | ✅ |
| `app_estimate_count` / `app_estimate_value` | `SUM` over `day` rows | ✅ |
| `app_order_count` / `app_order_value` | `SUM` over `day` rows | ✅ |
| `primary_demand_count` / `primary_demand_value` | `SUM` over `day` rows | ✅ |
| `invoice_buyer_count` | `COUNT(*)` buyer rows `WHERE invoice_count > 0` | ✅ |
| `estimate_buyer_count` | `COUNT(*)` buyer rows `WHERE estimate_count > 0` | ✅ |
| `order_buyer_count` | `COUNT(*)` buyer rows `WHERE order_count > 0` | ✅ |
| `primary_demand_buyer_count` | `COUNT(*)` buyer rows `WHERE primary_demand_count > 0` | ✅ |
| `invoice_product_count` | `COUNT(*)` product rows `WHERE invoice_count > 0` | ✅ |
| `estimate_product_count` | `COUNT(*)` product rows `WHERE estimate_count > 0` | ✅ |
| `order_product_count` | `COUNT(*)` product rows `WHERE order_count > 0` | ✅ |
| `source_watermark` | `MAX` over `day` rows | ✅ |
| `primary_demand_kind` | `v_primary`, unchanged | n/a |
| **`app_estimate_buyer_count`** | ⚠️ **blocked** — see 4.1 | ❌ |
| **`app_order_buyer_count`** | ⚠️ **blocked** — see 4.1 | ❌ |

## 4. Prerequisites

### 4.1 Four new columns on `metrics_buyer_period_summary`

The table stores only the *combined* `app_demand_count` / `app_demand_value`, so the
estimate and order app-buyer counts cannot be separated. Add:

```
app_estimate_count  bigint  NOT NULL DEFAULT 0
app_estimate_value  numeric NOT NULL DEFAULT 0
app_order_count     bigint  NOT NULL DEFAULT 0
app_order_value     numeric NOT NULL DEFAULT 0
```

Populate them in the existing buyer upsert (the values are already computed in its
`est` / `ord` laterals — they are currently only summed together). Keep
`app_demand_*` as the sum of the two for backward compatibility. Then:

- `app_estimate_buyer_count` ← `COUNT(*) WHERE app_estimate_count > 0`
- `app_order_buyer_count` ← `COUNT(*) WHERE app_order_count > 0`

Backfill via `_metrics_v4_backfill_driver` with **`p_chunk_days => 1`** (see the
investigation doc — a wider chunk silently skips buyers).

### 4.2 Reorder the commercial branch writes

`metrics_tenant_period_summary` is currently written **first** (~line 297), before
buyer (~433) and product (~694). Derivation requires it to run **after** both. New order:

```
buyer_period → buyer_now → location_now → product_period → tenant_period → brand → category
```

Safe: nothing between them reads `metrics_tenant_period_summary`. Brand/category read
`product_period`; `buyer_now` reads the buyer key temp table. The tail
`_metrics_v4_refresh_landing_kpis` already runs last.

## 5. New coupling, and the guard for it

**This is the real cost of the design and must be stated plainly.**

Today a `month` row is independently correct — it is computed from raw and does not care
whether the `day` rows are right. After this change, **`month`/`quarter` correctness
depends on `day` rows and on `buyer`/`product` period rows being complete.** A missed
dirty-mark that leaves a day row stale now silently propagates upward.

Three mitigations, in order of importance:

1. **Nightly drift check.** A job that recomputes `month`/`quarter` from raw for the
   current and previous period and compares against stored, logging any mismatch. This is
   the safety net that makes the coupling acceptable — without it, do not ship this.
   Cheap: a handful of periods, once a day, off-peak.
2. **Day-row coverage is already sound.** Verified 125/125 days present since
   2026-04-01, and a day with no activity contributes zero whether or not it has a row —
   only a day *with* activity and *no* row would undercount.
3. **The entity tables are verified complete** — 14,035 buyer and 2,107 product rows,
   zero mismatches against raw, and their DELETE guards remove rows whose activity
   disappears.

Note this coupling is less novel than it looks: `metrics_brand_period_summary` and
`metrics_category_period_summary` already derive from `product_period_summary` and have
always carried exactly this property.

## 6. Migration sequence

Each step is separately reversible and separately verifiable.

1. **Add the four columns** + populate in the buyer upsert. No behaviour change to
   tenant rows. Verify the new columns against raw.
2. **Backfill** (`chunk_days => 1`) so the new columns are populated historically.
3. **Reorder** the commercial branch writes. No behaviour change — verify the summaries
   are byte-identical before and after.
4. **Switch month/quarter to derived.** Restrict the raw CTE window to
   `grain IN ('day','week')` and add the rollup INSERT for `month`/`quarter`.
5. **Add the nightly drift check.**

Steps 1–3 are no-ops in output and can land independently of 4.

## 7. Verification

- **Before/after equality:** every `month` and `quarter` row for all tenants, all
  measures, stored vs derived — must be zero mismatches (the query used to validate this
  spec is the template).
- **Full gate vs raw** across all six summary tables, as run on 2026-08-04
  (16,552 rows, 0 mismatches) — must stay clean.
- **Cost:** re-measure the tenant block for a single dirty day. Expect the raw window to
  drop from ~14,018 docs to ~1,089, and the block from ~651 ms to well under 100 ms.
- **Sustained:** confirm peak tick no longer grows with quarter position — re-measure
  weekly through to 30 Sep.

## 8. Explicitly out of scope

- `metrics_product_period_summary.invoice_buyer_count` is a `COUNT(DISTINCT buyer_id)`
  with no finer grain beneath it (would need buyer×product×period). It stays on raw.
  It is cheap — bounded by the product key budget, not by period size.
- `day`/`week` remain raw. Do not "optimise" these into the rollup: they are the
  self-healing floor the whole design rests on.
- The pre-2026-04-01 history gap (raw goes back to 2025-08-18) is unrelated and remains
  a separate decision.
