# Onboarding Redesign — Implementation Plan

Status: proposal for review. Rooted in the current codebase (verified file-by-file, not assumed). The HTML mock (`threadline-onboarding-stepper.html`) is **not a source** — ignore it; visual/interaction direction will come from design refs Scott provides plus repo tokens.

---

## 0. Locked decisions & corrections (2026-07-23)

These override anything below them. A second verification pass against the code corrected four claims in the original draft; the resolved product decisions follow.

**Decisions (Scott):**

1. **Retailers still terminate at org creation.** No multi-phase onboarding for retailers — the current `create-retailer` path (sets `onboarding_completed_at` atomically, redirects to `/dashboard`) stays as-is. The §6 retailer column is **out of scope**; the new flow is rep/brand only.
2. **Phase 1 is not server-resumable — acceptable for now.** Name and Org Name are typed before the org row exists, so they aren't persisted on refresh. Fine for v1; don't build pre-org persistence.
3. **Reuse the existing prompt bar with its voice mode.** The `+layout.svelte` bar (ElevenLabs STT + `/api/voice` TTS loop) is reused as-is — full voice mode included, not a visual-only mic.
4. **Rep "brands you carry" = simple create for now.** Import Files for a rep creates local brand records (`create_brand`); the full cross-org connection/invite flow is deferred (finetune later).
5. **Desktop-first.** No dedicated mobile/tablet layout for v1. Build for desktop; graceful-enough is acceptable, purpose-built mobile is not in scope.

**Corrections to "what exists today" (verified in code):**

