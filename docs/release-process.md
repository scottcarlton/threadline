# Release Process

How code goes from `dev` → `main` → tagged release → live on Vercel.

## TL;DR

1. Open a `dev` → `main` PR
2. Review the **Draft Release** that release-drafter has been auto-curating against `main` (visible at https://github.com/scottcarlton/threadline/releases)
3. Merge the PR (squash recommended for `dev` → `main`; keep merge commits for feature → `dev`)
4. Edit the auto-drafted release on GitHub: confirm the version, hit **Publish release** — that creates the git tag

## What's automated

A workflow (`.github/workflows/release-drafter.yml`) runs on every push to `main` and on every PR. It:

- Maintains a single **draft release** at `/releases` named `v$NEXT_VERSION`
- Categorizes PR titles by label (Features, Bug Fixes, Brand & Marketing, Portal, Tooling, Docs)
- Auto-bumps the version based on labels:
  - `breaking`/`major` → major bump
  - `Feature`/`Outstanding Feature`/`minor` → minor bump
  - everything else → patch bump
- Generates a **Full Changelog** comparison link

The draft is updated on every push — so by the time you merge `dev` → `main`, the release notes for that version are already drafted.

## What's manual (for now)

- **Publishing the release.** The draft sits unpublished until you click Publish. Publishing creates the git tag.
- **The first release.** release-drafter starts from "the most recent tag" — until v0.1.0 is published, it includes all commits ever. Tag the first release manually:
  ```bash
  git checkout main && git pull
  git tag -a v0.1.0 -m "Initial release"
  git push origin v0.1.0
  ```
- **Linking back to Linear.** Optional: comment "Released in v0.X.Y" on each closed Linear ticket.

## Per-PR hygiene to make release notes good

- **PR title is the release-note line** — write it for humans. Bad: `wip`. Good: `feat(orders): bulk export to CSV`.
- **Apply at least one label** so the PR lands in a category. Brand-Portal-Marketing labels exist; the `Feature` / `Bug` / `Improvement` set drives version bumping.
- **Use conventional-commit prefixes** in the title (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `ci:`, `build:`, `test:`) — release-drafter auto-applies a label based on prefix, so even unlabeled PRs end up categorized.
- **Skip a PR from notes:** add the `skip-changelog` label.

## Linking releases to tickets

A release named `v0.2.0` should answer: which Linear tickets shipped?

- Each PR title should contain the ticket ID (`SCO-XXX`) — release-drafter prints the title verbatim
- Click any PR # in the release notes → it lists the ticket links via "Closes SCO-XXX" footer
- Optional next step (not yet automated): a workflow that posts "Released in v0.X.Y" as a Linear comment on every ticket linked to a merged PR. Open a ticket if you want this.

## Branch-protection note

To avoid the "Update branch" loop on `dev` → `main` PRs:

- **Squash merge** for `dev` → `main` (set as default in repo settings → General → Pull Requests). Avoids merge-commit accumulation on main.
- **Disable** "Require branches to be up to date before merging" on `main`'s protection rule. Required status checks (Lint, Typecheck, Build) still gate merges.

These two settings together eliminate the recurring sync friction.
