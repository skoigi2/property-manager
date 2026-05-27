#!/usr/bin/env bash
# Stop hook: nudges agents to open a PR before ending the session.
#
# Backstory: production deploys ship from `main`. Pushing a `claude/*` branch
# does NOT trigger a deploy. This repo has had multiple instances of features
# (Inbox, Setup Progress, Portal v2, landing-page rewrite, move-out flow)
# stranded for weeks because the agent that built them pushed the branch but
# never opened a PR. CLAUDE.md "Delivery Workflow (READ FIRST)" documents the
# rule — this hook enforces it.
#
# When the agent tries to stop with commits ahead of the default branch and no
# open PR, we return `{"decision":"block","reason":...}`. That tells the model
# to take one more turn and address the gap (either open the PR, or explain
# why one shouldn't be opened — the user can then stop intentionally).
#
# Bails silently (exit 0) when:
#   - Not in a git repo
#   - On main/master itself
#   - No commits ahead of origin/<default>
#   - An open PR already exists for the branch
#   - `gh` isn't authenticated / installed (best-effort, not a hard gate)

set -u

# Not in a git repo → nothing to nag about.
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Detached HEAD → can't open a PR anyway, skip.
branch=$(git symbolic-ref --short HEAD 2>/dev/null) || exit 0
[ -z "$branch" ] && exit 0

# Already on the default branch — nothing to PR.
case "$branch" in main|master) exit 0 ;; esac

# Resolve the default branch (origin/HEAD points at it).
default=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
[ -z "$default" ] && default=main

# Count commits ahead of origin/<default>. If origin/<default> doesn't exist
# (fresh repo) or the rev-list fails for any other reason, bail.
ahead=$(git rev-list --count "origin/$default..HEAD" 2>/dev/null || echo "")
[ -z "$ahead" ] || [ "$ahead" -eq 0 ] && exit 0

# Look for an open PR for this branch. If `gh` isn't installed/authenticated,
# err on the side of NOT blocking (avoid being a blocker for fresh clones).
if ! command -v gh >/dev/null 2>&1; then
  exit 0
fi
pr_count=$(gh pr list --head "$branch" --state open --json number --jq 'length' 2>/dev/null || echo "")
# Empty/error → don't block. PR exists → don't block.
[ -z "$pr_count" ] && exit 0
[ "$pr_count" -gt 0 ] && exit 0

# Commits exist + no PR. Block the stop and tell the agent why.
# Output must be a single line of JSON parseable by Claude Code.
printf '{"decision":"block","reason":"This branch has %s commit(s) ahead of %s but no open PR. Pushing alone does not trigger a deploy — open a PR with: gh pr create --base %s --head %s --title \"...\" --body \"...\" (see CLAUDE.md Delivery Workflow). If you intentionally do not want a PR yet (work-in-progress, exploratory commits), say so and stop again."}' \
  "$ahead" "$default" "$default" "$branch"
