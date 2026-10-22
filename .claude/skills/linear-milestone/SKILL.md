---
name: linear-milestone
description: Use when the user asks to plan a Linear milestone, wants to review all tickets in a milestone, or invokes /linear-milestone — fetches every ticket in the milestone and produces an implementation plan per ticket.
---

# Linear Milestone Planner

Given a milestone, produce an implementation plan for every ticket inside it. Tickets live in the Linear project **"Threadline"**.

## Inputs

Ask the user for the milestone if not provided:

- Milestone name or ID, OR
- Project name (default: "Threadline") + milestone name

## Workflow

### 1. Resolve the milestone

- `list_projects` (filter by name "Threadline") → project ID
- `list_milestones` for the project → match by name/ID → milestone ID
- `get_milestone` → confirm scope, target date, description

### 2. Pull every ticket in the milestone

- `list_issues` with `projectMilestoneId` filter
- Capture for each: ID, title, description, state, assignee, labels, estimate, dependencies/blocks

If the list is large (>15 tickets), group by state (Backlog/Todo/In Progress/Done) and plan only the not-yet-done tickets unless the user says otherwise.

### 3. Plan each ticket

For every ticket, produce a compact plan with these sections:

```
### {TICKET-ID} — {title}
**Goal:** one sentence restating the outcome.
**Affected areas:** files/modules likely touched (grep the repo if unsure).
**Approach:** 3–6 bullets of the implementation steps.
**Tests:** what to add/update (see CLAUDE.md testing rules).
**Risks / unknowns:** anything that needs a decision before coding.
**Dependencies:** other tickets that must land first.
**Estimate sanity check:** agree / suggest adjustment with one-line reason.
```

Keep each plan tight — aim for ~10 lines per ticket. The goal is a skim-able planning doc, not a design doc.

### 4. Cross-ticket synthesis

After the per-ticket plans, add a short summary:

- **Suggested build order** — ordered list by dependency + risk
- **Shared infra** — work that shows up in multiple tickets; flag for a single refactor PR
- **Gaps** — tickets with unclear acceptance criteria that need the user's input
- **Milestone risk** — anything threatening the target date

### 5. Output

Render the plan to the chat. Only write it to a file if the user asks. If writing, put it in Notion under the milestone's project page (see CLAUDE.md, Project Management), never in the repo.

## Grounding the plans in the codebase

Before planning each ticket, do quick recon so plans reference real files:

- `Grep` / `Glob` for symbols named in the ticket
- Read `CLAUDE.md` + [Features BRD](https://app.notion.com/p/3ff0c8824fed8168ad93db8d0eb566fd) (Notion) for feature-area conventions
- Check [Roles & Access](https://app.notion.com/p/3a70c8824fed81eeb9e2e25bf21e51d6) (Notion) if the ticket touches auth or RBAC

Don't deep-dive implementation — the plan points at files; it doesn't rewrite them.

## Quick reference

| Step           | Tool                                                |
| -------------- | --------------------------------------------------- |
| Find project   | `list_projects`                                     |
| Find milestone | `list_milestones`, `get_milestone`                  |
| List tickets   | `list_issues` (filter by `projectMilestoneId`)      |
| Ticket detail  | `get_issue` (only if description is thin from list) |
| Repo recon     | `Grep`, `Glob`, `Read`                              |

## Common mistakes

- **Planning without reading the ticket description in full.** List endpoints sometimes truncate — call `get_issue` when in doubt.
- **Inventing file paths.** If you haven't grepped for the symbol, don't name the file. Say "likely in src/lib/..." and stop.
- **Moving tickets to In Progress.** This skill PLANS. It does not start work. No state changes. Use `/kickoff` when actually picking up a ticket.
- **Writing novel-length plans.** Each ticket gets ~10 lines. If a ticket needs more, flag it as "needs design spike" instead.

## Red flags — stop

- About to call `save_issue` → STOP. Planning only.
- About to create a branch or edit code → STOP. Planning only.
- About to write a 500-line planning doc → STOP. Compress or split into a design spike ticket.
