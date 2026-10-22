---
name: frontend-ux
description: Use when designing, planning, reviewing, or building any UI feature, page, component, or flow in Threadline — before writing any frontend code, load the canonical UX principles and apply them to the design.
---

# Frontend UX

Before proposing a UI design or writing frontend code for a new feature or flow:

1. **Read [Frontend UX Principles](https://app.notion.com/p/3ff0c8824fed81eeb72cdb13829e6cd8) (Notion) in full.** It is the source of truth for interaction, information density, keyboard behavior, friction asymmetry, empty states, status visibility, and more. Do not paraphrase from memory — read it.
2. **Walk the 7-question checklist** from the "Applying this in practice" section against the feature:
   - Core action
   - Mental model
   - Empty state
   - Reversibility
   - Keyboard path
   - Status
   - Density budget
3. **Scan the anti-patterns list** at the end of the doc and confirm the design doesn't hit any of them.
4. **Name the principles you applied** when presenting the design to the user. Don't just ship — explain which UX levers you pulled and why.

## When this skill applies

- "Design a component / page / flow for X"
- "Plan the UI for X"
- "Review this screen / PR / design"
- Anything touching `src/routes/**` or `src/lib/components/**` that changes user-visible behavior

## When it does NOT apply

- Backend-only work (`src/lib/server/**`, migrations, API handlers)
- Pure refactors with no behavior change
- Copy tweaks that don't restructure the UI

## Hard rules (from the doc — memorize)

- **Reversible actions get no confirmation dialog.** Use undo instead.
- **Irreversible actions require real friction** (type-to-confirm, etc.).
- **Every screen has one primary action.** Not three.
- **Empty states teach**: follow the canonical pattern in CLAUDE.md (big thin icon, no circle background, title, subtitle). No dashed boxes. No "No data."
- **Status is always visible** — never leave the user wondering if something happened.
- **⌘K / search is reachable from anywhere.**
- **Contextual actions go on the object**, not in a toolbar.

## Red flags — stop and reconsider

- Adding an "Are you sure?" modal to a reversible action
- Putting 5+ icons in a toolbar row
- Designing an empty state as a dashed box with "No items"
- Equal-weight buttons competing for primary
- Generic error banners at the top of a page
- Blocking a core action behind a multi-step form when one step would do