- **No org exists at onboarding start.** `kind:'onboarding'` is the terminal auth fallback for users with _no_ org (`auth.ts:252`); the org is created mid-flow at the Org-Type sub-step. Per-step persistence to `organizations.*` is impossible until then (see decision 2). Supersedes the §7 assumption of a live org row.
- **No `onboarding_state JSONB` column exists.** The migration _named_ `20260428000001_onboarding_state.sql` only added `onboarding_step INT` + `onboarding_completed_at TIMESTAMPTZ`. §7 option A (add the JSONB column) is a genuinely new migration.
- **Org-Type sub-step must dispatch by type.** `create-org` coerces any non-`brand` type to `rep` (`create-org:62`) — it cannot persist `retailer`. Brand/rep → `create-org`; retailer → `create-retailer`.
- **`skip_setup_section` does not cover Settings.** Valid sections are `orders, taxes, returns, members, products, accounts` only (`ai-tools.ts:2510`) — **not** address/shipping/payments/terms. For Phase 3 skips to round-trip into `/insight`, the `org_setup_status` section set must be extended (and note the latent bug: `getSetupStatus` reads a `payments` flag that `skip_setup_section` can't write).

**§4 decisions — now locked (2026-07-23):**

6. **Rework the existing `/onboarding` route in place** (§4.1) — keeps `hooks.server.ts` routing, the completed-org guard, and resume wiring.
7. **Members are a dedicated sub-step** (§4.3), backed by `invitations` + `api/invite/send`; accounts import may optionally surface detected owners.
8. **CSV + PDF only for v1** (§4.5) — no XLSX parser; say so in copy. Revisit if `.xlsx` turns out to be common.
9. **Repo tokens verbatim** (§4.6) — sharp corners (`--radius:2px`), IBM Plex, lime `--accent`; dark dock mirrors the existing Conversation panel. No onboarding-only radius exception.

Hybrid architecture (§4.2) and the org-type matrix (§4.4, rep/brand only per decision 1) are settled. **All blocking decisions are now locked — the plan is build-ready.**

---

## 0b. Known issues found while building (deferred)

- **Pending invitations are invisible app-wide (pre-existing RLS bug).** Every
  `SELECT` on `invitations` as the `authenticated` role fails with
  `permission denied for table users`, because the policy
  `Invitation readable by token holder or org admin`
  (`supabase/migrations/20260530000001_security_review_fixes.sql:17`) sub-queries
  `auth.users`, which `authenticated` cannot read. `/organization/members` does
  `invResult.data ?? []`, so the error becomes an empty list and the "Pending
  Invitations" section never renders. Reproduced directly against the local DB.
  Fix is one line — `OR email = (auth.jwt() ->> 'email')` — same semantics, no
  grant on `auth.users`. Deferred until onboarding is finished; belongs on its
  own branch since it touches shared security policy.

---

## 1. Goal

Replace the current stepped onboarding with a conversational, distraction-free first-run flow where a pinned AI prompt (Stitch) is the primary interaction. The screen has three layers:

1. A **welcome header** (logo + one-line intro).
2. A **four-phase roadmap** in the main content — General Information, Import Files, Settings, Integrations — each showing what it collects and progress.
3. A **pinned prompt dock**: a dark panel that asks one sub-step question at a time (with a typewriter effect so it feels like Stitch is talking to you), a `‹ Question X of Y ›` sub-stepper in its header, a **Skip** control in its footer, and the pinned input bar (`+` attach, mic-when-empty / send-when-typing).

As data is imported, **live stat cards** ("500 Accounts Added", "4 Members Added") appear in the right rail. Required steps (Name, Org Type, Org Name) cannot be skipped; everything else can, and skipped work is resumable later.

---

## 2. What exists today (ground truth)

Do not rebuild these — the plan reuses them.

**Existing onboarding**

- `src/routes/onboarding/+page.svelte` — current `$state`-driven stepped wizard (name → orgName → orgType `'rep'|'brand'|'retailer'` → first brand / catalog → invite → welcome). Resumes from `organizations.onboarding_step`. Has its own inline `parseCSV` for brands/members and uses `ProductImportFlow`. **This file is what we rework.**
- `src/routes/onboarding/+page.server.ts` — load guard; bounces completed orgs (retailer → `/dashboard`, rep/brand → `/insight`); loads seasons.
- `src/hooks.server.ts` — routes `kind:'onboarding'` users to `/onboarding`. Post-login landing via `src/lib/server/landing.ts` (`landingPathForOrgType`).

**Org / auth / roles**

- `organizations` table: `org_type TEXT` with `CHECK (org_type IN ('rep','brand','retailer'))` (migrations `20260411000001_multi_org_foundation.sql`, `20260709000001_retailer_org.sql`). Persistence columns already present: `onboarding_step INT`, `onboarding_completed_at TIMESTAMP`.
- `src/lib/types/database.ts` — `OrgType = 'rep'|'brand'|'retailer'` (hand-written types; there is **no** generated `database.types.ts`).
- Members: `organization_members` (role `user_role`) + `invitations` (email/role/brand_ids/token/expires) + `member_brand_access`. Migration `20260405000001_auth_and_roles.sql`. `user_role` enum = `admin, owner, member, sales, guest`.
- Auth: `src/hooks.server.ts` + `src/lib/server/auth.ts` (`loadUserContext` → 5 kinds incl. `onboarding`; active org via `active_org_id` cookie + `resolveActiveMembership`). `locals.organization`, `locals.orgType`, `locals.membership`.

**AI / Stitch (already wired — reuse heavily)**

- `src/routes/api/ai/+server.ts` — Anthropic backend. Haiku classifier → `claude-sonnet-4-6` tool loop (max 10). `agentId:'setup'` swaps in `SETUP_PROMPT`. ~40 tools incl. `create_account`, `add_product`, `create_brand`, `create_order`, `update_org_settings`/`_shipping`/`_payments`, `check_setup_status`, `skip_setup_section` (sections: `orders, taxes, returns, members, products, accounts`).
- `src/lib/server/ai-tools.ts` — `executeToolCall` (all tool impls). `src/lib/server/ai-prompts.ts` — `SETUP_PROMPT` already defines a one-question-at-a-time setup script with `SUGGESTIONS:[...]` clickable options.
- `src/lib/stores/conversation.ts` — client message flow, POSTs `/api/ai` with SSE streaming (`tool_start`/`tool_result` progress), history windowing, cache invalidation. The pinned prompt bar + "Conversation" panel live in `src/routes/+layout.svelte`.
- `src/lib/stores/setup-wizard.ts` — a client store (`SetupStep{ id, question, type: address|single|multi|yesno|navigate, options, skipLabel }`, `start/goBack/goNext/insertStepsAfterCurrent/saveAnswer/close`). Rendered by `src/lib/components/setup/SetupQuestionCard.svelte`. Currently launched from `/insight` and `+layout.svelte`.

**Import / parsing (exists)**

- `src/lib/utils/csv-parse.ts` (custom CSV parser; no papaparse/xlsx) + `csv-column-suggest.ts`.
- Bulk import APIs: `src/routes/api/accounts/import`, `.../products/import`, `.../orders/import`. Zod schemas in `src/lib/schemas/{product-import,order-import}.ts`, `account-import` helpers.
- AI PDF linesheet parse: `src/routes/api/products/parse-linesheet/+server.ts` (PDF only, ≤20MB, `LINESHEET_PROMPT`).
- Import UI: `src/lib/components/products/{ProductImportModal,ProductImportFlow}`, `.../accounts/{AccountImportModal}`, `.../shared/{BulkImportModal,ProductImportPreview}`, `.../ui/file-upload/file-upload.svelte`.
- **Gap: no XLSX parsing.** Only CSV + AI-parsed PDF today.

**Entities (minimum a create needs)**

- accounts → `business_name` (+ org scope). Table in `20260405000002_domain_tables.sql`.
- products → `brand_id, style_number, name, wholesale_price`. `20260405000024_products.sql` (+ `product_variants`, `product_images`).
- orders → `account_id, brand_id, created_by` (`order_number` + `total_amount` auto via triggers); `order_lines.line_total` generated.

**Onboarding-adjacent APIs**

- `src/routes/api/onboarding/create-org` (POST `{orgName, displayName, orgType}` → org + admin membership; idempotent; slug collision returns 409).
- `src/routes/api/onboarding/create-retailer`.
- `src/routes/api/setup/save` (structured steps via `setupSaveSchema` + `setupGatewaySchema`: address/shipping/payments/…, also sends invites).
- Invites: `src/routes/api/invite/{send,accept,revoke}`, `src/routes/invite/[token]/accept`.

**Design system**

- Tokens in `src/app.css`: `--background: 0 0% 98.5%` (warm paper), `--foreground: 216 5% 17%` (ink), `--accent: lab(92.1406% -20.4979 84.7726)` (lime) with `--accent-foreground:#1a1a00`, `--radius: 2px` (sharp corners), dark `--sidebar: 240 5.9% 10%`.
- Fonts (`src/app.css` + `src/app.html`): **IBM Plex Sans** (`--font-sans`), **IBM Plex Mono** (`--font-mono`), **Instrument Serif** (`--font-serif`). The prototype's Cormorant/Outfit/JetBrains are NOT used here — ignore them.
- UI primitives in `src/lib/components/ui/`: alert, avatar, badge, button, card, checkbox, dialog, file-upload, input, label, overlay-panel, section-sheet, select, separator, skeleton, switch, tooltip, date-select, price-range-slider.

---

## 3. Target experience

Single full-screen route (no app sidebar). Layout top-to-bottom: logo → welcome copy → `Step N of 4` label + 4-segment progress bar → four-phase roadmap list → (fixed) prompt dock. Right rail (fixed, bottom-right): live stat cards stacked above a "Prefer a human? / Schedule a meeting" block.

Interaction model:

- **Two levels.** Phases are the roadmap (top level). Each phase expands into ordered **sub-steps** shown one at a time in the prompt panel; the panel header shows the phase name (left) and `‹ Question X of Y ›` (right) with chevrons for within-phase back/next. **Skip** sits in the panel footer, right-aligned, and is hidden on required sub-steps.
- **Typewriter questions.** Each Stitch question types out (caret), then its input reveals — this is the "someone is working with you" cue, reinforced by short reactive acknowledgements after each answer ("Nice to meet you, Scott.", "Catalog's live — 312 products.") and by an ingestion state during file processing.
- **Input bar** is context-aware: placeholder changes per sub-step; shows mic when empty and a send arrow once typing; `+` attaches files. After setup completes it reverts to the everyday "Ask anything about your business…".
- **Live stat cards** animate in as imports complete.

---

## 4. Decisions to lock before building

These change the build materially. Recommendations given; confirm each.

1. **Replace vs. add a route.** Recommend: rework `src/routes/onboarding/+page.svelte` in place (keeps `hooks.server.ts` routing, resume, and the guard). Alternative: new `/welcome` route + redirect.
2. **Deterministic flow vs. Stitch-driven.** Recommend **hybrid**: a deterministic phase/sub-step state machine owns structure, progress, skip/back, and persistence; it calls existing typed APIs for each write (`create-org`, `setup/save`, `*/import`, `parse-linesheet`). Stitch (`/api/ai`) powers only free-text answers typed into the bar and the extraction narration. This keeps onboarding reliable and testable while preserving the conversational feel. (Pure `SETUP_PROMPT` agent-driven is possible but harder to make deterministic/skippable/resumable.)
3. **Members: own sub-step or folded into Accounts.** The mock folds member detection into the accounts import so Import Files is 3 questions. Recommend keeping a dedicated **Members** sub-step (invite-by-email UI already backed by `invitations` + `api/invite/send`) and letting account import _optionally_ surface detected owners. Confirm which.
4. **Sub-step set is org-type-aware** (see §6). A rep does not own a product catalog; a retailer's flow differs. Confirm the per-type matrix.
5. **XLSX support.** Today only CSV + PDF. If buyers/reps commonly hand over `.xlsx`, add a parser (e.g. `xlsx`/SheetJS) behind the same import endpoints. Otherwise scope to CSV + PDF and say so in copy.
6. **Visual treatment.** Repo is sharp-cornered (`--radius:2px`), IBM Plex, lime accent. The mock is rounded/soft. Recommend adopting repo tokens verbatim (sharp corners, IBM Plex, `--accent` lime) so onboarding matches the app. Confirm, or approve a softer onboarding-only radius.

---

## 5. Architecture (recommended hybrid)

- **Route owns a state machine.** `phases: Phase[]`, each `Phase.subs: SubStep[]`; a global pointer `(phaseIndex, subIndex)`; `subState[]` (`'' | 'done' | 'skipped'`). Derive segment fill and phase list states from this. Mirrors the proven pattern already in `setup-wizard.ts` — extend that store rather than inventing a new one where possible (it already has `goBack/goNext/insertStepsAfterCurrent/saveAnswer` and a `SetupStep` shape). Add phase grouping + required flags.
- **Each sub-step is a small component** that renders its input and, on completion, calls a typed API then advances. No sub-step invents schema — they call existing endpoints.
- **Stitch is optional per sub-step.** Free-text bar answers route to `/api/ai` (reuse `conversation.ts`); structured picks/uploads bypass the model and hit the deterministic API. The typewriter/acks are client-side and do not require a model round-trip (keeps it fast and offline-testable).
- **Persistence** after every completed/skipped sub-step so refresh resumes exactly (extend `onboarding_step` → a phase/sub cursor; see §7).

---

## 6. Org-type-aware phase/sub-step matrix (critical)

`org_type` fundamentally changes what "Import Files" means. This mirrors the current wizard (brand has a catalog step; rep has a brand-invite step) and the federation model.

| Phase                                 | Brand (BOA)                                                                              | Rep (MBISR)                                                     | Retailer                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| **1. General Information** (required) | Name → Org type → Org name                                                               | same                                                            | same                                        |
| **2. Import Files**                   | Accounts, **Products (own catalog)**, Orders                                             | **Brands you carry** (`create_brand`/connect), Accounts, Orders | Accounts/vendors, Orders — no owned catalog |
| **3. Settings**                       | Address, shipping, payments, terms, taxes, returns (`setup/save` + `skip_setup_section`) | Business address, commission defaults, payment terms            | Ship-to / billing, terms                    |
| **4. Integrations**                   | Accounting (QuickBooks), Email/Calendar, Slack/Notion/Sheets                             | same                                                            | same                                        |

Key rule (from `CLAUDE.md` and federation model): **products belong to brands, not to reps.** For a rep, the "products" concept is reached via the brands they carry. Retailer onboarding already has a separate creation path (`api/onboarding/create-retailer`, lands `/dashboard`) — treat retailer as a distinct branch, not an afterthought.

Reconcile the mock's copy ("Add the products that Acme sells") — that phrasing is brand-correct only.

---

## 7. Data & persistence

- Reuse `organizations.onboarding_completed_at` for the terminal state and the existing guard in `onboarding/+page.server.ts` + `hooks.server.ts`.
- Replace the single integer `onboarding_step` cursor with a richer cursor. Two options:
  - **A (minimal migration):** add `onboarding_state JSONB` to `organizations` holding `{ phase, sub, subStates, statCounts }`. New migration `supabase/migrations/<ts>_onboarding_state.sql`. Keep `onboarding_step` for backward compat during transition.
  - **B (no migration):** encode `(phase, sub)` into the existing `onboarding_step` integer. Simpler but loses skip/stat detail on resume.
  - Recommend **A**.
- Skipped optional sections already have a home: `skip_setup_section` writes section status (verify the backing table/column in `ai-tools.ts`) — reuse it so onboarding skips and the `/insight` setup checklist stay consistent.
- Persist via a small `POST /api/onboarding/progress` (new) or extend `api/setup/save`. Debounce writes.

---

## 8. Components to build / reuse

New, under `src/lib/components/onboarding/`:

- `OnboardingRoadmap.svelte` — the 4-phase list (states: active/done/upcoming) + `Step N of 4` label.
- `ProgressSegments.svelte` — 4-segment bar (fill per phase reached).
- `StitchPanel.svelte` — dark prompt panel: phase-name + `Question X of Y` header with chevrons, typewriter question body, Skip footer. (Wrap/extend `SetupQuestionCard.svelte` rather than fork.)
- `PromptBar.svelte` — `+` / input / mic↔send. Reuse the layout's existing bar markup from `+layout.svelte` for consistency; extract if shared.
- `StatCard.svelte` + `StatRail.svelte` — live count cards.
- Sub-step views (thin): `SubName`, `SubOrgType`, `SubOrgName`, `SubMembers`, `SubAccounts`, `SubProducts` (brand) / `SubBrands` (rep), `SubOrders`, `SubSettings*`, `SubIntegration*`.

Reuse directly: `ProductImportFlow`, `AccountImportModal`/helpers, `file-upload`, `parse-linesheet`, the `api/*/import` endpoints, `setup-wizard.ts` (extended), `SetupQuestionCard.svelte`, all `ui/*` primitives, `conversation.ts` for free-text Stitch.

Rework: `src/routes/onboarding/+page.svelte` (host the new layout + machine), `+page.server.ts` (load org-type-aware phase config + resume cursor + seed data like seasons/brands).

---

## 9. Server / API work

Mostly reuse. New/changed:

- `create-org` — confirm it accepts and persists `orgType` (body already includes it; verify it writes `organizations.org_type`). Ensure the rep/brand/retailer branch triggers the right side effects (brand self-brand trigger already exists).
- `POST /api/onboarding/progress` (new) — persist the phase/sub cursor + stat counts (option A).
- Ingestion reuses `api/accounts/import`, `api/products/import`, `api/orders/import`, `api/products/parse-linesheet`. Stat counts come from the import responses (row counts) — no new query needed.
- Members reuse `api/invite/send`.
- Settings reuse `api/setup/save`.
- Optional: XLSX support (decision §4.5) added inside the existing import endpoints so the UI stays unchanged.

---

## 10. Visual system mapping

Translate the prototype to repo tokens (this is a `CLAUDE.md` "do not guess styling" area — copy exact classes/tokens):

- Colors: page `bg-background`, ink `text-foreground`, muted `text-muted-foreground`, borders `border-border`. Dark prompt panel: `bg-sidebar` / `bg-zinc-900` family (match the existing Conversation panel in `+layout.svelte`, lines ~871–920). Accent/CTA: lime `--accent` with `--accent-foreground`.
- Corners: `--radius: 2px` (sharp) unless §4.6 approves softer.
- Type: IBM Plex Sans body, IBM Plex Mono for the `Question X of Y` / step labels, Instrument Serif only if a display moment is wanted. **No Cormorant/Outfit/JetBrains.**
- Reuse `ui/button`, `ui/input`, `ui/card`, `ui/file-upload`, `ui/select` rather than hand-rolled controls (CLAUDE.md rule).

---

## 11. Implementation phases (for Claude Code)

Each phase ends green on `bun run check`, `bun run lint`, `bun run test:run`.

- **P0 — Scaffold + shell.** Rework the route to render the new static layout (logo, welcome, roadmap, segments, dock, stat rail) with repo tokens. State machine with mock advance, no persistence. Acceptance: full click-through of all 4 phases visually, back/skip/chevrons work, matches app tokens.
- **P1 — General Information (required).** Wire Name/Org type/Org name to `create-org` (+ display_name to `profiles`). Typewriter + acks. Persist cursor. Acceptance: org row created with correct `org_type`; refresh resumes at phase 2.
- **P2 — Import Files (org-type-aware).** Accounts import (`api/accounts/import`), Products/Brands per type, Orders import; PDF linesheet via `parse-linesheet`; Members invites. Live stat cards from import counts. Acceptance: real rows created; skip works; cards reflect counts.
- **P3 — Settings.** Address/shipping/payments/terms/taxes/returns via `api/setup/save` + `skip_setup_section`, consistent with the `/insight` checklist. Acceptance: `/insight` setup status reflects what was set/skipped here.
- **P4 — Integrations.** Connect cards for accounting/email/Slack/Notion/Sheets (reuse whatever connect flows exist under `organization/*`; verify before building). All skippable.
- **P5 — Completion + hardening.** Set `onboarding_completed_at`, redirect via `landingPathForOrgType` (rep/brand → `/insight`, retailer → `/dashboard`). Resume from any cursor. Free-text Stitch bar fallback via `/api/ai`. Tests + role-aware audit.

---

## 12. Testing & verification

- Unit (Vitest, colocated): the phase/sub-step machine (advance, skip, back, required gating, resume from cursor), any new parsing/mapping, stat-count derivation. Follow `CLAUDE.md` testing rules.
- `bun run check` at 0 errors; `bun run lint` clean (husky will format).
- Manual: exercise all three `org_type` branches (brand, rep, retailer) end-to-end in the browser; confirm redirect targets differ.
- Role-aware audit: render as each org type and strip type-wrong copy (e.g. never show "your product catalog" to a rep).
- Federation safety: onboarding only writes to the user's own new org; confirm no cross-org writes and RLS holds.

---

## 13. Risks & edge cases

- **Retailer divergence** — separate creation path and landing; must not be bolted onto the brand flow.
- **Rep ≠ products** — products are the brands' catalogs; the rep Import Files step is about brands carried, not an owned catalog.
- **Resume mid-phase** — cursor must restore sub-step and prior answers; idempotency on `create-org` already handles double-submit.
- **Skips must round-trip** — a skipped Settings/Members section must show as skippable-but-pending in `/insight`, using the same `skip_setup_section` state.
- **XLSX expectation** — users may drop `.xlsx`; today that silently fails. Decide before P2.
- **Guests / non-admins** — onboarding is an admin action; verify a non-admin never reaches it (auth kind gating).
- **Copy/tone** — run all user-facing strings against `docs/brand/guidelines.md` §1.5 before shipping; do not transcribe mock copy verbatim.

---

## Open questions for Scott

1. Confirm the six decisions in §4 (especially: hybrid architecture, members as own step vs folded, org-type matrix, XLSX, sharp-vs-soft visuals).
2. Integrations (§ phase 4): which connectors are in scope for v1, and do connect flows already exist under `organization/*` to reuse?
3. Persistence: approve JSONB `onboarding_state` (option A) vs. reusing the integer cursor (option B).
