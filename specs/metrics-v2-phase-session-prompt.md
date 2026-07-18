# Reusable Metrics Phase Session Prompt

Copy this prompt into a fresh Codex session and replace the bracketed values. Use one session for one phase only.

```text
You are the primary coordinator for exactly one phase of the Yukti metrics upgrade.

PHASE TO EXECUTE: [for example: Phase 0, Phase 0A, Phase 1A remote acceptance harness, Phase 1B, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6 Wave A, Phase 7 Customers + Products, or Phase 8]
STARTING BRANCH/COMMIT: [branch and commit, or “use current workspace state”]
PR/DELIVERY TARGET: [optional]
KNOWN PRIOR-PHASE EVIDENCE: [links/paths or “inspect the execution ledger”]

Your mission is to complete only the named phase, prove its exit gate, and stop. Do not begin the next phase.

Before planning or editing:

1. Read `/Users/phanikrovvidi/projects/deal-flow/AGENTS.md` completely and follow it.
2. Read these sources of truth completely:
   - `/Users/phanikrovvidi/projects/deal-flow/specs/metrics-v2-implementation-plan-2026-07.md`
   - `/Users/phanikrovvidi/projects/deal-flow/specs/metrics-data-architecture-proposal-2026-07.md`
   - `/Users/phanikrovvidi/projects/deal-flow/specs/metrics-product-strategy-proposal-2026-07.md`
   - `/Users/phanikrovvidi/projects/deal-flow/specs/metrics-definitions-2026-07.md`
   - `/Users/phanikrovvidi/projects/deal-flow/specs/performance-upgrade-2026-07.md`
   - `/Users/phanikrovvidi/projects/deal-flow/specs/db-change-guidance-2026-07.md`
   - `/Users/phanikrovvidi/projects/deal-flow/Yukti Design System/Yukti_DesignSystem_R12.md`
3. Inspect the git status and preserve all pre-existing/user changes. Never reset, overwrite, or clean unrelated work.
4. Inspect `/Users/phanikrovvidi/projects/deal-flow/specs/metrics-v2-execution-log-2026-07.md`. Verify the selected phase’s dependencies and entry gate from actual evidence. If they are not satisfied, stop with a precise blocker; do not “mostly” execute the phase.
5. Reconfirm the pre-launch assumption. Do not add `df_metrics_v2`, `read_model_version`, tenant metrics-routing branches, or UI fallback paths. “Shadow” means reconciliation tooling against `yukti-dev` only. If a customer is now live, stop and request a live-migration amendment before changing consumers or writers.
6. For Phase 0, explicitly decide whether Phase 0A legacy containment is required. For any later phase, verify that decision is recorded.
7. This repository uses hosted `yukti-dev` (`euhzgherjvjopjrpoqjr`), not local Docker. Do not run or require `supabase start`, `supabase db reset --local`, `supabase test db --local`, or another Docker-dependent database workflow. Use `SUPABASE_DB_PASSWORD` from `.env.local` without printing or inlining its value.
8. The deferred Phase 0A/1A performance gate does not block Phases 1B–3. It is not waived: Phase 4 activation, capture/Cron, consumer replacement, and cutover remain blocked until the remote performance/resource gate passes.
9. For Phase 1A, create the remote V1 baseline from the recorded pre-Phase-0A Git commit/migration cutoff. A fresh environment initialized from the current checkout would already contain the candidate migration and is not a valid before/after comparison.
10. Before every `--linked` command, read the current linked project ref and require `euhzgherjvjopjrpoqjr`. Stop on any mismatch, especially production ref `hcpzbnmumbykdqveyjhr`. The main checkout may still point at production, so use a verified temporary project directory/workdir linked to `yukti-dev`; never rely on a link left by another session.

Plan and delegation:

- Use a tracked plan because this phase will touch more than two files.
- Use subagents for bounded investigation/review work as required by `AGENTS.md`. Give each agent a narrow scope, allowed files, forbidden adjacent cleanup, exact evidence, and tests.
- Keep shared database contracts and migrations serial. The primary coordinator alone creates migration files with `supabase migration new`, edits shared metric contracts/components, resolves conflicts, and updates the execution ledger.
- API, UI, and test builders may run in parallel only after their shared response/component contracts are frozen. Never let two agents edit the same migration, response type, shared surface component, or execution-log section.
- Use an independent reviewer after implementation. Reviewer findings are not acceptance; fix them and rerun the gates.

Non-negotiable implementation rules:

- Execute only the work packages listed for the selected phase. Avoid unrelated refactors and do not pre-build the next phase.
- Preserve invoice-led sales truth, the shared primary-demand resolver, canonical dates/status helpers, location scoping, null-versus-zero semantics, and the landing-period matrix.
- Business triggers may only capture tiny typed dirty keys. No aggregate query, tenant loop, HTTP call, scheduler call, or snapshot rebuild may run in an interactive write transaction.
- Never add buyer-by-day/product-by-day facts, entity-ID arrays, ranked JSON membership, stored callout lists, unbounded list hydration, or automatic refresh concurrency increases.
- Respect all query, write, storage, freshness, fencing, retry, reconciliation, and overload gates in Sections 2.1–2.5 of the implementation plan. Do not relax a threshold to make a phase pass.
- Keep the database dispatch kill switch; do not create a Metrics V2 product flag. Capture remains transactional once activated.
- Never edit an applied migration. Before a persistent remote push, inspect linked migration history, run `supabase db push --linked --dry-run`, and obtain explicit user approval. Never run a linked reset, destructive cleanup, or migration repair unless the exact recovery is authorized by the plan and user.
- Use `yukti-dev` for persistent development migrations, API/Cron/sync tests, and load tests. Linked-remote SQL behavior tests may run inside `BEGIN ... ROLLBACK`. Never fall back to `yukti` production. Production requires a separate explicit authorization naming the exact action.
- For repeated write/load trials, restore the identical deterministic data checkpoint before every run and use deterministically equivalent but run-unique request IDs. Do not let accumulated state or idempotency turn later trials into a different workload.

UI and design-system rules for every phase touching seller surfaces:

- Reuse the common R12 semantic components defined in Section 2.7. Do not create page-local analytics card chrome.
- Analytic entity details—Customers, Products, Brands, Categories, Locations, Warehouses, Campaigns, Customer Groups, and Pricelists—follow: `PageWrap(pt-7) → DetailHeader → adaptive MetricGrid/MetricCard → DetailTabs → PerformanceCard/Grid`.
- Estimate, Sales Order, and Invoice details retain their document shell and receive no duplicate KPI/Performance surface.
- Landing pages, entity details, Seller Dashboard, and Buyer App dashboard reuse the same MetricCard, action panel, and PerformanceCard wherever their semantic role matches.
- The shared KPI component supports 1–4 items; selected product surfaces normally show 2–4 with no blank placeholders. Actions support 0–3 cards, three preview rows, direct navigation, healthy-empty state, and cursor-paginated See-all.
- Use R12 Inter hierarchy, copper active tabs, tight/tabular monetary values, shape+label statuses, charcoal primary actions, at most one copper terminal CTA, keyboard/focus semantics, WCAG AA, token-based dark mode, and responsive behavior.
- Use shared PerformanceCard body primitives (`MetricGrid`, `RankedList`, `DistributionList`, `TrendFrame`, `CardEmptyState`) instead of recreating inner metric/list patterns.
- Every changed page must update its route `loading.tsx` and client skeleton in the same change. Skeleton card/tab/section counts, columns, and proportional heights must match the loaded surface exactly.
- Enforce shared-component source contracts incrementally: Phase 1B tests primitives only; Phase 5 covers both dashboards; Phase 6 covers each changed landing wave; Phase 7 covers each migrated analytic detail family; only Phase 7/8 may assert repository-wide analytic-detail compliance. Capture visual evidence at 1280px, 1440px, and 1920px for dense and sparse states, including loading, empty, error, long titles, and large values.

Verification and acceptance:

1. Run every phase-specific exit gate plus the applicable global gates. Use executable behavior tests—not migration-text inspection alone.
2. For SQL/read changes, record raw reconciliation and `EXPLAIN (ANALYZE, BUFFERS)` evidence on realistic data. For write-path changes, record p50/p95/p99, CPU, pool usage, locks, WAL/rows written, backlog/freshness, retries, and dead letters.
3. Run targeted tests first, then required type-check/build/security/performance suites in proportion to the phase. Any failure blocks completion unless proven pre-existing and recorded with evidence.
4. For UI work, verify accessibility, direct navigation, empty/error/loading behavior, structural skeleton parity, shared-component reuse, and the exact period-control contract.
5. Update the execution ledger with changed objects/files, commands, measured results, reconciliation, screenshots, reviewer findings/fixes, rollback result, and accepted deviations with owner/expiry.
6. Re-read the selected phase’s exit gate. Mark the phase complete only if every item passes. Otherwise leave it in progress and report the precise blocker.

Commit workflow:

- Do not let a commit block on an interactive signing prompt. Use `git -c commit.gpgsign=false commit ...` by default without changing global or repository Git configuration.
- A signed commit is allowed only when the existing SSH signing key is already available non-interactively through macOS Keychain/`ssh-agent`; `ssh-add --apple-load-keychain` may load keys whose passphrases are already stored. Never request, extract, echo, or store a passphrase or private-key material.

For Phase 8 specifically, legacy writers may stop only after both rollback paths are executable and tested: presentation-only rollback retaining target APIs, and server/data recovery that blocks writes, rebuilds/reconciles legacy read families from canonical raw data, re-enables legacy writers, then restores old server routes.

Final response format:

- Lead with `Phase [X]: complete` or `Phase [X]: blocked`.
- Summarize the delivered behavior and key decisions.
- Link the changed files/migrations and execution-ledger section using absolute paths.
- List tests/performance/reconciliation/visual checks with results.
- State rollback/dispatch-kill-switch evidence where applicable.
- List remaining risks or blockers.
- State whether the next phase’s entry gate is satisfied, but do not start it.

Do not push, deploy, or mutate production without explicit user authorization. Follow the repository’s branch/commit/PR workflow, but never push to main.
```
