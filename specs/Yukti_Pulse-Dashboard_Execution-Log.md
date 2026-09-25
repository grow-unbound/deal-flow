# Yukti Pulse Dashboard — Shared Execution Log

**Source of truth:** `specs/Yukti_Pulse-Dashboard_Product-Spec_v1.md`

**Session prompt:** `specs/Yukti_Pulse-Dashboard_Phase-Session-Prompt.md`

**Created:** 22 September 2026

**Overall status:** P01 complete with follow-up visual/data refinement; P2A/P2B complete; P3 complete with lab/browser caveat; P5 functional slice implemented but still in progress on the Section 2.8 opportunity-read performance gate.

---

## 1. Working rules

- Every Pulse implementation session reads this log before planning and again immediately before appending its handoff.
- Entries are append-only. Never erase prior evidence; supersede it with a dated entry.
- One execution unit owns a shared migration, shared response type, shared Pulse component, or status-table update at a time.
- A blocked or investigation-only session still records what was learned and what is needed next.
- Phase completion requires the product-spec acceptance criteria and repository verification gates, not merely merged code.
- Section 2.8 performance budgets are release gates. Functional correctness does not compensate for a slow, blocking, or navigation-regressing dashboard.
- Every dashboard read names its precomputed aggregate/snapshot/RPC source. Request-time raw-table aggregation requires an explicitly documented bounded exception and query-plan evidence.
- Optional widgets load and fail independently; warm navigation and background refresh preserve already-rendered content.
- Digital demand needing operational action already routes to Today/Inbox and is not Pulse implementation work.
- Production work is outside this ledger unless separately and explicitly authorized.

---

## 2. Execution units and status

| Unit | Product-spec scope | Depends on | Status | Evidence / latest entry |
|---|---|---|---|---|
| `P01` | Phases 0 + 1: retire old Pulse and ship reliable core | None | `complete` | 2026-09-22 18:52 IST — p01-opportunity-tile-refinement |
| `P2A` | Phase 2: event/identity audit and instrumentation | None; contract must be frozen before P2B | `complete` | 2026-09-23 07:10 IST — p2a-p2b-behavioral-foundation |
| `P2B` | Phase 2: daily extraction and minimal snapshot | P2A | `complete` | 2026-09-23 07:10 IST — p2a-p2b-behavioral-foundation |
| `P3` | Phase 3: Demand Signals UI | P2B with fresh pilot snapshot | `complete` | 2026-09-24 09:48 IST — p3-demand-signals-polish |
| `P5` | Phase 5: useful without adoption | P01 | `in_progress` | 2026-09-25 11:37 IST — p5-useful-without-adoption |
| `P4` | Phase 4: adaptive maturity presentation | P01, P3, P5 | `not_started` | — |
| `P6` | Phase 6: declining-adoption recovery | P4 plus sufficient historical baseline | `not_started` | — |

Allowed status values: `not_started`, `investigating`, `in_progress`, `blocked`, `complete`, `superseded`.

---

## 3. Dependency and sequencing decision

### Recommended default sequence

`P01 → P2A → P2B → P3 → P5 → P4 → P6`

This is the safest sequence for independent sessions because it minimizes shared-file conflicts and keeps each entry gate easy to prove.

### Conditional parallel lanes

| Units | May run in parallel? | Conditions |
|---|---|---|
| `P01` + `P2A` | Yes | Separate worktrees. P2A may touch buyer/auth/PostHog capture only and must not edit seller Pulse components, landing response types, or shared ledger status concurrently. |
| `P2B` + `P5` | Conditionally | Separate worktrees; P5 must reuse existing aggregates and avoid migrations/shared response types owned by P2B. Coordinate final Pulse integration serially. |
| `P3` + `P5` | No by default | Both converge on Pulse layout, types, skeletons, and tests. Serialize unless file ownership is explicitly split and a coordinator integrates. |
| `P4` + anything earlier | No | P4 adapts the combined outputs and should begin only after P01, P3, and P5 stabilize. |
| `P6` + anything earlier | No | P6 depends on the maturity contract and sufficient historical evidence. |

Never parallelize:

- Two migrations or database-contract changes.
- Shared Pulse response types.
- `app/(seller)/pulse/page.tsx`, its `loading.tsx`, or the primary Pulse client component.
- Final status-table updates in this log.
- Remote migration validation/pushes.

### Why Phase 5 precedes Phase 4 in execution

Phase 4 owns adaptive eligibility and section ordering. It must adapt around both:

- PostHog-backed Demand Signals from P3.
- Non-adoption customer opportunities from P5.

Running P4 before P5 would force a second maturity-model rewrite.

---

## 4. Locked decisions carried across sessions

- Pulse owns demand intelligence, Yukti contribution, and computed opportunities.
- Today/Inbox owns discrete transactional work and its resolution lifecycle.
- Catalog owns healthy publication/configuration state; Pulse shows catalog only when blocked.
- Business contribution is channel-neutral even though Storefront is the first source.
- Generic ERP KPI strips and charts do not return as low-data filler.
- Pulse does not call PostHog directly after P2B.
- PostHog remains the raw behavioral source; Yukti stores only a bounded product-facing snapshot.
- Contribution cards and insights are eligibility-driven; zero-card grids are not required.
- Freshness is visible and uses the oldest relevant watermark.
- Current implementation claims attribution, not causal incrementality.
- The hidden `/buyer-app` analytics page redirects only after Phase 3 parity; access management remains available.
- Pulse uses aggregate/snapshot-backed request paths; expensive raw transactional/event aggregation is not hidden behind application caching.
- Contribution, Opportunities, and each Demand Signal widget are independent query/loading/error domains. API boundaries may combine tightly related cards but cannot let an unrelated slow widget block the page.
- Returning to Pulse within the configured stale window retains data without an immediate full-page refetch. Background refresh updates only the affected widget.
- Public Web Vital baselines are LCP `≤2.5s`, INP `≤200ms`, and FCP `≤1.8s`; the repository keeps its stricter CLS target `<0.05`. CSP remains a separate security gate.

---

## 5. Known pre-implementation findings

- Existing landing snapshots and period summaries can support the Phase 1 contribution section.
- `get_buyer_app_dashboard_v4` already returns the four non-transactional opportunity lists used by P01/P5.
- `app_demand_needing_operational_action` is already represented in Today/Inbox and is excluded from Pulse.
- Current direct PostHog endpoints are too slow for Pulse's critical render path.
- Current behavior capture needs a fresh audit: the older `posthog-setup-report.md` names events/routes that do not fully match current code.
- Tenant attribution for guest behavior must come from resolved hostname/request context, not authenticated context alone.
- `app.metrics_landing_kpi_snapshot` is the preferred first candidate for the bounded daily Demand Signals projection, subject to contract review.
- `specs/` is git-ignored in the current repository; implementation sessions must ensure these planning/log files are deliberately included in their delivery mechanism if they are expected in a PR.

---

## 6. Open decisions requiring implementation evidence

- Final Phase 1 contribution period if QTD cannot be made consistent across all four cards without new aggregation.
- Exact eligibility thresholds for hiding contribution cards and opportunity groups.
- Whether the existing landing snapshot JSON-array contract cleanly supports ranked Demand Signal rows.
- Daily extraction schedule and tenant batching limits.
- Minimum anonymity/sample threshold for seller-visible zero-result searches.
- Exact product-interest threshold and scoring for conversion gaps/stock mismatch.
- Maturity-state thresholds and hysteresis after pilot distributions are measured.
- Whether high-value-customer inactivity can be derived with a bounded existing-summary query or needs a new read model; new persistence is not pre-approved.
- Current production-build baseline for Pulse cold load, warm return navigation, LCP, INP, CLS, FCP, and TTFB.
- Representative high-volume fixtures and repeatable measurement protocol for aggregate-read and widget-endpoint p95.
- Whether available production traffic is sufficient for field p75 reporting; until then, sessions must label browser/lab evidence as provisional rather than field data.

---

## 7. Performance evidence contract

Every implementation entry records only the rows relevant to its changes, but it may not leave a changed read path or widget boundary unmeasured.

| Evidence | Required record |
|---|---|
| Data source | Exact precomputed table/view/RPC/snapshot used; explain any bounded raw-preview exception |
| Query plan | `EXPLAIN (ANALYZE, BUFFERS)` summary, relevant indexes, fixture size, and observed timing |
| API | Endpoint/widget boundary, response size, warm/cold server duration, and p95 when repeatable sampling exists |
| Failure isolation | Evidence that a delayed/failed optional widget does not block the shell, core, or siblings |
| Cache/navigation | Query tier, seed timestamp behavior, warm-return network behavior, and absence of page-level skeleton/refetch |
| Rendering | Production-build cold load and primary interaction trace; layout parity across loading/empty/error/stale/populated states |
| User metrics | LCP, INP, CLS, FCP, and TTFB evidence against Section 2.8; distinguish field p75 from lab/trace results |
| Security | CSP review when analytics origins or SDK configuration change |

