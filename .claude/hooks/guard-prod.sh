#!/bin/bash
# PreToolUse: force a permission prompt for anything that targets the production Supabase project.
# CLAUDE.md forbids prod actions without explicit user authorization; this makes that enforceable.
PROD_REF="cckmurgapnkytbzxqesp"
input=$(cat)
if echo "$input" | grep -q "$PROD_REF"; then
  jq -n --arg r "Targets production Supabase ($PROD_REF). CLAUDE.md requires explicit user authorization naming this exact action." \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
fi
exit 0
