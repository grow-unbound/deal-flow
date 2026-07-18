# Metrics V2 Implementation Plan — July 2026

**Status:** In execution. Phase 0 is complete; Phase 0A implementation is complete but its controlled remote performance acceptance is pending.

**Product contract:** [Metrics product strategy](./metrics-product-strategy-proposal-2026-07.md)
**Data architecture:** [Metrics data architecture](./metrics-data-architecture-proposal-2026-07.md)
**Canonical semantics:** [Metrics definitions](./metrics-definitions-2026-07.md)
**Prior performance lessons:** [Performance upgrade](./performance-upgrade-2026-07.md) · [DB change guidance](./db-change-guidance-2026-07.md)
**Reusable phase handoff:** [Metrics phase session prompt](./metrics-v2-phase-session-prompt.md)
**Execution ledger:** [Metrics aggregation execution log](./metrics-v2-execution-log-2026-07.md)

## 1. Execution stance

This is an expand–validate–cut over–retire program, not a big-bang rewrite.

- The application is pre-launch. Do **not** add `df_metrics_v2`, `read_model_version`, tenant routing branches, or UI fallback code solely for this program.
- Current and target reads may run side-by-side only in reconciliation tooling against an isolated hosted Supabase development/staging branch or project. This “shadow” is an offline validation technique, not a runtime application mode.
- Replace each consumer directly after its target surface passes raw-data reconciliation, concurrency testing, and UI acceptance.
- New read models are additive first. Old triggers/tables are retired only after all consumers are proven absent.
- The routine refresh path is a **budgeted dirty-work micro-batch**, not a continuously computing worker.
- Database work is serialized under one coordinator. Independent API/UI/test packages may run in parallel only after their data contract freezes.
- Test data is the primary reconciliation fixture. Synthetic fixtures cover Estimates-only, Orders-only, both-enabled, sparse, large, and multi-location tenants.
- If the application becomes live before Phase 8 completes, stop implementation and add an explicit live-migration/cutover amendment before proceeding; do not quietly introduce a feature flag mid-phase.
- Every phase has a stop/go gate. A failed gate blocks the next phase; it is not converted into a backlog item while rollout continues.

## 2. Global non-negotiable guardrails

### 2.1 Business-write protection

1. Business-row triggers perform only validation and tiny typed dirty-source marking. They perform **zero aggregate queries, tenant loops, HTTP calls, cron scheduling, or snapshot rebuilds**.
2. One interactive mutation must never invoke a function scoped only by `tenant_id` when a buyer/product/document key is available.
3. Bulk sync retains `app.sync_trigger_bypass_active()` and emits one tenant/domain/range dirty marker after a successful phase.
4. Dirty marking uses distributed source keys. No per-write upsert to one hot `(tenant_id, domain)` row.
5. Old and new buyer/product/location/date dependencies are captured as scalar rows. No ID arrays or JSON payload/membership lists.
6. Snapshot upserts use a distinctness predicate; unchanged rows are not rewritten.
7. No new table is added to `supabase_realtime` without a proven client requirement.

Write-path rollout gates:

- zero business-write errors, deadlocks, or metric-attributable timeouts;
- capture-only p95 write-latency regression **≤5%** and p99 regression **≤10%** versus the same seeded baseline;
- no metric-attributable lock wait above **1 second**; dirty marking itself uses no blocking aggregate lock;
- one mutation touches work proportional only to changed dependencies, never total tenant cardinality;
- during the frozen 1,000-virtual-user mixed workload through the normal API/connection pool—not 1,000 direct database connections—plus one active sync, database CPU and connection utilization remain within **baseline +5 percentage points** and never exceed **70% sustained for five minutes**;
- pausing refresh for 15 minutes must not degrade business-write p95 by more than **5%**.

Phase 1A freezes a reproducible initial stress profile before this becomes a blocker: one synthetic tenant with 10,000 buyers, 500 products, 9 locations, 100,000 commercial documents and 250,000 lines; 1,000 virtual users available to a constant-arrival workload capped at 50 API requests/second; two-minute ramp, eight-minute sustain, two-minute ramp-down; 40% landing/detail reads, 30% document header mutations, 15% line/inventory mutations, 10% dashboard/callout reads, and 5% buyer/product mutations; plus one concurrent 25,000-line integration sync through the normal sync path. The database pool is capped at its production setting. Every trial restores the same deterministic data checkpoint before running. Baseline and candidate use the same seed, operation mix, arrival rate, duration, and pool mode, with deterministically equivalent but run-unique request IDs so idempotency does not suppress writes. If pre-V2 baseline CPU is above 65% sustained, rollout stops for capacity/legacy-path remediation because the `+5` and absolute 70% gates cannot both be met.

