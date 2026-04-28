# Tablet audit

Source-code scan of every authenticated route for tablet-unfriendly patterns. Live device verification still needed at iPad portrait (768), iPad landscape (1024), and iPad Pro 12.9 portrait (1024) / landscape (1366).

- 🟢 Source-scan clean — ready for live verification.
- 🟡 Low-risk findings flagged below; mostly pre-existing patterns. Trivial fixes can land here; non-trivial fixes get a Linear ticket.
- 🔴 Significant findings; needs design work.

Patterns scanned: native form controls (banned), `text-xs` body content (below 14px minimum), fixed wide widths (overflow risk), `hidden lg:block` (critical UI hidden at tablet), `title=` tooltips (banned), tap targets <44px.

Pre-existing `text-xs` usages on muted captions, badge counts, and metadata lines are noted but not blocking — they're a code-style debt across the project, not introduced by this branch. The "Never use text-xs" rule applies to NEW code.

---

## Stage 1 — high-traffic surfaces (must verify on device)

### `/dashboard`

- Status (source scan): 🟢
- Notes: clean. No fixed wide widths, no hidden-on-tablet UI, no native form controls. Stat cards already use `sm:grid-cols-3` which works at iPad portrait.

### `/orders` (list)

- Status (source scan): 🟢 (after T24a)
- Notes: stat-card row converted to horizontal carousel below `lg` (T24a, commit `3009262`). Table uses progressive `hidden ... md:table-cell` columns — verify last 2 columns hidden at iPad portrait still gives a usable row. `min-w-[158px]` on filter buttons is fine.

### `/orders/new`

- Status (source scan): 🟡
- Notes: large multi-step wizard. Several `grid-cols-2 md:grid-cols-2 sm:col-span-2` patterns — should reflow OK. The `md:grid-cols-[1fr_320px]` split-view at `+page.svelte:1571` may feel cramped at iPad portrait — verify on device.

### `/accounts` (list)

- Status (source scan): 🟢
- Notes: clean.

### `/accounts/[id]`

- Status (source scan): 🟡
- Notes: `min-w-[240px]` on a filter at line 667 — fine at iPad portrait (768px) since other content can wrap. Verify the tab navigation doesn't overflow at portrait.

### `/brands` (list)

- Status (source scan): 🟢
- Notes: clean. `PageHeader title="..."` is a component prop, not a native title tooltip.

### `/organization` (with new SectionSheet at `< lg`)

- Status (source scan): 🟢 (after T24)
- Notes: SectionSheet wired at `< lg` (commit `a9f3991`). At `lg+`, original sticky rail unchanged. Detail-view guard preserved.

### `/organization/members`

- Status (source scan): 🟡
- Notes: pre-existing `text-xs` on metadata lines (lines 545, 548, 622, 812, 820, 824, 838) — not blocking but worth a future pass. Member cards may stack awkwardly at iPad portrait — verify.

### `/organization/shows/[id]` (detail)

- Status (source scan): 🟡
- Notes: pre-existing `text-xs` on lines 513, 520, 530, 562. Detail page bypasses sub-nav (correct). Verify the show-dates list scrolls comfortably on portrait.

### `/inbox`

- Status (source scan): 🟢
- Notes: clean source. Auto-hide AI dock is enabled here per existing logic.

### `/shop` (buyer)

- Status (source scan): 🟢
- Notes: product grid uses `sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4` — works at all tablet widths. Product detail modal uses `max-h-[90vh] max-w-[90vw]` — fine.

### `/reports`

- Status (source scan): 🟢
- Notes: clean. Empty state follows the canonical icon + title + subtitle pattern.

---

## Stage 2 — sweep audit

### `/appointments`

- Status (source scan): 🟢
- Notes: `min-w-[60px]` on date column items is intentional and fine. Otherwise clean.

### `/expenses`

- Status (source scan): 🟢 (after T24a)
- Notes: stat-card row converted to horizontal carousel below `lg` (T24a). `min-w-[120px]` on a filter button is fine.

### `/products`

- Status (source scan): 🟢
- Notes: `PageHeader title="Products"` is a component prop, not native HTML. Clean.

### `/products/new`

- Status (source scan): 🟡
- Notes: live "Product Card Preview" sidebar uses `hidden lg:block` (line 610) — iPad portrait users creating a product won't see the live preview. Same pattern in `brands/[id]/products/new`. Consider a "preview" toggle button on tablet, or move preview below the form on `< lg`. Not blocking; needs design call. Native `<input type="color" title="..." />` at line 516 — `title` on color pickers is the standard accessible name pattern (defensible exception to the no-`title` rule).

