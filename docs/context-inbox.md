# Context inbox

Proposals from `/wrap` for the core instruction files. Nothing here is loaded automatically. Review, mark, then run `/context-review`.

Mark each item: `[x] accept` · `[ ]` pending · `[-] reject — <reason>`.

Item format:
```
### YYYY-MM-DD <session/branch> — <one-line title>
- [ ] target: <file>   change: add|edit|remove|move
- text: <exact text>
- why: <reason + evidence (file:line, command, wasted turns)>
- cost: <lines/tokens; always-loaded | path-scoped>
```

## Pending

### 2026-09-28 feat/inbox-ui-polish — stage by explicit path in a shared checkout
- [ ] target: CLAUDE.md (Workflow)   change: add
- text: `Other sessions may leave uncommitted edits in the same checkout: stage by explicit path (never git add src/ or -A), and check git show --stat after committing.`
- why: `git add src` swept another session's uncommitted auth/buyer-access files into a commit this session; undone with a soft reset before push.
- cost: 1 line, always-loaded

### 2026-09-28 feat/inbox-ui-polish — entry metadata is a snapshot; nightly refresh failure is silent
- [ ] target: MEMORY.md (project)   change: add
- text: `Inbox entries (app.entries.metadata, e.g. credit_limit_breach outstanding/over_limit) are snapshots written by the nightly refresh (pg_cron job inbox-entries-daily-refresh); detail views recompute live. On dev the job failed 2026-09-24..28 (entries_tenant_external_ref_uk vs soft-deleted rows), fixed by migration 20260928072642 (dev only). Prod not checked: verify cron.job_run_details for the job before trusting prod entry numbers.`
- why: mismatched over-limit numbers traced to a job that failed every night with no alerting; wasted several queries to find.
- cost: ~3 lines in MEMORY index + one memory file; on-demand

### 2026-10-01 feat/existing-buyer-access-request — migration history drift: prod lacks inbox fixes; develop has 4 red tests
- [ ] target: MEMORY.md (project)   change: add
- text: `Migration history drift (checked 2026-10-01): 20260928042731 (sync_entry_from_buyer NULL-guard) and 20260928072642 are unrecorded on dev AND prod; dev's function already has the guard (applied out-of-band), prod does not -> nightly cron inbox-entries-daily-refresh created ~12.3k bogus approval entries on tenant d601c35c (09-27..09-30). db push to dev needs --include-all. Also develop has 4 pre-existing red test files (buyer-access.test.ts, buyer-idle-refetch, catalog-discovery-landing-streaming, sales-orders-landing-page): compare against a stash before blaming a diff.`
- why: cost two queries + a stash run to establish; prod entries are user-visible noise until the migration is applied (needs explicit prod authorization).
- cost: ~3 lines MEMORY index + one memory file; on-demand

## Applied log
### 2026-10-09 ops/prod-guard-w1 — one session approval covers a named set of read-only prod query classes
- [x] applied 2026-10-09 — target: CLAUDE.md (Prod safety)   change: edit (same line, no new line)
- text: replace the sentence "Prod **reads** (...): ask once per session, naming the project and what you'll look at; a yes covers read-only queries for that session, not writes." with: `Prod **reads**: ask once per session (name the project); that one yes covers every read in these classes without per-query asks: SELECT and EXPLAIN [ANALYZE] of a SELECT, catalog / pg_stat* / cron.* / migration-history lookups, pg_get_functiondef, query_logs, get_advisors, list_*. Conditions: bounded output (LIMIT/count first), set statement_timeout <= 20 s, never read secrets (vault.decrypted_secrets, tokens) or PII row dumps, check health first if a stall is suspected and stop reading if the instance saturates. Anything else (DO/anonymous blocks, functions with side effects, DML/DDL, nextval, cron.alter_job, config, --linked, db push) is a write.`
- why: 2026-10-07/08 prod incident sessions needed dozens of read-only prod queries (triage, log mining, EXPLAIN); per-query/per-topic approvals were friction for the user ("a headache"); user asked for a single approval for query types, writes stay explicit every time. DO blocks excluded because they can write even when meant to roll back.
- cost: 0 net lines (rewrites the same bullet), always-loaded; prod-db-health skill updated to match

### 2026-10-09 ops/prod-guard-w1 — stale memory index line: v4 metrics now have frontend readers
- [x] applied 2026-10-09 — target: MEMORY.md (project)   change: edit
- text: line 1 "v4 backend is live but no frontend reads it" -> `v4 backend is live; 16 seller API routes call get_landing_metrics_v4 (frontend wired); d601c35c is the LIVE tenant; queue has an unresolved wall-budget-timeout bug (see oct7_prod_stall_and_decisions.md).`
- why: git grep over app/ + src/ + prod edge logs (Oct 2-8) show 164-343 get_landing_metrics_v4 calls/day; the stale line misled the first W2 audit (greps missed src/ and nearly reported "no readers").
- cost: 0 lines, on-demand

## Rejected log
