# Frontend UX Principles

The standard for designing and planning any UI in Threadline. Read before building a new feature, restructuring an existing one, or reviewing a design. Opinionated on purpose.

Companion to `docs/brand/guidelines.md` (visual system) — this doc is about _behavior and interaction_, not pixels.

---

## 1. Design to the user's mental model, not the database schema

Users reason about their world (an order, a rep, a buyer, a line sheet), not about our tables. When a UI forces them to learn our internal model, we've failed.

- Name things the way users name them. If reps call it a "book," don't call it a "collection" in the UI because the table is `collections`.
- One concept = one word. Don't mix "order," "PO," and "purchase" in the same flow.
- Hide foreign-key plumbing. If a user picks a buyer, don't make them also pick the buyer's org, company, and billing entity — infer what you can.

**Check yourself:** if you explained this screen to a rep in 30 seconds, would they recognize the words?

## 2. Reduce cognitive load aggressively

Every element on screen is a tax. Every decision a user has to make is a tax. Budget accordingly.

- **Default aggressively.** Sensible defaults beat empty fields. If 90% of the time the answer is X, pre-fill X.
- **Collapse the rarely-used.** Advanced options go behind "More" or a secondary panel.
- **One primary action per screen.** If there are three equally-weighted buttons, the user has to think. Pick the primary; demote the rest.
- **Chunk information.** Six fields in a row is a wall. Group them into 2–3 clusters with clear labels.

If a screen has more than ~7 interactive elements competing for attention, it's too busy.

## 3. Progressive disclosure > feature density

Show what's needed now. Reveal the rest as the user earns it through context.

- **Hover / focus / expand** to reveal secondary actions, not always-visible icon soup.
- **Drill-in detail panels** over cramming everything on the list view.
- **Staged forms** (Next / Next / Submit) only when steps have real dependencies; otherwise one well-grouped form is better.
- **"Show advanced"** is a real tool. Use it.

**Anti-pattern:** 12 icons on a row "just in case." If we put it there, users believe they need to consider it.

## 4. Speed to core action

The primary action for this page should be reachable in **one click or one keystroke**, above the fold, without scrolling.

- Identify the core action for every screen. Write it down. Design around it.
- The core action is the biggest, highest-contrast control — and it should be placed where the eye already is.
- Every extra click to the core action is a tax on daily users, who are the users that matter most.

**Example:** Rep dashboard's core action is "log a new order." That button is not in a dropdown. It's visible, styled as primary, and `N` is a keyboard shortcut.

## 5. Empty states that teach

Empty states are the best onboarding real estate we have. Use them.

- **Icon-circle + title + subtitle + primary CTA.** (See CLAUDE.md — do not use dashed boxes.)
- **Teach the model.** "No orders yet — orders appear here after you log them. Log your first order →"
- **Show an example** when the concept is unfamiliar. A single faint mock row beats a paragraph of explanation.
- **Never dead-end.** Every empty state has a way forward.

## 6. Keyboard-first and search-first navigation

Power users don't click through menus. Designs must support both clickers and typists.

- **Global keyboard shortcut to search / command palette** (⌘K). Every noun in the app should be reachable from it.
- **Common actions have shortcuts.** New, save, next, back, close. Display them in tooltips.
- **Lists are arrow-navigable.** Enter opens, ⌘-click opens in a new context if applicable.
- **Forms are Tab-navigable in logical order.** Never trap focus in a modal that can't be closed with Esc.

Search beats navigation trees for anything with >20 items.

## 7. Friction should match reversibility

Asymmetric friction is the single biggest lever for both speed and safety.

- **Reversible action → zero friction.** No confirmation dialog. If they misclick, they click undo.
- **Undo is a first-class pattern.** Snackbar with "Undo" (5–10s) for delete, archive, status change, reassign.
- **Irreversible action → real friction.** Type the name to confirm. Re-enter password. Show consequences.
- **Semi-reversible → match the blast radius.** Sending an email: show a "sending… undo" toast for 5 seconds before actually sending.

**Never** block a reversible action behind "Are you sure?" — that trains users to click through confirmations, which is exactly what makes the irreversible ones dangerous.

## 8. Contextual actions over toolbar menus

Put actions where the object is, not in a global toolbar the user has to navigate to.