The expected targets are copied from the product spec for handoff visibility: LCP `≤2.5s`, INP `≤200ms`, CLS `<0.05`, FCP `≤1.8s`, initial TTFB target `≤800ms`, warmed aggregate-read p95 `<100ms`, and widget endpoint server-duration p95 `<300ms`. The product spec remains authoritative if these change.

---

## 8. Session-entry template

Copy this section to the end of the file for every session.

```markdown
## YYYY-MM-DD HH:MM IST — [unique session ID] — [execution unit]

**Status:** investigating | in_progress | blocked | complete

**Branch / commit / PR:**

**Objective:**

### Completed

-

### Files and database objects changed

-

### Verification and evidence

| Check | Command/evidence | Result |
|---|---|---|
| Type-check | `npx tsc --noEmit` | |
| Focused tests | | |
| Data reconciliation | | |
| Security/scoping | | |
| UI/loading/visual states | | |
| Aggregate/query plan | source, indexes, fixture size, plan/timing | |
| Widget API/payload | endpoint, isolation boundary, bytes, timing/p95 | |
| Cache/navigation | cold load, warm return, refetch behavior | |
| Web performance | LCP, INP, CLS, FCP, TTFB; field p75 or labelled lab/trace | |
| CSP review | required after analytics origin/SDK changes | |

### Findings

-

### Decisions made

-

### Deferred / explicitly out of scope

-

### Risks or blockers

-

### Rollback notes

-

### Recommended next unit

- Unit:
- Entry gate satisfied: yes | no
- Evidence / remaining requirement:
```

---

## 9. Session entries

## 2026-09-22 15:46 IST — p01-reliable-core — P01

**Status:** complete

**Branch / commit / PR:** `feat/pulse-revised` / local commit pending at log-write time / PR pending

**Objective:** Retire the old rendered `/pulse` ERP/catalog dashboard presentation and ship the Phase 1 reliable core using existing database-backed contribution and opportunity data only.

### Completed

- Replaced `/pulse` rendering with a Pulse-specific page: header, independent Business captured through Yukti section, and independent Opportunities section.
- Removed old Pulse imports/rendering of catalog live/setup cards, generic dashboard KPI strip, Business Flow, Customer Activity, Sales Mix, Location Performance, seller-assistant transactional feeds, and Buyer Channels wording.
- Added independent Pulse API/query boundaries: `/api/tenant/pulse/contribution` and `/api/tenant/pulse/opportunities`.
- Contribution reads `app.get_landing_metrics_v4(page_key='buyer_app', period='this_quarter')` for seller-admin tenant scope; seller-assistant contribution falls back to `app.get_buyer_app_dashboard_v4` so assigned-location scoping is preserved.
- Opportunities read existing `app.get_buyer_app_dashboard_v4` action lists and exclude `app_demand_needing_operational_action`, which remains Today/Inbox-owned.
- Added route-level `loading.tsx` and client skeletons with matching two-section structure and stable card footprints.
- Added focused tests for contribution/opportunity mapping, auth/scoping/API boundaries, retired dashboard content, failure isolation, and empty contribution behavior.

### Files and database objects changed

- `app/(seller)/pulse/page.tsx`
- `app/(seller)/pulse/loading.tsx`
- `app/api/tenant/pulse/contribution/route.ts`
- `app/api/tenant/pulse/opportunities/route.ts`
- `src/components/seller/pulse/PulseDashboardClient.tsx`
- `src/hooks/usePulse.ts`
- `src/lib/server/pulse-core.ts`
- `src/types/pulse.ts`
- `src/tests/pulse-core.test.ts`
- `src/tests/pulse-api.test.ts`
- `src/tests/pulse-client.test.tsx`
- Database objects changed: none. Existing RPCs only: `app.get_landing_metrics_v4`, `app.get_buyer_app_dashboard_v4`.

### Verification and evidence

| Check | Command/evidence | Result |
|---|---|---|
| Type-check | `npx tsc --noEmit` | Passed |
| Focused tests | `pnpm exec vitest run src/tests/pulse-core.test.ts src/tests/pulse-api.test.ts src/tests/pulse-client.test.tsx` | Passed: 3 files, 11 tests |
| Production build | `npm run build` | Passed. `/pulse` route built as dynamic, route size 205 B, first load JS 393 kB. |
| Data reconciliation | Unit tests assert mapping from `get_landing_metrics_v4` cards and `get_buyer_app_dashboard_v4` action IDs; live yukti-dev Wine Yard payload confirmed `app_sourced_demand_qtd` and `app_sourced_invoiced_sales_qtd` values/counts are available from landing metrics. | Contribution cards reconcile with existing snapshot card ids; opportunities reconcile with existing action ids. |
| Security/scoping | API tests cover seller-only rejection, unassigned assistant empty response, assistant `p_location_ids` passthrough to `get_buyer_app_dashboard_v4`, and seller-admin `get_landing_metrics_v4` tenant scope. | Passed. No client-supplied tenant id. No production mutation. |
| UI/loading/visual states | Component tests cover populated, contribution-error/opportunities-success, and empty-contribution/opportunities-success states. `app/(seller)/pulse/loading.tsx` uses same header + two section skeleton structure as `PulseDashboardSkeleton`. | Passed in test. Browser visual check blocked: `next dev --turbo` hit existing `next/font/google` Turbopack resolver error; `next start` hit existing `routesManifest.dataRoutes is not iterable` after successful build. |
| Aggregate/query plan | Verified linked ref before every `--linked` read: `hcpzbnmumbykdqveyjhr`. `EXPLAIN (ANALYZE, BUFFERS) SELECT app.get_landing_metrics_v4(... 'buyer_app', 'this_quarter' ...)` on Wine Yard dev. | Contribution source warm execution: 78.566 ms, shared hit=710, within warmed aggregate target `<100 ms`. |
| Opportunity/query plan | Verified linked ref before every `--linked` read. `EXPLAIN (ANALYZE, BUFFERS) SELECT app.get_buyer_app_dashboard_v4(... 'seller_admin', NULL::uuid[])` on Wine Yard dev. | Cold execution: 3736.432 ms, shared hit=47239 read=263 dirtied=92. Warm execution: 140.233 ms, shared hit=47303. Under widget endpoint target `<300 ms`, above stricter aggregate/RPC target `<100 ms`; retained because ranked preview rows need existing action-list RPC and no new aggregate was introduced in P01. |
| Widget API/payload | Source payload size query on Wine Yard dev: `length(get_landing_metrics_v4::text)`, `length(get_buyer_app_dashboard_v4::text)`. API tests assert separate Server-Timing labels `pulse_contribution_api` and `pulse_opportunities_api`. | Contribution source payload ~1190 bytes. Opportunities source payload ~20263 bytes before route trimming to max three groups and three previews each. Boundaries independently requestable and independently fail in tests. |
| Cache/navigation | `usePulseContribution` and `usePulseOpportunities` use `NAVIGATION_QUERY_STALE_TIME` / `NAVIGATION_QUERY_GC_TIME`, no `initialDataUpdatedAt: 0`, no `router.refresh()`, no page-level refetch skeleton after mount. | Static/code verified and covered by client tests for independent query URLs. Browser warm-return measurement blocked by local server issues above. |
| Bundle/performance | Built chunk inspection: `du -h .next/static/chunks/app/(seller)/pulse/page-*.js` = 4.0K. `rg` over built Pulse chunks found no `BusinessFlowChart`, `CustomerActivityDonut`, `SalesMixDonut`, `LocationPerformanceChart`, `recharts`, `CatalogLiveShareCard`, `Buyer channels`, or `SellerDashboardClient`. | Retired chart code is not in the new Pulse route chunk. |
| Web performance | Production build completed; route chunk and source query timings recorded. Browser lab LCP/INP/CLS/FCP/TTFB not captured because both local dev and production server modes were blocked by existing non-P01 server issues. | Partial lab evidence only; no field p75 available. |
| CSP review | No analytics/PostHog/CSP changes. | Not applicable. |

### Findings

- Existing `app.get_landing_metrics_v4` supports reliable seller-admin contribution without using the broader Buyer App portfolio.
- Seller-assistant contribution cannot use the tenant-wide landing metrics snapshot without leaking scope, so scoped assistants use `app.get_buyer_app_dashboard_v4`.
- `app.get_buyer_app_dashboard_v4` is acceptable for an independently loaded Opportunities widget by the `<300 ms` widget budget when warm, but it misses the stricter `<100 ms` aggregate/RPC budget on Wine Yard dev. This should be watched before default rollout and may need a narrower precomputed opportunity snapshot if p95 confirms the same.
- Local browser verification is blocked by existing server/runtime issues outside this P01 diff: Turbopack `next/font/google` resolver error in `next dev --turbo`; `next start` fails with `routesManifest.dataRoutes is not iterable` after a successful `next build`.

