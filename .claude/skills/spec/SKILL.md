---
name: spec
description: Use when the user describes a loose feature idea and wants it turned into a structured spec, or invokes /spec — produces a BRD-shaped spec (user story, acceptance criteria, edge cases, out-of-scope) aligned to the format in the Notion "Features BRD" page (https://app.notion.com/p/3ff0c8824fed8168ad93db8d0eb566fd), and optionally files it as a Linear ticket.
---

# Spec

Turn a loose feature idea into a crisp, reviewable spec in the same shape as [Features BRD](https://app.notion.com/p/3ff0c8824fed8168ad93db8d0eb566fd) (Notion). Output is a document the user can paste into the BRD, file as a Linear ticket, or hand to a subagent to implement.

## Inputs

The user gives you a feature idea in natural language. Before writing anything:

### 1. Interrogate the idea

Ask short, pointed clarifying questions. Batch them in one message if possible. Typical gaps:

- **Who is this for?** (rep / brand / buyer / internal)
- **What triggers it?** (a user action, a schedule, an external event)
- **What's the success outcome?** (the user does X in less time, sees Y, avoids Z)
- **What does "done" look like?** (MVP boundary)
- **What's explicitly out of scope?**
- **Does this touch permissions / billing / data model?** (routes the spec to related BRD sections)
- **Any existing feature this extends or conflicts with?**

If the idea is clear enough, skip questions and go straight to drafting — then ask clarifying questions in-line on the parts you weren't sure about.

### 2. Ground in the existing model

Before drafting:

- Read the relevant section of [Features BRD](https://app.notion.com/p/3ff0c8824fed8168ad93db8d0eb566fd) (Notion) — does this overlap with an existing feature? Extend it instead of duplicating.
- Check [Roles & Access](https://app.notion.com/p/3a70c8824fed81eeb9e2e25bf21e51d6) (Notion) if the feature involves access or visibility.
- If it's UI-heavy, note which [Frontend UX Principles](https://app.notion.com/p/3ff0c8824fed81eeb72cdb13829e6cd8) (Notion) principles will matter most — the spec should reference them for designers/implementers.
- `Grep` the repo for relevant symbols to anchor the spec in real files when possible.

## Spec format

Match the voice and structure of [Features BRD](https://app.notion.com/p/3ff0c8824fed8168ad93db8d0eb566fd) (Notion). Keep it tight — a spec is a contract, not an essay.

```markdown
## {Feature Name}

**Status:** Proposed
**Owner:** {user or TBD}
**Related:** {links to BRD sections, related tickets, related features}

### Problem

One-paragraph description of the user pain or business gap. Cite who hits it and how often. No solution yet.

### Goal

One sentence. The outcome, not the feature. "Reps can log a buyer interaction in under 10 seconds at a trade show" — not "add a Note mode to the order form."

### User story

As a {role}, I want to {capability}, so that {outcome}.

### Proposed solution

3–8 bullets. The _shape_ of the implementation at the product level — not code. Reference existing patterns in the app where possible.

### Acceptance criteria

Checklist of testable conditions. Each one should be verifiable by a human or a test. Aim for 5–10.

- [ ] {observable behavior}
- [ ] {state transition}
- [ ] {permission / visibility rule}
- [ ] {empty state behavior}
- [ ] {error / edge case}

### Edge cases

- {Named scenario}: {expected behavior}
- {Named scenario}: {expected behavior}

### Out of scope

Explicit list. Keeps MVP honest.

- {thing someone will ask for but we're deferring}
- {related idea that's a separate spec}

### UX notes

Reference principles from [Frontend UX Principles](https://app.notion.com/p/3ff0c8824fed81eeb72cdb13829e6cd8) (Notion):

- Core action: {what}
- Empty state: {teach what}
- Reversibility: {which actions need undo vs. confirm}
- Keyboard path: {what matters}

### Data / API notes

Tables touched, new columns, new endpoints. Flag if migration or RLS changes are needed.

### Permissions

Which roles can do what. Reference [Roles & Access](https://app.notion.com/p/3a70c8824fed81eeb9e2e25bf21e51d6) (Notion) if extending existing rules.

### Open questions

- {Thing we still need to decide}
- {Dependency we need to confirm}

### Estimate

T-shirt: XS / S / M / L / XL — with a one-line reason.
```

## Output options

After drafting, offer:

1. **Render only** — just show the spec in chat. Default.
2. **Append to the [Features BRD](https://app.notion.com/p/3ff0c8824fed8168ad93db8d0eb566fd) in Notion** — insert under the right section. Ask the user to confirm placement before writing.
3. **File as Linear ticket** — create in the Threadline project via the Linear MCP. Use the spec as the description. Set appropriate project/milestone if provided.
4. **All three** — render, append, file, linked.

## Grounding rules

- **Use the user's language, not the schema's.** If the user says "book" and the table is `collections`, the spec says "book" and notes "(maps to `collections` table)."
- **Reference real files and routes** when the implementation surface is obvious.
- **Cite BRD sections** in the "Related" line so the spec lives inside the existing document universe.
- **Don't invent requirements.** If the user didn't say something, ask — don't fill it in.
- **Flag open questions explicitly.** A spec with open questions is healthier than one that silently papers them over.

## Scope discipline

- **One feature per spec.** If the user describes three things, produce three specs (or ask them to pick one to start).
- **No implementation.** This skill stops at the spec. Implementation happens via `/kickoff` once the ticket is filed.
- **No UI mockups.** Describe the UX in words referencing the principles doc. Pixels come later.
- **Budget: ≤1 page rendered.** If the spec is longer, the feature needs to be split.

## Common mistakes

- Writing the solution before stating the problem. Start with problem → goal → user story. Always.
- Acceptance criteria that aren't testable ("works well", "feels fast"). Rewrite as observable conditions.
- Skipping "Out of scope" — this is the single most valuable section for keeping MVPs honest.
- Overspecifying the UI. Reference principles, not pixels.
- Treating the first draft as final. Expect the user to edit.

## Red flags — stop

- Writing code → STOP. Specs don't contain code. File paths and table names only.
- No problem statement → STOP. Go back and ask what hurts today.
- Acceptance criteria starting with "Should feel..." → STOP. Rewrite as observable.
- Spec growing past a page → STOP. The feature is too big. Split it.
