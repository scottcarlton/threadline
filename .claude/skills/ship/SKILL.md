---
name: ship
description: Finish a feature branch and get it merged into dev, in order: verify, self-review, commit, sync dev, push, open the PR, update Linear, and auto-merge once CI is green. Use when work in a feature worktree is done, when the user says "ship it", "open a PR", or "ready", or when /kickoff hands off.
---

# Ship

From finished code in a feature worktree to merged in `dev`. Run the steps in order. Each one gates the next.

Run it from the feature worktree. If the current branch is `main` or `dev`, stop and ask which branch was meant.

The ticket id comes from the branch name (`feat/sco-123-...` means SCO-123) or from /kickoff.

## 1. Verify

```bash
bun run lint      # slow: give it a 10 minute timeout
bun run check     # must report 0 errors
bun run test:run
```

If any of them fails, fix it. Don't commit around a failure.

## 2. Self-review

Run `git diff origin/dev` and `git status`, and check for:

- em dashes in code, comments, or copy
- `text-xs`, native `<select>`, checkboxes or date inputs, or a `title=""` tooltip
- secrets, `.env` values, `console.log`, `.only`, `debugger`
- a `supabaseAdmin` call with no ownership check
- a migration not yet applied to local Supabase
- files you didn't mean to touch

Fix what you find. If anything is a judgment call, ask before committing.

## 3. Commit

Stage named files only, never `git add -A`. Write a conventional message with the ticket ID, ending with the Co-Authored-By trailer Claude Code gives you:

```
feat(scope): short summary

Why, in a sentence or two.

SCO-123

Co-Authored-By: Claude <noreply@anthropic.com>
```

Never use `--no-verify` or `--amend`. If the pre-commit hook fails, fix the cause and make a new commit.

## 4. Sync with dev and push

```bash
git fetch -q origin && git merge origin/dev
```

If dev brought in changes, run step 1 again. If there's a conflict you don't understand, stop and ask. Then `git push -u origin {branch}`. Never force-push.

## 5. Open the PR

Base `dev`. Title: `{type}: SCO-123 short summary`. The prefix feeds the release notes.

```markdown
## Summary

- what changed

## Why

the ticket's reason

## Verification

- [x] `bun run lint` passes
- [x] `bun run check` passes (0 errors)
- [x] `bun run test:run` passes (N)
- [ ] anything not verified, and why

## Test plan

- [ ] what a reviewer should try

Closes SCO-123

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Use `Closes` only on the ticket's last PR. Earlier PRs say `Part of SCO-123`, so merging them doesn't close the ticket. If another open PR touches the same files, say so in the body.

## 6. Update Linear

- `save_issue` with `links: [{url, title}]` for the PR.
- On the last PR, also set `state: "In Review"`.

## 7. Auto-merge into dev

```bash
gh pr checks {n} --watch --fail-fast
gh pr merge {n} --auto --merge
```

- Turn on auto-merge only after every check is green. If a check fails, fix it with a new commit and push.
- The repo uses merge commits, so pass `--merge`.
- If Claude Code blocks `gh pr merge`, stop and tell the user. Don't look for another way to merge. The fix is an allow rule, `Bash(gh pr merge:*)`, which the user has to add themselves.

## 8. Report

Give the PR link, what was verified, what wasn't and why, and any likely conflict with another open PR.