### Decisions made

- P01 does not delete old dashboard RPCs, chart components, or `/buyer-app`; it only stops `/pulse` from rendering the old presentation.
- Contribution shows only meaningful cards; access-enabled/no-order metrics are not surfaced as Pulse business outcomes.
- Demand needing operational action is explicitly excluded from Pulse Opportunities.
- No migrations or new aggregate tables were introduced.

### Deferred / explicitly out of scope

- Demand Signals UI and PostHog extraction remain P2/P3.
- `/buyer-app` redirect is deferred until Phase 3 parity, per spec.
- Maturity-adaptive ordering and no-adoption expanded insights remain P4/P5.
- Browser Web Vital traces and warm-return navigation traces need a working local/prod server harness.

### Risks or blockers

- Opportunity source RPC warm timing is 140.233 ms on Wine Yard dev, above the strict aggregate/RPC target. It is independently loaded and below widget target, but this is the main rollout risk.
- Local server issues blocked browser visual/Web Vital evidence despite successful production build and component-level UI tests.
- `specs/` is git-ignored in this repo; this log update must be force-added or otherwise deliberately included in delivery if expected in PR.

### Rollback notes

- Revert the P01 commit to restore `/pulse` to the previous `SellerDashboardClient` bootstrap and remove the new `/api/tenant/pulse/*`, `src/components/seller/pulse/*`, `src/hooks/usePulse.ts`, `src/lib/server/pulse-core.ts`, and `src/types/pulse.ts` files. No database rollback required.

### Recommended next unit

- Unit: `P2A`
- Entry gate satisfied: yes
- Evidence / remaining requirement: P01 surface is implemented and no P2A dependency is blocked. P2A should avoid editing seller Pulse components and focus on buyer/auth/PostHog event and identity audit/instrumentation.

---

## 2026-09-22 17:39 IST — p01-visual-data-refinement — P01

**Status:** complete

**Branch / commit / PR:** `feat/pulse-revised` / commit pending at log-write time / PR update pending

**Objective:** Apply the post-implementation visual correction for P01: remove the newly introduced outer section boxes, reuse archived Pulse/Buyer App KPI and widget/list presentation patterns, restore a four-card KPI strip, and expose outside-Yukti business on the two conversion opportunity groups.

### Completed

- Removed the outer bordered section shells from `/pulse`; section headings are now simple title/supporting-text labels with freshness metadata.
- Swapped contribution cards to the shared `InsightStrip4` / `MetricCard` style used by the archived dashboard KPI strips.
- Swapped opportunity group rendering to the shared `PerformanceCard` + `RankedList` style used by archived dashboard widgets/lists, eliminating the bespoke nested-card/list row treatment.
- Added the fourth KPI footprint card, `Customers with Yukti access`, from existing aggregate/RPC metrics so the strip matches the archived buyer-app four-card format.
- Enriched `Convert interested customers` and `Convert browsers into demand` mapping to show `business outside Yukti` when the opportunity row provides `business_outside_yukti_90d`, with fallbacks to existing snapshot value keys.
- Added migration file `20260922120450_pulse_opportunity_outside_yukti_values.sql` to enrich `app.get_buyer_app_dashboard_v4` preview rows from existing `app.metrics_buyer_snapshot` values. No real remote migration push was run.
- Updated focused tests to cover the four KPI cards, shared presentation behavior, and outside-Yukti opportunity evidence.

### Files and database objects changed

- `src/components/seller/pulse/PulseDashboardClient.tsx`
- `src/lib/server/pulse-core.ts`
- `src/types/pulse.ts`
- `src/tests/pulse-core.test.ts`
- `src/tests/pulse-client.test.tsx`
- `supabase/migrations/20260922120450_pulse_opportunity_outside_yukti_values.sql`
- `specs/Yukti_Pulse-Dashboard_Execution-Log.md`
- Database objects intended by migration: `app.get_buyer_app_dashboard_v4` only, preserving signature/grants and enriching action-row JSON with `business_outside_yukti_90d`.

### Verification and evidence

| Check | Command/evidence | Result |
|---|---|---|
| Focused tests | `pnpm exec vitest run src/tests/pulse-core.test.ts src/tests/pulse-api.test.ts src/tests/pulse-client.test.tsx` | Passed: 3 files, 11 tests |
| Type-check | `npx tsc --noEmit` | Passed |
| UI/skeleton parity | Static diff review: Pulse sections no longer render outer bordered shells; KPI cards use `InsightStrip4`; opportunity cards use `PerformanceCard`/`RankedList`; skeletons mirror the same unboxed section labels and shared-card footprints. | Passed by code review and component tests |
| API/query boundaries | Existing independent hooks/routes unchanged: contribution and opportunities remain separate query/API domains with navigation cache settings. | Preserved |
| Performance contract | Contribution still uses existing aggregate/RPC sources. The opportunity migration enriches rows from `app.metrics_buyer_snapshot`, not request-time raw document aggregation. No `router.refresh()`, no hydration-forced refetch, no PostHog direct reads. | Preserved by static review |
| Migration safety | Migration authored with Supabase CLI-generated timestamp after sandbox telemetry failure required escalated rerun. No `db push`, no production command, and no remote mutation was run. | Passed local workflow; remote validation/push still deferred to an explicitly authorized migration step |

### Findings

- The original P01 UI had correctly isolated data boundaries but introduced a new visual system for cards and row widgets; reusing `InsightStrip4`, `PerformanceCard`, and `RankedList` aligns Pulse with the archived dashboard surfaces.
- The current latest `app.get_buyer_app_dashboard_v4` action rows for `access_enabled_but_never_used` and `used_app_but_no_demand` only carried buyer id/name. Showing outside-Yukti business requires the included RPC migration or an equivalent precomputed source enrichment.
- `metrics_buyer_snapshot` already has the relevant precomputed buyer-level invoice fields, so the enrichment can avoid raw-table aggregation and stay within the Section 2.8 release gate.

### Decisions made

- Reintroduced access footprint as the fourth KPI because the requested archived buyer-app format expects four cards; it is labeled as access/footprint, while conversion/business evidence remains separate.
- Did not start P2A/P2B or add PostHog demand-signal work.
- Did not run a real remote migration push.

### Deferred / explicitly out of scope

- Browser visual/Web Vital traces remain deferred because the earlier P01 local server blockers were not re-tested in this refinement pass.
- Remote migration list/dry-run/push and live RPC explain evidence for the new migration remain deferred until explicit migration validation approval.

### Risks or blockers

- The UI can render outside-Yukti business immediately when supplied by API fixtures/tests, but live data will not include `business_outside_yukti_90d` until the migration is validated and applied to `yukti-dev`.
- The added buyer-snapshot join should remain cheaper than raw aggregation, but live `EXPLAIN` evidence is still needed before migration rollout.

### Rollback notes

- Revert this refinement commit to restore the first P01 presentation. If the migration has been applied remotely, roll back by restoring the prior `app.get_buyer_app_dashboard_v4` definition from `20260830042439_buyer_app_dashboard_v4_fix_adoption_by_group.sql`.

### Recommended next unit

- Unit: `P2A`
- Entry gate satisfied: yes
- Evidence / remaining requirement: P01 remains complete after the visual/data refinement. Before or during P2A, separately validate/apply the included P01 migration on `yukti-dev` if outside-Yukti preview values are required in live dev data.

---

## 2026-09-22 18:52 IST — p01-opportunity-tile-refinement — P01

**Status:** complete

**Branch / commit / PR:** `feat/pulse-revised` / commit pending at log-write time / PR update pending

**Objective:** Refine the P01 Opportunities tiles to remove redundant time/evidence labels, show five scrollable buyers per card, support a paginated Show all slide-over, and show QTD invoice support text under each buyer.

### Completed

- Removed Opportunity tile time indicators (`NOW`, `NOW + QTD`, `NOW + 90D`) from the visible cards.
- Removed the repeated evidence/help text line from each tile and removed per-row `assisted business`/outside-Yukti labels.
- Changed the visible opportunity list body to the archived Buyer App `Products most viewed` pattern: fixed-height `dashboard-vscroll` body with `RankedList`, up to five buyers.
- Added a `Show all` label button below each tile count and removed the old tile CTAs (`Open access management`, `Review enabled customers`, `Review customer access`).
- Added a right-side slide-over backed by `/api/tenant/pulse/opportunities/[id]/buyers`, with cursor pagination and independent query state.
- Changed buyer support text to `₹X · Y invoices` under the buyer name.
- Renamed `Convert browsers into demand` to `Follow up with browsing customers without demand`.
- Updated the local migration file so `app.get_buyer_app_dashboard_v4` preview rows carry QTD invoice value/count from `app.metrics_buyer_period_summary` and keep up to 100 sorted rows for paginated slide-over use. No real remote migration push was run.