### `/products/[productId]`

- Status (source scan): 🟡
- Notes: same color-picker `title=` pattern at line 513. Otherwise clean.

### `/sheets`

- Status (source scan): 🟢
- Notes: clean.

### `/shows`

- Status (source scan): 🟢
- Notes: clean. Pre-existing `text-xs` on date metadata lines (709, 714) — not blocking.

### `/seasons`

- Status (source scan): 🟢
- Notes: clean.

### `/plan`

- Status (source scan): 🟢
- Notes: clean.

### `/account`

- Status (source scan): 🟢
- Notes: clean.

### `/insight`

- Status (source scan): 🔴
- Notes: largest visualization-heavy page in the app. Findings:
  - `Scoreboard` component hidden behind `hidden lg:block` at lines 618 and 1094 — iPad portrait users lose KPI scoreboard. Needs a tablet-friendly fallback.
  - `min-w-[300px]` on a select at line 1241 is borderline at portrait (left ~470px for siblings).
  - Wide tables with `sticky left-0 z-10 min-w-[200px]` columns — `overflow-x-auto` on the table wrapper is required (verify).
  - Probably needs a dedicated Linear ticket for tablet treatment of the Insight surface.

### `/intelligence`

- Status (source scan): 🟢
- Notes: clean source.

### `/workspace`

- Status (source scan): 🟢
- Notes: clean.

### `/settings`

- Status (source scan): 🟢
- Notes: clean. (No sub-nav changes in this branch per spec decision.)

### `/settings/email-intake`

- Status (source scan): 🟢
- Notes: clean. (Pre-existing `state_referenced_locally` warning is unrelated.)

### `/organization/billing`

- Status (source scan): 🟡
- Notes: pre-existing `text-xs opacity-60` "Coming soon" badge at line 136. Not blocking.

### `/organization/security`

- Status (source scan): 🟡
- Notes: pre-existing `text-xs` on captions (lines 288, 301, 352). Not blocking.

### `/organization/contacts`

- Status (source scan): 🟡
- Notes: pre-existing `text-xs` on order metadata (lines 733, 742). Not blocking.

### `/organization/agents`

- Status (source scan): 🟢
- Notes: clean.

### `/organization/integrations`

- Status (source scan): 🟡
- Notes: pre-existing `text-xs` "Connected" badges and integration descriptions (line 327; provider page lines 208, 347, 367, 387, 646, 658, 666). Not blocking.

### `/organization/orders`, `/taxes`, `/shipping`, `/returns`, `/payments`

- Status (source scan): 🟢
- Notes: clean across all five.

### `/organization/seasons`, `/shows`, `/territories`, `/partners`

- Status (source scan): 🟡 (cosmetic)
- Notes: pre-existing `text-xs` on action links and date captions across these pages (e.g. `seasons/+page.svelte:258`, `shows/+page.svelte:703,709,714`, `territories/[id]/+page.svelte:305`). Not blocking.

---

## Live device verification (user TODO)

Walk each route at:

- iPad portrait (768)
- iPad landscape (1024)
- iPad Pro 12.9 portrait (1024)
- iPad Pro 12.9 landscape (1366)

For each row, mark 🟢 / 🟡 / 🔴 in your own column once tested. Trivial fixes (overflow, sub-44px tap target, hidden critical UI) get fixed on the same branch. Non-trivial fixes get a Linear ticket.

## Recommended Linear tickets to file

Based on the source scan, two issues likely warrant follow-up tickets rather than in-branch fixes:

1. **`/insight` tablet treatment** — the Scoreboard is hidden at `< lg`, and the page's overall information density assumes desktop. A dedicated tablet design (collapse Scoreboard into a horizontal carousel like `/orders`, defer wide tables behind tab/filter, or add a tablet-only summary view) is its own design exercise.

2. **`/products/new` and `/brands/[id]/products/new` Product Card Preview** — the live preview is hidden at `< lg`. Options: move the preview below the form on tablet, add a "Show preview" toggle, or accept the loss of live preview on tablet (note in spec).

3. **Project-wide `text-xs` cleanup** — many pre-existing pages use `text-xs` on muted captions and metadata. Not introduced by this branch but a known code-style debt. A focused PR to bump these to `text-sm` (or replace with `[11px]` on circular badges only) would close out the violation. Track separately.
