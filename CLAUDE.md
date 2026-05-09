# Threadline

SvelteKit 5 app for fashion reps, brands, and buyers. Deployed to Vercel at `threadline.systems`.

## Do not guess, do not assume — period

**This rule covers everything, not just code.** Schema, routes, fields, API behavior, **UI patterns, styling conventions, copy, tone, component variants, empty-state styles, icon choices, modal vs dialog patterns, the exact classes used elsewhere** — all of it.

Before proposing any of the above, **verify**: read the file, grep the codebase, or ask the user. Do not infer from a plausible name. Do not assume "this pattern is probably like X." Do not invent copy from a feature description without checking the brand voice doc.

If you're not sure, say "I don't know — let me check" and check. If there isn't a clear answer in the code or docs, **ask the user** before acting. A wrong guess wastes the user's time and erodes trust more than the 10 seconds it costs to grep or ask.

Canonical patterns to verify (not an exhaustive list — the rule applies to everything):

- **Empty states** — see the Empty states subsection in Code Style below. Copy the canonical pattern exactly; do not pick a different variant you happen to remember.
- **Brand voice** — read `docs/brand/guidelines.md` §1.5 before writing any user-facing copy, including coming-soon subtitles, button labels, toast text, and modal descriptions. Do not transcribe a feature description the user gave you as copy — rewrite it against brand voice.
- **Role-aware audit** — before shipping a role-scoped page, mentally render it as every role and strip self-referential or tautological content.
- **UI primitives** — check `src/lib/components/ui/` before hand-rolling a control.

## Do not collapse federation boundaries

The repo has two federation directions (MBISR→BOA via `get_connected_org_ids()`, BOA→MBISR via `federated_*_links`). They are different mechanisms by design. Do not replace one with the other.