### Files and database objects changed

- `src/components/seller/pulse/PulseDashboardClient.tsx`
- `src/hooks/usePulse.ts`
- `src/lib/server/pulse-core.ts`
- `src/types/pulse.ts`
- `app/api/tenant/pulse/opportunities/[id]/buyers/route.ts`
- `src/tests/pulse-core.test.ts`
- `src/tests/pulse-api.test.ts`
- `src/tests/pulse-client.test.tsx`
- `supabase/migrations/20260922120450_pulse_opportunity_outside_yukti_values.sql`
- `specs/Yukti_Pulse-Dashboard_Execution-Log.md`
- Database objects intended by migration: `app.get_buyer_app_dashboard_v4` only, preserving signature/grants and enriching action-row JSON with QTD invoice fields.

### Verification and evidence

| Check | Command/evidence | Result |
|---|---|---|
| Focused tests | `pnpm exec vitest run src/tests/pulse-core.test.ts src/tests/pulse-api.test.ts src/tests/pulse-client.test.tsx --pool=threads` | Passed: 3 files, 12 tests |
| Focused tests, default pool | `pnpm exec vitest run src/tests/pulse-core.test.ts src/tests/pulse-api.test.ts src/tests/pulse-client.test.tsx` | Blocked before import by Vitest fork-worker startup timeout (`[vitest-pool-runner]: Timeout waiting for worker to respond`). Re-run with `--pool=threads` passed. |
| Type-check | `npx tsc --noEmit`; `npx tsc --noEmit --pretty false`; `npx tsc --noEmit --pretty false --incremental false` | Blocked: each run stayed silent for several minutes and had to be interrupted (`SIGINT`) to avoid leaving a compiler process running. No TypeScript diagnostic was emitted. |
| Static hygiene | `git diff --check` | Passed |
| API/query boundaries | New slide-over uses separate `/api/tenant/pulse/opportunities/[id]/buyers` GET and `useInfiniteQuery`; contribution and top-level opportunities queries remain independent. | Preserved |
| Performance contract | Tile previews and slide-over pages are sourced from existing `app.get_buyer_app_dashboard_v4` rows enriched from `metrics_buyer_period_summary`, not request-time raw invoice aggregation. No `router.refresh()` or page-level invalidation added. | Preserved by static review/tests |
| Migration safety | Only migration file edited locally. No `db push`, no production command, no remote mutation. | Passed local workflow; remote validation/push still deferred to explicit approval |

### Findings

- The existing opportunities response could support a server-paginated sheet by paging the sorted row array returned in the RPC payload, while keeping the widget isolated from the contribution cards.
- QTD invoice value/count belongs in the existing aggregate-backed RPC row JSON; the UI should not derive invoice counts from visible rows or raw invoices.
- The default Vitest fork pool was unstable in this session, but the same focused test files passed under the threads pool.
- Full `tsc` did not fail with diagnostics; it hung silently in this session even with incremental disabled.

### Decisions made

- Kept Show all as a text label button in the tile count area, per request, rather than a footer CTA.
- Kept the slide-over paginated with explicit `Load more` instead of automatic infinite loading, so the user controls additional fetches.
- Did not add a new table or remote migration; continued to revise the already-authored P01 migration file.

### Deferred / explicitly out of scope

- Browser visual/Web Vital traces remain deferred because this pass did not restart the previously blocked local server harness.
- Live `yukti-dev` migration dry-run/EXPLAIN/push remains deferred until explicit migration validation approval.
- Full `npx tsc --noEmit` remains unresolved because the command hung without diagnostics in this session.

### Risks or blockers

- Live dev data will not show QTD invoice support text in opportunity previews until the local migration is validated and applied to `yukti-dev`.
- The slide-over can paginate only through rows present in the RPC payload; the migration raises that sorted row payload to 100 rows. A future dedicated paginated RPC would be cleaner if pilot tenants need deeper result sets.
- Full type-check verification is blocked by the local `tsc` hang and should be rerun in CI or a fresh shell before merge.

### Rollback notes

- Revert this refinement commit to restore the previous Opportunities tile layout and remove `/api/tenant/pulse/opportunities/[id]/buyers`. If the migration has been applied remotely, restore the prior `app.get_buyer_app_dashboard_v4` definition from `20260830042439_buyer_app_dashboard_v4_fix_adoption_by_group.sql`.

### Recommended next unit

- Unit: `P2A`
- Entry gate satisfied: yes, with verification caveat
- Evidence / remaining requirement: P01 UI/data refinement is complete and focused tests pass. Before merge or before P2A work depends on this branch, rerun full `npx tsc --noEmit` in a non-hung environment and validate the pending migration against `yukti-dev` if live preview support text is required.

---

## 2026-09-23 07:10 IST — p2a-p2b-behavioral-foundation — P2A and P2B

**Status:** complete

**Branch / commit / PR:** `feat/pulse-revised` / commit pending at log-write time / PR not requested

**Objective:** Implement Phase 2 buyer behavioral event/identity instrumentation and the minimal daily PostHog-to-local Pulse Demand Signals snapshot path, without adding a raw event warehouse or putting PostHog on the Pulse read path.

### Completed

- Added a shared buyer analytics envelope for storefront source/channel, tenant slug/id, buyer id when known, share/campaign attribution, UTM parameters, referrer class, surface, route, and PostHog distinct/session ids.
- Added privacy-safe search query normalization/redaction for buyer catalog searches. Likely emails, phone numbers, GSTINs, address-like values, and too-short strings are not emitted as raw seller-facing query terms.
- Extended current buyer-side captures rather than inventing parallel event names:
  - `$pageview` on buyer routes now carries storefront context.
  - `product_viewed` includes tenant product, brand/category ids, source/channel context, and campaign/share context.
  - `catalog_item_added_to_cart` includes source/channel context and existing cart snapshot fields.
  - `buyer_catalog_search_results_viewed` includes normalized query metadata, result count, result product ids/count, filters/scope, and redaction metadata.
  - `buyer_cart_submit_clicked` and failure events include the same source/channel envelope.
- Propagated browser PostHog distinct/session ids to buyer order/enquiry APIs with `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID`.
- Replaced duplicated server-side order/enquiry PostHog captures with `captureAuthoritativeBuyerDemand`, preserving non-blocking `flush()` behavior while adding document id/value/line product ids/source channel/buyer id/session correlation.
- Added explicit `posthog.reset()` on manual sign-out so shared devices do not leak identity after logout while preserving anonymous-to-authenticated stitching before login.
- Added a bounded Pulse Demand Signals snapshot helper backed by existing `app.metrics_landing_kpi_snapshot` under `page_key='pulse_demand_signals'`, `period_key='today'`; no new table or migration was introduced.
- Added `/api/internal/pulse/demand-signals/extract` as a bearer-protected internal extraction endpoint. It batches tenants, computes a 7-day PostHog projection, and writes a tenant snapshot only after that tenant payload succeeds; failures leave prior snapshots readable.
- Added `/api/tenant/pulse/demand-signals` as the seller read boundary. It reads only `app.get_landing_metrics_v4(page_key='pulse_demand_signals')`, never PostHog.

### Files and database objects changed

- `src/lib/buyer-analytics.ts`
- `src/lib/server/buyer-posthog-events.ts`
- `src/lib/server/pulse-demand-signals.ts`
- `src/components/providers/PostHogRouteCapture.tsx`
- `src/contexts/AuthContext.tsx`
- `src/contexts/BuyerCartContext.tsx`
- `src/hooks/useBuyerMe.ts`
- `src/components/buyer/catalog/BuyerProductDetailClient.tsx`
- `src/components/buyer/catalog/CatalogDiscoveryLanding.tsx`
- `src/components/buyer/catalog/CatalogFilteredBrowse.tsx`
- `src/components/buyer/search/BuyerSearchPageClient.tsx`
- `app/(buyer)/buy/cart/page.tsx`
- `app/api/buyer/estimates/route.ts`
- `app/api/buyer/orders/route.ts`
- `app/api/internal/pulse/demand-signals/extract/route.ts`
- `app/api/tenant/pulse/demand-signals/route.ts`
- `src/tests/buyer-analytics.test.ts`
- `src/tests/pulse-demand-signals.test.ts`
- `src/tests/buyer-cart-context.test.tsx`
- `src/tests/buyer-orders-route.test.ts`
- `specs/Yukti_Pulse-Dashboard_Execution-Log.md`
- Database objects changed: none. Existing snapshot table/RPC only: `app.metrics_landing_kpi_snapshot`, `app.get_landing_metrics_v4`, `app.get_tenant_products_summary`.

### Verification and evidence

