---
name: kickoff
description: Start and run Linear work end to end. Takes a ticket (SCO-123), a project, or an initiative; with no argument it picks the most relevant open ticket and starts it. Handles pickup, worktree, and build, then hands each deliverable to /ship to get it merged into dev. Use when the user says "pick up", "work on", "next ticket", "continue", or "keep going", or names a ticket, project, or initiative.
---

# Kickoff

`/kickoff [ticket | project | initiative]` works out what to do, builds it, and hands each deliverable to `/ship`. Team `scottcarlton`, default project "Threadline".

## 1. Work out what to do

**A ticket** (matches `SCO-123`): the queue is that ticket.

**A project or initiative** (any other text), tried in this order:

1. `get_project` with the text. If it matches, the queue is that project's open tickets.
2. `list_projects` with `initiative` set to the text. If it returns projects, the queue is the open tickets across all of them.
3. `list_issues` with `query` set to the text, in the Threadline project. Use this for a theme with no project of its own (for example "AI observability").

If nothing matches, or two very different things match, ask once and stop.

"Open" means a status of Backlog, Todo, or In Progress. Leave out In Review, Done, and Canceled.

Order the queue:

1. In Progress first, since they're already started.
2. Then tickets that block others before the tickets they block (`get_issue` with `includeRelations`).
3. Then by priority: Urgent (1), High (2), Medium (3), Low (4), then None (0).
4. Then by ticket number, lowest first.

Skip any ticket blocked by one that isn't done. Skip any that already has an open PR, unless it still has deliverables without one.

**No argument:** pick one ticket.

1. If one of my tickets is In Progress in Threadline, resume it. Look for its worktree with `git worktree list | grep -i sco-123`.
2. Otherwise take the top Todo ticket assigned to me, ordered as above.
3. Otherwise take the top Backlog ticket in Threadline, ordered as above.

Say which ticket you picked and why in one line, then start. Don't ask first.

## 2. Pick up

For each ticket, in order:

- `get_issue`: read the title, description, scope, and links.
- `save_issue` with `state: "In Progress"`. Do this before reading any code.
- Split the scope into deliverables. Each one gets its own branch and PR.
- If it's a feature, read the matching Notion spec and the Features BRD first (links in CLAUDE.md).

## 3. Make the worktree

For each deliverable, from the main checkout:

```bash
git fetch -q origin
git worktree add -q .worktrees/{name} -b {prefix}/{name} origin/dev
cd .worktrees/{name}
git branch --unset-upstream
cp ../../.env ../../.env.ci .
bun install
```

- `{name}` is `sco-123-short-slug`, five words at most. `{prefix}` is `feat`, `fix`, or `chore`.
- Every later command runs inside the worktree. Never edit on `main` or `dev`.

## 4. Build

- Read the code before you write any. Check that a file exists before creating it: Write refuses to overwrite a file you haven't read, but `cat >` overwrites without asking.
- Follow CLAUDE.md: tests for logic, Zod schemas at the edges, `supabaseAdmin` with an ownership check, no `text-xs`, no em dashes.
- UI: describe the change and get a yes before editing. Then load the page and use it.
- Migrations: apply them to local Supabase with `docker exec -i supabase_db_threadline psql -U postgres`. Record the version in `supabase_migrations.schema_migrations`, run `notify pgrst, 'reload schema'`, and check that the column exists.
- Some work lives outside the repo, like Sentry alert rules or dashboard settings. Do it through its connector if one is signed in. If not, ask the user to sign in, and say what you'll change before you change it.

## 5. Ship

Run `/ship` for the deliverable. Tell it whether this is the ticket's last PR, which decides `Closes` versus `Part of`.

## 6. Next

- Move to the next deliverable, then the next ticket in the queue.
- Between tickets, tell the user in a line or two: the PR link, what was verified, and what's next.
- Stop when the queue is empty, when something needs the user (a design call, a sign-in, a blocked merge, a conflict you don't understand), or when the user says stop.
- With no argument, stop after one ticket and suggest what's next.