Phase 1B freezes a separate representative normal-load profile: use twice the measured tenant peak when production history exists; otherwise use 100 virtual users at a constant 10 API requests/second for 30 minutes with the same domain mix and one routine sync. The harness must be able to measure coalesced ingress `I_d` and isolated sustainable completion `C_d` separately for commercial, inventory, Buyer App, setup, and each high-cardinality entity key class once the refresh kernel exists. Phase 4 records the accepted values; every domain/key class must prove `I_d ≤ 0.5C_d`, and an aggregate tenant-wide average cannot hide one slow domain. The 1,000-user profile remains overload safety testing only.

### 2.2 Routine refresh budgets

- one `pg_cron` entry every **60 seconds** invoking one short-lived scheduled function; no resident worker or drain loop;
- a durable global lease spans the claim/compute transaction boundary; global refresh concurrency is **1** on the current tier and metrics use at most one database connection at a time;
- at most one active lease per tenant/domain;
- inspect/claim at most **100 dirty source rows** and refresh at most **100 distinct entity/scope keys** per tick;
- compute at most **25 set-based refresh statements/groups** per tick;
- `lock_timeout = 100ms`, routine `statement_timeout = 3s`, whole tick wall budget **5s**;
- claim transaction commits before computation;
- no recursion, same-tick drain loop, or automatic concurrency increase;
- attempts/backoff are dirty-version scoped; three failures dead-letter only the claimed version and a newer version resets retry ownership;
- active bulk sync for a tenant defers its metric work;
- daily reconciliation is watermark/range bounded and never sweeps every buyer/product.

The claim planner must lease only source rows whose derived refresh-key set fits the same tick's entity/group budget; unused candidates remain pending. Routine refresh, month rollover, age-out, reconciliation, and repair schedules are staggered and acquire the same durable global lease.

