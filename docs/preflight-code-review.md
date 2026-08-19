# Preflight (onboarding) — code review & fix plan

Scope: `src/routes/onboarding/+page.svelte`, `+page.server.ts`,
`src/lib/components/onboarding/machine.ts`, `member-template.ts`, and the
endpoints preflight calls (`api/onboarding/progress`, `api/onboarding/draft`,
`api/onboarding/create-org`, `api/onboarding/create-retailer`, `api/setup/save`,
`api/invite/send`, `api/{accounts,products,orders}/import`).

Severity: **P0** data loss / broken flow · **P1** wrong behaviour a user will hit
· **P2** polish, a11y, dead code.

---

## P0 — must fix before this ships

### 1. Settings answers never mark setup complete → the app re-asks for them

`+page.svelte:537` posts to `/api/setup/save`, which writes the org columns and,
for some steps, `org_setup_status` (`api/setup/save/+server.ts:111,290`). The
three preflight settings steps (`address`, `payment-terms`, `payment-methods`)
are **not** among the steps that write `org_setup_status`. Result: the user
answers them in preflight and the app asks again later.

Fix: extend the `org_setup_status` upsert to cover the preflight steps, and
decide what a _skipped_ settings step records (currently: nothing at all).

### 2. Skipping a Settings step saves nothing

`skip()` (`+page.svelte:502`) only records a stat + local `subStates`. For
Settings there is no server write, so an org can finish preflight with no
address, no terms, no payment methods, and nothing marking them as
"deliberately skipped". Downstream code can't distinguish "not asked" from
"declined".

Fix: post the schema's `'skip'` value (`setup-save.ts` already accepts
`z.literal('skip')` for terms/methods) so the skip is recorded.

### 3. `progress` endpoint can write to the wrong organization

`api/onboarding/progress/+server.ts:22-28` resolves the org with
`.eq('role','admin').limit(1).maybeSingle()` — **any** admin membership, ordered
arbitrarily. A user who is admin of two orgs can have their preflight cursor
written to the other org.

Fix: scope to the active org (`active_org_id` cookie / `locals.organization.id`)
and fall back to the founding membership only when absent.

### 4. `progress` rejects `owner`, `invite/send` accepts it

`progress` requires `role = 'admin'`; `api/invite/send/+server.ts:12` allows
`['admin','owner']`. If an org ever uses `owner`, progress returns 404 and
**resume silently stops persisting** — the user loses their place on refresh
with no error shown (the client `.catch(() => {})`s it).

Fix: align the role set in one shared helper. Also surface a failed persist
instead of swallowing it.

### 5. `onboarding_state` is written unvalidated and unbounded

`progress/+server.ts:41` stores whatever JSON the client sends. No shape check,
no size cap.

Fix: validate with a Zod schema (phase/sub ints, subStates map, stats array with
a max length) and reject oversized payloads.

### 6. Member invites: sequential N requests, silent partial failure

`confirmIngest` (`+page.svelte:1101`) loops `await fetch` per member. A 200-row
CSV is 200 sequential round-trips, each of which calls
`supabaseAdmin.auth.admin.listUsers()` server-side (`invite/send:78`) — an
unpaginated call that **defaults to 50 users per page**, so an existing user
beyond the first page is not found and is treated as new.

Fix: (a) batch endpoint or bounded concurrency; (b) replace `listUsers()` with a
targeted lookup by email; (c) report `sent` vs `failed` with the failing
addresses instead of only "none could be sent".

---

## P1 — wrong behaviour a user will hit

### 7. Rep orgs are asked for a product catalog and orders they can't import

`products` requires `data.selfBrandId` (`+page.svelte:1053`) and `orders/import`
requires a self-brand (`orders/import/+server.ts:59`). Only brand orgs have one.
A rep is shown both steps, drops a file, and gets an error telling them their
org type is unsupported.

Fix: the org-type matrix (flagged P2 in the file header). Filter `phases[].subs`
by `data.organization?.org_type` so reps never see those steps.

### 8. Typing one email invites and immediately advances

`answer()` → `inviteOne()` (`+page.svelte:674`) calls `advanceGlobal()` after a
single invite, so the copy "or invite them by email" is a one-shot: you cannot
type a second address.

Fix: stay on the step, append the invited person to a running list, advance only
on explicit continue.

### 9. Voice dictation on non-text steps silently does nothing

`toggleVoice` fills `draft` on every step, but `answer()` returns early for
`kind !== 'text'` (`+page.svelte:669`). On a choice/upload step the user dictates,
sees their words, presses Enter, and nothing happens.

Fix: disable the mic (and the input) on non-text steps, or map dictation to the
step's control.

### 10. Zero-count imports are inconsistent