| Check | Command/evidence | Result |
|---|---|---|
| Type-check | `npx tsc --noEmit` | Passed. Completed silently in ~5s on the final run. |
| Focused tests | `pnpm exec vitest run src/tests/buyer-analytics.test.ts src/tests/pulse-demand-signals.test.ts src/tests/buyer-cart-context.test.tsx src/tests/buyer-estimates-route.test.ts src/tests/buyer-orders-route.test.ts src/tests/pulse-api.test.ts --pool=threads` | Passed: 6 files, 29 tests. |
| Static hygiene | `git diff --check` | Passed. |
| Data reconciliation | Unit tests assert search PII redaction, storefront attribution envelope, PostHog correlation headers, authoritative demand capture shape, and landing-snapshot card parsing. | Passed. Missing assortment rows carry normalized terms only after privacy checks; server conversion events include document ids, values, line product ids, buyer id, and browser correlation ids. |
| Security/scoping | Snapshot read endpoint uses `getVerifiedClaims`, seller-role guard, and server-side tenant id from JWT. Internal extractor requires `PULSE_DEMAND_SIGNALS_EXTRACT_SECRET` bearer token. Snapshot table read uses existing RLS-backed `get_landing_metrics_v4`; writes use service role only in the internal endpoint. | Passed by static review and focused tests for related Pulse API auth boundaries. No client-supplied tenant id is trusted for seller reads. No production command or mutation was run. |
| UI/loading/visual states | No Pulse UI was added or changed in this unit; Demand Signals UI remains P3. Buyer event wiring preserves existing UI states and does not add route skeletons/pages. | Not applicable for visual parity. |
| Aggregate/query plan | Verified local linked project metadata before every linked query: `supabase/.temp/project-ref = hcpzbnmumbykdqveyjhr`. `EXPLAIN (ANALYZE, BUFFERS)` direct snapshot lookup on `app.metrics_landing_kpi_snapshot` for tenant/page/scope/period. | Uses `metrics_landing_kpi_snapshot_active_uk`; execution 0.146 ms, shared hit=2, planning 1.406 ms. Meets aggregate-read budget. |
| Aggregate/RPC wrapper | `EXPLAIN (ANALYZE, BUFFERS) SELECT app.get_landing_metrics_v4(... page_key='pulse_demand_signals', period='today' ...)` on yukti-dev with dummy tenant id. | Execution 133.995 ms, shared hit=708 read=1. Above strict aggregate target on first wrapper measurement but below widget endpoint budget; direct indexed lookup is 0.146 ms. Keep watching once a real pilot snapshot exists. |
| Widget API/payload | `/api/tenant/pulse/demand-signals` is a separate widget boundary from contribution/opportunities and reads one compact JSON-array snapshot. `src/lib/server/pulse-demand-signals.ts` caps each row list at five display rows before writing. | Static/code verified; no dev server API timing captured in this session. Response shape tested via snapshot parser unit test. |
| Cache/navigation | No Pulse client hook was added in P2B; P3 must attach this endpoint as its own TanStack query boundary. Current seller Pulse contribution/opportunity cache behavior is unchanged. Buyer event changes do not call `router.refresh()` or force full-page refetch. | Static verified. |
| Failure isolation | Extractor updates each tenant independently; a tenant extraction failure pushes a failed result for that tenant and does not delete/update the prior snapshot. Pulse read endpoint never calls PostHog, so extractor or PostHog failures do not block existing P01 contribution/opportunities. | Static verified in endpoint/helper design; failure rows returned by internal extraction response. |
| Web performance | No rendered Pulse UI or route bundle was changed. Snapshot read direct DB evidence is <1 ms; extractor is off the interactive path. Browser LCP/INP/CLS/FCP/TTFB not re-measured because this unit is data capture/read foundation only. | No field p75 available. |
| CSP review | No new analytics origin was added. Existing PostHog host/proxy remains in use; the internal extractor calls the existing `https://us.posthog.com` server-side API. No `script-src`, `connect-src`, `img-src`, unsafe-inline, or eval changes. | Passed by static review. |

### Findings

- The old `specs/posthog-setup-report.md` is stale: it names older `/shop/*` routes and earlier event coverage. Current buyer routes are `/buy/*`, with existing captures across cart/catalog/search/order flows.
- Anonymous buyer pageviews previously waited on auth state and relied on auth-derived tenant context. The new buyer envelope can derive the tenant slug from the storefront host and enrich with `/api/buyer/me` when available.
- Search events previously emitted only query length/result count. P2A now emits privacy-safe normalized query data and result product ids/count needed for Missing Assortment extraction.
- Existing `app.metrics_landing_kpi_snapshot` can represent the bounded ranked-list projection as cards with row arrays and metadata, so no new snapshot table was needed.
- The direct snapshot lookup is extremely fast through the existing expression unique index. The `get_landing_metrics_v4` wrapper has measurable function overhead on the first sampled run; keep direct/index evidence in mind if P3 endpoint p95 needs tuning.

### Decisions made

- Reused current event names and added required properties instead of duplicating a new event namespace.
- Kept PostHog historical/raw detail outside Yukti. Yukti stores only the latest bounded tenant projection in `metrics_landing_kpi_snapshot`.
- Added no migration. The existing landing snapshot JSON-array contract is sufficient for the minimal projection.
- Implemented stock mismatch as an empty snapshot bucket for now. Full current-inventory joining/scoring belongs with P3 validation or a later extractor refinement, not this foundation unit.
- Kept `/api/tenant/buyer-app/posthog/*` untouched because retiring the archived Buyer App analytics page is explicitly after Phase 3 parity.

### Deferred / explicitly out of scope

- Demand Signals seller UI, hooks, skeletons, empty/error/stale states, and row actions remain P3.
- Applying a real scheduled cron configuration was not done; the internal endpoint is ready for scheduling once secrets/deployment policy are confirmed.
- Live PostHog extraction was not run because it requires server-side PostHog credentials and should be scheduled/internal. No real tenant snapshot was written during this session.
- Browser Web Vital traces were not run because no visible Pulse UI changed.
- Stronger conversion-gap and stock-mismatch scoring against confirmed demand/current inventory remains a P3/P2B refinement once pilot event volume exists.

### Risks or blockers

- P3 entry gate is not fully satisfied until at least one fresh pilot tenant snapshot exists in `app.metrics_landing_kpi_snapshot(page_key='pulse_demand_signals')`.
- `get_landing_metrics_v4` wrapper measured 133.995 ms on a dummy cold-ish read, above the strict aggregate/RPC target; direct indexed lookup is 0.146 ms. If P3 widget endpoint p95 misses budget, use a narrow direct snapshot reader rather than the generic landing RPC.
- The extractor endpoint needs `PULSE_DEMAND_SIGNALS_EXTRACT_SECRET`, `POSTHOG_PERSONAL_API_KEY`, and optionally `POSTHOG_PROJECT_ID` in the server environment before use.
- Product interest extraction is thresholded (`unique_count >= 2`) and capped; low-volume tenants may legitimately get empty signal buckets.

### Rollback notes

- Revert this commit to remove the P2A event-envelope/correlation changes, `/api/internal/pulse/demand-signals/extract`, `/api/tenant/pulse/demand-signals`, and the new helpers/tests. No database rollback is required because no migration or remote write was performed.
- If a tenant snapshot has been written by the extractor after deployment and must be hidden, soft-delete only the `app.metrics_landing_kpi_snapshot` rows with `page_key='pulse_demand_signals'`; do not delete raw PostHog data.

### Recommended next unit

- Unit: `P3`
- Entry gate satisfied: no
- Evidence / remaining requirement: P2A/P2B code contract is complete and tests/type-check pass, but P3 requires a fresh pilot snapshot. Run the internal extractor against WineYard/yukti-dev with configured PostHog credentials, confirm `page_key='pulse_demand_signals'` data exists and is fresh, then start P3 UI.

---

## 2026-09-24 08:45 IST — p2a-p2b-posthog-extract-validation — P2A and P2B

**Status:** complete

**Branch / commit / PR:** `feat/pulse-revised` / commit pending at log-write time / PR not requested

**Objective:** Validate the internal Pulse Demand Signals extractor against the configured PostHog project for tenant `d601c35c-1a78-4506-a556-a82118d72893`, review the resulting snapshot shape, and fix extractor access/query compatibility issues found during live dev validation.

### Completed

