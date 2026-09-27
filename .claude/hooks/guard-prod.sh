#!/bin/bash
# PreToolUse: force a permission prompt for anything that could hit the production Supabase project.
# CLAUDE.md forbids prod actions without explicit user authorization; this makes that enforceable.
# No jq dependency: the hook must not fail open.
PROD_REF="cckmurgapnkytbzxqesp"
DEV_REF="hcpzbnmumbykdqveyjhr"
input=$(cat)

ask() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

# 1) Anything naming the prod ref (Bash args, MCP project_id).
case "$input" in *"$PROD_REF"*) ask "Targets production Supabase ($PROD_REF). CLAUDE.md requires explicit user authorization naming this exact action." ;; esac

# 2) Supabase CLI commands that act on the *linked* project without naming a ref.
if echo "$input" | grep -Eq '"command"[^}]*supabase[^}]*(--linked|db push|migration repair|db reset|functions deploy|secrets set)'; then
  workdir=$(echo "$input" | grep -oE -- '--workdir[ =][^ "\\]+' | head -1 | sed -E 's/--workdir[ =]//')
  root="${workdir:-${CLAUDE_PROJECT_DIR:-.}}"
  ref_file="$root/supabase/.temp/project-ref"
  linked=$(cat "$ref_file" 2>/dev/null | tr -d '[:space:]')
  [ "$linked" = "$DEV_REF" ] || ask "Supabase CLI command acts on the linked project, but the linked ref is '${linked:-unknown}', not dev ($DEV_REF). CLAUDE.md: stop on mismatch; prod needs explicit user authorization."
fi
exit 0