- **Row-level actions** on hover — edit, delete, archive, duplicate live on the row they affect.
- **Detail-panel actions** next to the thing they act on, not in a header bar far away.
- **Bulk actions** only appear when multiple items are selected; they replace the normal toolbar rather than coexist.
- **Right-click / "⋯" menu** for rare or advanced actions on an object.

Fitts's law applies: the action should be near the cursor, near the object, on the path the user is already on.

## 9. Status visibility — the user should always know what's happening

If something is loading, changed, failed, or syncing — say so. Silence is the worst state.

- **Loading** — skeleton screens over spinners when we know the shape of the result. Spinners for true indeterminate work.
- **Saving** — inline "Saved ✓" near the field or a subtle "All changes saved" in the header. Not a modal.
- **Sync / background work** — a pill or badge showing queued/processing/done state.
- **Errors** — near the thing that failed, with what to do next. Not a generic red banner at the top.
- **Success confirmations** — ephemeral toasts, not interruption modals, for routine success.

**Rule:** no action should feel like it disappeared into a void. Optimistic UI where possible; acknowledgment always.

## 10. Direct manipulation over forms-and-buttons

When a user can act on a thing by touching the thing, let them.

- **Inline edit** over edit modals for single-field changes. Click the title, it becomes editable.
- **Drag to reorder**, drag to assign, drag to categorize — when it matches the mental model.
- **Click to toggle** status pills rather than opening a dropdown to "change status."
- **Drag-and-drop file upload** on the surface where the file will live, not a hidden upload modal.

If changing a thing requires navigating away from the thing, ask why.

## 11. Consistency compounds

Every new pattern we introduce is a pattern users have to learn. Reuse before invent.

- **Reuse existing components** and layouts before designing new ones. If a pattern exists in the app, match it.
- **Same noun, same verb everywhere.** "Archive" in one place and "Hide" in another for the same action is a bug.
- **Match the app's existing density, spacing, and rhythm.** New features should not feel like a different app.
- **Deviate deliberately.** If you do invent a new pattern, it's because existing ones genuinely don't fit, not because you didn't look.

## 12. Errors are an interaction, not a wall

An error is a moment where the user needs help, not a reason to stop.

- **Say what happened, why, and what to do next.** "Couldn't save — you're offline. We'll retry when you're back."
- **Preserve their work.** Never clear a form on error. Never lose unsent input.
- **Inline over global** — attach errors to the field/row/object, not a banner at the top of the page.
- **Never blame the user.** "That email is already in use — did you mean to log in?" not "Invalid email."

---

## Applying this in practice

When planning or reviewing a UI feature, answer these before writing code:

1. **Core action:** what's the one thing this screen is for? Is it one click away?
2. **Mental model:** does the UI use the user's words, not our schema's?
3. **Empty state:** what does this look like with zero data, and does it teach?
4. **Reversibility:** for every action — is the friction matched to the blast radius?
5. **Keyboard path:** can a power user do the core flow without the mouse?
6. **Status:** will the user always know what's happening during async work?
7. **Density budget:** how many decisions am I putting on screen? Can I defer or default half of them?

If you can't answer all seven, the design isn't ready.

## Styling — lowest specificity wins

Reach for the lowest CSS specificity that still expresses the intent:

- Prefer Tailwind utilities on the element over ancestor-targeted rules.
- Don't use `!important` unless overriding a third-party rule — and leave a comment saying why.
- Avoid `#id` selectors for styling; use classes or data attributes.
- Don't write `.card .header .title { ... }` when `.title { ... }` works.
- Components that accept a `class` prop should merge via `cn()` / `clsx` so callers can override with a single utility — don't inline-style the winning variant inside the component.
- When diagnosing a visual bug, check the CSS token first (e.g. `--border` in `src/app.css`). If light/dark parity is off, fix the token — don't add overrides downstream.

## Anti-patterns — don't ship these

- "Are you sure?" modals for reversible actions
- Toolbar bars of icons without hover labels or tooltips
- Empty states that just say "No data"
- Primary + secondary + tertiary buttons all styled similarly
- Generic red banner: "An error occurred"
- Required fields with no indication of which are required until submit
- Modals that can't be closed with Esc
- Loading spinners for things that finish in <200ms (just show the result)
- Saving that requires a "Save" button click when the change is unambiguous
- Search that only matches prefix, or is case-sensitive, or requires exact spelling