- Confirmed required local environment variables are present without printing secrets: `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `PULSE_DEMAND_SIGNALS_EXTRACT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_KEY`.
- Fixed middleware access for `/api/internal/pulse/demand-signals/extract` so the route's own bearer-token authorization runs instead of the request being redirected to `/login`.
- Fixed PostHog query request compatibility by sending only `{ query: { kind: 'HogQLQuery', query } }` to `/api/projects/:project/query/`; PostHog rejected the previous top-level `variables` field.
- Added UUID validation for explicit `tenant_id` extraction requests before building tenant-scoped HogQL.
- Ran the extractor locally for tenant `d601c35c-1a78-4506-a556-a82118d72893`; it wrote one fresh `app.metrics_landing_kpi_snapshot` row under `page_key='pulse_demand_signals'`.

### Files and database objects changed

- `middleware.ts`
- `src/tests/auth/middleware.test.ts`
- `app/api/internal/pulse/demand-signals/extract/route.ts`
- `src/lib/server/pulse-demand-signals.ts`
- `src/tests/pulse-demand-signals.test.ts`
- `specs/Yukti_Pulse-Dashboard_Execution-Log.md`
- Database objects changed: none. Existing `app.metrics_landing_kpi_snapshot`, `app.get_landing_metrics_v4`, and `app.get_tenant_products_summary` were used.

### Verification and evidence

| Check | Command/evidence | Result |
|---|---|---|
| Focused tests | `npx vitest run src/tests/pulse-demand-signals.test.ts src/tests/auth/middleware.test.ts` | Passed: 2 files, 57 tests. |
| Type-check | `npx tsc --noEmit` | Passed. |
| Extractor API | `POST /api/internal/pulse/demand-signals/extract` with bearer secret and `{"tenant_id":"d601c35c-1a78-4506-a556-a82118d72893"}` | `attempted: 1`, `updated: 1`, `failed: 0`. |
| Snapshot row | Read `app.metrics_landing_kpi_snapshot` on yukti-dev for tenant/page/period. | Row id `c25989a8-a3a5-4f12-ad79-80c56302fb8f`, `period_start=2026-09-24`, `computed_at=2026-09-24T03:10:06.189+00:00`, three cards present. |
| Seller read model | Called `app.get_landing_metrics_v4` for `page_key='pulse_demand_signals'`, `period_key='today'`, tenant scope. | Returned object with 3 cards from the precomputed snapshot path; no PostHog/raw aggregation on the seller read path. |
| PostHog source sanity | 7-day raw aggregate for the same tenant/window. | `buyer_catalog_search_results_viewed`: 590 events / 37 unique; `product_viewed`: 316 events / 54 unique; `catalog_item_added_to_cart`: none in this window. |
| Event property completeness | PostHog property-presence aggregate for the same tenant/window. | Search events have `result_count` on 590/590 but `normalized_query` and `query_redacted` on 0/590; product views have `tenant_product_id` on 316/316. |

### Snapshot review

- Structure is valid and P3-readable: `cards` is a JSON array with `missing_assortment`, `conversion_gaps`, and `stock_mismatch`; rows are bounded to five display rows where populated.
- `conversion_gaps` is populated with five enriched product rows and product names from Supabase. Top rows include 2mp IP Bullet iLLUMAX STQC CP Plus, 8-Ch NVR CP Plus, 16-Ch NVR 1-SATA CP Plus, 4mp IP iLLUMAX Bullet STQC CP Plus, and 2mp IP iLLUMAX Dome STQC CP Plus.
- `missing_assortment` is empty even though 174 zero-result searches exist, because current stored PostHog search events do not yet include the P2A `normalized_query` / `query_redacted` fields. This is expected before the P2A buyer instrumentation is released and exercised in production.
- `stock_mismatch` remains empty by design from P2A/P2B; inventory/current-stock scoring remains deferred.
- Funnel metadata currently reports `product_views=81`, `cart_adds=0`, and zero search counts in the snapshot. The product-view count is the extractor's thresholded/candidate set, not the raw 316 product-view events. P3 should label this carefully or refine the metric if a raw funnel total is required.

### Findings and decisions

- The PostHog key scope issue is resolved; the successful run proves the key can query PostHog.
- PostHog API shape differs from the initial implementation assumption: top-level `variables` is rejected by the QueryRequest parser. The extractor now avoids that field and uses server-side UUID validation plus string escaping for the bounded tenant/window values.
- The current snapshot is enough to unblock P3 layout/state work, but not enough to validate seller-facing missing-assortment copy because the production event stream has not yet seen the new normalized-query fields.
- No production release or production mutation was performed. The only persistent remote write was the requested yukti-dev snapshot row.

### Deferred / next unit guidance

- Unit: `P3`
- Entry gate satisfied: yes, with data-volume caveat.
- P3 should treat missing-assortment and stock-mismatch empty states as first-class states. Do not assume all three buckets are populated.
- After P2A instrumentation is released and buyers perform searches, rerun the extractor and re-check that `normalized_query`/`query_redacted` property presence rises above zero and missing-assortment can rank zero-result terms.

### Rollback notes

- Revert the middleware/query compatibility commits to restore the previous code state. To hide the dev snapshot only, soft-delete the single `app.metrics_landing_kpi_snapshot` row for `tenant_id='d601c35c-1a78-4506-a556-a82118d72893'`, `page_key='pulse_demand_signals'`, `period_start='2026-09-24'`; do not delete raw PostHog events.

---

## 2026-09-24 09:22 IST — p3-demand-signals-ui — P3

**Status:** complete

**Branch / commit / PR:** `feat/pulse-revised` / commit pending at log-write time / PR not requested

**Objective:** Add the Phase 3 Demand Signals UI to `/pulse` using the local `pulse_demand_signals` snapshot read path, render empty buckets as first-class states, and retire the archived `/buyer-app` analytics page by redirecting it to `/pulse` while preserving `/buyer-app/access`.

### Completed

- Added UI-facing Demand Signal types and `usePulseDemandSignal(kind)` hooks with independent TanStack query keys, explicit navigation cache tiers, and no hydration-forced refetch.
- Added a new **Demand signals** section above the P01 core on `/pulse`, with three equal-priority widgets: Missing assortment, Conversion gaps, and Stock mismatch.
- Rendered conversion-gap rows from the WineYard snapshot shape with product links, intent counts, unique visitor counts, last-seen recency, and `Storefront` source chips.
- Added stable loading, error, empty, stale, and populated footprints for each widget; empty Missing assortment and Stock mismatch states are truthful and action-oriented.
- Updated route/client skeleton parity by adding the Demand Signals section to `PulseDashboardSkeleton`, which backs `app/(seller)/pulse/loading.tsx`.
- Changed `app/(seller)/buyer-app/page.tsx` to authenticate sellers and then redirect to `/pulse`; `/buyer-app/access` remains in place.
- Kept PostHog off the Pulse read path. No new migration, persistence, charting library, raw-table aggregation, or `router.refresh()` was introduced.

### Files and database objects changed

- `app/(seller)/buyer-app/page.tsx`
- `src/components/seller/pulse/PulseDashboardClient.tsx`
- `src/hooks/usePulse.ts`
- `src/lib/server/pulse-demand-signals.ts`
- `src/types/pulse.ts`
- `src/tests/pulse-api.test.ts`
- `src/tests/pulse-client.test.tsx`
- `src/tests/pulse-demand-signals.test.ts`
- `specs/Yukti_Pulse-Dashboard_Execution-Log.md`
- Database objects changed: none. Existing `app.metrics_landing_kpi_snapshot` and `app.get_landing_metrics_v4` only.

### Verification and evidence

| Check | Command/evidence | Result |
|---|---|---|
| Type-check | `npx tsc --noEmit` | Passed. |
| Focused tests | `pnpm exec vitest run src/tests/pulse-demand-signals.test.ts src/tests/pulse-api.test.ts src/tests/pulse-client.test.tsx src/tests/auth/middleware.test.ts --pool=threads` | Passed: 4 files, 72 tests. |
| Static hygiene | `git diff --check` | Passed. |
| Production build | `npm run build` | Passed on second run. First run was interrupted after a long silent compile phase; second run compiled successfully in 2.5 min and generated all pages. `/pulse` built as dynamic, route size 244 B, first load JS 476 kB. |
| Production server smoke | `npm run start -- -p 3007`; `curl -I -sS http://localhost:3007/pulse` | Server started in 1035 ms. `/pulse` returned expected `307` to `/login?next=%2Fpulse` because the route is auth-gated. CSP header remained present; no CSP source changes were made. |
| Data source | Read-only `yukti-dev` snapshot metadata for tenant `d601c35c-1a78-4506-a556-a82118d72893` after verifying `supabase/.temp/project-ref = hcpzbnmumbykdqveyjhr`. | Existing snapshot row `c25989a8-a3a5-4f12-ad79-80c56302fb8f`, tenant `wineyard`, `period_start=2026-09-24`, `computed_at=2026-09-24T03:10:06.189+00:00`, `source_watermark=2026-09-24T03:10:06.189+00:00`, 3 cards, `kpis` payload about 2075 bytes. |
| Aggregate/query plan | `EXPLAIN (ANALYZE, BUFFERS) SELECT app.get_landing_metrics_v4(... page_key='pulse_demand_signals', period_key='today' ...)` on `yukti-dev`. | Result node execution 9.227 ms, shared hit=710, planning 0.064 ms. Under aggregate/RPC read and widget endpoint budgets. |
| Direct snapshot lookup | `EXPLAIN (ANALYZE, BUFFERS)` against `app.metrics_landing_kpi_snapshot` for tenant/page/scope/period. | Uses `metrics_landing_kpi_snapshot_active_uk`; execution 0.143 ms, shared hit=6, planning 1.048 ms. |
| Widget API/payload | `/api/tenant/pulse/demand-signals` remains one compact snapshot API; the UI attaches three independent widget query keys for loading/error/cache state. | Snapshot payload is server-ranked/capped to the three card arrays and currently about 2 KB. Tests cover API response parsing and client isolation. |
| Cache/navigation | Static review: Demand Signal widgets use `NAVIGATION_QUERY_STALE_TIME` / `NAVIGATION_QUERY_GC_TIME`, no `initialDataUpdatedAt: 0`, no full-page `router.refresh()`. | Passed static review and client tests. Warm authenticated browser navigation was not measured in this environment. |
| UI/loading/visual states | Component tests cover populated conversion gaps with empty sibling buckets, all-empty stale copy, demand-signal query failure while P01 core remains visible, and redirect preservation. Skeleton updated through `PulseDashboardSkeleton` and route loading imports the same skeleton. | Passed focused tests. No authenticated browser screenshot captured. |
| Web performance | Production build and server smoke captured; database read paths are within budget. | No field p75 available. Authenticated lab LCP/INP/CLS/FCP/TTFB traces were not captured because the smoke environment had no authenticated seller browser session. |
| CSP review | Production `/pulse` redirect response included CSP. No analytics origin, SDK, `script-src`, `connect-src`, `img-src`, unsafe-inline, or eval changes were made. | Passed static/server-header review. |

