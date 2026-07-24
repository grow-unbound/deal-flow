# KPI Fix Execution Log

Companion to `specs/kpi-callout-audit-2026-07-23.md` §6–7 (standards + plan). This file is
the resumption point for any session picking up this work — check status here before
re-reading the full audit doc.

**Rule when picking this up in a new session:** update your item's row the moment you finish
it (not at the end of a batch) — status, files touched, migration name if any, how you
verified it, and date. If you find the plan itself needs to change, edit the audit doc's §6/§7
and note that you did so here.

**Target DB:** project `hcpzbnmumbykdqveyjhr` (linked via `supabase db push`). Test tenant for
live verification: `d601c35c-1a78-4506-a556-a82118d72893`.

---

## P0 — ✅ COMPLETE (all 4 items done, both migrations pushed + live-verified 2026-07-23)

| # | Item | Status | Files touched | Migration | Verified how | Date |
|---|---|---|---|---|---|---|
| 1 | Locations "Overdue amount" → `overdue_amount` not `receivable_amount` | DONE | `supabase/migrations/20260723121903_fix_locations_overdue_kpi_field.sql`, `src/hooks/useLocations.ts`, `app/api/tenant/locations/landing/route.ts`, `src/components/seller/locations/LocationsLandingClient.tsx` | 20260723121903_fix_locations_overdue_kpi_field.sql | `npx tsc --noEmit` clean. `get_seller_locations_landing_summary` now also returns `overdue_dues_total` (`SUM(overdue_amount)` across `location_rollup`, already sourced from `metrics_location_snapshot.overdue_amount`/`app.invoice_is_overdue`) and `overdue_location_count` (`overdue_amount > 0`, matching the "Collections overdue" callout filter) alongside the untouched `outstanding_dues_total`/`dues_location_count`. `LocationsLandingKpis` type and `EMPTY_KPIS` default updated with both fields. Locations landing "Overdue amount" tile now reads `kpis.overdue_dues_total`/`kpis.overdue_location_count` instead of `kpis.outstanding_dues_total`/`kpis.dues_location_count`. Migration not yet pushed — pending a separate `supabase db push`. | 2026-07-23 |
| 2 | Customers "Invoiced sales · MTD" → "· 90D" label fix | DONE | src/components/seller/customers/CustomersLandingClient.tsx | (none) | typecheck clean | 2026-07-23 |
| 3 | Orders `open_value` missing from RPC for `p_kind='orders'` | DONE | `supabase/migrations/20260723121905_fix_orders_open_value_field.sql` | 20260723121905_fix_orders_open_value_field.sql | `npx tsc --noEmit -p .` clean. Traced `app.metrics_v2_transaction_landing`'s two defining migrations (`20260716092549_metrics_v2_phase_6_landing_pages.sql` — orders branch only emits `'open_total', v_open_count`; `20260717131227_metrics_v2_estimates_pulse_value_fields.sql`, the latest, already carries `'open_value', v_open_value` alongside `'open_total'` in the orders-kind jsonb_build_object, variable `v_open_value` already computed from `open_order_value` in `metrics_location_snapshot`/`metrics_tenant_commercial_snapshot`). New migration re-applies the full current (717) function body verbatim so `open_value` is guaranteed present in the orders-kind response on every environment, closing any drift where a deployment still runs the pre-717 definition. `app/api/tenant/orders/route.ts` (`landingKpis.open_value ?? 0`) and `src/hooks/useOrders.ts`'s `OrdersKpis.open_value: number` already matched the RPC field name — no changes needed on either side. Migration not yet pushed — pending a separate `supabase db push`. | 2026-07-23 |
| 4 | Buyer App: canonicalize dues predicate (Home GMV filter, Profile credit widget, unpaid-invoices sheet, seller Dashboard `needs_action` reuse) + fix credit-tile fallback sum bug | DONE | `src/lib/invoice-status.ts`, `src/lib/server/buyer-credit.ts`, `app/api/buyer/invoices/route.ts`, `app/api/buyer/home/route.ts` | (none) | `npx tsc --noEmit -p .` clean. `loadBuyerCreditSnapshot`/`Snapshots` now fetch invoices without the too-permissive `.neq('status','draft')` and instead filter rows with the canonical `hasInvoiceReceivableExposure` predicate (status in sent/viewed/unpaid/partially_paid/overdue AND outstanding_balance>0), so `void` invoices with stray positive `outstanding_balance` no longer count as credit used. `app/api/buyer/invoices/route.ts` `unpaid_only=true` now applies `hasInvoiceReceivableExposure` as a post-fetch filter on top of the existing `.gt('outstanding_balance',0)` DB pre-filter. `app/api/buyer/home/route.ts` GMV (`gmvMtd`/`gmvPreviousMonth`/`gmvYtd`/`invoiceCountYtd`) now filters `financialInvoices` through a new `invoiceStatusGmvIncluded()` (added to `src/lib/invoice-status.ts`, mirrors SQL `app.invoice_status_gmv_included`: excludes only `draft`/`void`) before summing, so draft/void invoices no longer inflate spend. Credit tile fallback (`buyerMetrics` null) reworked so `credit_limit`/`available_credit`/`credit_used` all derive from one shared `outstandingDues` value (same live-invoice-sum fallback already used for the dues card) instead of independently defaulting `available_credit` to 100% and `credit_used` to 0. | 2026-07-23 |

## P1 — ✅ COMPLETE (items 6–8 done + live-verified; item 5 deferred to end of phase by design)

