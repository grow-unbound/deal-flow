#!/bin/bash
# PostToolUse(Bash): after a PR is opened, remind to run /wrap if it hasn't been run.
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[[ "$cmd" == *"gh pr create"* ]] || exit 0
jq -n '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:"PR opened. If /wrap has not run this session, run it now: verify gate + fresh-context review + context-update proposals."}}'
exit 0