Supabase recommends keeping Cron concurrency and duration bounded; this plan is deliberately much stricter than its general ceiling of eight concurrent jobs and ten minutes per job: [Supabase Cron guidance](https://supabase.com/docs/guides/cron).

Freshness and capacity gates:

- define `I` as distinct refresh keys arriving per minute after coalescing, `C` as measured sustainable refresh keys completed per minute under the fixed budgets, and `B` as burst backlog. Normal-load p95 source-to-snapshot freshness **≤2 minutes** applies only inside the declared operating envelope `I ≤ 0.5C`;
- each load run records `I`, `C`, `B`, and predicted drain time `B / (C - I)` while `I < C`; observed drain time must be no worse than **1.25×** that prediction;
- the 1,000-user overload test is a database-safety gate, not a false two-minute-freshness promise. Once overload stops, backlog drains under the measured equation without increasing concurrency; the UI remains explicitly stale meanwhile;
- pending age above **15 minutes** alerts and marks affected UI data stale; it never permits longer queries or more workers;
- expired leases are recoverable and replay is idempotent;
- dead-letter count must be zero before replacing an application consumer with the target read model.

### 2.3 Read/query protection

1. Landing Pulse/subtitle uses one bounded snapshot RPC. It never derives totals from the visible list page.
2. Collapsed callouts are named server queries with indexed filters/sorts and `LIMIT 3`.
3. “See all” reuses the same query with a stable cursor and page size **≤50**; it never loads the complete result set.
4. Transaction Actions never inherit the table's document-date period.
5. Entity Explore runs only on open, requires tenant + entity, caps history at **12 months**, and caps ranked lists at **20**.
6. Every new hot query is verified with `EXPLAIN (ANALYZE, BUFFERS)` on realistic cardinalities. Indexes are added for proven paths only.
7. Every API response returns explicit `as_of`, `commercial_horizon_days`, and `table_period` where relevant.

Initial read gates, measured at database execution and API levels separately:

- landing summary RPC database p95 **≤250ms** and API p95 **≤500ms**;
- collapsed callout database p95 **≤150ms** and API p95 **≤350ms**;
- first table page API p95 **≤500ms** at the agreed page size;
- on-open detail RPC database p95 **≤750ms**, with hard timeout **3s**;
- zero unbounded relational hydration, sequential full-tenant buyer/product aggregation, or temp-file spill in accepted plans.

### 2.4 Storage and semantic protection

- zero buyer-by-day or product-by-day V2 facts;
- zero current stock copied into historical rows;
- zero entity-ID arrays, top-list JSON, or stored callout membership;
- tenant/location daily facts only when a shipped dashboard chart consumes them;
- Invoices are sales truth; Estimate and Order facts remain separate;
- primary demand is resolved centrally from enabled modules: Orders when enabled, otherwise Estimates;
- financial values reconcile to canonical raw data within **₹0.01**; document/entity counts match exactly;
- unavailable/incomplete data is never converted to zero;
- seller-assistant location isolation and cross-tenant RLS tests block rollout.

### 2.5 Migration, rollout, and rollback protection

1. Never edit an applied migration. Create every schema change with `supabase migration new <name>`.
2. Only the main coordinator creates migration files, changes shared metric contracts, and updates the execution ledger.
3. Subagents never run production `supabase db push` or destructive cleanup.
4. Do not add a Metrics V2 PostHog flag or persisted V1/shadow/V2 selector while the app remains pre-launch. Existing module flags continue to gate their modules normally.
5. Keep the database-local **dispatch** kill switch. Dirty capture remains transactionally enabled after validation activation so pausing computation cannot lose invalidations.
6. Application requests never compute current and target aggregates together. Comparison is a bounded reconciliation command or test fixture against an isolated hosted remote development/staging database.
7. Every consumer replacement has a code-revert test against the stable response contract. Every write-path phase has dispatcher-off tests. Capture-off is never a clean rollback: it requires blocking affected mutations or making the target model unavailable until a full affected tenant/domain fixed-window rebuild and reconciliation pass.
8. Destructive retirement occurs in a later migration after the first-customer observation window, usage proof, and backup—not in the cutover migration.

Remote database rules for every phase:

- do not start, require, or gate acceptance on the local Docker Supabase stack;
- use only hosted `yukti-dev` (`euhzgherjvjopjrpoqjr`) for development, rollback validation, persistent development migrations, seeds, integration, functions, and load tests;
- never target `yukti` production (`hcpzbnmumbykdqveyjhr`) during Phases 0–7; a production action requires separate explicit user authorization naming that action, and no prior development approval carries over;
- use the official `SUPABASE_DB_PASSWORD` from `.env.local` without exposing it in output, commands, fixtures, or commits;
- before every `--linked` command, verify and record that the linked ref equals `euhzgherjvjopjrpoqjr`; stop on any mismatch, especially `hcpzbnmumbykdqveyjhr`;
- use rolled-back linked-remote transactions for isolated SQL behavior checks;
- because the main checkout may retain a production link, use a verified temporary Supabase directory/workdir linked to `yukti-dev` rather than running from an unverified checkout;
- never run a linked remote reset, destructive cleanup, or migration repair as part of routine execution.

### 2.6 Landing-period contract

No implementation wave may reintroduce a page-global period selector. The period owner is fixed per surface:

| Landing surface | User control | Fixed Pulse/Action scope | List scope |
| --- | --- | --- | --- |
| Seller Dashboard | None | This-month invoiced sales/flow + trailing-90-day context + NOW posture/Actions | — |
| Estimates | Table toolbar: This month, Today, This week, 90 days, Custom | Fixed This-month created value + NOW open posture/Actions | Selected table period only |
| Sales Orders | Same table toolbar | Fixed This-month created value + NOW open posture/Actions | Selected table period only |
| Invoices | Same table toolbar | Fixed This-month invoiced sales + NOW receivables/Actions | Selected table period only |
| Customers | None | Trailing 90 days + NOW credit/receivables | All active, cursor-paginated |
| Products | None | Trailing-90-day invoiced sales/velocity + NOW stock | All active, cursor-paginated |
| Buyer App | None | Trailing-90-day adoption/contribution + NOW access | — |
| Campaigns | None | Trailing-90-day outcomes + NOW live/expiry | All campaigns; detail is lifetime |
| Customer Groups | None | Current membership + trailing-90-day facts for current members | All current groups |
| Pricelists | None | NOW validity, coverage, pricing posture | All current Pricelists |
| Brands | None | Trailing-90-day invoiced sales + NOW stock | All active Brands |
| Locations | None | Trailing-90-day invoiced sales + NOW demand/receivables/stock | All active Locations |
| Warehouses | None | NOW inventory + explicitly labelled trailing-90-day demand qualification | All Warehouses |
| Categories | None | Trailing-90-day invoiced sales + NOW stock/setup | All Categories |

Transaction toolbar periods change only the paginated list/count. They never alter the fixed headline, current Pulse, Actions, or callouts. Explore controls are card-local only: one lazy bounded 12-month payload may be sliced into 3M/12M/YTD without new snapshot variants.

### 2.7 Shared detail/dashboard component contract

[`Yukti_DesignSystem_R12.md`](../Yukti%20Design%20System/Yukti_DesignSystem_R12.md) is the visual source of truth. Metrics work must normalize the existing detail pages, not add another one-off card style.

| Semantic role | Shared implementation direction | Required reuse |
| --- | --- | --- |
| Analytic detail shell | `PageWrap className="pt-7"` + `DetailHeader` + breadcrumb + identity/status/actions | Customers, Products, Brands, Categories, Locations, Warehouses, Campaigns, Customer Groups, and Pricelists |
| Pulse KPIs | Replace the fixed-name/fixed-count `MetaStrip4`/duplicate stat cards with one adaptive `MetricGrid` and one R12 `MetricCard`; the component supports 1–4 while product surfaces normally render 2–4 | Landing pages, detail pages, Seller Dashboard, Buyer App dashboard |
| Actions | Evolve `V3CalloutPanel` into the shared adaptive action panel; collapsed rows ≤3 and “See all” uses `SeeAllSheet` | Landing Actions and dashboard action queues |
| Explore/performance | `PerformanceCard` is the only outer card shell; shared `MetricGrid`, `RankedList`, `DistributionList`, `TrendFrame`, and `CardEmptyState` bodies cover recurring content | Detail Explore tabs and dashboard Explore cards |
| Tabs | `DetailTabs`, corrected to the R12 Tabs contract | Every analytic entity detail page; transaction document shells are exempt |
| Status/identity | `StatusTag`/status glyph + label and `EntityAvatar` | Headers, lists, callouts, and cards |
| Loading/error/empty | Shared structurally faithful skeletons, dismissible error `Alert`, and section-level `EmptyState` | Every migrated page and its `loading.tsx` |

Component rules are non-negotiable:

1. One semantic component per role. A module may pass data/variants; it may not copy rounded-border-card markup into its page.
2. Dashboard cards reuse `MetricCard`, the shared action panel, and `PerformanceCard` wherever the semantic role matches. Dashboard-specific layout composition is allowed; duplicate card chrome is not.
3. Adaptive density is real: the component supports 1–4 and the KPI grid renders the selected 2, 3, or 4 equal cards with no empty placeholders. Rename or replace APIs that imply exactly four cards.
4. R12 typography/tokens apply: Inter hierarchy, 36px/800 page title, 11px uppercase stat eyebrow, tabular numerals, JetBrains Mono only for copyable codes/pure figures, tight proportional `₹`, 14px card radius, warm hairline border, and no hardcoded off-system type sizes.
5. Copper is accent-only and limited to one terminal CTA per screen. Primary actions are charcoal. Status always has shape glyph + text; colour alone is invalid.
6. Interactive cards/rows receive R12 hover and `scale(0.97)` press feedback plus visible keyboard focus. WCAG 2.1 AA, responsive layouts, and dark-mode token aliases remain mandatory.
7. Every analytic entity detail keeps the exact structural order: breadcrumb → identity/status/actions → adaptive Pulse → tabs → tab content. Estimate, Sales Order, and Invoice details retain their canonical document shell; they do not require this analytic shell, tabs, Pulse, or `PerformanceCard`, and must not duplicate document facts.
8. Every UI package updates its route `loading.tsx` and client skeleton in the same change. The skeleton must match the exact card count, columns, section count, and proportional heights.

Before module UI work begins, freeze these shared prop contracts and add component tests. `DetailHeader` must support real entity avatar kinds rather than presenting operational entities as brands; `DetailTabs` must use R12 copper with `tablist`/`tab` keyboard semantics; fixed-period `PageHeader` must not render an inert selector affordance. Each UI phase includes a desktop visual matrix at 1280px, 1440px, and 1920px for 1/2/3/4 component states, selected 2/3/4 product states, empty/action-present states, loading, error, long-title, and large-value cases. A detail/dashboard implementation that introduces a local `rounded-[14px] border … bg-white` analytics shell fails review unless the shared primitive cannot express a documented semantic need.

## 3. Subagent execution protocol

The main coordinator owns sequencing and acceptance. Subagents receive narrow, non-overlapping work packages.

### Roles

- **Investigator:** locates live/repository definitions, consumers, and tests; makes no edits.
- **DB builder:** owns one CLI-created migration or one bounded SQL function family plus its focused tests.
- **API builder:** owns one frozen response contract and its route/hook tests.
- **UI builder:** owns one module family after the API type freezes; updates matching loading skeletons.
- **Performance/test builder:** owns executable SQL reconciliation, concurrency/load scenarios, and threshold enforcement.
- **Reviewer:** reviews the completed phase diff against correctness, RLS, period, and performance gates; does not implement fixes.

### Coordination rules

- Database migrations are serial. Two agents never edit the same migration, shared response type, shared surface component, or execution log.
- A module wave may use at most three builders in parallel: API, UI, and tests. UI begins only after the response contract is frozen.
- Every package specifies allowed files, forbidden adjacent cleanup, exact tests, and acceptance evidence.
- Standard loop: investigate → coordinator freezes scope → builder → targeted tests → independent reviewer → coordinator acceptance.
- Subagent completion is not phase completion. The coordinator reruns the gates and records evidence.
- If a package crosses more than one shared database contract or more than two module families, split it before delegation.

## 4. Phase 0 — Contract freeze and live database audit

**Entry:** Product strategy, landing period matrix, and architecture approved.

**Work packages**

- Investigator A: compare live `pg_get_functiondef`, triggers, RLS, indexes, Cron jobs, extensions, and migration history with the repository.
- Investigator B: build the complete consumer graph for snapshots/KPI tables across routes, loaders, cohorts, recommendations, and sync functions.
- Investigator C: produce canonical raw expected values for the test tenant and synthetic Estimates-only, Orders-only, both-enabled, multi-location, sparse, and large tenants.
- Coordinator: freeze `metrics-definitions-2026-07.md`, primary-demand resolver, period metadata, target response types, and rollout ledger.
- Coordinator: add a clearly delimited Metrics V2 phase section to `metrics-v2-execution-log-2026-07.md`; every later phase appends evidence there.
- Coordinator: obtain and record the narrow operational-table retention/convention decision; no migration may infer an exception to `AGENTS.md`.

**Exit gate**

- every live/repository difference is recorded;
- every existing snapshot/KPI consumer has `migrate`, `temporarily retain`, or `retire` disposition;
- operational dirty/lease/run-table retention conventions are explicitly approved and reflected in project instructions, or the schema phase is blocked;
- expected results cover status edges, canonical date fallback, source, location, null/zero, and multi-line joins;
- no implementation edits have started.

### Phase 0A — Conditional legacy containment

Run this only if the Phase 0 baseline shows that an existing tenant-wide snapshot trigger, sync rebuild, or event-driven refresh already violates the write/resource gates. Do not stack V2 capture on a failing V1 write path.

- isolate the offending legacy refresh behind a tenant-scoped gate;
- remove it from the interactive transaction or replace it with the smallest bounded existing-family refresh needed to keep V1 correct;
- preserve current V1 response contracts and record any temporary freshness trade-off;
- repeat the identical baseline until the raw write path has at least five percentage points of CPU headroom below the rollout ceiling and no metric-attributable deadlock/timeout.

This is containment, not a partial V2 build. It must be separately reviewable and reversible.

If the required controlled workload harness does not yet exist, **Phase 1A only** may execute while Phase 0A remains provisionally blocked. This is not a Phase 0A bypass: Phase 1B and Phase 2 remain blocked until the identical before/after evidence passes and the execution ledger marks Phase 0A complete.

## 5. Phase 1 — Acceptance harness and operational foundation

### Phase 1A — Remote validation harness and Phase 0A acceptance

**Dependencies:** Phase 0 complete and the Phase 0A requirement/implementation decision recorded.

**Work packages**

- Seed builder: create a deterministic, re-runnable synthetic scale fixture for an isolated hosted Supabase development/staging branch or project; no customer identifiers or production-derived secrets belong in the fixture.
- Performance builder: extend `scripts/perf-smoke.mjs` (or add a focused companion) to cover raw writes, concurrent sync, database/resource sampling, p50/p95/p99, controlled `pg_stat` deltas, and executable pass/fail thresholds.
- Coordinator: record the environment, seed hash, request IDs, arrival profile, pool mode, operation mix, duration, and pre-Phase-0A V1 baseline before applying the candidate migration.
- Reviewer: prove the baseline and candidate runs are identical, test traffic uses the normal API/connection pool, and the harness itself neither bypasses normal write paths nor leaks credentials.

**Remote acceptance sequence**

1. Prefer a disposable hosted Supabase branch/project created at the recorded **pre-Phase-0A Git commit/migration cutoff**. Do not bootstrap the baseline from a checkout that already includes the Phase 0A migration. Seed it deterministically and capture at least three identical V1 runs.
2. Before every linked command, verify that the current project/branch ref is the validation ref recorded in the ledger. Then run `supabase migration list --linked` and `supabase db push --linked --dry-run`; inspect that only the intended pending migration set will apply.
3. Obtain explicit user approval before any persistent remote push. Apply the Phase 0A migration, restore the deterministic data checkpoint before each trial, then rerun the exact workload at least three times with run-unique request IDs.
4. Record p50/p95/p99 latency, CPU and connection-pool utilization, lock waits, errors/deadlocks/timeouts, WAL/rows written, and controlled `pg_stat_user_tables` deltas.
5. Compare the median of the three candidate p95/p99 results with the median of the three baseline results. Phase 0A passes only with zero metric-attributable errors/deadlocks/timeouts in every run, no metric-attributable lock wait above one second, median p95 regression ≤5%, median p99 regression ≤10%, and sustained CPU at least five percentage points below the 70% ceiling in every run. Any individual latency outlier beyond the thresholds requires investigation and a complete rerun; it may not be averaged away. A write must remain proportional to changed dependencies rather than tenant cardinality.
6. Update the execution ledger. Do not start Phase 1B unless every Phase 0A acceptance item is green.

Run this acceptance only on `yukti-dev` (`euhzgherjvjopjrpoqjr`) with isolated fixtures. The production `yukti` project is not a fallback. Local Docker is neither required nor an accepted substitute.

**Exit gate**

- the workload is reproducible and fails its command when any threshold fails;
- the pre-Phase-0A and candidate evidence is recorded from identical remote runs;
- Phase 0A is marked complete in the execution ledger, or execution stops with Phase 1B still blocked.

### Phase 1B — Operational-control contracts and shared UI foundation

**Dependencies:** Phase 1A, plus Phase 0A complete when Phase 0 determined containment was required.

**Work packages**

- DB contract builder: freeze the database-local dispatch-control DDL/RPC contract and executable contract tests without creating the runtime-control objects; Phase 2 owns their additive implementation. Primary demand remains derived from existing module settings.
- Reconciliation builder: extend the executable remote SQL fixtures to compare current and target reads; this remains the only side-by-side current/target read path.
- Performance builder: extend the Phase 1A harness to dashboards, summaries, callouts, and details; add executable `I/C/B` sampling/scenario hooks whose real capacity thresholds run only in Phase 4 after the refresh kernel exists.
- UI investigator: inventory every detail/dashboard outer card shell and map it to the §2.7 semantic roles.
- UI foundation builder: freeze and test adaptive `MetricGrid`/`MetricCard`, shared action panel, R12 `PerformanceCard`, `DetailHeader`, `DetailTabs`, status, empty/error, and skeleton contracts; remove the fixed-four assumption from the shared KPI layer.
- Reviewer: ensure no Metrics V2 flag/version selector was added, module flags retain their existing meaning, and shared primitives match R12.

**Exit gate**

- current metrics data consumers remain unchanged until their direct-replacement gates pass; the shared R12 component refactor is permitted in this phase;
- no `df_metrics_v2`, `read_model_version`, or tenant metrics-routing branch exists;
- SQL tests execute database behavior rather than only inspect migration text;
- the workload seed, arrival profile, operation mix, pool mode, and `I/C/B` instrumentation/scenarios are reproducible; actual refresh completion capacity and `I/C/B` acceptance remain a Phase 4 gate after the Phase 3 kernel exists;
- no runtime-control database object is created in Phase 1B;
- pre-schema baseline results and DB capacity are recorded;
- shared component contracts and 1/2/3/4 component states plus selected 2/3/4 product states pass R12 component, accessibility, and skeleton tests.

## 6. Phase 2 — Additive schema foundation

**Dependencies:** Phase 1A and Phase 1B.

**Serial work packages**

1. Coordinator creates migration with Supabase CLI.
2. DB builder adds typed domain/entity snapshots, `metrics_dirty_work`, refresh state, runtime control, leases, and execution history.
3. DB builder adds only tenant-leading claim/read indexes justified by target queries.
4. Test builder adds RLS, unique-grain, no-array, no-high-cardinality-daily, and cross-tenant assertions.
5. Reviewer checks grants, function security/search paths, FK indexes, Realtime exclusion, timeouts, and write amplification.

No capture triggers, dispatcher, or consumer changes are enabled in this phase.

**Exit gate**

- a fresh disposable hosted Supabase project applies every repository migration from an empty project baseline; alternatively, a fresh branch reconciles every migration after its documented inherited baseline;
- migration list, advisors, RLS, cross-tenant, and schema-contract tests pass;
- new Data API objects have explicit schema exposure/grant checks and RLS remains authoritative;
- all new objects are unused and default off;
- rollback is simply to leave additive objects disabled.

## 7. Phase 3 — Refresh kernel, manual invocation only

**Dependencies:** Phase 2.

**Work packages**

- DB builder A: dirty claim/version/lease/idempotence functions, including the durable global owner token across committed claim and compute calls.
- DB builder B: bounded commercial, inventory, Buyer App, and setup refresh functions.
- DB builder C: sync-completion tenant/domain/range marking while preserving row-trigger bypass.
- DB builder D: retry, dead-letter, reconciliation, freshness, inspection, and kill-switch functions.
- Scheduled-function builder: one short-lived sequential claim → compute → acknowledge tick designed for Cron but invoked manually in this phase; it never drains recursively or opens parallel database work.
- Test builder: concurrent claim, duplicate delivery, old/new dependency moves, month rollover, 30/90/365-day age-out, crash-after-claim, lease expiry during an active compute statement, stale fencing owner, timeout, retry, and replay scenarios.
- Reviewer: prove no function loops all buyers/products for one interactive entity.

Seed dirty work manually and through completed sync jobs. Do not attach interactive capture yet.

**Exit gate**

- global concurrency one and tenant/domain exclusion are enforced across transaction boundaries; lease-row locking plus fencing prevents stale owners from writing snapshots or acknowledging newer claims;
- the documented row/time budgets are executable configuration;
- replay produces identical snapshots and does not rewrite unchanged rows;
- three failures dead-letter; expired leases recover;
- dispatcher can be disabled independently from application reads;
- raw reconciliation passes for the manually seeded scenarios.

## 8. Phase 4 — Capture-only staging validation

**Dependencies:** Phase 3 and passing load harness.

**Work packages**

- Builder A: lightweight statement-level dirty capture for document headers.
- Builder B: line-item/inventory capture with old and new dependencies.
- Builder C: mutation-path audit proving bulk import/sync bypasses per-row capture and marks one bounded range on completion.
- Builder D: enable exactly one 60-second Cron invocation of the short-lived scheduled function in an isolated hosted remote validation environment; it remains disabled in any environment carrying real business writes until the phase gate passes.
- Performance builder: 1,000-session mixed workload, simultaneous dashboard reads, one sync, paused dispatcher, worker crash, and backlog recovery.
- Reviewer: inspect trigger plans, lock statistics, rows touched, write amplification, and kill-switch behavior.

Enable capture and the budgeted dispatcher against the staging dataset. Application consumers remain unchanged; comparisons run only through reconciliation tooling.

**Exit gate**

- every Business-write Protection and Routine Refresh gate in §2 passes;
- one full sync and all interactive mutation types produce no unexplained dirty-key loss;
- capacity measurements and backlog drain behavior satisfy the `I/C/B` gates without increasing concurrency;
- pausing the dispatcher leaves capture intact and raw writes healthy; failure injection proves capture cannot be bypassed while mutations continue without making V2 unavailable and requiring a full affected-domain rebuild.

## 9. Phase 5 — Commercial vertical slice and both dashboards

**Dependencies:** Phase 4 stable through one full sync.

**Work packages**

- DB builder: tenant/location commercial and Buyer App contribution RPCs.
- Reconciliation builder: raw-versus-V2 comparison report with calculation versions and freshness.
- API builder A: Seller Dashboard fixed-period response.
- API builder B: Buyer App dashboard fixed-period response.
- UI builders: dashboard cards/actions only after response types freeze; reuse the §2.7 shared metric, action, and performance primitives.
- Reviewer: invoice-led sales, Estimate/Order primary demand, location scope, ratio watermark consistency, and no global period selector.

**Exit gate**

- counts exact and currency within ₹0.01;
- Estimates-only, Orders-only, and both-enabled cases pass;
- full sync and interactive changes produce no unexplained drift;
- read/query gates pass;
- both dashboard consumers are replaced directly in the implementation branch with no runtime flag/version branch; code revert remains possible while old tables/functions are retained.

## 10. Phase 6 — Landing pages in bounded waves

**Dependencies:** Phase 5 read model stable.

| Wave | Modules | Period requirement |
| --- | --- | --- |
| A | Estimates, Sales Orders, Invoices | Table-toolbar period only; fixed This-month headline; NOW Actions |
| B | Customers, Products, Buyer App | Fixed trailing 90 days + NOW; no landing selector |
| C | Brands, Categories, Locations, Warehouses | Fixed 90 days/NOW; Warehouses has no control |
| D | Campaigns, Customer Groups, Pricelists | Fixed 90 days/lifetime or NOW; no landing selector |

Per wave, delegate non-overlapping API, callout, UI, test, and review packages.

**Exit gate for every wave**

- page-specific period metadata and controls match the product contract;
- Pulse is one bounded snapshot RPC;
- collapsed callouts use indexed `LIMIT 3`; overlay uses stable cursor pagination;
- Actions are independent of transaction table date filters;
- list aggregates never use visible-page math;
- module-disabled, location-isolation, sparse/no-data, and direct code-revert contract tests pass;
- read/query gates pass at synthetic target cardinality;
- a wave may roll back without reverting earlier waves.
- landing KPI, Action, and Explore cards use the §2.7 shared primitives; matching loading skeletons retain structural fidelity.

## 11. Phase 7 — Detail Pulse and Explore

**Dependencies:** Corresponding landing wave complete.

Parallel module families:

- Customers + Products;
- Brands + Categories;
- Locations + Warehouses;
- Campaigns + Customer Groups + Pricelists.

Each package owns one bounded on-open RPC, response type, lazy UI composition using the §2.7 shared primitives, skeleton parity, and tests. Estimate, Order, and Invoice details receive no duplicate KPI/Performance surface.

**Exit gate**

- tenant/entity ID and maximum horizon are mandatory;
- history ≤12 months and top lists ≤20;
- query plan and timeout evidence recorded;
- charts remain dynamically imported;
- card-local 3M/12M/YTD controls only slice the bounded payload;
- no buyer/product daily storage is introduced;
- every migrated analytic entity family uses the common detail shell, adaptive KPI grid, R12 tabs, and `PerformanceCard`; no page-local duplicate outer card shell remains. Transaction document details retain their canonical document shell;
- detail and dashboard visual matrices pass at 1280px/1440px/1920px for variable counts, loading, empty, error, long-title, and large-value states.

## 12. Phase 8 — Pre-launch cutover, observation, and retirement

**Dependencies:** Every selected surface uses the target model and shared R12 components; full-sync, reconciliation, failure, load, build, and visual gates are green.

**Sequence**

1. Reconfirm that no customer is live. If that assumption changed, stop and write a live-migration amendment before continuing.
2. Apply the additive migrations to staging, rebuild target snapshots from canonical raw data, run one full sync, and reconcile every selected metric.
3. With explicit human approval and while customer writes are still blocked, apply the additive migrations to the launch environment, enable transactional capture and the bounded dispatcher, perform the bounded initial backfill, reconcile every selected metric to raw data, and verify domain freshness before application deployment.
4. Merge/deploy the direct consumer replacements together with the target read model. There is no Metrics V2 feature flag or runtime version selector.
5. Before opening customer access, test both rollback paths: (a) a presentation-only artifact that retains the target API/read layer, and (b) a server/data recovery runbook that blocks writes, pauses dispatch, rebuilds every retained legacy read family from canonical raw data in bounded batches, reconciles it, re-enables legacy writers, and only then permits deployment of old server routes.
6. Keep old tables/functions physically present but stop their expensive writers. Prove through query/function telemetry that no application consumer uses them.
7. Open the app to the first customer and run the observation window with dispatch/freshness/load monitoring and daily reconciliation. The database dispatch kill switch remains available.
8. Retire Buyer App ranked JSON and buyer/product daily writers only after the observation gate.
9. Drop obsolete high-cardinality tables in a later CLI-created migration after backup and usage proof.
10. Update `AGENTS.md`, canonical definitions, architecture, execution log, and shared component inventory.

**Rollback**

- before first customer data is accepted: a whole-deployment revert is allowed only while launch-database reconciliation proves the old writers/tables are still current; otherwise use the tested presentation-only artifact or server/data recovery runbook;
- after legacy writers stop: use the presentation-only artifact for UI defects. For target RPC/snapshot/semantic defects, block affected writes and execute the tested server/data recovery runbook before restoring old server routes; never point code at stale legacy tables;
- for database load: pause dispatch with the database kill switch while dirty capture continues;
- if capture itself must be disabled, block affected tenant/module mutations or make target metrics unavailable; complete a full affected tenant/domain fixed-window rebuild and reconciliation before reads resume;
- never reverse production by editing an applied migration;
- if the app becomes live during implementation, this rollback section is insufficient by design: stop and add tenant-safe live cutover controls before proceeding.

## 13. Required evidence ledger

For every phase record:

- commit/migration and exact changed objects;
- investigator/build/reviewer ownership;
- tests and commands run;
- raw reconciliation results;
- `EXPLAIN (ANALYZE, BUFFERS)` evidence for new hot queries;
- p50/p95/p99 API and write latency;
- CPU, connection utilization, lock waits, deadlocks, temp blocks, WAL/snapshot rows written;
- dirty backlog age, tick duration, retries/dead letters, freshness;
- direct code-revert and database dispatch-kill-switch result;
- presentation-only and server/data rollback-runbook evidence before legacy writers stop;
- R12 shared-component reuse, skeleton parity, accessibility, and 1280px/1440px/1920px visual evidence;
- accepted deviations with owner and expiry date.

Without this evidence, a phase is incomplete even when its UI appears correct.
