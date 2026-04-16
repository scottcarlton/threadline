# Threadline

SvelteKit 5 app for fashion reps, brands, and buyers. Deployed to Vercel at `threadline.systems`.

## Do not guess, do not assume

Before proposing a form, page, route, component, field, table, column, or API behavior — **verify it exists**. Read the file, grep the code, or ask. Do not infer from a plausible name. A wrong guess wastes the user's time and erodes trust. If you don't know, say "I don't know — let me check" and check.

## Stack

- **Framework:** SvelteKit 2 + Svelte 5 (runes)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **UI primitives:** Bits UI (tooltips, dialogs, etc.)
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

- Minimum body size is `text-sm` (14px). **Never use `text-xs`** (12px).
- Establish clear heading hierarchy — don't rely on size alone to communicate structure.

### Icons & tooltips

- Use inline SVGs. No icon libraries for new code.
- Never use the native `title=""` attribute for tooltips. Use Bits UI `Tooltip`.

### Svelte 5

- Do not use `{@const}` inside plain `<div>` blocks — it only works inside block tags (`{#if}`, `{#each}`, etc.). Use a `<script>` variable instead.

### Tailwind

- Arbitrary values use underscores, not commas: `grid-cols-[1fr_360px]`, not `grid-cols-[1fr,360px]`.

### Empty states

- Use the icon-circle + title + subtitle pattern. Do not use dashed-border boxes.

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

### Brand

- `docs/brand/philosophy.md` — founding philosophy (process problem thesis). Read before product, marketing, or positioning decisions.
- `docs/brand/guidelines.md` — voice, colors, typography, tone. Read before UI or marketing work.
- `docs/brand/visual-guide.html` — rendered visual reference.

### Design

- `docs/design/frontend-ux.md` — UX principles (mental models, cognitive load, progressive disclosure, friction asymmetry, empty states, keyboard-first, status visibility). Read before designing or reviewing any UI. Skills: `.claude/skills/frontend-ux` (design-time), `.claude/skills/ux-review` (audit existing UI), `.claude/skills/brand-review` (audit against brand guidelines), `.claude/skills/spec` (turn an idea into a BRD-shaped spec).

### Marketing copy

- `docs/content/homepage.md` — canonical copy for `/`.
- `docs/content/early-access.md` — canonical copy for `/early-access`.

### Research

- `docs/research-ai-wholesale-disruption.md` — background research on the AI + wholesale thesis.