### Findings

- The P3 gate is satisfied by the fresh WineYard `pulse_demand_signals` snapshot, but current pilot data only populates `conversion_gaps`; Missing assortment and Stock mismatch must remain empty-state capable.
- Parser freshness previously marked every snapshot stale. P3 now computes staleness from `source_watermark`/`computed_at` with a 36-hour daily-extraction tolerance.
- Three independent widget query keys currently call the same compact local snapshot endpoint. This preserves independent client loading/error/cache states without PostHog or raw aggregation, at the cost of duplicate tiny API reads.
- The first `npm run build` stayed silent in the optimized build phase for several minutes and was interrupted; the second attempt completed successfully.

### Decisions made

- Placed Demand Signals above the P01 contribution/opportunity core so emerging demand is visible without implementing the later P4 maturity-adaptive model.
- Kept Stock mismatch as a truthful empty widget because extractor-side current-inventory scoring remains deferred.
- Redirected only `/buyer-app` to `/pulse`; `/buyer-app/access` stays available for access management.
- Did not add kind-specific API routes in P3 because the existing bounded snapshot payload is compact and already the accepted P2B read contract.

### Deferred / explicitly out of scope

- P4 maturity-adaptive ordering/eligibility remains out of scope.
- P5 useful-without-adoption opportunities remain out of scope.
- Extractor refinement for raw funnel totals, Missing assortment after normalized search events are live, and Stock mismatch current-inventory scoring remains deferred.
- Authenticated browser Web Vital traces and warm-return network evidence still need a browser session/harness.

### Risks or blockers

- Missing assortment will stay empty until released buyer instrumentation emits `normalized_query` / `query_redacted` and enough buyers produce privacy-safe zero-result search volume.
- Stock mismatch will stay empty until extractor scoring joins product interest to current inventory/availability.
- `/pulse` first-load JS is 476 kB in the production build; this session added no charting library, but the existing route bundle should still be watched in a browser trace before pilot default-on.

### Rollback notes

- Revert the P3 commit to remove the Demand Signals section/hook/types/tests, restore `/buyer-app` analytics rendering, and restore parser staleness behavior. No database rollback is required.
- To hide the pilot dev snapshot only, soft-delete the existing `app.metrics_landing_kpi_snapshot` row for `tenant_id='d601c35c-1a78-4506-a556-a82118d72893'`, `page_key='pulse_demand_signals'`, `period_start='2026-09-24'`; do not delete PostHog data.

### Recommended next unit

- Unit: `P5`
- Entry gate satisfied: yes
- Evidence / remaining requirement: P01 and P3 are complete. P5 can reuse existing aggregate-backed customer/opportunity data and should not start P4 until P5 stabilizes.

---

## 2026-09-24 09:48 IST — p3-demand-signals-polish — P3

**Status:** complete

**Branch / commit / PR:** `feat/pulse-revised` / commit pending at log-write time / PR not requested

**Objective:** Apply post-P3 presentation feedback: move Demand Signals after Business captured through Yukti and Opportunities, remove duplicated widget freshness/source labels, and make conversion-gap row copy clearer.

### Completed

- Reordered `/pulse` sections to: Business captured through Yukti → Opportunities → Demand signals.
- Updated route/client skeleton order to match the rendered section order.
- Removed the repeated per-widget populated-state freshness strip; freshness remains at the Demand Signals section header.
- Removed visible `Storefront` labels from Demand Signal widget headers and rows.
- Changed row supporting copy from `intent events` / `visitors` to clearer `customers` and `Last seen ...` language.
- Changed row trailing values to show the actual signal count with labels such as `views`, `searches`, or `interest`.
- Clarified the Conversion gaps widget copy to say it shows the top 5 products buyers viewed or added to cart without matching demand.

### Files and database objects changed

- `src/components/seller/pulse/PulseDashboardClient.tsx`
- `src/tests/pulse-client.test.tsx`
- `specs/Yukti_Pulse-Dashboard_Execution-Log.md`
- Database objects changed: none.

### Verification and evidence

| Check | Command/evidence | Result |
|---|---|---|
| Focused client test | `pnpm exec vitest run src/tests/pulse-client.test.tsx --pool=threads` | Passed: 1 file, 5 tests. |
| Focused P3 suite | `pnpm exec vitest run src/tests/pulse-demand-signals.test.ts src/tests/pulse-api.test.ts src/tests/pulse-client.test.tsx src/tests/auth/middleware.test.ts --pool=threads` | Passed: 4 files, 72 tests. |
| Type-check | `npx tsc --noEmit` | Passed. |
| UI/loading/visual states | Static diff plus client tests assert section order and absence of visible `Storefront`, `intent events`, and `visitors` copy. | Passed. |
| Query/API/performance | No read-path, endpoint, cache, or persistence changes. | Existing P3 evidence remains applicable. |

### Findings

- The card already had section-level freshness, so removing per-widget populated-state freshness reduces duplicate copy without hiding data freshness.

### Decisions made

- Kept the single compact snapshot API and independent widget query keys unchanged.
- Kept `Storefront` out of row/header labels in the current UI polish; source channel remains in the underlying snapshot for future multi-channel display.

### Deferred / explicitly out of scope

- No extractor, database, or PostHog changes.
- No browser/Web Vital rerun because this was copy/order-only and no read path changed.

### Risks or blockers

- None introduced. Existing P3 caveats about Missing assortment and Stock mismatch data availability still apply.

### Rollback notes

- Revert this polish commit to restore the original P3 section order and Demand Signal row labels. No database rollback required.

### Recommended next unit

- Unit: `P5`
- Entry gate satisfied: yes
- Evidence / remaining requirement: P01 and P3 remain complete after polish.

---

## 2026-09-24 10:03 IST — p3-demand-signals-show-all — P3

**Status:** complete

**Branch / commit / PR:** `feat/pulse-revised` / commit pending at log-write time / PR not requested

**Objective:** Add full-count display and Show all slide-overs to each Demand Signals widget, while keeping the basic widget capped to the top five rows with an internal scroll pattern like Opportunities.

### Completed

- Added `signal_counts` to the Demand Signals snapshot/response contract so widgets can show the full bounded snapshot count independently of the visible top-five rows.
- Updated the extractor to preserve up to 25 ranked rows per populated demand-signal bucket in the local snapshot; widgets still render only the top five rows.
- Added Demand Signals `Show all` buttons that open a right-side sheet using the same snapshot-backed rows, with no PostHog or raw-table read on the UI path.
- Wrapped populated widget rows in the existing internal scroll body pattern.
- Added tests proving the basic widget caps at five rows while the sheet exposes the sixth row.

### Files and database objects changed

- `src/components/seller/pulse/PulseDashboardClient.tsx`
- `src/lib/server/pulse-demand-signals.ts`
- `src/types/pulse.ts`
- `src/tests/pulse-client.test.tsx`
- `src/tests/pulse-demand-signals.test.ts`
- `specs/Yukti_Pulse-Dashboard_Execution-Log.md`
- Database objects changed: none. Future extractor runs will write a larger but still bounded snapshot payload.

### Verification and evidence