Accounts/products advance with a `0 …Added` card; orders block with an error
(`+page.svelte:1179`). Same situation, two behaviours.

Fix: pick one. Recommend orders matching the others (advance, `0 Orders Added`),
with the "nothing matched" explanation shown as a note on the card.

### 11. Completion summary renders skipped steps as achievements

`+page.svelte:1487` lists every stat with a checkmark, so a skipped step shows
"✓ 0 Members Added". The `note` ("Skipped for now") is dropped, and
`.replace(/^\d+\s*/,'')` is dead code now that labels never start with a digit.

Fix: filter zero/skipped rows out of the summary, or render them with a dash and
the note.

### 12. Duplicate emails in a CSV send duplicate invites

`parseMembers` (`+page.svelte:817`) doesn't dedupe. The second send fails and is
counted as a failure.

Fix: dedupe by lowercased email during parse.

### 13. No row cap on any import

A 10k-row CSV is parsed, previewed (4 shown), and committed in full. Members is
the dangerous one — it sends real email.

Fix: cap rows with an explicit message ("I'll take the first N — split the file
for the rest").

### 14. `redirectTimer` is never cleared on unmount

`finishOnboarding` (`+page.svelte:485`) sets a 2.6s timer that calls
`window.location.href`. Navigating away in that window yanks the user back.

Fix: clear it in an `$effect` teardown.

### 15. Reduced-motion users never auto-advance

Same function: the redirect is inside `if (!prefersReduced)`. Reduced motion is a
motion preference, not a "don't navigate" preference.

Fix: always schedule the redirect; skip only the animation.

### 16. `create-org` ignores org type on the idempotent path

`create-org/+server.ts:29` returns the existing org without checking that its
`org_type` matches what the user just chose. Re-entering preflight and choosing
a different type silently keeps the old one.

Fix: return the existing org _and_ tell the client the type differs, or reject.

### 17. Stat number column clips 3-digit counts

`w-7` (28px) at `text-xl` fits two digits. "250 Products Added" overflows.

Fix: `min-w-[2ch]` with natural growth, or drop the fixed width and align the
label column instead.

### 18. `seasons` is loaded and never used

`+page.server.ts` queries seasons for the catalog step; `parseProducts` hardcodes
`season_id: null` (`+page.svelte:870`). Imported products land with no season.

Fix: either wire the season picker or drop the query.

---

## P2 — polish, a11y, hygiene

19. **Collapsed panel can't be expanded by keyboard** — it's a `div` with
    `onclick` and two `svelte-ignore a11y_*` comments (`+page.svelte:1542`). Needs
    a real `<button>` or `role="button"` + key handler + `aria-expanded`.
20. **Typewriter has no `aria-live`** — screen readers get character-by-character
    updates, or nothing. Render the full question to AT and animate visually only.
21. **Address inputs are placeholder-only** — no `<label>`, so no accessible name
    (`+page.svelte:1764`). Violates the project's own form rules; also these are
    raw `<input>`s rather than `ui/input`.
22. **Manual Entry is a no-op** (`startManualEntry`, `+page.svelte:807`) — a
    visible button that does nothing. Tracked deliberately, but it ships as dead UI.
23. **Dead code**: `currentSubState` (`:413`) is unused since the badge was
    removed; duplicated `svelte-ignore state_referenced_locally` (`:302-303`).
24. **Right rail is `hidden xl:block`** — no stats at all below 1280px.
25. **Copy is provisional** — the file header says to run it against
    `docs/brand/guidelines.md` §1.5. Not done.
26. **`persistCursor` is fire-and-forget** and swallows errors; rapid advances can
    drop the last write with no signal.
27. **Retailer path is untested end-to-end here** — `create-retailer` sets
    `onboarding_completed_at` atomically (`retailers.ts:85`), so preflight
    terminates correctly; worth an explicit test so a refactor can't break it.

---

## Suggested order of work

| Batch | Items        | Why first                                                                   |
| ----- | ------------ | --------------------------------------------------------------------------- |
| **A** | 1, 2         | Settings currently produce no durable outcome — the phase is decorative     |
| **B** | 3, 4, 5      | Persistence correctness + a security hole; small, isolated endpoint changes |
| **C** | 6, 12, 13    | Invites send real email; batching + dedupe + caps together                  |
| **D** | 7            | Org-type matrix; unblocks reps using preflight at all                       |
| **E** | 8, 9, 10, 11 | Interaction correctness — each is small and independently testable          |
| **F** | 14–18        | Lifecycle + display bugs                                                    |
| **G** | 19–27        | a11y, dead code, copy pass                                                  |

Batches A–C are the ones that lose or corrupt user data. D is the one that makes
preflight usable for half the user base.
