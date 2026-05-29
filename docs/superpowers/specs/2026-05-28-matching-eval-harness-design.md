# Matching Eval Harness — Claude Code Brief

A staged plan to add a measurement layer over Threadline's existing `email-intake` matching pipeline. The goal: turn threshold-tuning from intuition into data, and prevent silent quality regressions when the parser or resolver changes.

Hand this file to Claude Code as the starting brief. Do not "build the whole harness in one PR" — work phase by phase, and re-read the relevant source files before each phase.

You may move this file into `docs/superpowers/specs/<date>-matching-eval-harness-design.md` if that matches the existing spec convention; otherwise leave it at the repo root.

---

## Why this matters (read before touching code)

`src/lib/server/email-intake/` already implements a real matching engine:

- `parser.ts` — calls Anthropic to extract structured fields from raw email bodies (account, brand, items, ship window).
- `resolve.ts` — exports `THRESHOLDS` (`ACCOUNT_MIN`, `ACCOUNT_AMBIGUITY_DELTA`, `PRODUCT_MIN`, `PRODUCT_AMBIGUITY_DELTA`, `BRAND_MIN`) and resolves parser output against the live catalog via `supabaseAdmin`, returning a `ResolvedOrder` with per-field confidences.
- `outcome.ts` — `decideOutcome()` consumes a resolved order and decides `submitted` vs `needs_review` with structured `reasons`.

What's missing is a **scorecard**. Today:

- Fixtures in `__fixtures__/*.txt` are raw email bodies — no labeled "expected outcome" alongside them.
- Existing tests cover pure functions (`parseShipDate`) and mocked `ResolvedOrder` → `decideOutcome` — there is no end-to-end replay.
- `THRESHOLDS` constants are set by intuition. Changing them has no measured effect on auto-submit rate, false-positives, or false-negatives.
- A parser/resolver change that silently degrades match quality would not be caught by CI.

The fix is a harness that loads labeled fixtures, runs them through the pipeline (with the LLM and DB pinned to deterministic inputs), and reports precision/recall/auto-submit-rate per layer. Once it exists, threshold-tuning is a measurable experiment instead of a guess.

---

## Non-negotiables

1. **Do not modify the pipeline (`parser.ts`, `resolve.ts`, `outcome.ts`) as part of this work.** The harness observes; it does not change behavior. If you find a bug while building the harness, file a follow-up ticket and surface it via a failing eval — do not fix in the same PR.
2. **The harness must run deterministically in CI without making live LLM calls or live DB queries.** Cache parser outputs to disk and mock the resolver's DB access. A live-LLM / live-DB mode is acceptable as a separate opt-in command for periodic refresh.
3. **Do not change `THRESHOLDS` values in this work.** Tuning them is the _output_ of the harness, not part of building it. Threshold changes are a separate, data-justified PR after the harness lands.
4. **Verify, do not guess.** Per CLAUDE.md. Read the parser/resolver/outcome code in full before defining the `Expected` schema. The fields you label must match the fields the pipeline actually produces.
5. **Costs.** The Anthropic call in `parser.ts` is real money. The harness must not call it unintentionally — cached mode is the default; live mode is explicit and rate-limited.

---

## Required reading (every phase)

Before any code:

- `CLAUDE.md` (root) — testing conventions, "do not guess", `bun run check` discipline
- `src/lib/server/email-intake/parser.ts` — full `ParsedOrder` / `ParsedOrderItem` shape, system prompt, tool schema
- `src/lib/server/email-intake/resolve.ts` — `THRESHOLDS`, `ResolvedOrder`, `ResolvedLine`, all DB queries (`accounts`, `products`, `product_variants`, `brands`)
- `src/lib/server/email-intake/outcome.ts` — `decideOutcome`, all `reasons` strings (the reason categories you'll score against)
- `src/lib/server/email-intake/__fixtures__/*.txt` — the five existing email bodies (labeled-format, no-ship-window, org-hint, space-separated-dates, worked-example)
- `src/lib/server/email-intake/resolve.test.ts` and `outcome.test.ts` — existing test patterns to match
- `src/lib/server/email-intake/brevo-inbound.ts` and `route.ts` — for context on the live entry point (not modified, but informs what "production behavior" the harness is approximating)

---

## Architecture

### Inputs — labeled fixture pairs

Each scenario is a triple of files, colocated in `__fixtures__/`:

- `<name>.txt` — raw email body (already exists for 5 scenarios).
- `<name>.expected.json` — ground truth labels (new — see schema below).
- `<name>.parsed.json` — cached `ParsedOrder` from the live parser (new, generated on demand; checked into git so CI is deterministic and cost-free).

The `Expected` schema is the labeled answer for every layer of the pipeline. Define it as a Zod schema in `src/lib/server/email-intake/eval/schema.ts`:

```ts
import { z } from 'zod';

export const ExpectedSchema = z.object({
	// Per-fixture metadata
	description: z.string(), // human-readable scenario summary
	// Free-form tags — a fixture can belong to multiple scenario types.
	// If a tag appears in 3+ fixtures, consider promoting to an enum.
	tags: z.array(z.string()).min(1),

	// Layer 1: parser expectations (what extract_order should return)
	parser: z.object({
		account_name: z.string(),
		brand_name: z.string().nullable(),
		org_hint: z.string().nullable(),
		item_count: z.number().int().min(0),
		has_ship_window: z.boolean()
	}),

	// Layer 2: resolver expectations (what resolveOrder should produce)
	// Labels use NAMES, not IDs — decouples .expected.json from seed IDs.
	// `resolveExpectedIds(expected, seed)` in eval/fixtures.ts does name→id
	// lookup once at load time. Fails loudly if a name isn't in the seed.
	resolver: z.object({
		kind: z.enum(['resolved', 'ambiguous']),
		// Only required when kind === 'resolved':
		expected_account_name: z.string().nullable().optional(),
		expected_brand_name: z.string().nullable().optional(),
		expected_account_confidence_min: z.number().min(0).max(1).optional(),
		lines: z
			.array(
				z.object({
					expected_product_name: z.string().nullable(),
					expected_confidence_min: z.number().min(0).max(1),
					expected_sizes_with_variants: z.array(z.string())
				})
			)
			.optional()
	}),

	// Layer 3: outcome expectations
	outcome: z.object({
		status: z.enum(['submitted', 'needs_review']),
		expected_reason_codes: z.array(z.string()) // see "Reason taxonomy" below
	})
});

export type Expected = z.infer<typeof ExpectedSchema>;
```

### Reason taxonomy

`outcome.ts` produces freeform `reason` strings. The eval shouldn't string-match — define a `classifyReason(reason: string): ReasonCode` helper in `eval/reasons.ts` that maps each known reason template to a code. Score on codes, not strings. The eval fails loudly on unknown reasons so additions can't slip through unannotated.

**Direct messages from `outcome.ts`** (use regex for the parameterized ones):

| Reason template                                                                        | Reason code              |
| -------------------------------------------------------------------------------------- | ------------------------ |
| `Account could not be identified`                                                      | `account_missing`        |
| `Account match confidence too low (${n})` (regex: `^Account match confidence too low`) | `account_low_confidence` |
| `Brand could not be identified`                                                        | `brand_missing`          |
| `No variant found for size "${s}"` (regex: `^No variant found for size`)               | `variant_not_found`      |
| `Quantity ${n} out of range [1, 999]` (regex: `^Quantity \d+ out of range`)            | `qty_out_of_range`       |

**Forwarded `issue.detail` from `resolve.ts`** (match by the issue's `code` field, not by string-parsing the detail):

| resolve.ts issue code | Reason code              |
| --------------------- | ------------------------ |
| `low_confidence`      | `product_low_confidence` |
| `ambiguous_product`   | `product_ambiguous`      |
| `no_match`            | `product_no_match`       |
| `unknown_variant`     | `variant_unknown`        |

When a new reason template lands in `outcome.ts` or a new issue code lands in `resolve.ts`, update this table in the same PR.

### Mocked DB seed — for the resolver

`resolve.ts` makes several `supabaseAdmin.from('...')` calls. The harness must not hit a real database in CI. Two options — **choose option A unless the user says otherwise**:

- **Option A (recommended): in-process mock.** Build a `MockSupabase` in `eval/mock-db.ts` that implements the subset of the Supabase query builder `resolve.ts` actually uses (`.from`, `.select`, `.eq`, `.in`, `.ilike`, `.limit`, `.order`, etc.) against an in-memory seed defined per fixture. Seed shape:

  ```ts
  type DbSeed = {
  	organizations: Array<{ id: string; name: string; org_type: 'brand' | 'rep' }>;
  	users: Array<{ id: string; organization_id: string }>;
  	accounts: Array<{
  		id: string;
  		organization_id: string;
  		business_name: string;
  		aliases?: string[];
  	}>;
  	brands: Array<{ id: string; organization_id: string; name: string; is_active: boolean }>;
  	products: Array<{ id: string; brand_id: string; name: string }>;
  	product_variants: Array<{
  		id: string;
  		product_id: string;
  		size: string;
  		color: string | null;
  		unit_price: number;
  	}>;
  };
  ```

  Store seeds at `__fixtures__/<name>.seed.json` (or share a `seeds/default.json` when most fixtures use the same catalog and only some need overrides). This keeps the eval deterministic and runnable offline.

- **Option B (later/optional): live DB against a snapshot.** Out of scope for the first version. Track as a follow-up if seed maintenance becomes painful.

### Layers and metrics

Score each layer **independently** so a regression's location is obvious:

| Layer    | Metric                   | Definition                                                                                           |
| -------- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Parser   | field accuracy           | exact match on `account_name`, `brand_name`, `org_hint`, `item_count`, `has_ship_window` per fixture |
| Resolver | account-resolution rate  | % of fixtures where resolved account name matches `expected_account_name` (via seed ID lookup)       |
| Resolver | account confidence floor | % where `accountConfidence >= expected_account_confidence_min`                                       |
| Resolver | product-resolution rate  | per-line matched product name match rate (via seed ID lookup)                                        |
| Resolver | variant-fill rate        | per-line `variantId` non-null match rate                                                             |
| Outcome  | auto-submit accuracy     | confusion matrix of expected vs actual `status` (precision, recall, F1)                              |
| Outcome  | reason-code coverage     | for `needs_review` fixtures: did the expected reason codes appear?                                   |

Aggregate report should include per-tag breakdowns (happy-path vs missing-brand vs etc.) so regressions in one scenario type don't get hidden by overall averages.

### File layout

```
src/lib/server/email-intake/
  eval/
    schema.ts            — Zod Expected schema + types
    reasons.ts           — classifyReason() taxonomy
    mock-db.ts           — MockSupabase implementing the builder subset resolve.ts uses
    parser-cache.ts      — load/save .parsed.json; refresh against live LLM on demand
    fixtures.ts          — discover and load fixture triples
    metrics.ts           — scoring functions (precision/recall/F1, per-layer aggregators)
    harness.ts           — pipeline runner: fixture → parsed → resolved → outcome → scored
    report.ts            — pretty console scorecard + JSON serializer
    threshold-sweep.ts   — run the corpus at multiple THRESHOLDS settings, diff results
    eval.test.ts         — vitest entry that runs the cached harness and asserts no regressions
  __fixtures__/
    <name>.txt           — existing
    <name>.expected.json — new
    <name>.parsed.json   — new (committed; refresh via script)
    <name>.seed.json     — new (or shared seeds/default.json)

scripts/
  eval-matching.ts       — CLI entry: `bun run eval:matching [--live] [--sweep] [--report=json|console]`
```

Add to root `package.json` scripts:

```json
{
	"eval:matching": "bun run scripts/eval-matching.ts",
	"eval:matching:live": "bun run scripts/eval-matching.ts --live",
	"eval:matching:sweep": "bun run scripts/eval-matching.ts --sweep"
}
```

---

## Phases

Do not build the whole harness in one PR. Each phase is independently reviewable and produces a working artifact.

### Phase 1a — Schema + label existing corpus

- Define `ExpectedSchema` in `eval/schema.ts`.
- For each of the 5 existing fixtures, create `<name>.expected.json`. Read the `.txt` and infer expected outcomes; confirm with the user before committing if anything is ambiguous (don't guess what the "right answer" is).
- Add 2–3 new fixtures covering the most critical gaps (likely: ambiguous-account, low-product-confidence, variant-not-found). Each new fixture: a `.txt` body, a `.expected.json`, and a seed entry.
- Define a shared `seeds/default.json` containing a small catalog (1 org, 1 brand, ~5 products with size variants) sufficient for the happy-path fixtures. Per-fixture seed overrides only when a scenario needs a specific catalog state.

**Acceptance:**

- [ ] `ExpectedSchema` validates with Zod for every fixture
- [ ] 7–8 fixtures total (5 existing + 2–3 new)
- [ ] Seed JSON parses and is consistent (no dangling `brand_id` references)
- [ ] `bun run check` — 0 type errors

### Phase 2 — Mock DB + parser cache

- Implement `MockSupabase` in `eval/mock-db.ts`. Only implement the builder methods `resolve.ts` actually calls — read `resolve.ts` first and list them, do not implement the full Supabase surface. Add a `// extend when resolve.ts adds new calls` comment.
- Write unit tests for the mock (it's a fake — fakes need tests). At minimum: `from('accounts').select('*').ilike('business_name', 'bloom%')` returns expected rows from seed.
- Implement trigram RPC mocking (see dedicated subsection below) — this is the riskiest part of Phase 2.
- Implement `parser-cache.ts`: `loadParsed(fixtureName)` reads `.parsed.json`; `refreshParsed(fixtureName)` calls live `parser.ts` against the `.txt`, saves result. Refresh is opt-in via CLI flag, never run automatically.
- Generate `.parsed.json` for all Phase 1a fixtures using `refreshParsed` once. Commit the JSON to git.

#### Trigram RPC mocking

`resolve.ts` calls three Postgres RPCs via `supabaseAdmin.rpc()`:

- `trigram_match_accounts({ p_org_id, p_search, p_limit })`
- `trigram_match_brands({ p_org_id, p_search, p_limit })`
- `trigram_match_products({ p_org_id, p_search, p_limit, p_brand_id? })`

Each returns rows with at least the matched entity and a similarity score in `[0, 1]` (pg_trgm semantics). The mock must implement `.rpc(fnName, args)` with a fake trigram similarity function against the seed catalog (Jaccard over trigram sets, or `dice-coefficient`, or any deterministic substring/edit-distance proxy). The function does not need to perfectly match Postgres pg_trgm — it needs to be deterministic and consistent enough that confidence thresholds discriminate the way the labels expect.

Treat this as the riskiest part of Phase 2. Land it with its own tests that lock down the similarity contract (identical strings score 1.0; clear near-misses score above `THRESHOLDS.ACCOUNT_MIN`; clear non-matches score below it).

**Acceptance:**

- [ ] `MockSupabase` covers every call shape `resolve.ts` makes, including `.rpc()` for all three trigram functions (verify by grep, not by guess)
- [ ] `eval/mock-db.test.ts` exercises each supported builder method AND the trigram RPC similarity contract
- [ ] `.parsed.json` exists for every fixture and matches the live parser output
- [ ] `bun run check` — 0 errors; `bun run test:run` — passes

### Phase 3 — Harness, metrics, scorecard

- Implement `harness.ts`: takes a fixture, runs cached-parser → mocked-resolver → `decideOutcome`, returns a per-layer score against `Expected`.
- Implement `metrics.ts`: per-layer accuracy, precision/recall/F1 for the binary `submitted` vs `needs_review` decision, reason-code coverage.
- Implement `report.ts`: pretty console table grouped by `tags`, plus a JSON report.
- Implement `eval.test.ts` as a vitest entry: runs the cached harness across all fixtures, asserts every fixture's outcome matches `Expected`. This becomes the CI regression guard.
- Implement `scripts/eval-matching.ts` CLI with `--report=json|console` flag. Default mode is cached (no LLM, no DB).

**Acceptance:**

- [ ] `bun run eval:matching` prints a per-tag scorecard and a summary line (auto-submit accuracy, average account confidence, reason-code coverage)
- [ ] `bun run test:run` includes the eval and passes (all fixtures pass at current `THRESHOLDS`)
- [ ] JSON report mode emits a stable schema (document it inline) — this is the format you'll diff over time

### Phase 1b — Expand corpus after the harness runs

After Phase 3's harness exists, the live scorecard will reveal which scenario types are under-represented. Add the remaining fixtures (5–7 more) then, informed by what the harness shows is missing or noisy.

- Add new fixtures covering tags not yet represented (qty-out-of-range, partial-ship-window, multi-line-mixed, missing-brand, org-hint-required, etc.).
- Each new fixture: a `.txt` body, a `.expected.json`, a `.parsed.json` (refresh via `refreshParsed`), and a seed entry if the default seed doesn't cover it.
- Re-run the harness and confirm the new fixtures pass at current `THRESHOLDS`.

**Acceptance:**

- [ ] 13+ fixtures total, covering a broad spread of tags
- [ ] All new fixtures validate against `ExpectedSchema`
- [ ] `bun run eval:matching` passes with all fixtures included
- [ ] `bun run test:run` — passes

### Phase 4 — Threshold sweep + live mode

- Implement `threshold-sweep.ts`: takes a list of `THRESHOLDS` variants (e.g., `ACCOUNT_MIN ∈ {0.5, 0.6, 0.7}` × `PRODUCT_MIN ∈ {0.6, 0.7, 0.8}`), runs the corpus at each, emits a matrix of metrics.
- Add `--sweep` CLI flag with a default sweep grid plus the ability to pass a config file for custom grids.
- Implement `--live` CLI flag: refreshes `.parsed.json` from live Anthropic before running. Rate-limit aware. Document expected cost per run in the CLI help.
- Add `--diff <baseline.json>` flag that compares the current run against a saved baseline and exits non-zero on regression.

**Acceptance:**

- [ ] `bun run eval:matching:sweep` produces a readable matrix (markdown table to stdout, optional JSON)
- [ ] `bun run eval:matching:live` refreshes the cache, prints token spend, and runs the cached path against the refreshed data
- [ ] `--diff` correctly identifies regressions when run against an intentionally degraded baseline (test this once manually)

### Phase 5 (optional, defer unless user asks) — CI integration

- Add a GitHub Action that runs `bun run test:run` (which now includes the eval) on PR. No change needed to existing CI if vitest already runs there; just confirm.
- Optionally add a separate workflow that runs `bun run eval:matching:live` on a weekly schedule, posts the JSON report as a CI artifact, and opens an issue if metrics drop below configured thresholds.

---

## What NOT to do

- Do **not** modify `parser.ts`, `resolve.ts`, or `outcome.ts`. Observation only.
- Do **not** change `THRESHOLDS` values. Tuning is a separate, data-justified PR after the harness lands.
- Do **not** mock the LLM by reimplementing extraction logic. Cache the real output to `.parsed.json` — that's the only honest representation.
- Do **not** hit the real database in CI. Mock seed only.
- Do **not** build a generic test-mock framework. `MockSupabase` should cover exactly the calls `resolve.ts` makes today, with a clear extension point. Over-generalizing now creates a maintenance burden. Exception: `.rpc()` with fake trigram similarity IS in scope — it's not generic mocking, it's the resolver's core dependency.
- Do **not** add fixtures beyond what's needed to cover the primary scenario tags. The corpus needs to be small enough to maintain by hand. Quality of labels > quantity.
- Do **not** bundle this with anything else (parser improvements, schema changes, the query-modules refactor).

---

## Open questions to confirm with the user before Phase 1

1. **Live mode cadence and budget.** Cached mode is the default for CI. Live mode hits Anthropic — what's the expected cadence (manual on demand, weekly cron, never)? What's an acceptable cost per run?
2. **Fixture additions for sensitive tags.** Some tags (e.g., `low-account-confidence`) require knowledge of how the resolver's similarity scoring actually behaves. Phase 1a may need to refresh `.parsed.json` and inspect resolver output before finalizing those `Expected` labels. Confirm this iterative loop is acceptable.
3. **Reason-code taxonomy completeness.** The taxonomy in `eval/reasons.ts` should cover every reason string `outcome.ts` produces today. After mapping them, confirm with the user that no `outcome.ts` reasons are missing — if a new reason category is found, it's a real one (not a typo).
4. **Where to put the spec.** Repo root (this file) or `docs/superpowers/specs/<date>-matching-eval-harness-design.md`? Match whatever convention you've settled on.

---

## Out of scope

- Changing `THRESHOLDS` values (output of using the harness, not part of building it)
- Embeddings / pgvector matching (separate workstream)
- Replacing heuristic resolver with LLM-based resolution (separate workstream)
- Receipt → expense matching (a future application of this pattern, not this PR)
- Live-DB integration mode (Option B above — deferred)
- Performance benchmarks for the matching pipeline (separate concern)
- Enforcing a fixed tag taxonomy before the corpus is large enough to justify one

---

## Git workflow

Per CLAUDE.md:

- One PR per phase. Six phases → up to six small PRs. Phase 5 is optional.
- Phase order: 1a → 2 → 3 → 1b → 4 → 5.
- Feature branch off `dev`; PR into `dev`.
- Conventional commits:
  - `feat(eval): add Expected schema and label existing fixtures` (Phase 1a)
  - `feat(eval): add mock supabase, trigram RPCs, and parser cache` (Phase 2)
  - `feat(eval): add matching scorecard harness` (Phase 3)
  - `feat(eval): expand fixture corpus from harness findings` (Phase 1b)
  - `feat(eval): add threshold sweep and live mode` (Phase 4)
  - `chore(ci): wire matching eval into CI` (Phase 5, optional)

---

## Done when

- `bun run eval:matching` runs in under 5 seconds in cached mode against the full corpus
- `bun run test:run` includes the eval as a CI regression guard and passes at current `THRESHOLDS`
- `bun run eval:matching:sweep` produces a readable matrix the team can use to decide threshold changes
- `bun run eval:matching:live` refreshes the parser cache deterministically and reports cost
- A short follow-up ticket exists titled "Tune `THRESHOLDS` based on eval data" with a link to the latest sweep report
- A note added to CLAUDE.md (or wherever email-intake conventions live) pointing future contributors at the eval as the source of truth for matching quality

---

## Slice progress log

_(Updated after each phase — one line per phase with notable surprises)_

---

## Notes for the agent executing this

- This spec is the contract. If something contradicts your instinct, re-read CLAUDE.md and the linked files before deviating. If you still want to deviate, ask the user — do not silently change the plan.
- Re-read this file before starting each phase. The "Required reading" list is per-phase, not per-project.
- When labeling fixtures in Phase 1, never guess the "right answer." Read the email, run the current pipeline if needed (via Phase 2's `refreshParsed`), and confirm with the user when intent is ambiguous. The labels become the contract — wrong labels make the harness lie.
- Update the "Slice progress log" at the end of each phase.
