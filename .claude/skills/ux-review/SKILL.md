---
name: ux-review
description: Use when the user asks to review, audit, evaluate, or critique the UX of a specific feature, page, flow, or the whole app — or invokes /ux-review. Produces a prioritized list of issues and improvement suggestions grounded in the Threadline UX principles.
---

# UX Review

Audit existing UI against [Frontend UX Principles](https://app.notion.com/p/3ff0c8824fed81eeb72cdb13829e6cd8) (Notion) and produce a prioritized, actionable improvement plan.

## Inputs

Ask the user if not specified:

- **Scope:** a specific feature/route (e.g. `/orders`, the buyer invite flow), OR "all" for a full app sweep.
- **Depth:** quick pass (top 5 issues) or thorough (everything found, grouped).

Default: if they say "/ux-review" with no scope, ask. If they say "/ux-review the orders page," scope = `src/routes/orders/**`.

## Workflow

### 1. Load the principles

Read [Frontend UX Principles](https://app.notion.com/p/3ff0c8824fed81eeb72cdb13829e6cd8) (Notion) in full. The 12 principles + 7-question checklist + anti-pattern list are your rubric.

### 2. Map the scope

- For a specific feature: `Glob` the route(s) and component(s). Read every `.svelte` file in scope and any called child components.
- For "all": walk `src/routes/**/+page.svelte` and `src/lib/components/**`. Prioritize high-traffic surfaces (dashboard, primary lists, core actions).

For each screen in scope, identify:

- The **core action** the screen is for
- The **primary data** shown
- The **state transitions** (empty / loading / error / populated)
- The **actions available** (inline, toolbar, contextual)

### 3. Audit against the rubric

For every screen, walk the 7 questions from the Frontend UX Principles page:

1. Core action — one click, visible, primary-styled?
2. Mental model — user language, not schema language?
3. Empty state — teaches the concept, has a CTA, not a dashed box?
4. Reversibility — friction matches blast radius? Any unnecessary "Are you sure?"s? Any irreversible actions with no friction?
5. Keyboard path — can the core flow be done without the mouse? ⌘K reachable?
6. Status — loading, saving, syncing, errors all visible and contextual?
7. Density — is the screen doing too much? What could be deferred, defaulted, or progressively disclosed?

Also scan the anti-pattern list and flag any hits.

### 4. Classify findings

Every finding gets:

- **Severity:** Critical (blocks or confuses core action) / High (friction on common path) / Medium (polish) / Low (nice-to-have)
- **Effort:** S (≤1 hr) / M (≤½ day) / L (bigger)
- **Principle violated:** reference the numbered principle from the Frontend UX Principles page (e.g. "§7 Friction asymmetry")
- **Recommendation:** concrete, not vague ("replace confirm dialog with undo snackbar" — not "reduce friction")

### 5. Output format

```
## UX Review: {scope}

### Summary
- Screens audited: N
- Critical: X | High: Y | Medium: Z | Low: W
- Top 3 highest-leverage fixes (sev × effort): ...

### Findings

#### {Screen / component name}
**Core action:** {what this screen is for}
**Overall:** one-line verdict.

1. [Critical / S] **{Short title}** — §{principle}
   - Observed: {what the UI does today}
   - Problem: {why it violates the principle}
   - Fix: {concrete recommendation}
   - File: src/routes/.../+page.svelte:123

2. [High / M] ...

### Cross-cutting patterns
Issues that appear across multiple screens (e.g. "5 screens use dashed-box empty states").

### Suggested improvement plan
Ordered list of tickets to create, grouped by theme:
1. **Quick wins** — critical/high severity × S effort. Ship this week.
2. **Follow-up** — high × M effort. Next sprint.
3. **Longer rework** — anything L effort or requiring design input.
```

### 6. Offer to file tickets

After presenting, ask: "Want me to create Linear tickets for the quick wins?" If yes, use the Linear MCP (`save_issue`) to create them in the Threadline project. One ticket per fix for S/M; group related ones for L.

## Grounding rules

- **Cite file paths and line numbers** for every finding. No vague "the orders page has issues" — point at the code.
- **Reference the principle** by number every time. This builds the user's intuition for the rubric.
- **Prefer concrete fixes** over principles. "Replace the modal with inline edit on click" beats "reduce friction."
- **Don't invent problems.** If you can't tie a finding to a specific principle in the doc, it's probably taste, not UX — leave it out or flag it as "opinion, not principle."

## Scope discipline

- **Review only.** This skill does not edit code. If the user asks for fixes, finish the review first, then run `/kickoff` on the tickets.
- **Don't rewrite the feature.** If a screen needs a ground-up redesign, flag it as "needs design spike" with a one-paragraph problem statement, not a full redesign.
- **Budget the review.** For "all," aim for top 20 findings across the app, not every nit on every screen.

## Common mistakes

- Reviewing visual polish (spacing, color) when the rubric is about interaction. Visual lives in [Brand Identity & Guidelines](https://app.notion.com/p/3ff0c8824fed811b940eff4b650e1eca) (Notion) — separate skill, separate review.
- Producing a 2,000-word prose critique. Users act on prioritized lists, not essays.
- Flagging violations without a concrete fix. A finding without a recommendation is noise.
- Skipping the "cross-cutting patterns" section — the biggest wins are usually systemic.

## Red flags — stop

- About to edit code mid-review → STOP. Finish the review, then create tickets, then implement.
- Listing 50 findings on one screen → STOP. You're nit-picking. Top 5–8 per screen.
- Writing "improve UX" as a recommendation → STOP. Be specific or cut it.
