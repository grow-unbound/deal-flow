---
name: wrap
description: End-of-session wrap-up — verify gate, fresh-context diff review, and context-update proposals for the core instruction files. Run before opening a PR or ending a session.
---
Run in order. Keep total output under ~40 lines.

1. **Scope.** `git status -sb`; base = the PR base branch (default `origin/main`, or the branch this was cut from). Note untracked/uncommitted files.
2. **Verify gate.** `scripts/verify.sh <base>`. On failure, stop and fix; do not proceed to review.
3. **Review.** Spawn the `wrap-reviewer` subagent (fresh context, Sonnet) with base ref and the verify result. Show its findings verbatim. Fix 🔴 items or state why not.
4. **Completeness check** (you, brief): every requirement of the task covered? tests for new logic? `loading.tsx` for new pages? flag gating? migration applied only to dev? Anything left TODO → list it.
5. **Context proposals.** Ask: did this session learn something durable that the core files don't already say — a rule that prevented/caused a bug, a wrong or stale line in `CLAUDE.md`/`docs/architecture.md`/`.claude/rules/`/`specs/INDEX.md`, a repeated wasted step, an incident fact for MEMORY.md? Rules:
   - ≤3 proposals; skip if none — "none" is a fine answer.
   - Only durable, non-derivable-from-code facts. Not task narration, not things `codegraph`/git already show.
   - Prefer edit/delete/move over add. Net budget: CLAUDE.md ≤100 lines.
   - Each proposal: `target file` · `exact text to add/change/remove` · `why` (evidence: file:line, failing command, wasted turns) · `cost` (lines/tokens; or "always-loaded" vs "path-scoped").
   Append them to `docs/context-inbox.md` under a dated heading (format in that file) and print them. Do **not** edit the target files.
6. **Usage note (optional).** If the session was long/costly, one line: `python3 scripts/session-usage.py` output delta or a hygiene note.
7. Report: verify ✅/❌ · findings count · proposals count → then stop.
