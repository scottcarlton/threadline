# Preflight status and work queue

Verified against `main` @ `6420444` on 2026-09-01. Supersedes the review written
at `4022c94`; that version predates 101 commits and several of its P0 items are
now built. Every row below was re-checked in the code, not carried forward.

Scope: `src/routes/onboarding/+page.svelte`, `+page.server.ts`,
`src/lib/components/onboarding/*`, and the endpoints the flow posts to.

Framing per Scott: **what's missing, what can be improved, what can go away.**

---

## Locked decisions (2026-09-01)

1. **Retailer stays minimal.** Retailers terminate at org creation
   (`create-retailer` redirects to `/dashboard`). No multi-phase retailer
   preflight for now. The only retailer work in scope is G2: stop the roadmap
   promising four phases they never see. A fuller retailer flow is a separate
   milestone, after brand and MBISR are finished.
2. **Cursor persistence is `onboarding_state` JSONB** (plan option A). New
   migration. A bare integer phase index cannot mean the same thing to a rep
   (3 phases) and a brand (4), and it loses skip state and stat counts on resume.
3. **The forward chevron stays, gated.** Do not delete it. Disable it when the
   current or the previous question is unanswered. This closes M5 without
   removing navigation.

Still open, and blocking the matrix: see Q1 at the bottom.

---

## The org-type matrix, as built today

`buildPhases` (`+page.svelte:301`) is the only place org type changes what is
asked. This table is the code, not the intent.

| Phase                  | Brand (BOA)                             | Rep (MBISR)                                       | Retailer      |
| ---------------------- | --------------------------------------- | ------------------------------------------------- | ------------- |
| 1. General Information | name, org type, org name                | same                                              | same          |
| 2. Import Files        | members, accounts, products, orders     | **brands**, members, accounts, products*, orders* | never reached |
| 3. Settings            | address, payment terms, payment methods | **phase does not exist**                          | never reached |
| 4. Connections         | inbox, tools                            | inbox only                                        | never reached |

\* The two rep steps that dead-end. See M3.

Reps reach `buildPhases` through `REP_SKIPPED_SUBS`
(`address`, `payment-terms`, `payment-methods`, `connect`), which empties
Settings, and the phase is then dropped by the zero-sub filter at `:326`.
`RETAILER_SKIPPED_SUBS` exists but is currently unreachable, since a retailer
never gets past phase 1.

---

## Built since the last review

| Item                                                  | Evidence                                                                                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M2** Rep "brands you carry" step                    | `brandsSub` at `:277`, injected rep-only at `:311`. CSV upload, downloadable template, manual entry, stat card. Saves via `POST /api/setup/save` step `brand-manual` (`:1008`, `:1098`). |
| **M4 / G5** Payment terms and methods removed for rep | PR #275. Also removed for retailer. Brand keeps all three.                                                                                                                               |
| **M7** Brand CSV imports land season-less             | Fixed. `parse.ts:257` reads a `season` header, `:307` carries `season_name`, and `+page.svelte:1607` resolves it with `matchSeasonId`.                                                   |
| **G3** `startManualEntry` was an empty function       | Fixed. It opens the manual brand entry panel (`:1276`).                                                                                                                                  |
| **M1** No org-type branching at all                   | Partially fixed. `buildPhases` branches, but the result is not yet the intended matrix.                                                                                                  |

M2 has one gap left: the step only creates **local** brand records. Nothing calls
`POST /api/setup/save` step `partner-invite`, so no connect code is minted and no
brand is invited. A rep finishes with brand rows that have no `org_connections`
behind them, which is what actually gates catalog visibility, order creation and
`/shop` (`docs/adr/0001-federation-model.md`). Tracked as **M2b**.

---

## 1. What's missing

### M3 · Two rep steps are dead ends, not skips — [P0, rep]

| Step       | What a rep gets                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `products` | Client guard at `:1305` and `:1483`: _"Product imports need a brand catalog, that's only set up for brand organizations right now."_                   |
| `orders`   | No client guard. `api/orders/import/+server.ts:59` resolves the self-brand and 404s with the raw string _"No self-brand found for this organization"_. |

Rep orgs never have a self-brand: the `auto_create_self_brand` trigger only fires
for `org_type = 'brand'`. Both messages tell the user their account is the wrong
shape for a flow the product routed them into. The orders one leaks backend text.

### M5 · Nothing gates a required question — [P0, both types]

`nextSub = () => canNext && subIndex++` (`:786`), and `canNext` is `canGoNext`,
which checks array bounds only (`machine.ts`). The chevron is disabled only at
the end of a phase (`:2059`). `isSkippable` is imported and used for the Skip
button but never for the chevron. So a user can chevron past the org-type cards,
type an org name, and `create-org:60` coerces the missing answer:
`const validOrgType = orgType === 'brand' ? 'brand' : 'rep'`. They are now an
MBISR org and were never asked. Compounded by I11.

Decision 3 applies here: gate the chevron, do not remove it.

### M6 · The choice is never confirmed or reversible — [P1, both types]

Org type defines the rest of the app. The flow never restates it after the click,
never shows it in the roadmap, and offers no way back once the org row exists.
One line of confirmation copy is the cheapest fix in this document.

### M8 · Below 1280px there is no progress state at all — [P2, both types]

The right rail (`fixed right-10 bottom-6 hidden w-56 xl:block`, `:2746`) carries
the running import counts and the "Prefer a human?" escape hatch. Both vanish
below `xl`. Desktop-first is a locked decision, but 1280 is not the mobile line,
it is a narrowed laptop window.

---

## 2. What can be improved

### I1 · The counters lie about effort — [P2]