| Check | Command/evidence | Result |
|---|---|---|
| Focused tests | `pnpm exec vitest run src/tests/pulse-demand-signals.test.ts src/tests/pulse-client.test.tsx --pool=threads` | Passed: 2 files, 10 tests. |
| Focused P3 suite | `pnpm exec vitest run src/tests/pulse-demand-signals.test.ts src/tests/pulse-api.test.ts src/tests/pulse-client.test.tsx src/tests/auth/middleware.test.ts --pool=threads` | Passed: 4 files, 73 tests. |
| Type-check | `npx tsc --noEmit` | Passed. |
| Static hygiene | `git diff --check` | Passed. |
| Query/API/performance | UI still reads only `/api/tenant/pulse/demand-signals`; extractor limits remain bounded at 25 rows per bucket. | No new interactive PostHog/raw-table path introduced. |

### Findings

- Existing snapshots still contain only the rows written by their extraction run. The Show all sheet is full relative to the bounded local snapshot; future extractor runs can now store up to 25 rows per bucket.

### Decisions made

- Did not add per-kind routes because the bounded snapshot remains compact and already provides the data needed for the sheet.
- Kept empty widgets without Show all CTA because there is no full list to inspect.

### Deferred / explicitly out of scope

- No live extractor rerun was performed in this session.
- No database migration or PostHog query shape beyond the bounded limit increase was introduced.

### Risks or blockers

- Current WineYard dev snapshot still needs a rerun to contain more than its already-written five conversion-gap rows.

### Rollback notes

- Revert this follow-up commit to remove the Demand Signals slide-over/count changes and restore the previous top-five-only widget behavior. No database rollback required.

### Recommended next unit

- Unit: `P5`
- Entry gate satisfied: yes
- Evidence / remaining requirement: P01 and P3 remain complete after the Show all follow-up.

---

## 2026-09-25 11:37 IST — p5-useful-without-adoption — P5

**Status:** in_progress

**Branch / commit / PR:** `feat/pulse-revised` / commit pending at log-write time / PR explicitly not requested

**Objective:** Implement the Phase 5 useful-without-adoption presentation slice by making synced customer-history opportunities evidence-backed and actionable, without starting P4 maturity adaptation or adding persistence.

### Completed

- Added opportunity evidence and action metadata to the Pulse opportunity contract so each visible customer opportunity names the business basis and links to an existing action surface.
- Prioritized the two Phase 5 eligible insights inside the existing Opportunities section: `Activate valuable customers` and `High-value customers going quiet`.
- Kept the read path on existing `app.get_buyer_app_dashboard_v4` portfolio data; no new table, migration, raw event store, PostHog read, charting dependency, or `router.refresh()` was introduced.
- Rendered qualifying assisted-business evidence and an access-management action for the activation insight.
- Rendered prior Yukti-demand value and last-demand evidence for the quiet-customer insight when the existing action rows provide `value` and `last_demand_day`.
- Kept existing independent section/query boundaries: Contribution, Opportunities, each Demand Signal query key, and opportunity buyer slide-over pagination remain separate.
- Added focused tests for the P5 evidence/action contract and retained exclusion of `app_demand_needing_operational_action`.

### Files and database objects changed

- `src/types/pulse.ts`
- `src/lib/server/pulse-core.ts`
- `src/components/seller/pulse/PulseDashboardClient.tsx`
- `src/tests/pulse-core.test.ts`
- `src/tests/pulse-client.test.tsx`
- `specs/Yukti_Pulse-Dashboard_Execution-Log.md`
- Database objects changed: none.

### Verification and evidence

| Check | Command/evidence | Result |
|---|---|---|
| Type-check | `npx tsc --noEmit` | Passed. |
| Focused tests | `pnpm exec vitest run src/tests/pulse-core.test.ts src/tests/pulse-api.test.ts src/tests/pulse-client.test.tsx --pool=threads` | Passed: 3 files, 18 tests. The run printed a non-blocking pnpm registry metadata fetch warning before executing tests. |
| Static hygiene | `git diff --check` | Passed. |
| Production build | `npm run build` | Passed. `/pulse` route remains dynamic, route size `244 B`, first load JS `476 kB`. |
| Data reconciliation | Unit tests assert activation evidence from `valuable_assisted_customers_without_access`, quiet-customer evidence from `previously_submitted_app_demand_now_inactive`, preserved customer links, and exclusion of Inbox-owned `app_demand_needing_operational_action`. | Passed. |
| Security/scoping | No client-supplied tenant id added. Opportunities still load through the existing seller-authenticated `/api/tenant/pulse/opportunities` boundary and `loadPulsePortfolio`, preserving seller role checks and existing assistant location-scope behavior in `app.get_buyer_app_dashboard_v4`. | Passed by static review and existing API tests. No production command or mutation. |
| UI/loading/visual states | Opportunity cards now show evidence plus one existing-surface action link. Skeleton structure and route `loading.tsx` are unchanged; card min-height remains stable and rows still use the existing internal scroll body. Client tests cover populated, failure-isolation, stale Demand Signal, and slide-over states. | Passed focused tests. |
| Aggregate/query plan | Verified linked project ref before linked reads: `hcpzbnmumbykdqveyjhr`. `EXPLAIN (ANALYZE, BUFFERS) SELECT app.get_buyer_app_dashboard_v4('d601c35c-1a78-4506-a556-a82118d72893'::uuid, 'seller_admin', NULL::uuid[])` on `yukti-dev`. | Sample 1 execution `932.692 ms`, shared hit `45803`; sample 2 execution `1505.895 ms`, shared hit `45803`. This fails the Section 2.8 individual widget endpoint target `<300 ms` and aggregate/RPC target `<100 ms`. |
| Widget API/payload | Read-only payload metadata for the same existing RPC: `length(body::text)=20263`, `action_count=5`, `source_watermark=2026-09-20T05:44:01.391173+00:00`. | Payload remains bounded and unchanged in shape, but backing RPC duration is not release-ready. |
| Cache/navigation | `usePulseOpportunities` remains `['pulse','opportunities']` with `NAVIGATION_QUERY_STALE_TIME` / `NAVIGATION_QUERY_GC_TIME`; slide-over uses `useInfiniteQuery` with `placeholderData: keepPreviousData`; no full-page invalidation or hydration-forced refetch was added. | Static review passed. Authenticated warm-return browser trace not captured. |
| Web performance | Production build succeeded; `/pulse` bundle unchanged at `244 B` route / `476 kB` first load JS. | No field p75 available. Authenticated lab LCP/INP/CLS/FCP/TTFB not captured in this session. |
| CSP review | No analytics, PostHog, CSP header, `script-src`, `connect-src`, `img-src`, unsafe-inline, or eval changes. | Not applicable. |

### Findings

- Functional P5 presentation can reuse the existing Buyer App v4 action lists, but the current broad portfolio RPC is too slow in live `yukti-dev` samples to satisfy the Pulse release gate.
- The existing local RPC payload can provide the Phase 5 quiet-customer evidence (`value`, `last_demand_day`) when present, so no new persistence is needed for the UI contract.
- Because the existing RPC preserves seller-assistant location scoping, replacing it with a narrower direct app-layer summary read should be done carefully in a follow-up, with explicit assistant-scope reconciliation.

### Decisions made

- Marked P5 `in_progress`, not `complete`, because Section 2.8 performance evidence failed even though functional tests and build passed.
- Did not introduce a new aggregate/snapshot table or migration in this unit.
- Did not start P4 maturity-adaptive ordering; section order remains Business captured through Yukti → Opportunities → Demand signals.
- Did not surface generic top-customer lists, raw sales totals, outstanding/overdue duplication, Inbox queues, reorder predictions, or cross-sell recommendations.

### Deferred / explicitly out of scope

- Narrow opportunity read-model optimization for P5 remains required before completion. Preferred next investigation: derive activation and quiet-customer rows from existing indexed summaries while preserving seller-assistant location scoping, or add the smallest approved aggregate/RPC if existing summaries cannot meet the budget.
- Browser-authenticated warm navigation and Web Vital traces remain uncaptured.
- P4 and P6 remain out of scope.

### Risks or blockers

- P5 cannot be called complete until `/api/tenant/pulse/opportunities` or an equivalent narrower opportunity boundary meets the `<300 ms` widget endpoint budget and preferably the `<100 ms` aggregate-read budget on representative data.
- Current `get_buyer_app_dashboard_v4` samples are significantly slower than the earlier P01 warm sample, so relying on this broad RPC for Pulse opportunities is the main blocker.
- If a narrower direct summary read is implemented, assistant location scoping must not regress.

### Rollback notes

- Revert this P5 commit to remove the opportunity evidence/action fields and restore the prior opportunity ordering/copy. No database rollback required.

### Recommended next unit

- Unit: `P5` continuation, not `P4`
- Entry gate satisfied: no
- Evidence / remaining requirement: Keep P4 blocked until P5 has a performant opportunity read path. The next session should optimize or replace the current opportunity read boundary using existing summaries/RPCs, then rerun focused tests, type-check, production build, query plans, payload/timing evidence, and warm navigation checks.