Every own-org list route (`/brands`, `/orders`, `/expenses`, `/appointments`) MUST keep its `.eq('organization_id', currentOrgId)` filter. Federation views (`/accounts`, `/organization/contacts`, `/shop`, `/reps`, `/brands/[id]` when viewing a connected BOA's brand) scope by active connections — they resolve `visibleOrgIds` from `org_connections` and `.in('organization_id', visibleOrgIds)`, relying on connection gating rather than own-org filtering. Accounts are shared context between both sides of an MBISR ↔ Brand connection by design (the brand owns accounts, the connected rep sells into them), so their contacts must surface on the rep side too.

When in doubt, read `docs/brd/permissions-implementation-map.md` §A.4. Skill: `.claude/skills/rbac-change`.

## Stack

- **Framework:** SvelteKit 2 + Svelte 5 (runes)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **UI primitives:** Bits UI (tooltips, dialogs, etc.) — docs at `bits-ui.com/docs/llms.txt`
- **Animation:** Motion
- **Backend:** Supabase (Postgres + SSR auth via `@supabase/ssr`)
- **Observability:** Sentry
- **Integrations:** Anthropic SDK, Google APIs (Gmail, Calendar), Notion
- **Testing:** Vitest
- **Deploy:** Vercel (`@sveltejs/adapter-vercel`)

## Package Manager

Use `bun` — never `npm` or `yarn`.

- `bun install` — dependencies (also installs the husky pre-commit hook via `prepare`)
- `bun run dev` — dev server
- `bun run build` — production build
- `bun run check` — svelte-check + TypeScript
- `bun run lint` — prettier + eslint
- `bun run test:run` — run vitest once (CI-style)
- `bun run test` — vitest watch mode
- `bunx` instead of `npx`

### Pre-commit hook

A husky + lint-staged hook runs `prettier --write` on staged files before every commit. Unformatted code is auto-fixed in place, so CI Lint won't fail on formatting drift. To bypass (rarely — e.g. emergency hot-fix), use `git commit --no-verify`, but investigate the underlying failure first.

## Testing

Add colocated `*.test.ts` unit tests when implementing logic that has meaningful behavior to verify.

**Write tests for:**

- Pure functions and utilities (`src/lib/utils/**`)
- Svelte stores with non-trivial logic (`src/lib/stores/**`)
- Server modules: data transforms, parsers, validators, API handlers (`src/lib/server/**`)
- Business logic: pricing, permissions, eligibility, scoring, state machines
- Anything with edge cases, error paths, or non-obvious correctness

**Skip tests for:**

- Pure UI markup / presentational components
- Simple prop passthroughs and layout wrappers
- Generated types or trivial re-exports

Run `bun run test:run` before claiming work is complete.

## Code Style

### Typography

- Minimum body size is `text-sm` (14px). **Avoid `text-xs`** (12px) unless explicitly approved by the user.
- Establish clear heading hierarchy — don't rely on size alone to communicate structure.

### Icons & tooltips

- Use inline SVGs. No icon libraries for new code.
- Never use the native `title=""` attribute for tooltips. Use Bits UI `Tooltip`.

### Form controls — Bits UI, not raw HTML

- **No native `<select>` in new code.** Use `src/lib/components/ui/select` (Bits UI wrapper). Native selects bypass the dark theme and break the keyboard behavior we've tuned. Same rule for checkboxes (`ui/checkbox`), switches (`ui/switch`), and tooltips (`ui/tooltip`).
- Available primitives: `alert`, `avatar`, `badge`, `button`, `card`, `checkbox`, `input`, `label`, `select`, `separator`, `skeleton`, `switch`, `tooltip`, plus `date-select` and `price-range-slider`. Check `src/lib/components/ui/` before hand-rolling.
- If a primitive is missing, add it under `src/lib/components/ui/` instead of inlining one more ad-hoc control. Bits UI docs: `bits-ui.com/docs/llms.txt`.

### Svelte 5

- Do not use `{@const}` inside plain `<div>` blocks — it only works inside block tags (`{#if}`, `{#each}`, etc.). Use a `<script>` variable instead.

### Tailwind

- Arbitrary values use underscores, not commas: `grid-cols-[1fr_360px]`, not `grid-cols-[1fr,360px]`.

### Empty states

Canonical pattern across `/accounts`, `/products`, `/orders`, `/reports`, `/shop`, `/organization/contacts` — copy it, do not invent variants.

- **Icon:** inline SVG, classes `mx-auto h-16 w-16 text-foreground`, `stroke="currentColor"`, `stroke-width="0.4"`. Big and thin, no fill, **no circle background**, no muted tint.
- **Title:** `<p class="mt-4 text-lg font-semibold">` (or `<h2>` if it's the page's primary heading).
- **Subtitle:** `<p class="mt-2 text-sm text-muted-foreground">`.
- Wrapper is a centered column: `class="text-center"` (or `flex flex-col items-center` when you need vertical positioning control).
- Do not use dashed-border boxes.
- Do not use the smaller `h-14 w-14 rounded-full bg-muted` circle + `h-7 w-7` inner icon variant — that's for secondary/inline empty states inside a card, not full-page empty states.

### Type safety

- `bun run check` must stay at **0 errors**. If you find pre-existing errors unrelated to your change, either fix them in the same PR (and call them out) or open a separate branch — never let them accumulate silently.
- Don't let `any` leak from helpers. Wrappers like `scopeByRep(query: any)` return `any`, which poisons `.map`/`.filter` downstream. Annotate the result: `const rows = (result ?? []) as Array<{ field: type }>`.
- Supabase joined selects (e.g. `.select('id, shows(name)')`) often infer the join as `never`. Cast the joined field: `sd.shows as { name?: string } | { name?: string }[] | null`.
- Motion v12: use `ease` (not `easing`) in `AnimationOptions`. When `animate(element, keyframes)` picks the wrong overload, cast keyframes: `{...} as Parameters<typeof animate>[1]`. Use `querySelectorAll<HTMLElement>` for typed iteration.

## Forms & Validation

All new forms use **Zod schemas + sveltekit-superforms + svelte-sonner**. Reference implementation: `src/routes/accounts/new/`.

- **Schema:** `src/lib/schemas/<entity>.ts` — single source of truth for shape and rules. Trim, transform empty strings to `undefined`, set max lengths.
- **Server:** `+page.server.ts` exports `load` (returns `{ form }` from `superValidate(zod4(schema))`) and `actions.default` (validates `request`, returns `fail(400, { form })` on invalid, `fail(500, { form, message })` on server error, `throw redirect(303, ...)` on simple success). For partial-success flows (e.g. account created but a side-effect failed), return `message(form, { ... })` instead of redirect, and let the client navigate after toasting.
- **Client:** `+page.svelte` calls `superForm(data.form, { validators: zod4Client(schema), validationMethod: 'onblur', dataType: 'json' (for nested), onUpdated, onError })`. Use `<form method="POST" use:enhance>`. Bind inputs with `bind:value={$form.field}`. Render inline errors as `{#if $errors.field}<p class="text-sm text-destructive">{$errors.field[0]}</p>{/if}`. Disable submit with `$submitting`. Use the `zod4` adapter (the project is on Zod v4); `zod`/`zodClient` are for Zod v3.
- **Feedback split:**
  - **Inline (red text under field):** validation errors (required, format, length).
  - **Toast (`svelte-sonner`):** server errors, network failures, success confirmations. `Toaster` is mounted in `src/routes/+layout.svelte`.

Don't roll new ad-hoc `let error = $state('')` patterns. If a form is being touched, migrate it to this pattern.

## Git Workflow

- `main` — production
- `dev` — integration branch; PR to `main` for release
- Feature branches: PR into `dev` first, test, then `dev` → `main`
- Use worktrees under `.worktrees/<branch-name>` for isolated feature work
- **Releases:** when `dev` → `main` lands, the auto-drafted release at `/releases` is ready to publish. See `docs/release-process.md`. Use conventional-commit prefixes in PR titles (`feat:`, `fix:`, `chore:`, etc.) so they're auto-categorized in release notes.

## Project Management

- Tasks and milestones live in Linear project **"Threadline"**
- Move tickets to **In Progress** when you start work, not after completing it
- Skills: `.claude/skills/linear-flow` (pickup → branch → PR → close), `.claude/skills/linear-milestone` (plan all tickets in a milestone), `.claude/skills/git-pre` (end-of-feature: verify → self-review → commit → sync dev → push → open PR)

## Verification Before Completion

Before claiming a task is done:

1. `bun run check` — no type errors
2. `bun run test:run` — tests pass
3. For UI changes, load the page in the browser and exercise the feature
4. State what was verified; if something couldn't be verified, say so explicitly

## Reference Docs

Consult these before working in the relevant area. Do **not** inline their contents — read on demand.

### Business requirements

- `docs/brd/features.md` — feature requirements. Read before implementing any feature.
- `docs/brd/roles-permissions.md` — RBAC rules. Read before touching auth, roles, or permissions.
- `docs/brd/marketing.md` — marketing and launch requirements.
- `docs/brd/permissions-implementation-map.md` — RLS helpers, per-table contracts, route/API classification, federation direction cheat-sheet. Read before touching RLS policies, adding tables, or wiring cross-org routes.

### Brand

- `docs/brand/philosophy.md` — founding philosophy (process problem thesis). Read before product, marketing, or positioning decisions.
- `docs/brand/guidelines.md` — voice, colors, typography, tone. Read before UI or marketing work.
- `docs/brand/visual-guide.html` — rendered visual reference.

### Design

- `docs/design/frontend-ux.md` — UX principles (mental models, cognitive load, progressive disclosure, friction asymmetry, empty states, keyboard-first, status visibility). Read before designing or reviewing any UI. Skills: `.claude/skills/frontend-ux` (design-time), `.claude/skills/ux-review` (audit existing UI), `.claude/skills/brand-review` (audit against brand guidelines), `.claude/skills/spec` (turn an idea into a BRD-shaped spec).

### Release

- `docs/release-process.md` — how `dev` → `main` becomes a tagged GitHub Release. release-drafter auto-curates notes from PR labels.

### Marketing copy

- `docs/content/homepage.md` — canonical copy for `/`.
- `docs/content/early-access.md` — canonical copy for `/early-access`.

### Research

- `docs/research-ai-wholesale-disruption.md` — background research on the AI + wholesale thesis.
