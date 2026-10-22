---
name: brand-review
description: Use when the user asks to review, audit, evaluate, or critique brand consistency across UI, marketing, or copy — or invokes /brand-review. Audits against the Notion "Brand Identity & Guidelines" page (https://app.notion.com/p/3ff0c8824fed811b940eff4b650e1eca) and produces a prioritized list of deviations and fixes.
---

# Brand Review

Audit visual and verbal brand execution against [Brand Identity & Guidelines](https://app.notion.com/p/3ff0c8824fed811b940eff4b650e1eca) (Notion) (voice, tone, color, typography, spacing). Complement to `/ux-review` — that one covers interaction; this one covers brand expression.

## Inputs

Ask the user if not specified:

- **Scope:** specific route/component (e.g. `/early-access`, the dashboard), marketing pages only, or "all."
- **Axis:** full (visual + voice), visual only, or voice/copy only. Default: full.

## Workflow

### 1. Load the rubric

Read [Brand Identity & Guidelines](https://app.notion.com/p/3ff0c8824fed811b940eff4b650e1eca) (Notion) in full. Note the canonical tokens:

- Color palette and semantic roles
- Typography scale + heading hierarchy rules (also enforced in CLAUDE.md: no `text-xs`)
- Voice/tone attributes
- Logo usage, spacing, iconography rules

Also check [Homepage copy](https://app.notion.com/p/3ff0c8824fed81d6993ee7de9c0359dd) and [Beta landing page copy](https://app.notion.com/p/3ff0c8824fed8100aba8da8260027ddb) in Notion when auditing marketing surfaces — those are the canonical copy.

### 2. Map the scope

- **Specific route:** `Glob` the route + components. Read every `.svelte` in scope.
- **Marketing:** `src/routes/(marketing)/**` or whatever the marketing group is; plus any `/early-access`, `/`, `/about` pages.
- **All:** prioritize high-visibility surfaces (landing, dashboard, auth, primary lists).

For each file, note:

- Inline color values (hex, rgb) — should be tokens
- Font sizes used — any `text-xs`?
- Heading structure — is hierarchy communicated or is it just size?
- Copy tone — does it match the voice rubric?
- Empty states, errors, toasts — these tend to drift off-brand

### 3. Audit

**Visual axis:**

- Color: any ad-hoc hex values outside the palette? Semantic roles respected (success/warning/error)?
- Typography: any `text-xs`? Heading hierarchy clear without relying on size alone?
- Spacing/rhythm: new components matching the app's existing density?
- Iconography: inline SVGs (per CLAUDE.md), no icon libraries, no native `title=""` tooltips?
- Logo + mark usage per guidelines

**Voice/copy axis:**

- Tone matches the guidelines (e.g. confident vs. chatty, direct vs. corporate)
- Terminology consistent with the product model (rep/brand/buyer/order — not random synonyms)
- Error messages in-voice (not stock Supabase/framework strings leaking through)
- CTA language — verbs match across similar actions
- Marketing copy alignment with the Notion [Marketing Copy](https://app.notion.com/p/3ff0c8824fed8170a180f2a03b356edf) canon

### 4. Classify findings

Each finding:

- **Severity:** Critical (off-brand on a high-visibility surface) / High (common inconsistency) / Medium (polish) / Low (nit)
- **Effort:** S / M / L
- **Rule violated:** cite the section of [Brand Identity & Guidelines](https://app.notion.com/p/3ff0c8824fed811b940eff4b650e1eca) (Notion) (or CLAUDE.md if it's a codified rule like "no text-xs")
- **Recommendation:** specific fix — "replace `#E63946` with `--color-error`" not "use the right color"

### 5. Output

```
## Brand Review: {scope}

### Summary
- Surfaces audited: N
- Critical: X | High: Y | Medium: Z | Low: W
- Top 3 highest-leverage fixes: ...

### Visual findings
#### {Screen / component}
1. [High / S] **{title}** — §{guidelines section}
   - Observed: `text-xs` on 4 elements in the row action menu
   - Problem: violates minimum body size
   - Fix: replace with `text-sm`; if that's too large, restructure to hide on hover instead
   - Files: src/lib/components/OrderRow.svelte:42,57,81,94

### Voice / copy findings
(same structure)

### Cross-cutting patterns
Systemic issues across multiple surfaces.

### Suggested cleanup plan
1. **Quick wins** — critical/high × S. One PR, batch them.
2. **Component-level** — inconsistencies that should land in a shared component.
3. **Rework** — anything requiring new tokens, new components, or copy rewrites.
```

### 6. Offer to file tickets

"Want me to create Linear tickets for the quick wins?" — if yes, create them in the Threadline project via the Linear MCP. Batch trivial fixes (like "remove all text-xs") into one ticket, not one per occurrence.

## Grounding rules

- **Cite file and line** for every finding.
- **Cite the guideline section** by name — builds the user's mental map of the brand doc.
- **Concrete fixes only.** "Use `--color-muted`" beats "use a quieter color."
- **Don't invent rules.** If a finding isn't supported by [Brand Identity & Guidelines](https://app.notion.com/p/3ff0c8824fed811b940eff4b650e1eca) (Notion) or CLAUDE.md, flag it as "opinion" or cut it.

## Known codified rules (reference when auditing)

From CLAUDE.md:

- Minimum body size is `text-sm` (14px). **Never `text-xs`.**
- Inline SVGs only — no icon libraries.
- Bits UI `Tooltip`, never native `title=""`.
- Empty states follow the canonical pattern in CLAUDE.md (big thin icon, no circle background, title, subtitle; no dashed boxes).
- Tailwind arbitrary values use underscores: `grid-cols-[1fr_360px]`.

## Scope discipline

- **Review only.** No code edits. Create tickets for fixes.
- **Don't merge with `/ux-review`.** If an issue is interaction-related, note it but route the user to `/ux-review` instead.
- **Budget:** for "all," top 25 findings across the app. Depth over breadth on a single surface; breadth over depth on "all."

## Common mistakes

- Critiquing personal taste instead of guideline deviations. If the guidelines don't say it, it's not a brand issue.
- Flagging the same token violation on every file individually instead of once as a cross-cutting pattern.
- Reviewing interaction (this is `/ux-review`'s job).
- Producing a prose essay. Users act on lists.

## Red flags — stop

- About to edit code mid-review → STOP. Finish, then ticket, then implement.
- Flagging something without a guideline citation → STOP. If it's not in the doc, it's not a finding.
- About to list every `text-xs` in the codebase as separate findings → STOP. One cross-cutting finding, one ticket.