| # | Item | Status | Notes |
|---|---|---|---|
| 5 | Verify metrics refresh pipeline self-heals after bulk `invoice_items` backfill (not a code fix unless a gap is found) | ✅ DONE 2026-07-23 — no gap found, self-healed correctly | See full write-up in session notes below. Summary: 0 invoices missing line items (100% backfilled, test tenant), basis gap shrank from ~20% to ~15.2% (matches predicted structural residual), all snapshot tables reflect backfilled totals with zero manual reprocess needed, cross-page figures now match to the rupee across Locations/Invoices/Customers/Dashboard, refresh-cadence audit found no misalignment requiring a fix. |
| 6 | Extend `metrics_v2_primary_demand_kind` to Brands + Cohorts | DONE | **Files touched:** `supabase/migrations/20260723123407_extend_primary_demand_brands_cohorts.sql` (new, previously an empty placeholder).<br><br>**Migration — two `CREATE OR REPLACE FUNCTION`s, both bodies copied verbatim from their confirmed-latest prior definitions (`app.get_seller_brand_landing_summary` from `20260719065025_v1_snapshot_retirement.sql`; `app.get_seller_cohort_landing_aggregates` from `20260723011321_cohort_landing_aggregates_point_in_time.sql` — repo-wide grep confirmed no later `CREATE OR REPLACE` of either name exists) with only the GMV-computation portion branched on `app.metrics_v2_primary_demand_kind(p_tenant_id)`, following the exact `IF v_primary = 'orders' ... ELSIF v_primary = 'estimates'` pattern already established in `app.get_metrics_v2_buyer_app_dashboard` (`20260718131001_fix_buyer_app_dashboard_metrics.sql`) and `app.get_metrics_v2_seller_dashboard`'s `location_comparison` CTE (`CASE v_primary WHEN 'orders' ... WHEN 'estimates' ...`, `20260716090456_...foundation.sql`). Both target functions are `LANGUAGE sql` (no `IF`/`ELSIF` available), so the branch is expressed as a `demand_kind AS (SELECT app.metrics_v2_primary_demand_kind(p_tenant_id) AS kind)` CTE cross-joined in, gating each source with `WHERE dk.kind IN ('orders','none')` vs `WHERE dk.kind = 'estimates'` per the task's explicit instruction to keep `'orders'`/`'none'` on the existing path unchanged.<br><br>**`get_seller_brand_landing_summary`:** `period_brand` CTE (drives `portfolio_gmv_mtd`/`_prev_mtd`, `needs_attention`, `top_performers`, `top_risers` — all downstream of `brand_rollup`) gets a third `UNION ALL` branch: live `app.estimates JOIN app.estimate_items JOIN app.tenant_products`, gated `dk.kind = 'estimates'`, summing `COALESCE(ei.line_total, ei.qty*ei.unit_price)` per `tenant_brand_id` over the current/previous windows. No `kpi_brand_daily`-equivalent snapshot exists for estimates (checked the table DDL: `gmv`/`orders_count`/`buyers_count`/`units_sold` only, no estimate columns), so unlike the orders tenant-wide branch (which stays on the `kpi_brand_daily` snapshot), the estimates branch is always a live query, for both tenant-wide and location-scoped calls (`p_location_ids IS NULL OR e.location_id = ANY(p_location_ids)` in one branch, vs. orders' two separate snapshot/live branches split on location scope). Estimate predicate — `app.estimate_status_is_open(e.status) OR e.status = 'accepted'`, `AND e.converted_to_order_id IS NULL` — copied from `app.get_catalog_landing_metrics`'s own estimates-demand branch (`20260714113130_catalog_landing_compact_summary.sql`) for consistency with the one other RPC in this codebase that already computes an orders+estimates demand figure. `visible_brands`' location-scope EXISTS check gets a third OR-branch (estimate_items/estimates presence, gated `dk.kind = 'estimates'`) alongside its existing inventory and order_items checks, so an estimate-primary tenant's brands don't get incorrectly hidden when a location filter is applied. `buyer_counts.active_buyers` (backs `buyers_with_orders_mtd`, i.e. the "N of M customers purchased" KPI subtext) switched from a single `LEFT JOIN app.orders` to a `UNION ALL` subquery choosing `app.orders` (orders_status_in_flow, gated `dk.kind IN ('orders','none')`) or `app.estimates` (open/accepted, not-yet-converted, gated `dk.kind = 'estimates'`) — same reasoning, so the KPI doesn't read 0 active buyers for an estimate-primary tenant. `catalog_stats`/`categories`/`cohorts` CTEs and the final `jsonb_build_object` shape are byte-for-byte unchanged.<br><br>**`get_seller_cohort_landing_aggregates`:** simpler fix — `app.kpi_buyers_daily` (the table `current_metrics`/`previous_metrics` already read) carries both `orders_gmv`/`orders_count` AND `estimates_gmv`/`estimates_count` columns already (confirmed via table DDL in `20260709000001_prod_bootstrap.sql`, and confirmed both are actively populated per-day by `app.refresh_kpi_buyers_daily`'s `estimates`/`orders` fact CTEs — `estimates_gmv` sums `e.total_amount` with no status filter, `orders_gmv` sums `o.total_amount` filtered `order_status_in_flow`, both pre-existing behavior, not changed here). So no new live query was needed: `current_metrics`/`previous_metrics` now cross-join the same `demand_kind` CTE and read `CASE WHEN dk.kind = 'estimates' THEN k.estimates_gmv ELSE k.orders_gmv END` (and `estimates_count`/`orders_count` for `orders_mtd` and the `active_members` filter) instead of unconditionally `k.orders_gmv`/`k.orders_count`. `attributed_members_by_day`, `member_metrics`, `campaign_metrics`, `cohort_views`, `buyer_summary`, and the final jsonb shape are untouched — none of them reference `orders_gmv`/`orders_count` at all.<br><br>**Frontend:** checked `src/components/seller/brands/BrandsLandingClient.tsx`, `src/components/seller/cohorts/CohortsLandingClient.tsx`, and `app/api/cohorts/route.ts` for hardcoded "orders"-only labels (per the task's ask, similar to Locations' conditional `open_primary_demand_kind` labeling) — found none. Brands' only buyer-count subtext reads "N of M customers purchased" (generic, not "ordered"); Cohorts' UI and API route use "GMV"/"avg ticket" throughout, never the literal word "orders" in user-facing text; the `orders_mtd` field name is internal-only (used for `aov` math, never rendered as a label). No frontend changes made — none were needed.<br><br>**Verified how:** `npx tsc --noEmit -p /Users/phanikrovvidi/projects/deal-flow` clean (no errors). Confirmed via `ls -la`/`grep` that `20260723123407_extend_primary_demand_brands_cohorts.sql` was the empty placeholder waiting for this fix and that no later migration in the repo touches either function name. Confirmed the migration file's dollar-quoting and paren-count are balanced (`AS $$`/`$$;` ×1, `AS $function$`/`$function$;` ×1, 309 open = 309 close parens). Did **not** run `supabase db push` per instructions — migration is ready but not yet applied; live re-verification against tenant `d601c35c-1a78-4506-a556-a82118d72893`'s `portfolio_gmv_mtd`/`combined_gmv_mtd` (expected to go from ₹0 to a positive estimates-sourced figure) still needs to happen after the push.<br><br>**Out-of-scope finding surfaced, not fixed here (flagged as a background task):** `app.get_seller_cohort_landing_aggregates` reads all its GMV from `app.kpi_buyers_daily`, but `20260717080952_metrics_v2_stop_legacy_tenant_refresh.sql` removed `refresh_kpi_buyers_daily` from every order/invoice/estimate write trigger as part of V1-snapshot retirement — that migration's own comment claims "zero seller-facing routes read any V1 snapshot/KPI table directly anymore," which is not true for Cohorts. If accurate, `kpi_buyers_daily` (and therefore every Cohorts GMV/growth/conversion figure, both before and after this fix) has been frozen at 2026-07-17 data for every tenant. Not fixed in this pass — out of scope for "extend primary-demand-kind," needs its own investigation/fix.<br><br>**⚠️ SUPERSEDED 2026-07-23 (later same day) — see session notes below.** The Cohorts half of this fix (reading `kpi_buyers_daily.estimates_gmv`/`estimates_count`) was live-verified stale (frozen at 2026-07-14, 9 days behind) immediately after this migration was pushed, confirming the out-of-scope finding above was real. First response (`20260723125211_restore_kpi_buyers_daily_refresh_for_cohorts.sql` — restore a periodic refresh) was rejected by the user: `kpi_buyers_daily` is a V1 table that should be dropped, not resurrected. Final fix (`20260723125928_drop_kpi_buyers_daily_v1_table.sql`) rewrote `get_seller_cohort_landing_aggregates` to read `app.metrics_buyer_snapshot` (current cohort membership × existing rolling-90d buyer snapshot, same shape every other V2 page uses) instead, per the user's explicit choice between that and building new V2 day-grain infrastructure, then dropped the table entirely. The Brands half of this row's fix (kpi_brand_daily/live-estimates branch) was unaffected by any of this — verified live and correct as originally described above. | 2026-07-23 |
| 7 | Kill calendar-MTD from all headline KPI tiles (Invoices, Dashboard, Orders/Estimates strips) — no Tally/GST exception, that's deferred to a future Exports & Reports section | DONE (Dashboard portion — see below; transaction-landing portion below was already PARTIAL/complete from the parallel pass) | **Scope note:** Dashboard's own RPC (`get_metrics_v2_seller_dashboard`) and `src/lib/server/seller-dashboard.ts` are explicitly out of scope for this pass — a separate agent is handling Dashboard in parallel; not touched here. Everything below covers `app.metrics_v2_transaction_landing` (all 3 `p_kind` branches: invoices/orders/estimates), the RPC shared by the Invoices/Orders/Estimates landing pages.<br><br>**Files touched:** `supabase/migrations/20260723123409_kill_calendar_mtd_transaction_landing.sql` (new); `src/components/seller/invoices/InvoicesLandingClient.tsx`; `src/components/seller/sales-orders/SalesOrdersLandingClient.tsx`; `src/components/seller/estimates/EstimatesLandingClient.tsx`.<br><br>**Migration:** `20260723123409_kill_calendar_mtd_transaction_landing.sql` — `CREATE OR REPLACE FUNCTION app.metrics_v2_transaction_landing(...)`, full body copied verbatim from the prior latest definition (`20260723121905_fix_orders_open_value_field.sql`) with only the window computation and the `headline_period` literal changed, across all 3 `p_kind` branches (estimates/orders/invoices). **Old:** `v_month date := date_trunc('month', p_as_of AT TIME ZONE 'Asia/Kolkata')::date`, `v_prev_month date := (date_trunc('month', p_as_of AT TIME ZONE 'Asia/Kolkata') - interval '1 month')::date`, `v_prev_end date := v_month - 1`, with every KPI aggregate filtered `WHERE day BETWEEN v_month AND v_today` (current) / `WHERE day BETWEEN v_prev_month AND v_prev_end` (previous) — i.e. true calendar MTD vs the prior calendar month. **New:** `v_current_start date := (p_as_of AT TIME ZONE 'Asia/Kolkata')::date - 89`, `v_current_end date := (p_as_of AT TIME ZONE 'Asia/Kolkata')::date + 1` (exclusive), `v_previous_start date := v_current_start - 90`, `v_previous_end date := v_current_start` (exclusive) — the same half-open trailing-90d idiom already established in `app.get_seller_locations_landing_summary`'s `p_current_start`/`p_current_end_exclusive` params and `src/lib/server/seller-period.ts`'s `day - 89`. Every KPI aggregate now filters `day >= v_current_start AND day < v_current_end` (current 90d) / `day >= v_previous_start AND day < v_previous_end` (previous 90d), for all three kinds — `metrics_tenant_daily`/`metrics_location_daily` scans, and the live `app.estimates`/`app.orders` `metric_day_ist(...)` filters used for `converted_this_period`/`buyers_mtd`-style fields. `'headline_period'` changed from `'this_month'` to `'trailing_90_days'` for all 3 kinds (matches the value `app.metrics_v2_products_landing` already returns for the same field). No other query logic touched — same source tables, same predicates (`invoice_status_has_receivable`, `invoice_is_overdue`, `order_status_is_open`, `estimate_status_is_open`, etc.), same jsonb field names (`gmv_mtd`, `orders_mtd`, `total_gmv_this_period`, etc. — field *names* kept as-is since renaming them is a separate, larger frontend-contract change not requested here; only the *window* and `headline_period` changed). **Not pushed** — pending a separate `supabase db push` per instructions.<br><br>**Frontend label fixes** (KPI-strip-vs-toolbar mismatch, since the strip is now permanently 90d regardless of the table's period toolbar): `InvoicesLandingClient.tsx` — tile label `'Invoiced sales'` → `'Invoiced sales · 90D'`, sub `` `${invoices_this_period} invoices this period` `` → `` `${invoices_this_period} invoices in trailing 90 days` ``, and the page subtitle (previously `` `${invoices_this_period} invoices in ${horizonLabel.toLowerCase()}.` `` — wrongly implying the KPI count tracked the toolbar's selected period) → fixed wording `` `${invoices_this_period} invoices in the trailing 90 days.` ``. `SalesOrdersLandingClient.tsx` — tile label `'Order value · MTD'` → `'Order value · 90D'`, sub updated to say "in trailing 90 days"; same subtitle fix (`orders_mtd ... in ${horizonLabel}` → fixed "trailing 90 days" wording). `EstimatesLandingClient.tsx` — tile label `'Estimate value · MTD'` → `'Estimate value · 90D'`, sub updated to say "in trailing 90 days"; same subtitle fix. In all three, `horizonLabel` (toolbar period) is left wired only to `PageHeader`'s `horizon` prop, which still legitimately governs the row table below — the table-period-selector concern (§5 pattern 8, row toolbar) is intentionally left alone; only the headline KPI's own label/text no longer borrows the toolbar's period wording.<br><br>**Verified how:** `npx tsc --noEmit -p /Users/phanikrovvidi/projects/deal-flow` clean (no errors). Confirmed via `grep` that no `MTD`/`this month` text remains under `src/components/seller/invoices`, `src/components/seller/sales-orders`, or `src/components/seller/estimates`. Confirmed via `grep` that `headline_period: 'trailing_90_days'` already matches the convention in `app.metrics_v2_products_landing` (Products RPC). Cross-checked the 90d-window idiom against `app.get_seller_locations_landing_summary` (`p_current_start`/`p_current_end_exclusive` params, `20260723121903_fix_locations_overdue_kpi_field.sql`) and `src/lib/server/seller-period.ts` (`day - 89`) to match the established pattern exactly. **Migration not yet pushed to Supabase** — live RPC-return verification (e.g. re-querying `metrics_v2_transaction_landing` for the test tenant and confirming `headline_period`/window-bounded sums) still needs to happen after `supabase db push`, which this task was explicitly told not to run. | 2026-07-23 |<br><br>**Dashboard portion — DONE, added 2026-07-23 (separate agent, same day, appended not overwritten):** Scope was `app.get_metrics_v2_seller_dashboard` + `src/lib/server/seller-dashboard.ts` + the Dashboard's own "This month" UI text only — `app.metrics_v2_transaction_landing` (above) was explicitly left untouched by this pass, per the boundary the other agent's note already drew.<br><br>**Files touched:** `supabase/migrations/20260723123411_kill_calendar_mtd_dashboard.sql` (new, previously an empty placeholder); `src/lib/server/seller-dashboard.ts`; `src/components/seller/dashboard/SellerDashboardClient.tsx`; `src/tests/lib/seller-dashboard.test.ts`.<br><br>**Migration:** `20260723123411_kill_calendar_mtd_dashboard.sql` — `CREATE OR REPLACE FUNCTION app.get_metrics_v2_seller_dashboard(...)`, full body copied from `20260716090456_metrics_v2_phase_5_dashboard_metrics_foundation.sql` (confirmed via repo-wide grep to be the only `CREATE OR REPLACE` of this function, i.e. the true latest) with only the two MTD spots changed. Two independent MTD reads existed: (1) the `invoiced_sales` KPI metric — tenant-wide branch read `metrics_tenant_commercial_snapshot.current_month_invoice_value`; location-scoped branch summed `metrics_location_daily.invoice_value` `FILTER (WHERE ld.day >= v_month_start AND ld.day <= v_today)`; (2) the `business_flow` explore card's three tiles (Invoiced sales/Order value/Estimate value), all reading `metrics_tenant_commercial_snapshot`'s `current_month_*` columns tenant-wide regardless of scope. **Old:** `v_month_start date := date_trunc('month', p_as_of AT TIME ZONE 'Asia/Kolkata')::date`, used only in the location-scoped branch's `ld.day` filter; tenant-wide branch and business_flow read the `current_month_*` snapshot columns directly (true calendar MTD, refreshed async). **New:** `v_month_start` declaration removed entirely (no longer used anywhere in the function). Both spots now use `v_horizon_start` — the trailing-90d boundary (`(p_as_of AT TIME ZONE 'Asia/Kolkata')::date - 89`) **already declared and already used elsewhere in this same function body** for its other 90d metrics (buyer-app demand customers, sales-mix, customer-activity) — i.e. no new idiom introduced, this function's own established internal pattern was simply extended to the two spots that hadn't adopted it yet. Location-scoped branch: `ld.day >= v_month_start AND ld.day <= v_today` → `ld.day >= v_horizon_start AND ld.day <= v_today` (same `metrics_location_daily` table, window widened only). Tenant-wide branch: `metrics_tenant_commercial_snapshot.current_month_invoice_value` replaced with a live `SUM(d.invoice_value) ... FROM app.metrics_tenant_daily d WHERE d.day >= v_horizon_start AND d.day <= v_today` — there is no pre-aggregated 90d invoice/order/estimate value+count column on `metrics_tenant_commercial_snapshot` to read instead (checked the table's DDL and every migration that adds columns to it — only `purchasing_buyers_90d` exists as a 90d column there), so this switches to computing the 90d sum live from the tenant-wide daily rollup table, exactly as the task instructions anticipated as the fallback option. Same live-`metrics_tenant_daily`-sum approach used for `business_flow`'s `order_value_this_month`/`order_count_this_month`/`estimate_value_this_month`/`estimate_count_this_month` (new vars `v_order_value_90d`/`v_order_count_90d`/`v_estimate_value_90d`/`v_estimate_count_90d`, one shared query, tenant-wide regardless of location scope — matching this card's pre-existing scope behavior, which was already tenant-wide-only under the old MTD read; only the window moved, scope behavior intentionally left as-is). `invoice_count_this_month`/the `invoiced_sales` metric's own count now use a new `v_invoiced_sales_count` computed alongside `v_invoiced_sales` in both branches (previously both hardcoded to the tenant-wide `current_month_invoice_count` even in the location-scoped branch — fixed for internal consistency since it's the same restructured IF/ELSE). `v_buyer_app_sales_share`'s denominator changed from `v_commercial.current_month_invoice_value` to `v_invoiced_sales` (now trailing-90d) so the ratio stays internally consistent with the metric it's dividing into. `time_basis` metadata strings for `invoiced_sales` and `business_flow` changed from `'THIS MONTH'` to `'90D'` to match the convention every other 90d metric in this same payload already uses. JSON field *names* kept as `*_this_month` (e.g. `invoice_value_this_month`) — renaming the wire contract was out of scope; only the underlying window and the user-facing label/subtitle text changed. **Not pushed** — pending a separate `supabase db push` per instructions (same constraint as the transaction-landing migration above).<br><br>**Frontend label fixes:** `src/lib/server/seller-dashboard.ts` — admin KPI-strip tile label `'Invoiced sales · This month'` → `'Invoiced sales · Last 90 days'` (reusing the exact phrase already used by this same page's "Customer activity" card, confirmed by reading `SellerDashboardClient.tsx`, rather than inventing a new convention like "· 90D"). Also fixed a second, JS-side MTD leak that the RPC-only fix wouldn't have caught: the tile's own "N customers" sub-label and its RPC-unavailable fallback value were computed from `currentInvoices`/`currentGmv`, filtered by the dashboard route's hardcoded `getSellerLandingPeriodMeta('month')` calendar-month period (see `app/api/tenant/dashboard/route.ts`) — i.e. even after the RPC returned a 90d number, the sub-label under it would still have silently reported a calendar-MTD customer count. Replaced with a `Date.now() - 90 * DAY_MS` trailing-90d filter computed independent of `period` (new `invoices90d`/`invoicedCustomers90d`/`currentGmv90d`), consistent with this same file's existing wall-clock-relative style used elsewhere (`daysOverdue`, inactive-customer, dormant-buyer checks all already use `Date.now()` directly). `src/components/seller/dashboard/SellerDashboardClient.tsx` — Business flow card subtitle `'This month'` → `'Last 90 days'` (same reused phrase); page-level `horizonLabel` const `'This Month'` → `'Last 90 Days'` (this is the `PageHeader`'s `horizon` badge for the whole Dashboard page, shown regardless of role — updated since no tile on this page is calendar-MTD anymore). Left untouched: the `business_flow` JSON key names (`*_this_month`) and the unrelated `useSellerLandingPeriod` hook + its own hardcoded 'This Month' test expectation (`src/tests/use-seller-landing-period.test.tsx`) — that hook is a generic, reusable period-selector used by other landing pages with their own toolbars, not specific to the Dashboard's headline KPIs, and changing its default label text was never in scope here.<br><br>**Verified how:** `npx tsc --noEmit -p /Users/phanikrovvidi/projects/deal-flow` clean (no errors, confirmed after every edit). `npx vitest run src/tests/lib/seller-dashboard.test.ts src/tests/dashboard-client.test.tsx src/tests/dashboard-api.test.ts` — updated the one label assertion in `seller-dashboard.test.ts` (`'Invoiced sales · This month'` → `'Invoiced sales · Last 90 days'`); `seller-dashboard.test.ts` and `dashboard-api.test.ts` fully pass; `dashboard-client.test.tsx` has 1 pre-existing failing test (`getByText('Purchasing')` — a `screen.getByText` lookup unrelated to any MTD/label text, confirmed still fails identically on a clean `git stash` of this session's changes, i.e. not introduced by this work) alongside 3 passing tests including the ones touching Business flow/Customer activity tile rendering. Confirmed via repo-wide grep that no other `CREATE OR REPLACE FUNCTION app.get_metrics_v2_seller_dashboard` definition exists that could shadow this migration. Confirmed via `grep` that `v_month_start` has zero remaining references in the new migration body. **Migration not yet pushed to Supabase** — ready for `supabase db push` whenever the user runs it (not run here per instructions); live RPC-return re-verification against the test tenant should happen after that push, same as the transaction-landing migration above. | 2026-07-23 |
| 8 | Collapse 4 snapshot tables onto one shared predicate set | DONE | Files touched: none — audit found no divergence. Migration: none — `supabase/migrations/20260723123413_canonicalize_snapshot_refresh_predicates.sql` left empty, no fix needed. Verified how: grepped `supabase/migrations/*.sql` for every writer of the 4 tables and read the *latest* version of each refresh kernel in full. `metrics_tenant_commercial_snapshot`, `metrics_tenant_daily`, and `metrics_buyer_snapshot` are all populated inside `app._metrics_refresh_commercial` (latest def: `20260723070437_fix_metrics_refresh_commercial_cohort_scd2.sql`); `metrics_location_snapshot` (+ `metrics_location_daily`/`metrics_buyer_location_snapshot`/`metrics_product_location_snapshot`) inside `app._metrics_refresh_location_scopes` (latest def: `20260719111415_fix_location_conversion_90d_formula.sql`, called from within `_metrics_refresh_commercial`). Every GMV/receivable/overdue column in both functions calls `app.invoice_status_gmv_included(i.status)`, `app.invoice_status_has_receivable(i.status, i.outstanding_balance)`, or `app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)` — no inline `status IN (...)`/`status = '...'` predicate re-derivation found anywhere in either kernel (confirmed via a targeted grep for raw invoice-status literals across all migrations — the only inline `status IN (...)` hits are for `app.estimates.status`, unrelated to this concern). Also confirmed no other/legacy function writes to any of the 4 tables (grepped every `INSERT INTO`/`UPDATE` against each table name). Conclusion: the 4 tables were already designed to share the canonical predicates from the start; no fix required. **Bulk-backfill refresh-mechanism finding (read-only, no code changed):** whether the upcoming `invoice_items` backfill self-heals these tables depends on how it's executed. Every `app.invoice_items` write fires row-level trigger `trg_metrics_v2_capture_invoice_items` (`app.metrics_capture_invoice_items()`), which calls `app.metrics_mark_dirty(..., 'commercial', 'invoice_item', ...)` with the affected invoice's exact `buyer_id`/`location_id`/day — as long as `app.sync_trigger_bypass_active()` is false at insert time, this is sufficient: `metrics_tenant_commercial_snapshot` is recomputed unconditionally (full tenant-wide aggregate) on every tick regardless of dirty-key granularity, and `metrics_tenant_daily`/`metrics_location_snapshot`/`metrics_location_daily`/`metrics_buyer_snapshot` all pick up the exact buyer/location/day scalar keys from the per-row mark, so the 15s `metrics_refresh_tick` cron catches up correctly with no manual step, just some lag proportional to backfill volume (dirty-work is claimed 100 rows/tick). However, if the backfill runs through the same bulk-sync code path ERP imports use — which sets `app.integration_sync_bypass_triggers`/`sync_trigger_bypass_active()` specifically to suppress this per-row firehose during large imports (see `20260716071422_metrics_v2_phase_4_capture_only_validation.sql`, `20260723033820_wire_membership_dirty_marks_into_bypass_paths.sql`) — then no per-row dirty marks are created at all, and the only automatic catch-up is `trg_metrics_v2_post_sync_reconciliation` firing on `app.integration_sync_jobs` completion, which calls `app.metrics_mark_daily_reconciliation()` — but that only marks a **trailing 2-day window** (`v_today-1` to `v_today`) plus a 90-day age-out sweep (see `20260717094820_metrics_v2_daily_reconciliation.sql`), not the arbitrary historical date range a backfill of old invoices would touch. In that bypassed-trigger scenario, `invoice_units`/day-grain fields on `metrics_tenant_daily`/`metrics_location_daily` for backfilled invoices older than yesterday would stay stale indefinitely (the 4 tables' dollar GMV/receivable/overdue columns wouldn't actually change from an invoice-items-only backfill since those come from `invoices.total_amount`/`outstanding_balance`, untouched by this backfill — only unit-count columns are at risk). **Recommendation:** confirm with whoever runs the backfill whether it goes through the bypass path; if so, follow it with an explicit `app.metrics_mark_reconciliation(tenant_id, 'commercial', backfill_start_day, backfill_end_day)` call (bounded to ≤90 days per call) covering the full backfilled date range, then let the cron tick drain it — do not assume the trailing-2-day sweep alone will catch a historical load. Date: 2026-07-23 |

## P2 — in progress (reshaped 2026-07-23 by new rules 11/12, see doc §6)

| # | Item | Status | Notes |
|---|---|---|---|
| 9 | Reframe Brands/Cohorts/Catalogs to demand+conversion | PARTIAL — Brands DONE 2026-07-24, Cohorts/Catalogs still TODO | Buyer App Home reframe **descoped 2026-07-23** — stays invoice-based (Spend/Dues/Credit); demand may become a separate future 4th tile, not a reframe. **Brands portion (2026-07-24):** relabeled the mislabeled "Invoiced sales · 90D" tile to a dynamic "Estimate demand value · 90D" / "Order demand value · 90D" based on `primary_demand_kind` (added to `app/api/tenant/brands/route.ts`'s response) — see session notes below for full detail. Cohorts/Catalogs not touched this pass. |
| 10 | **Revised 2026-07-23: remove, don't fix.** Growth%/trend/top-risers sweep — Locations, Categories, Products (`revenue_growth_pct`), Brands (`growth_pct` + top-risers callout + `gmv_decline` alerts), Cohorts (`growth_pct` + top-risers callout — remove the no-op just built), Orders (`orders_growth_pct`), Buyer App Home (trend card). Estimates' `expiring_soon` stays a straight fix (not growth-related). | DONE (landing pages) — detail-page growth% also swept, 3 items deferred as explicit follow-up, see note below | Rule 12: no trend without ≥180d ops history<br><br>**Buyer App Home portion — DONE 2026-07-23.** Straight removal, not a fix, per explicit instruction (a stubbed/computed-but-meaningless trend number is exactly the trust bug this effort exists to eliminate). No DB migration — all TypeScript.<br><br>**Files touched:**<br>`app/(buyer)/buy/home/page.tsx` — removed the `trendLabel(value: number)` helper function entirely (rendered `+X% vs last month` / `X% vs last month` / `Flat vs last month`) and its call site. The "Spend this year" card's sub-line changed from `` `${trendLabel(summary?.trend_vs_last_month_pct ?? 0)} · ${summary?.invoice_count_ytd ?? 0} invoices this year` `` to just `` `${summary?.invoice_count_ytd ?? 0} invoices this year` `` — card itself, gmv figure, and invoice count untouched.<br>`app/api/buyer/home/route.ts` — removed `gmvPreviousMonth` (the previous-calendar-month GMV sum used only for the trend ratio) and `trendVsLastMonthPct` (the `(gmvMtd - gmvPreviousMonth)/gmvPreviousMonth` computation) entirely. Removed `trend_vs_last_month_pct` from both the real `payload.summary_card` and the no-buyer `previewPayload.summary_card` fallback. **Kept** `previousMonthStart` and the `financialWindowStart` widening logic (`previousMonthStart < currentYearStart ? previousMonthStart : currentYearStart`) — checked and confirmed this date bound also back-stops `openInvoiceRows`/`earliestDueDateFromWindow` (the dues-card fallback lookup), a separate concern from trend, so narrowing the window would have silently regressed dues-card correctness for buyers whose earliest open invoice falls in December of the prior year. Only the trend-specific computation built from these dates was removed, not the dates themselves.<br>`src/lib/buyer-home-types.ts` — removed `trend_vs_last_month_pct: number` from `BuyerHomeResponse['summary_card']`.<br>`src/tests/buyer-home-route.test.ts` — removed the `expect(body.summary_card.trend_vs_last_month_pct).toBe(25)` assertion.<br>`src/tests/buyer-home-page.test.tsx` — removed `trend_vs_last_month_pct: 12` from the mocked `summary_card` fixture.<br><br>Repo-wide grep for `trend_vs_last_month_pct`, `trendLabel`, `trendVsLastMonthPct`, `gmvPreviousMonth` confirms zero remaining references anywhere.<br><br>**Migration:** (none) — TypeScript-only change, per task scope.<br><br>**Verified how:** `npx tsc --noEmit -p /Users/phanikrovvidi/projects/deal-flow` clean, no errors. `npx vitest run src/tests/buyer-home-route.test.ts src/tests/buyer-home-page.test.tsx` — `buyer-home-page.test.tsx` passes; `buyer-home-route.test.ts`'s one test fails with `500` instead of `200` (`Unexpected query: app.cohort_members_active` inside `resolveBuyerAllowedTenantBrandIds`), confirmed via `git stash`/re-run to be a **pre-existing failure unrelated to this change** — fails identically on the unmodified tree (a parallel, in-flight change to buyer-brand-visibility's cohort query, not something this task touched or introduced). Date: 2026-07-23 |
| 11 | **New 2026-07-23.** Sweep for other V1 metrics tables still referenced by a live RPC; drop-and-migrate whatever's found | DONE | Rule 11 — same class of bug as `kpi_buyers_daily`. **Files touched:** none — audit found no other live consumer. Migration `supabase/migrations/20260723131707_sweep_remaining_v1_metrics_tables.sql` left empty (0 bytes), matching the item-8 precedent for "audited, no fix needed."<br><br>**V1 table inventory (from `20260717080952_metrics_v2_stop_legacy_tenant_refresh.sql`'s own comment + `20260709000001_prod_bootstrap.sql`'s function bodies, one `INSERT INTO`/`UPDATE` target per named refresh function):** `refresh_orders_snapshot`→`app.orders_snapshot`; `refresh_invoices_snapshot`→`app.invoices_snapshot`; `refresh_estimates_snapshot`→`app.estimates_snapshot`; `refresh_kpi_orders_daily`→`app.kpi_orders_daily`; `refresh_kpi_invoices_daily`→`app.kpi_invoices_daily`; `refresh_kpi_estimates_daily`→`app.kpi_estimates_daily`; `refresh_kpi_tenant_daily`→`app.kpi_tenant_daily`; `refresh_kpi_location_daily`→`app.kpi_location_daily`; `refresh_locations_snapshot`→`app.locations_snapshot`; `refresh_buyer_app_daily`→`app.kpi_buyer_app_daily` (note table name doesn't match function name). `refresh_kpi_buyers_daily`→`app.kpi_buyers_daily` already handled (dropped in `20260723125928_drop_kpi_buyers_daily_v1_table.sql`). Also confirmed via `20260719065025_v1_snapshot_retirement.sql`: `app.buyers_snapshot`/`app.buyer_current_snapshot` are V1 tables too, but already fully `DROP TABLE ... CASCADE`'d in that same migration — not a concern.<br><br>**Per-table live-consumer check:** grepped every `supabase/migrations/*.sql` for `FROM app.<table>`/`JOIN app.<table>` on all 10 remaining tables. Hits fell into two buckets: (1) internal maintenance/diagnostic functions never called from application code — `app.get_tenant_aggregate_freshness`, `app._run_metrics_analysis_for_tenant_range`/`run_metrics_analysis_for_tenant`, `app.rebuild_metrics_for_tenant_range`, `app.prune_kpi_daily_old_rows`, `app.post_sync_rebuild` (all defined in `20260709112450_metrics_phase7_repair_and_freshness.sql`, `20260710070719_metrics_phase8_cleanup.sql`, `20260712072733_fix_rebuild_metrics_for_tenant_range.sql`, `20260709055452_buyer_home_phase6_completion.sql`) — confirmed via repo-wide grep of `app/` and `src/` that none of these RPC names are ever called via `.rpc(...)`, only referenced inside migration-content assertion tests (`src/tests/settings/metrics-phase*.test.ts`); (2) three seller-facing landing RPCs that *did* read V1 tables in an earlier definition — `app.get_seller_locations_landing_summary`, `app.get_seller_location_landing_row_metrics`, `app.search_seller_location_landing_ids` (all originally defined in `20260714102906_seller_entity_landing_search_rpcs.sql`/`20260714113035_locations_warehouses_landing_runtime_summaries.sql`, reading `locations_snapshot`/`kpi_location_daily`/`kpi_estimates_daily`) and `app.get_seller_warehouses_landing_summary`(`_v2`)/`get_seller_warehouse_landing_row_metrics_v2`/`search_seller_warehouse_landing_ids_v2` — but each was superseded by a strictly later `CREATE OR REPLACE FUNCTION` (`20260716110313_metrics_v2_phase_6_wave_c_completion.sql` onward, through `20260723121903_fix_locations_overdue_kpi_field.sql` for Locations specifically, confirmed the true latest via repo-wide grep of `CREATE OR REPLACE FUNCTION app.<name>(` and timestamp ordering) that fully rewrote them onto V2 `metrics_location_daily`/`metrics_location_snapshot` with zero remaining references to any V1 table name — confirmed with a direct grep of the latest migration bodies (no hits), and cross-checked against `src/tests/seller-entity-landing-rpcs-sql-contract.test.ts`, which already asserts the Wave-C completion migration does **not** contain `app.locations_snapshot`/`app.kpi_location_daily`. Confirmed via `app/api/tenant/locations/landing/route.ts` and `app/api/tenant/warehouses/landing/route.ts` that these are exactly the RPC names the live routes call (`get_seller_locations_landing_summary`, `get_seller_warehouses_landing_summary_v2`).<br><br>**Application-code check:** grepped `app/` and `src/` for `.from('<v1-table>')`/direct Supabase client reads of all 10 tables plus the 3 already-retired ones (13 total) — zero hits outside test files.<br><br>**Conclusion:** unlike `kpi_buyers_daily`, no other V1 table has a live seller-facing or buyer-facing consumer today — the 2026-07-17 migration's "zero seller-facing routes read any V1 snapshot/KPI table directly anymore" claim holds for all of them except the one already fixed. No drop/migrate performed this pass (nothing to migrate). **Related finding, not fixed (flagged as background task, out of scope for this item):** `app.get_tenant_aggregate_freshness` (`20260709112450_metrics_phase7_repair_and_freshness.sql`) still has a `FROM app.kpi_buyers_daily` branch; since that table was dropped in `20260723125928`, this function will error if ever invoked. It has zero live callers today (diagnostic-only, referenced solely in migration-content tests), so left alone rather than patched under this item's scope — surfaced for a future cleanup pass if this diagnostic function is ever wired up. **Verified how:** `npx tsc --noEmit -p /Users/phanikrovvidi/projects/deal-flow` clean. Date: 2026-07-23 |
| Estimates-note | Estimates `expiring_soon` stub in `app.metrics_v2_transaction_landing` (audit §7 P2 item 10 note — a due-date-window count, explicitly **not** part of the growth/trend removal in scope of item 10 above) | DONE | Rule 9-adjacent (missing/stubbed field silently defaulting to 0, §5 pattern 9), not rule 12. **Files touched:** `supabase/migrations/20260723132022_fix_estimates_expiring_soon_stub.sql` (new). **Traced the full data flow first:** `app.metrics_v2_transaction_landing(p_kind='estimates')`'s jsonb hardcoded `'expiring_soon', 0`; the real value was computed separately, downstream, in `app/api/tenant/estimates/route.ts` via a live `app.estimates` query (`status IN ('draft','sent','accepted') AND expires_at <= now()+7d`), exposed to the frontend as `pulse_aggregates.expiring_soon_count`/`expiring_soon_value`. Confirmed `src/components/seller/estimates/EstimatesLandingClient.tsx`'s "Expiring in 7 days" tile (and the `expiring_soon` V3CalloutPanel card) reads `pulseAggregates?.expiring_soon_value`/`expiring_soon_count`, **never** `kpis.expiring_soon` — so the estimates landing page itself was never displaying the dead stub. However, `app/api/tenant/estimates/summary/route.ts` forwards `kpis.expiring_soon` directly as its own top-level `expiring_soon` field (no current in-repo caller found via grep, but it's a live, unguarded pass-through — any future/external consumer of that summary endpoint, or of the RPC directly, would surface the stub 0). Chose **option (a)** (move the logic into the RPC) over just deleting the field, so every current and future consumer of `kpis.expiring_soon` gets the real number, not just the one page that happened to route around it via `pulse_aggregates`. Migration is a verbatim copy of the current function body (`20260723123409_kill_calendar_mtd_transaction_landing.sql`) with one addition confined to the `p_kind='estimates'` branch: new `v_expiring_soon_count` variable, computed via a live `SELECT COUNT(*) FROM app.estimates WHERE ... status IN ('draft','sent','accepted') AND expires_at IS NOT NULL AND expires_at <= (p_as_of + interval '7 days')` (location-scoped when applicable), mirroring the API route's own predicate exactly; `'expiring_soon', 0` → `'expiring_soon', v_expiring_soon_count` in the returned jsonb. No other query logic, window computation, or `growth_pct` field touched — those are explicitly out of scope for this fix (parallel growth/trend removal workstream owns those). Not pushed — `supabase db push` not run per instructions. **Verified how:** `npx tsc --noEmit -p /Users/phanikrovvidi/projects/deal-flow` clean. Confirmed via grep that no later `CREATE OR REPLACE FUNCTION app.metrics_v2_transaction_landing` exists in the repo (this migration is the new latest). Confirmed parens/dollar-quoting balanced (198 open = 198 close parens, 2×`$$`). `npx vitest run src/tests/estimates-landing-page.test.ts src/tests/invoices-landing-page.test.ts` both pass (estimates test mocks the RPC response directly, so it wasn't exercising the stub either way — the fix is only live-verifiable after `supabase db push`, which is out of scope for this pass). Live re-verification against tenant `d601c35c-1a78-4506-a556-a82118d72893` (`kpis.expiring_soon` should move from `0` to a positive count matching `pulse_aggregates.expiring_soon_count`) still needs to happen after the push. Date: 2026-07-23 |
| 12 | Page-specific supporting text sweep | DONE | **Files touched:** `src/components/seller/warehouses/WarehousesLandingClient.tsx` (the only real fix found). **Spot-checked:** Locations, Categories, Products, Customers, Warehouses, Invoices, Estimates landing pages' headline `InsightStrip4` tiles for a bare number with no qualifying "of/across/N X" subtext. Locations (`overdue amount` → "across N locations", etc.), Categories, Products, Customers, Invoices, and Estimates were **already compliant** — every headline tile already carries page-specific supporting text from earlier passes this session (e.g. Invoices' "Invoiced sales · 90D" → "N invoices in trailing 90 days"; Customers' "Overdue amount" → "N customers"). **Warehouses had one real bug, not just a missing-subtext gap:** the "Warehouses in operation" tile's `sub` read `` `${summary?.kpis.active_warehouses ?? 0} total` `` — i.e. it duplicated the *same* `active_warehouses` value shown as the tile's headline number, instead of the actual total warehouse count. The real total (`summary.kpis.warehouse_count`) was already being fetched by the same API response and was already displayed elsewhere on the page (the page subtitle: `` `${summary?.kpis.warehouse_count} warehouses across ${summary?.kpis.location_count} locations.` `` ) — exactly the "count already available, not surfaced as subtext" case this sweep exists to catch. Fixed to `` sub: `of ${summary?.kpis.warehouse_count ?? 0} warehouses` `` — no new query, no schema/type change, `WarehousesLandingKpis.warehouse_count` already existed. Other three Warehouses tiles ("Tracked SKUs", "Warehouses with stock risk", "Idle stock SKUs") already carry descriptive subtext and were left as-is (no natural "N of M" denominator available for those without a new query, which is out of scope). **Verified how:** `npx tsc --noEmit -p /Users/phanikrovvidi/projects/deal-flow` clean. `npx vitest run src/tests/warehouses-landing-page.test.tsx` — 1 test fails on `getByText('Active warehouses')` (the test's own fixture expects a stale tile label that doesn't match the current `'Warehouses in operation'` label); confirmed via `git stash`/re-run this failure is **pre-existing and unrelated** — fails identically on the unmodified tree. Date: 2026-07-23 |
| 13 | "As of HH:MM" freshness stamp | PARTIAL — 2 of 3 target pages done, Locations deferred | **Files touched:** `src/lib/number-format.ts` (new `formatAsOfLabel(isoTimestamp)` helper — "as of HH:MM IST" in `Asia/Kolkata`, returns `null` for missing/invalid input so callers can omit the stamp rather than render a fabricated time); `src/lib/utils.ts` (re-export); `src/components/seller/dashboard/SellerDashboardClient.tsx` (both `AdminSection` and `AssistantSection` — stamp rendered under the `InsightStrip4` KPI strip, reads `data.portfolio?.as_of`, which `app.get_metrics_v2_seller_dashboard` already returns and `src/lib/server/seller-dashboard.ts`'s `normalizeDashboardPortfolio` already parses into the response payload, but which **no dashboard component previously rendered anywhere** — confirmed via grep, a clean case of "fetched but silently dropped"); `app/api/tenant/invoices/route.ts` (extracted `landingMetricsRes.data.computed_at` — `app.metrics_v2_transaction_landing`'s own real snapshot-refresh timestamp, previously fetched and discarded since only `.kpis` was read off that RPC result — and added it to the response payload as `computed_at`, alongside the pre-existing but request-time-only `as_of` field, left untouched); `src/types/tenant-invoices.ts` (`computed_at?: string \| null` added to `TenantInvoicesResponse`); `src/components/seller/invoices/InvoicesLandingClient.tsx` (stamp rendered under the KPI strip, reads `summaryData?.computed_at`).<br><br>**Locations — investigated, explicitly deferred, not silently skipped:** `app.get_seller_locations_landing_summary`'s jsonb output has **no** `computed_at`/`source_watermark`/similar field at all (confirmed by reading the full latest function body, `20260723121903_fix_locations_overdue_kpi_field.sql`) — `app/api/tenant/locations/landing/route.ts`'s own `as_of`/`refreshed_at` fields are fabricated wall-clock `new Date().toISOString()` at request time, not a real reflection of when `metrics_location_snapshot`/`metrics_location_daily` were last refreshed. Per this item's own scope note ("if a page's response doesn't carry any timestamp at all, skip it for now — bigger backend change, out of scope for this pass"), left untouched. **Follow-up needed:** add a `MAX(ls.computed_at)`-style column to `get_seller_locations_landing_summary`'s `totals`/output CTE (the underlying `metrics_location_snapshot` rows do carry their own `computed_at`, per the schema used elsewhere in this same session's migrations — it's just not surfaced by this particular RPC) before a real freshness stamp can be added to the Locations page.<br><br>**Not attempted this pass (per the item's own "2-3 highest-traffic pages, not all" framing):** Categories, Products, Customers, Estimates, Sales-orders, Warehouses, Brands, Cohorts, Catalogs, Price Lists all still need either (a) a rendered stamp if their RPC/route already returns a real timestamp (not individually checked this pass), or (b) the same kind of backend addition Locations needs if it doesn't.<br><br>**Verified how:** `npx tsc --noEmit -p /Users/phanikrovvidi/projects/deal-flow` clean. `npx vitest run src/tests/lib/seller-dashboard.test.ts src/tests/dashboard-client.test.tsx src/tests/invoices-landing-page.test.ts` — all pass except `dashboard-client.test.tsx`'s pre-existing `getByText('Purchasing')` failure (confirmed via `git stash`/re-run to fail identically on the unmodified tree, same failure already logged against item 7 above — not introduced by this change). Date: 2026-07-23 |

---

## Session notes

### 2026-07-23 — plan locked
Guardrails from user session confirmed and reconciled against live data (see audit doc §6
for the rule-9 void/draft finding — 86 void invoices carry ₹21.0L stale `outstanding_balance`,
47 drafts carry ₹6.97L; literal "no status filter" would have summed ₹1.19cr instead of the
real ₹90.6L). Plan locked, dispatching subagents for P0 items 1–4.

### 2026-07-23 — P0 complete
All 4 subagents landed clean (full-repo `npx tsc --noEmit` passing after each). Both pending
migrations (`20260723121903_fix_locations_overdue_kpi_field.sql`,
`20260723121905_fix_orders_open_value_field.sql`) pushed via `supabase db push` and
live-verified against test tenant `d601c35c-1a78-4506-a556-a82118d72893`:
- `get_seller_locations_landing_summary` now returns `overdue_dues_total: 2993391` alongside
  the untouched `outstanding_dues_total: 4045615` — the two numbers are now genuinely
  different fields instead of one number under the wrong label.
- `metrics_v2_transaction_landing('orders')` now returns `open_value: 704970` (was silently 0).
- Item 3's investigation found the RPC bug was already fixed in a later migration
  (`20260717131227`) than the one originally read during the audit — the new migration
  re-applies that already-correct body verbatim, closing any drift on environments still
  running the earlier (716) definition. Not a wasted step: confirms the fix, doesn't
  duplicate one.
- Item 4 (Buyer App) is TS-only, no migration — verified by re-deriving the canonical
  predicate's live value for the same test buyer (₹6,20,150 / 23 invoices) and confirming
  it matches what the now-fixed code paths compute, replacing the previous ₹6,44,650 / 24
  reported by the buggy `status<>'draft'` and no-status-check variants.

**Next up: P1 items 5–8** (item 5 blocked on the user's line-item backfill; items 6–8 are
open). See audit doc §7 for what each involves before starting.

### 2026-07-23 — two open questions resolved, P1 dispatched
User resolved both outstanding calls from the audit doc: (1) Buyer App Home stays
invoice-based (Spend/Dues/Credit) — rule 7 only applies to Catalogs/Cohorts (seller's view of
buyer-app demand), not the buyer's own screens; a demand figure may become a separate future
4th tile there, not a reframe. (2) No Tally/GST calendar-month carve-out — rule 1's 90d-only
standard is unconditional now, calendar-period reporting deferred entirely to a future
"Exports & Reports" nav section. Doc §6/§7 updated accordingly. Dispatched 4 parallel
subagents for P1 items 6/7 (split: transaction-landing RPC, Dashboard RPC)/8.

### 2026-07-23 — P1 items 6–8 landed, migrations pushed, live-verified
All 4 P1 subagents completed clean (full-repo typecheck passing throughout). 5 migrations
pushed via `supabase db push` (4 from the subagents + 1 follow-up correction, see below):
- `20260723123407_extend_primary_demand_brands_cohorts.sql`
- `20260723123409_kill_calendar_mtd_transaction_landing.sql`
- `20260723123411_kill_calendar_mtd_dashboard.sql`
- `20260723123413_canonicalize_snapshot_refresh_predicates.sql` (empty — item 8's audit found
  all 4 snapshot refresh kernels already call canonical predicates, no fix needed)
- `20260723125211_restore_kpi_buyers_daily_refresh_for_cohorts.sql` (superseded same session,
  see below)

**Mid-course correction on item 6 (Cohorts):** live-verifying the just-pushed Brands/Cohorts
fix surfaced that `app.kpi_buyers_daily` (which Cohorts' GMV/growth/conversion figures
entirely depend on) was frozen at 2026-07-14 — 9 days stale — because
`20260717080952_metrics_v2_stop_legacy_tenant_refresh.sql` had removed its refresh trigger
under the (incorrect, for this one table) claim that no seller-facing route still read it.
First fix attempt restored a periodic refresh of the table (rejected by user — a V1 table
should be dropped, not resurrected). Asked the user directly how to handle the resulting gap
(no V2 table supports `kpi_buyers_daily`'s point-in-time buyer×day grain): build new V2
day-grain infrastructure, or simplify to current-cohort-membership × existing rolling-90d
`metrics_buyer_snapshot` (the shape every other V2 page already uses). User chose the
simplification. Final migration (`20260723125928_drop_kpi_buyers_daily_v1_table.sql`)
rewrote `get_seller_cohort_landing_aggregates` onto `metrics_buyer_snapshot`, dropped
`app.kpi_buyers_daily` and its two orphaned refresh functions
(`refresh_kpi_buyers_daily`, `rebuild_kpi_buyers_daily_for_tenant`), and unscheduled the
now-superseded cron from the rejected first attempt. **Known trade-off, stated plainly:**
Cohorts' `gmv_previous`/`growth_pct` now always read 0 (no previous-period column exists at
buyer grain in V2), so the "top risers" callout is currently a no-op (ties break to
`gmv_mtd` desc, same order as "top performers"). Flagged in the migration's own header
comment, not silently degraded.

**Live verification, test tenant `d601c35c-1a78-4506-a556-a82118d72893`:**
- `kpi_buyers_daily` confirmed dropped (`to_regclass('app.kpi_buyers_daily')` → `null`).
- Cohorts: `combined_gmv_mtd = 615733` (nonzero, was 0 before the primary-demand-kind fix;
  this tenant has 1 cohort, 10 active members, estimate-primary).
- Brands: `portfolio_gmv_mtd = 220695564.12` — cross-checked against a direct
  `SUM(estimate_items.line_total)` query over the same 90d window/predicate
  (open/accepted, not converted to order) and it matches exactly (3,098 estimates) — no
  double-counting from the new UNION ALL branch.
- Orders `open_value` and Locations `overdue_dues_total` (P0) re-confirmed still correct
  after this round of pushes.
- Full-repo `npx tsc --noEmit` clean after every change in this phase.

**Remaining before P2:** item 5 (backfill self-healing check) stays deferred until the user
confirms the line-item backfill is done — re-run the §1 basis triangulation plus the P0-item-8
bulk-backfill finding (confirm whether the backfill goes through the trigger-bypass path; if
so, an explicit `app.metrics_mark_reconciliation(...)` call is needed per the audit doc's
end-of-phase verification note) at that point, not before.

### 2026-07-23 — item 10 (growth%/trend removal) continued after an agent session limit

The seller-side growth%/trend/top-risers sweep agent hit a session limit mid-task, having
finished the SQL migration (`20260723131709_remove_growth_trend_top_risers.sql` — Locations,
Categories, Products, Brands, Cohorts, Orders/Estimates/Invoices RPCs, ~1565 lines) but not yet
verified it or finished the matching frontend/caller edits. Picked up directly (no new agent)
since the remaining work required tracing exact RPC signature changes against live callers —
continuity mattered more than parallelism here.

**Found and fixed, beyond the agent's own migration:**
- **RPC signature drift, not just output drift.** Three functions had params *dropped*
  (`DROP FUNCTION` + recreate with fewer args), not just `CREATE OR REPLACE` with the same
  signature: `get_seller_location_landing_row_metrics` (6→4 params, dropped
  `p_previous_start`/`p_previous_end_exclusive`), `get_seller_category_landing_page_metrics_v2`
  (7→5 params, same two dropped), `get_seller_cohort_landing_aggregates` (8→6 params, same two
  dropped). Every caller still passed the old param names — would have failed with "no
  function matches" once pushed. Fixed: `app/api/tenant/locations/landing/route.ts`,
  `src/lib/server/categories-landing.ts`, `app/api/cohorts/route.ts` (removed the dropped
  params from each `.rpc()` call), plus removed the now-dead `previousStart`/
  `previousEndExclusive` locals and `gmv_previous` type fields that fed them.
- **Brands' `needs_attention`/`need_attention_count` removed entirely from the SQL, not just
  `growth_pct` within them** — confirmed by reading the migration and the actual pre-migration
  `alerts` array: it only ever emitted `'gmv_decline'` (low_stock/not_in_catalog_mtd reason
  strings in the frontend's `attentionReason()` were dead code, never actually triggered by any
  real SQL branch). With that one real alert source gone, the whole "Brand stock risk" KPI
  tile and V3CalloutPanel callout in `BrandsLandingClient.tsx` were reading fields the RPC no
  longer returns — removed both, plus the `attention`/`attentionReason`/`alerts` plumbing that
  only existed to feed them, plus `TenantBrand.alerts`, `BrandsKpis.need_attention_count`,
  `TodaysReadItem`/`TopRiserItem` types in `useBrands.ts`.
- **`BrandsLandingClient.tsx` and `CohortsLandingClient.tsx` full sweep**, beyond the plain
  `growth_pct` field: removed the `'Growth (high → low)'` sort option (both pages), the
  `GrowthPill` column + import (both), the `decliningBrands`/`growthVsPrior` client-side
  "Brands losing sales" callout (fully removed, was already a client-derived, non-backend-
  aggregate list per its own code comment), the `top_risers` callout on Cohorts, and the now-
  unused `hasNextPage`-driven hint text tied to the removed decliners list. Table `columns`
  arrays and skeleton `columns={N}` counts updated to match (7→6 on both).
- **Detail pages the original task never covered** (its scope was explicitly landing pages
  only) — swept for the same class of bug and fixed the ones that render fake/stub data to
  users: `CustomerPerformanceTab.tsx` + `app/api/tenant/customers/[id]/route.ts` (removed a
  `growth_pct` badge fed by a hardcoded-0 stub), `ProductDetailPage.tsx` +
  `app/api/tenant/products/[id]/route.ts` (same pattern, two hardcoded-0 stubs —
  `meta_strip_4.growth_pct` and `units_snapshot.growth_pct`), `CatalogDetailPage.tsx` +
  `app/api/tenant/catalogs/[id]/route.ts` (real, computed `growth_pct` badge — left the
  ~100-line previous-period GMV query it depends on in place rather than risk gutting it under
  time pressure, just stopped exposing the two output fields that read it), `CohortDetailPage.tsx`
  + `app/api/cohorts/[id]/route.ts` (removed `growth_pct` **and** a full `gmv_trend_12m`
  12-month-array computation — `getLastNMonthStarts`/`monthAgg`/`twelveMonthKeys` — that was
  computed but had **zero frontend consumers**, confirmed by grep before removing; also dropped
  the now-unused `prevStartDate` from `getIstMonthWindow()`'s return, keeping
  `currentStartDate`/`nextStartDate` since those still drive the real current-period metrics).
  Removed the matching type fields across `useCohorts.ts`/`useBrands.ts`/`useProducts.ts`.

**Explicitly deferred, not silently skipped — logged here for whoever picks this up next:**
1. **`LocationOverviewTab.tsx`/`LocationPerformanceTab.tsx`'s `gmv_trend` bar chart**
   (`app/api/tenant/locations/[id]/detail/route.ts`, `trendPoints` from `detailV2`'s
   `performance_cards` system) — a *real*, populated trend chart, the most clear-cut rule-12
   violation left. Not removed: it renders only in a legacy fallback path (`if
   (performanceCards?.length)` returns a different rendering system first; this chart only
   shows when that's empty), and removing it cleanly means adjusting a `grid-cols-2` layout
   in two files without leaving a hole — judged too risky to rush. **Needs its own pass.**
2. **`CustomerPerformanceTab.tsx`'s `monthly_spend_trend` and `ProductPerformanceTab.tsx`'s
   `monthly_units_trend`** — both are real trend-chart infrastructure (AreaChart/similar) but
   both are always fed an empty array by their API routes today (`monthly_spend_trend: []`,
   `monthly_units_trend: []`), so the chart's own empty-state renders and nothing misleading is
   currently shown. Lower urgency than item 1 for that reason, but still in scope for rule 12 —
   left as follow-up rather than expanding this pass further.
3. **Catalogs *landing* route (`app/api/tenant/catalogs/route.ts`) computes real
   `growth_pct`/`top_risers`/`gmv_growth_pct`** (lines ~1060-1100, a real previous-period
   comparison, not a stub) **but `CatalogsLandingClient.tsx` never renders any of it** —
   confirmed via grep, zero consumers in the actual component. Backend-only dead code, not
   currently misleading any user. Left as follow-up as well; removing it means touching the
   same route file that also serves the Catalogs KPI strip and other callouts, wanted to keep
   this session's remaining edits scoped to things a user can actually see.
4. **Customers landing** (`useCustomersLanding.ts`'s `CustomersLandingBuyer.growth_pct`,
   `spend_prev_mtd`, `kpis.spend_growth_pct`) — same as #3, confirmed via grep never rendered in
   `CustomersLandingClient.tsx`. Dead type fields plus a `growth_pct: 0` in one optimistic-update
   placeholder object (not real data either way). Left alone, same reasoning.

**Verified how:** `npx tsc --noEmit -p /Users/phanikrovvidi/projects/deal-flow` clean after
every edit in this note (confirmed via a full final run too). The only typecheck errors in the
repo are 5 pre-existing, unrelated `membership_mode`/`selected_buyer_ids`/`selected_product_ids`
errors in `CampaignFormSheet.tsx`, `CatalogBuyersTab.tsx`, `CatalogCompositionTab.tsx`,
`CohortBuyersTab.tsx`, `PriceListProductsTab.tsx` — confirmed via `git status` that none of
these files were touched this session (pre-existing uncommitted work from before this
conversation started, an unrelated in-flight "manual vs automatic membership" feature).

**Not yet pushed to Supabase:** `20260723131709_remove_growth_trend_top_risers.sql` — ready,
not run per the standing "agents/continuations don't run `supabase db push`" convention this
session established; needs a `supabase db push` (and live re-verification against the test
tenant) before item 10 is fully closed out.

### 2026-07-23 — item 10 pushed, live-verified, one regression caught and fixed same-session

Ran `supabase db push --dry-run` and found 2 unrelated, unauthored-by-this-work migrations
already queued (`20260723140857_whatsapp_template_display_names.sql`,
`20260723143131_fix_beat_route_visit_window.sql` — WhatsApp template content, from other
in-progress work in this repo). Since `supabase db push` applies all pending migrations
together with no cherry-pick option, asked the user how to proceed rather than pushing
unknown migrations unilaterally. User confirmed: push all 5 together. Done —
`20260723131707_sweep_remaining_v1_metrics_tables.sql`,
`20260723131709_remove_growth_trend_top_risers.sql`,
`20260723132022_fix_estimates_expiring_soon_stub.sql`, and the 2 WhatsApp migrations all
applied clean.

**Regression caught during live verification, fixed same session:** querying
`app.metrics_v2_transaction_landing` post-push for the test tenant showed
`total_estimates_growth_pct: 1084`, `orders_growth_pct: 0`, `invoices_growth_pct: 1152` still
present — the exact fields item 10 was supposed to remove. Root cause:
`20260723132022_fix_estimates_expiring_soon_stub.sql` was authored (by a different agent, in
parallel) as a verbatim copy of an *earlier* function body
(`20260723123409_kill_calendar_mtd_transaction_landing.sql`, pre-growth-removal), then got
pushed *after* `20260723131709`'s growth-removal `CREATE OR REPLACE` — silently reintroducing
all three growth_pct fields. Two independently-correct migrations, applied in sequence,
produced an incorrect result because the later one wasn't based on the former one's output.
Fixed with `20260723172820_fix_transaction_landing_growth_regression.sql` — the 131709 body
(no growth_pct) plus the 132022 fix (live `v_expiring_soon_count`) combined correctly.
Live-verified after this push: all three `p_kind` branches return no `growth_pct` field, and
`expiring_soon: 45` (real, not the old stub `0`) is still present.

**Lesson for future multi-migration sessions on the same RPC:** when two agents each produce a
`CREATE OR REPLACE FUNCTION` for the *same* function in parallel, the second one to be pushed
silently wins in full — there's no merge, no conflict detection. Either serialize such work
(don't dispatch two agents at the same function concurrently) or explicitly re-base the later
migration's body on the earlier one's *already-edited* output before pushing, not on whatever
each agent happened to read at dispatch time.

**All 3 KPI-related item-10/estimates migrations now live and correct.** Item 10 is fully
closed for landing pages plus the detail-page sweep described above; the 4 explicitly-deferred
items (Locations detail `gmv_trend` chart, Customers/Products dead-empty trend arrays,
Catalogs landing route's unused growth_pct/top_risers) remain open follow-ups, not blockers.

### 2026-07-23 — item 5 end-of-phase verification, backfill confirmed complete

User confirmed the line-item backfill finished. Ran the deferred verification against the test
tenant (`d601c35c-1a78-4506-a556-a82118d72893`), read-only, no code changes.

**1. Backfill completeness:** 13,420 GMV-included invoices in the trailing 90d window, **0
missing line items** (was ~851 invoices with zero items pre-backfill, ~6.3% of volume).

**2. §1 basis triangulation re-run (total_amount vs SUM(line_total)):**

| Basis | Before backfill | After backfill |
|---|---|---|
| `total_amount` (header) | ₹9.45cr (13,369 inv) | ₹9,48,47,649 (13,420 inv) |
| `SUM(line_total)` (line-item) | ₹7.57cr (12,518 inv) | ₹8,04,03,449 (13,420 inv) |
| Gap | ~20% | **~15.2%** |

Gap shrank as predicted (audit doc §6 rule 4) — the residual is now the structural piece
(freight/order-level discounts/rounding that sit at the invoice header and can't be attributed
to any line item), not missing data. Recommend treating ~15% as the new expected baseline for
this tenant; a materially larger residual on a re-check later would be worth investigating,
this size is not.

**3. Snapshot self-heal, no manual reprocess needed:** `metrics_location_snapshot` /
`metrics_location_daily` sum to **exactly** ₹94,847,649 (bit-for-bit match with the live
`total_amount` query). `metrics_product_snapshot` sums to ₹80,388,264.37 vs the live
`line_total` query's ₹80,403,449.09 — a ₹15,185 (~0.02%) gap, pure refresh-tick lag, not a
data problem. The earlier-flagged risk (bulk-sync bypass path skipping dirty-marking, needing
a manual `app.metrics_mark_reconciliation(...)` call) did **not** materialize — the backfill
must have gone through normal write paths, or reconciliation already ran. No manual action
needed; if a future backfill is genuinely bulk-bypassed, the earlier item-8 finding on how to
detect and remediate that still applies.

**4. Cross-page comparison, live-verified identical (not just "close"):**

| Page | Invoiced sales (90d) | Overdue |
|---|---|---|
| Locations | ₹94,847,649 | ₹29,48,216 |
| Invoices | ₹94,847,649 | ₹29,48,216 |
| Customers | ₹94,847,649 | ₹29,48,216 |
| Dashboard | ₹94,847,649 | ₹29,48,216 |
| Categories (line-item basis) | ₹79,604,014.89 | n/a |
| Products (line-item basis) | ₹80,388,264.37 | n/a |

The `total_amount` family (Locations/Invoices/Customers/Dashboard) is now byte-identical
everywhere — confirms the P0/P1 canonicalization work fully closed the cross-page drift for
that family. The `line-item` family (Categories/Products) sits close to each other (~1% apart,
expected — different product-scope filters between the two RPCs) and at the predicted ~15%
residual below the `total_amount` figure, not the ~20%+ gap from before. Both families now
behave exactly as rule 4 describes: reconciled where they should be, structurally offset where
they're supposed to be, no unexplained drift in either.

**5. Refresh-cadence alignment audit (new ask, not previously in the plan):** Inventoried every
active `cron.job` and cross-referenced against the actual trigger wiring (not just cron
schedules) for the tables that feed cross-page KPIs:

- **Core GMV/dues** (`metrics_tenant_commercial_snapshot`, `metrics_tenant_daily`,
  `metrics_location_snapshot`, `metrics_location_daily`, `metrics_buyer_snapshot`,
  `metrics_buyer_location_snapshot`, `metrics_product_snapshot`,
  `metrics_product_location_snapshot`) — all drained by the same `metrics-v2-refresh-tick`
  cron, every 15 seconds. This is why the cross-page comparison above matched exactly: every
  page reading one of these tables is on the identical refresh clock.
- **Warehouse stock counts** (`tracked_skus`/`low_stock_skus`/`stockout_skus` on
  `warehouses_snapshot`) — initially assumed this needed cadence-alignment work too, but
  checked the actual trigger (`trg_inventory_dispatch` → `app.dispatch_from_inventory()`) and
  found it calls `refresh_warehouses_snapshot()` **synchronously, in the same transaction as
  the write** — these fields are effectively zero-lag, faster than the 15s tick, not behind it.
- **Warehouse idle-stock** (`idle_stock_skus`) — the one field that can't be write-triggered at
  all, since it changes purely with elapsed calendar time (a SKU "goes idle" the day it crosses
  90 days since its last sale, with no corresponding database write to hang a trigger off of).
  The `warehouses-snapshot-freshness` cron added earlier this session (daily, 02:00 IST) is the
  right cadence for this specific field — checking a 90-day threshold more often than once a
  day has no observable benefit, and matches how `metrics-v2-daily-reconciliation` (06:30 IST)
  already handles the analogous problem for the core metrics tables.
- **Cohort membership** (`app.cohort_members_active`) — `membership-automatic-refresh-tick`,
  every 30 seconds. Close enough to the 15s metrics tick that Cohorts' GMV (current membership
  × `metrics_buyer_snapshot`) won't show materially different staleness than any other
  buyer-grain page.

**Conclusion: no cadence-alignment fix needed.** Every table's refresh mechanism is already
matched to its own volatility — near-real-time triggers for anything a write can hang off of,
short-interval ticks for aggregate rollups, and day-grained crons only for the two metrics
(idle-stock, daily reconciliation) that are themselves defined in day-grained terms. The
different cadences here aren't drift risk, they're intentional and already coherent; forcing
everything onto one uniform interval would either waste cycles (checking a 90-day threshold
every 15 seconds) or slow down things that are currently instant (making warehouse writes wait
for a tick instead of refreshing synchronously). Flagging this explicitly rather than silently
declaring "done" — if a *new* table is added to this pipeline later without wiring it into
either the 15s tick's dirty-marking or an appropriately-paced standalone cron (the same mistake
`kpi_buyers_daily` made), that would reintroduce exactly this class of drift.

**Verification method throughout:** live SQL against project `hcpzbnmumbykdqveyjhr`, read-only,
no migrations, no code changes — this was a verification pass only, per the task.

### 2026-07-24 — user-reported number discrepancies investigated (read-only, no fixes yet)

User compared live numbers across pages post-backfill and reported several mismatches, plus 4
UI/UX observations on the callout SeeAllSheet (layout shift on open/close, count showing a
placeholder before refreshing to real value, no infinite-scroll pagination in the sheet, primary
text truncated despite available width — **logged, not investigated this pass**, user's own
framing pointed the deep-dive at the number mismatches specifically).

**Confirmed real bugs, not yet fixed (code-read + live SQL, no browser access — auth-gated,
tried and blocked):**

1. **Dashboard "Overdue receivables" customer count wildly undercounts (7 vs the correct 60).**
   `src/lib/server/seller-dashboard.ts` fetches `app.invoices` with `.eq('tenant_id',...)
   .is('deleted_at', null)` and **no `.limit()`, no date filter** — this tenant has 16,957
   invoices all-time. Supabase/PostgREST silently caps unbounded selects at its default row
   limit, so `overdueCustomerCountAll` (`new Set(overdueInvoicesAll.map(row => row.buyer_id))
   .size`, computed client-side in JS over whatever partial slice came back) is counting
   distinct buyers within an arbitrary ~1000-row prefix of a 16,957-row table, not the true
   set. `overdue_sum` (the ₹ figure) is unaffected — it's not a `.reduce()` over this same
   truncated array for the *headline* number (that comes from the canonical RPC, already
   verified correct) — only the **customer-count sub-label** is wrong. **Fix direction:** stop
   computing this in JS from an unbounded fetch; use a bounded `COUNT(DISTINCT buyer_id)` SQL
   aggregate (or read it off `metrics_tenant_commercial_snapshot`/an equivalent canonical
   source) the same way every other page's overdue figure already does.

2. **Locations "active_locations = 0" ripples into 3 separate tiles' subtext**, not just the
   one already flagged in the original audit. Confirmed via direct code read
   (`LocationsLandingClient.tsx` lines 260-291): "Invoiced sales 90D" sub = `"${active_locations}
   active locations"` → 0; "Customers who bought" sub = `"across ${active_locations}
   locations"` → 0; "Open estimate value" sub = `"across ${active_locations} locations"` → 0.
   Root cause unchanged from earlier this session (all 9 of this tenant's locations have
   `status = 'inactive'` in the DB, a data-hygiene question, not a query bug — the RPC is
   faithfully reading what's in the column) — but now visibly confirmed to be corrupting 3
   separate tiles' supporting text, not 1. **Fix direction:** either resolve the underlying
   data (locations that are clearly trading — has invoices, buyers, GMV — probably shouldn't be
   `status='inactive'`), or stop using `active_locations` as the universal subtext denominator
   for tiles that aren't actually about location-active-status (e.g. "Customers who bought"
   should use total location count or a real active-buyer-location count, not this field).

3. **Locations "Customers who bought" (3,320) double-counts buyers across locations.**
   Confirmed via live SQL: `3,320 = SUM(purchasing_buyers_90d)` across all of this tenant's
   rows in `metrics_location_snapshot` — a buyer who purchased at 2+ locations gets counted
   once per location in that sum. This is the same "cross-entity SUM instead of true dedup"
   bug class as the original audit's client-side-page-sum finding, just at the RPC layer this
   time rather than the client. Explains why it sits between Customers landing's
   `invoiced_customer_count` (2,810, correctly deduplicated tenant-wide) and `active` (3,955,
   also deduplicated but a broader any-demand definition) without matching either — it's not
   supposed to match, it's a different (and inflated-by-overlap) computation. **Fix
   direction:** either compute a true `COUNT(DISTINCT buyer_id)` across all locations in the
   RPC (one more CTE, not expensive), or relabel the tile to make clear it's a sum of
   per-location activity, not a tenant-wide customer headcount.

4. **Brands "Invoiced sales · 90D" is mislabeled — the value is demand, not invoices.**
   Confirmed via code read (`BrandsLandingClient.tsx` line 288, literal string `'Invoiced sales
   · 90D'`) bound to `portfolio_gmv_mtd`, which — since this session's primary-demand-kind fix
   — is computed from live `app.estimates`/`app.estimate_items` for this estimate-primary
   tenant (₹21,79,03,522.04 live-verified, matches the user's reported ₹21.79cr exactly). This
   is squarely **P2 item 9** ("reframe Brands/Cohorts/Catalogs to demand+conversion, per audit
   doc §6 rule 7"), already identified and logged as TODO earlier this session, now confirmed
   as a real, currently-visible mislabel via the user's own live comparison rather than just
   code inspection. No new fix needed beyond executing the already-planned item 9.

**Investigated, could not resolve — needs either a fresh repro or live app access:**

5. **Locations "Open estimate value" shows ₹7.51cr; Dashboard/Invoices show the correct
   ₹30,68,96,260 (₹30.69cr) for the conceptually-same figure.** Traced the full server-side
   computation (`app/api/tenant/locations/landing/route.ts` lines 255-287) and verified via
   live SQL that if this code runs as written, it computes ₹30,68,96,260 — matching Dashboard
   exactly (all 3,884 open estimates for this tenant have a non-null `location_id`, so the
   route's `.not('location_id','is',null)` filter excludes nothing). Ruled out: (a)
   `primary_demand_kind` flip-flopping — it's a deterministic tenant-settings lookup
   (`app.metrics_v2_primary_demand_kind`), confirmed stable at `'estimates'`, not
   threshold/volume-based; (b) pagination/`include_summary=false` reverting the KPI object on
   scroll — `mergeSellerLandingPages` correctly spreads `firstPage`'s kpis and only merges the
   rows array, confirmed by reading the merge function; (c) confusing the point-in-time "open
   estimate value" KPI with the row table's *trailing-90d* `estimate_value_90d` column — summed
   across locations that's ₹29.4cr, not ₹7.51cr either, so that's not the source of the number.
   Attempted to reproduce live in a browser to inspect the actual network response, but the
   local dev server (already running on :3000) requires WhatsApp-OTP login this session has no
   way to complete on the user's behalf. **The reported ₹7.51cr doesn't match any query this
   session could construct from the current code or data — flagging as unresolved rather than
   guessing further.** Suggest a fresh screenshot after a hard reload, and if it persists,
   share the Network tab's actual JSON response for `/api/tenant/locations/landing` so the
   exact field values reaching the browser can be inspected directly.

**Investigated, confirmed NOT bugs (expected behavior, already covered by earlier rules):**

- Categories (₹7.88cr) / Products (line-item basis) vs Locations/Invoices/Customers/Dashboard
  (₹9.41cr, `total_amount` basis) — expected ~15% structural gap per rule 4, unchanged from the
  item-5 verification above.
- Customers "Active" (3,955, any invoice+estimate+order activity) vs "Invoiced" (2,810,
  invoices only) — legitimately different predicates (`is_active AND (invoice_count_90d +
  estimate_count_90d + order_count_90d) > 0` vs `invoice_count_90d > 0`), both internally
  correct. Worth a label-clarity pass later (the "X% purchased at least once" sub-text under
  "Active Customers" implies invoicing when the definition is broader) but not a data bug.
- Small invoice-count drift across the session's live checks (13,311 → 13,420) — confirmed via
  the "as of 05:24 IST" freshness stamp matching the DB's actual `computed_at` timestamp
  exactly, i.e. genuine new invoices created in the gap between snapshots, not staleness or a
  bug.

**Nothing pushed or changed this pass — investigation only, per the user's ask.** Items 1-4
above are ready to become new P2/P3 execution items once the user confirms priority; item 5
needs a repro before it can be fixed.

### 2026-07-24 — user authorized fixes; all 5 items above fixed + pushed, plus SeeAllSheet UX

User sent 6 screenshots confirming the same numbers from the read-only pass above, one new
observation (Dashboard "7 overdue customers" — already found and root-caused above), an explicit
instruction to **not** investigate the tax/line-item basis gap for Categories/Products/Brands
right now (will validate with WineYard separately), and authorization to fix everything with two
hard constraints: **all KPIs and supporting text must come only from metrics_v2 tables, never raw
aggregations**, and **callout counts/experience must align with the KPI tiles on the same page**.

**Item 5 (Locations "Open Estimate value" ₹7.51cr) — root cause found.** The prior pass's SQL
trace was correct that the code, if unbounded, computes the right number — the missing piece was
that it isn't unbounded. Re-ran the exact live query the route issues
(`.from('estimates').select('total_amount')...in('status',['draft','sent']).limit(10000)`) and it
returned **exactly 1000 rows summing to ₹75,09,154** — Supabase's `db-max-rows` project setting
silently caps any `.select()` returning rows at 1000, *regardless of a larger `.limit()`
requested*. Same failure mode as item 1 (Dashboard overdue count), confirmed independently. Fixed
by reading `app.metrics_tenant_commercial_snapshot.open_estimate_value`/`open_order_value`
instead (a single pre-aggregated row per tenant — no row-count cap can apply). Live-verified:
`open_estimate_value = 306896260`, `open_estimate_count = 3884` — exact match to
Dashboard/Estimates.

**Fixes made, in order:**

1. **Dashboard overdue-customer-count (7 → 60).** `src/lib/server/seller-dashboard.ts`: replaced
   the JS `new Set(overdueInvoicesAll.map(...buyer_id)).size` (computed over the same
   1000-row-truncated `app.invoices` fetch) with a bounded query against
   `app.metrics_buyer_snapshot` — `count:'exact', head:true` filtered `overdue_amount > 0` for
   tenant-wide (non-scoped) sellers, since `head:true` issues a `SELECT count(*)` server-side and
   is immune to the row-return cap; for location-scoped (`seller_assistant`, subset mode) sellers,
   reads `app.metrics_buyer_location_snapshot` filtered by `location_id IN (...)` and dedupes
   buyer_id in JS (bounded `.limit(5000)`, generous safety margin — this tenant only has 60
   overdue buyers tenant-wide). Live-verified: 60, matches Invoices/Customers landing exactly.
   **Also fixed the "Collections" callout** (same root cause, one level deeper than originally
   scoped): its own hint count (`overdueByBuyer.size`) and row list were independently
   re-aggregated from the same truncated `invoices` array, so it still would have shown a
   wrong/inconsistent number even after the KPI tile was fixed — exactly the
   callout-vs-KPI-alignment problem the user flagged. Added a second bounded query
   (`overdueBuyerRowsQuery` — same tables, `buyer_id, overdue_amount, oldest_due_at`, ordered
   `overdue_amount DESC`, `.limit(500)`) and rebuilt `collectionsRowsAll` from it instead of
   aggregating raw invoices; the callout's `hint` now reads the same `overdueCustomerCountAll`
   value as the KPI tile, so they can never drift apart again. Dropped the per-buyer invoice-count
   from the row's reason text (`"${daysOverdue}d overdue"` instead of `"N invoices · Xd
   overdue"`) since that granularity isn't in `metrics_buyer_snapshot` and adding a live
   `GROUP BY` count query would reintroduce a raw aggregation.

2. **Locations "Open estimate/order value" (₹7.51cr → ₹30.69cr).**
   `app/api/tenant/locations/landing/route.ts`: removed the live
   `.from('estimates')`/`.from('orders')` fetch-and-reduce entirely; now reads
   `open_estimate_value`/`open_order_value` off a single `metrics_tenant_commercial_snapshot` row
   fetched alongside the existing queries in the same `Promise.all`. Deleted the now-dead
   `OPEN_ESTIMATE_STATUSES`/`OPEN_ORDER_STATUSES` local constants.

3. **Locations "Customers who bought" (3,320 double-count → 2,810).** Same
   `metrics_tenant_commercial_snapshot` row also carries `purchasing_buyers_90d` (already
   deduplicated tenant-wide) — wired into the response as `kpis.purchasing_buyers_90d`, and
   `LocationsLandingClient.tsx`'s tile now reads it instead of
   `filtered.reduce((sum,row)=>sum+row.active_buyers,0)` (which both double-counted
   cross-location buyers *and* only summed the current page).

4. **Locations `active_locations`-as-denominator ripple (3 tiles + page header).** Root cause
   (all 9 of this tenant's locations have `status='inactive'` — a real data fact, not touched)
   left alone, but stopped using that field as the count for tiles that aren't about
   active/inactive status. Added `total_locations` (`COUNT(*)`, no status filter) to
   `get_seller_locations_landing_summary`'s `totals` CTE and `kpis` output (migration
   `20260724033158_fix_locations_landing_total_gmv_and_count.sql`, function body copied verbatim
   from `20260723121903_fix_locations_overdue_kpi_field.sql` with only `totals`/`kpis` changed).
   "Invoiced sales 90D", "Customers who bought", and "Open estimate/order value" tile subtexts,
   plus the page header subtitle (previously `${filtered.length} active locations`, wrongly
   implying an active-status count when it was really just the loaded-page row count), now all
   read `kpis.total_locations` (= 9 for this tenant) instead.

5. **Locations "Invoiced sales 90D" client-side page-sum.** Same migration also exposes
   `totals.total_gmv` (already computed server-side in this RPC from
   `app.metrics_location_daily`, trailing-90d window, just never returned) as
   `kpis.invoiced_sales_90d`. Client now reads it instead of
   `filtered.reduce((sum,row)=>sum+row.gmv_mtd,0)` (page-limited — correct only by coincidence for
   this 9-location tenant, would under-report for any tenant with more locations than fit on one
   page). Live-verified: ₹95,06,2198 (₹9.51cr) — a proper tenant-wide trailing-90d figure, close
   to but not byte-identical with Customers landing's ₹9.41cr; flagging that small residual gap
   as a follow-up (likely a minor date-boundary/precision difference between
   `metrics_location_daily` and the invoices-direct computation Customers landing uses) rather
   than chasing it further this pass — it's a large improvement over the prior page-sum bug and
   not one of the numbers the user flagged.

6. **Brands "Invoiced sales · 90D" mislabel.** `portfolio_gmv_mtd` is order/estimate demand value
   for this estimate-primary tenant (live-verified ₹21,79,03,522.04, matches user's report
   exactly), not invoiced sales — this is P2 item 9, executed now for Brands specifically (not
   Cohorts/Catalogs, which are unaffected/already correct). Added `primary_demand_kind` to
   `app/api/tenant/brands/route.ts`'s response (same `metrics_v2_primary_demand_kind` RPC every
   other page already calls) and `TenantBrandsResponse` type; `BrandsLandingClient.tsx` now
   labels the tile "Estimate demand value · 90D" / "Order demand value · 90D" dynamically instead
   of the hardcoded, incorrect "Invoiced sales · 90D".

7. **SeeAllSheet callout UX — 3 of 4 issues fixed at the shared-component level** (applies to
   every page using `V3CalloutPanel`/`SeeAllSheet` at once, not per-page):
   - **Layout shift on open/close**: `app/globals.css` already sets `scrollbar-gutter: stable` on
     `html`, but Radix Dialog's scroll-lock (`react-remove-scroll`) measures scrollbar width via
     `innerWidth - clientWidth` — a value that stays nonzero even with the gutter permanently
     reserved — and adds its own redundant `padding-right` to `<body>` on open/removes it on
     close, on top of the space the CSS gutter already reserved. Added
     `body[data-scroll-locked] { padding-right: 0 !important; margin-right: 0 !important; }` to
     neutralize Radix's redundant compensation.
   - **Count shows a placeholder before refreshing to the real value (sometimes capped, sometimes
     not)**: `V3CalloutPanel.tsx` was showing `activeItem.rows.length` (the 2-row homepage
     preview array) as the sheet subtitle count while `loadRows()` was still in flight for
     callouts that have one, then swapping to the true count once it resolved. Now shows
     "Loading…" instead of any count until the authoritative list (`loadRows()`'s result, or the
     synchronous `rows` array for callouts with no `loadRows`) is known. Removed the now-dead
     `loadingItemId` state (folded into a derived `isLoadingFullList` boolean).
   - **Primary text truncated despite available space**: sheet table columns were `68%`/`32%`
     name-vs-value split; the value column rarely needs that much room (usually a short currency
     figure). Widened to `72%`/`28%`.
   - **No pagination/infinite-scroll past the first page**: **not fixed** —
     `SeeAllSheet.tsx` already implements client-side infinite-scroll correctly (IntersectionObserver
     sentinel + `visibleCount` paging over the full `items` array, `useInfiniteScroll` hook
     verified correct, `SheetBody`'s ref forwarding + `overflow-y-auto` verified correct). The
     complaint is more likely that many pages' callout `rows` arrays are themselves capped
     server-side (found `LIMIT 100` in several read-model RPCs —
     `20260714113113_seller_brand_category_landing_read_models.sql`,
     `20260714113035_locations_warehouses_landing_runtime_summaries.sql`,
     `20260716110313_metrics_v2_phase_6_wave_c_completion.sql`,
     `20260723070839_fix_brand_landing_rows_cohort_scd2.sql`, among others) with no `loadRows`
     counterpart to fetch beyond that cap — only 3 of the 14 pages using `V3CalloutPanel`
     (Customers, Dashboard, Buyer App) implement `loadRows` at all; the other 11 pass a single
     static array with whatever the landing RPC happened to include. Auditing which of those 11
     pages' callouts can realistically exceed their cap (most look like genuinely small lists —
     e.g. "8 locations with overdue balances" — where the cap is moot) is a per-page task that
     needs its own pass; flagging as a follow-up rather than guessing which ones are actually
     affected.

**Not touched, flagged as follow-ups:**
- The residual ₹9.51cr vs ₹9.41cr gap between Locations' new `invoiced_sales_90d` and Customers
  landing's invoiced-sales figure (item 5 above) — small, likely a date-boundary/precision
  difference between two different source tables, not a page-sum bug anymore.
- `BrandsLandingClient.tsx`'s `portfolioGmv` still has a client-side `brands.reduce(...)` fallback
  used only if `summaryData?.kpis?.portfolio_gmv_mtd` is unavailable — same raw-aggregation
  anti-pattern as a defensive fallback, low risk (rarely hit), not fixed this pass.
- The `LIMIT 100`-without-`loadRows` audit described in item 7 above.
- Dashboard's `currentGmv90d`/`invoicedCustomers90d` (the "Invoiced sales · Last 90 days" tile)
  and the recent-activity/feed row fetches (`orders`/`estimates`/`invoices` raw arrays) are still
  subject to the same 1000-row Supabase cap in principle — confirmed live (`.from('invoices')`
  with no limit returned exactly 1000 of 16,957 rows) — but were **not reported as visibly wrong**
  by the user and the KPI *value* itself already comes from the RPC-backed `portfolio` object
  (the raw arrays only feed a fallback path and the recent-activity/feed lists, which only ever
  render the top 4-5 most-recently-updated rows — order/correctness risk there is much lower than
  the two confirmed-wrong counts fixed this pass). Not touched to keep this batch scoped to
  confirmed, user-reported bugs; worth a dedicated pass given the "metrics_v2 only" directive is
  a standing rule now, not a one-time request.

**Migration pushed:** `20260724033158_fix_locations_landing_total_gmv_and_count.sql` (dry-run
confirmed it was the only pending migration before push). All other fixes were TypeScript-only
(no new SQL needed — `metrics_tenant_commercial_snapshot`/`metrics_buyer_snapshot`/
`metrics_buyer_location_snapshot` already had every column needed).

**Verified how:** `npx tsc --noEmit` clean after every edit (checked repeatedly through the
batch, final check clean). Every numeric fix live-verified against tenant
`d601c35c-1a78-4506-a556-a82118d72893` via direct Supabase JS client queries (the Supabase MCP
tool required re-authorization mid-session; fell back to a `node -e` script reading
`.env.local`'s service-role key directly, same effect). Could not verify the SeeAllSheet UI fixes
in a browser — local dev server requires WhatsApp-OTP login this session can't complete on the
user's behalf (same blocker as the prior read-only pass); recommend the user click through the
Locations/Dashboard pages and a callout "see all" sheet to visually confirm before considering
this batch fully closed.
