# Threadline

SvelteKit 5 app for fashion reps, brands, and buyers. Deployed to Vercel at `threadline.systems`.

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

- `bun install` — dependencies
- `bun run dev` — dev server
- `bun run build` — production build
- `bun run check` — svelte-check + TypeScript
- `bun run lint` — prettier + eslint
- `bun run test:run` — run vitest once (CI-style)
- `bun run test` — vitest watch mode
- `bunx` instead of `npx`

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

## Git Workflow

- `main` — production
- `dev` — integration branch; PR to `main` for release
- Feature branches: PR into `dev` first, test, then `dev` → `main`
- Use worktrees under `.worktrees/<branch-name>` for isolated feature work

## Project Management

- Tasks and milestones live in Linear project **"Threadline"**
- Move tickets to **In Progress** when you start work, not after completing it

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
- `docs/brand/guidelines.md` — voice, colors, typography, tone. Read before UI or marketing work.
- `docs/brand/visual-guide.html` — rendered visual reference.

### Marketing copy
- `docs/content/homepage.md` — canonical copy for `/`.
- `docs/content/early-access.md` — canonical copy for `/early-access`.

### Research
- `docs/research-ai-wholesale-disruption.md` — background research on the AI + wholesale thesis.