"Step 1 of 4" (`:1866`) plus "Question 1 of 4" (`:2056`) implies 16 questions.
Phases hold 4/4/3/2 for a brand and a different shape for a rep. Show questions
remaining overall, or drop the per-phase counter.

### I2 · The members step is one-shot — [P1]

Copy says "or invite them by email"; `inviteOne` calls `advanceGlobal()` on
success (`:990`), so a second address is impossible. Stay on the step, append to
a visible list, advance on explicit continue.

### I3 · Bulk invites fail invisibly — [P1]

The ingest loop reports only when `sent === 0` (`:1544`), with
"None of those invites could be sent". 12 of 15 failing looks like success.
Report sent versus failed, with the addresses.

### I4 · Zero-count imports behave two different ways — [P2]

Accounts and products advance with a `0 Added` card; orders block with
"None of those rows matched an account and product" (`:1646`). Pick one. Orders
matching the others, with the explanation on the card, is the consistent choice.

### I5 · Dictation silently no-ops on most steps — [P2]

`toggleVoice` (`:458`) fills `draft` on every step, and the mic button (`:2697`)
is never disabled. `answer()` returns early for `kind !== 'text'` (`:965`). On
choice, multi, address and upload steps the user speaks, sees their words, hits
Enter, and nothing happens. Disable the mic there, or map dictation to the
control.

### I6 · Errors are one string, sometimes the server's — [P0]

`let errorMsg = $state('')` at `:440` with 49 assignment sites, several carrying
raw backend text. `docs/beta-readiness.md` Gate 1 names this file explicitly as
still on the old pattern; the canonical Zod plus superforms plus sonner pattern
is a P0 there for auth, onboarding and checkout.

### I7 · The address step ignores the project's own form rules — [P1]

Raw `<input>` elements, placeholder-only, no `<label>` (`:2272` onward). No
accessible name, and not `ui/input`. CLAUDE.md forbids both.

### I8 · The dock covers the roadmap when the panel is tallest — [P2]

The dock is `fixed inset-x-0 bottom-0` (`:1946`) and upload steps hold a
`min-h-[222px]` floor (`:2118`). On a short viewport the roadmap, the only place
the whole shape of preflight is visible, sits behind the panel exactly when the
panel is largest.

### I9 · Stat number column clips at three digits — [P2]

`w-7` at `text-xl` (`:2760`) fits two. "250 Products Added" overflows.

### I10 · Copy has never been run against the brand guidelines — [P1]

The file header says so at `:5`; beta-readiness Gate 2 requires it. Beyond tone,
some content is org-type-wrong: the rep roadmap subtitle still reads "Upload
brands, members, accounts, products, and orders" while two of those steps
dead-end.

### I11 · `create-org` ignores org type on the idempotent path — [P0]

`create-org:29` returns the existing org without comparing `org_type`.
Re-entering preflight and choosing Brand keeps the rep org, silently. This is the
second half of M5: you can become the wrong type by accident and then not fix it.

### I12 · `text-xs` throughout the flow — [P1]

Nine occurrences, including the Manual Entry button (`:2594`). CLAUDE.md sets
`text-sm` as the floor.

---

## 3. What can go away

### G1 · The forward chevron

Superseded by decision 3. Gate it on the current and previous answers rather than
deleting it.

### G2 · The 4-phase roadmap, for retailers — [P1]

Retailers terminate at org creation (`:882`, `create-retailer`, then
`/dashboard`) and never see phases 2 to 4. The roadmap and "Step 1 of 4" are on
screen before the org type is known and promise four phases of work they will
never be shown. Render the roadmap only once the type is chosen, and give
retailers a one-phase view.

### G4 · The products and orders steps, for reps

See Q1. Half-done: M2's brands step was added, but products and orders were not
removed alongside it.

### G6 · The length of the closing verification sequence — [P2]

Nine lines plus a 700ms hold (`:754`) is roughly six seconds. For a user who
skipped everything that is six seconds of ceremony reporting that nothing
happened. Keep the summary, it correctly distinguishes done from skipped, and
scale the cadence to the number of lines that carry a count.

---

## Work queue

| #   | Work                       | Why here                                                               |
| --- | -------------------------- | ---------------------------------------------------------------------- |
| 1   | M5 + I11                   | Wrong org type, silently, permanently. Both are small.                 |
| 2   | M3 (needs Q1)              | The last structurally broken thing in the rep flow.                    |
| 3   | I6 + I7 + I12              | Named P0/P1 in beta-readiness Gate 1 and CLAUDE.md.                    |
| 4   | G2 + M6                    | Stop promising retailers work they never see; confirm the choice.      |
| 5   | I2 + I3                    | Members step correctness.                                              |
| 6   | M2b                        | Federation: mint connect codes so a rep's brands are real connections. |
| 7   | I1, I4, I5, I8, I9, M8, G6 | Layout, consistency, ceremony.                                         |
| 8   | I10                        | Copy pass across the whole flow, once the questions are settled.       |

Cursor persistence (decision 2) lands with whichever item first needs it,
most likely item 4.

---

## Q1 · The one open matrix question

**What should a rep's products and orders steps become?**

Options, with the recommendation first:

1. **Remove both from the rep flow.** Products belong to brands, not reps
   (CLAUDE.md federation rule), and the brands step already occupies that slot.
   Rep Import Files becomes brands, members, accounts. Smallest change, and it
   removes two apologies.
2. **Remove products, keep and fix orders.** Rewrite `api/orders/import` to
   resolve the brand from the rep's carried brands instead of a self-brand. More
   work, but a rep with existing orders is a real case.
3. **Keep both and gate them behind having carried brands.** Most work, and the
   first-run case is exactly the one where no brands exist yet.

Everything in the rep column of the matrix is final once this is answered.
