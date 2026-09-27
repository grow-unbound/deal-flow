#!/usr/bin/env bash
# Budget check for always-loaded context. ~4 chars/token estimate.
cd "$(git rev-parse --show-toplevel)"
fail=0
check(){ f="$1"; max="$2"; [ -f "$f" ] || return; l=$(wc -l <"$f" | tr -d ' '); t=$(( $(wc -c <"$f") / 4 )); s=ok; [ "$l" -gt "$max" ] && { s="OVER (max $max lines)"; fail=1; }; printf "%-34s %4s lines  ~%5s tok  %s\n" "$f" "$l" "$t" "$s"; }
check CLAUDE.md 100
check AGENTS.md 10
for f in .claude/rules/*.md docs/architecture.md; do check "$f" 150; done
[ -f .claude/CLAUDE.md ] && { echo "DUPLICATE: .claude/CLAUDE.md exists — keep only the root CLAUDE.md"; fail=1; }
echo "always-loaded est: ~$(( ($(wc -c <CLAUDE.md) + $(wc -c <AGENTS.md)) / 4 )) tok (+ unscoped rules)"
exit $fail
