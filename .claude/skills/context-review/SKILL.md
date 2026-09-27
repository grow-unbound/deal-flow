---
name: context-review
description: Apply the user-approved proposals in docs/context-inbox.md to CLAUDE.md, docs/architecture.md, .claude/rules/, specs/INDEX.md, or memory, then lint budgets. Only run when the user asks.
disable-model-invocation: true
---
1. Read `docs/context-inbox.md`. Only items marked `[x] accept` are applied; `[ ]` items stay; `[-] reject` items move to the Rejected log with the user's reason (rejections are signal — don't re-propose).
2. Apply each accepted item exactly as written. If the target rule would exceed its budget, tell the user and propose what to trim instead of silently exceeding.
3. Run `bash scripts/context-lint.sh`; fix budget failures.
4. Commit on a branch (`chore/context-<date>`) with one line per applied item; open a PR. Never push to main.
5. Move applied items to the Applied log in the inbox.
