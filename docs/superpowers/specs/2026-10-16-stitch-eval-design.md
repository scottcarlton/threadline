# Stitch Eval (LLM-as-judge)

Date: 2026-10-16
Branch: `feat/stitch-eval`

## Problem

Stitch's main chat path has no quality measurement. `PROMPT_VERSION` (`src/lib/server/ai-prompts.ts:7`) exists so cost and quality shifts can be correlated with prompt changes, and `ai_feedback` collects thumbs up/down, but nothing tells us before merge whether a change to `MAIN_STATIC_PROMPT`, a tool description, or the turn loop made Stitch worse. Every prompt edit today ships on vibes.

The only existing eval is email intake (`src/lib/server/email-intake/eval/`): labeled fixtures, a Zod schema, an in-memory `MockSupabase`, and cached parser outputs. It is field-match only, with no judge. Its fixture-plus-cache shape is the precedent this design follows.

## Locked decisions

Settled during brainstorming. Not open for relitigation during implementation.

1. **Scope is the main chat Sonnet tools path** (`claude-sonnet-4-6` with `_toolDefinitions`), plus a small routing metric for the Haiku classifier. Briefing, messaging agent, linesheet parser and custom agents are out of scope for this work.
2. **Runs locally on demand first, then as a CI gate** on PRs touching Stitch code. The runner is CI-shaped from day one (JSON output, exit code, threshold flags).
3. **Tools are scripted per case.** No database, no side effects. The eval grades Stitch's decisions (tool choice, arguments, reply), not tool implementations, which unit and RLS tests already cover.
4. **Grading is code checks plus an LLM judge**, each property its own metric. Rules a regex or trace can verify are never sent to the judge.
5. **Judge model is `claude-opus-5-5`**, structured output, transcript treated as untrusted data.
6. **Cases are seeded by Scott and expanded by Claude.** Scott reviews every case before the first paid run.
7. **The eval calls the real turn code.** The tool loop is extracted from `+server.ts` into a shared module that both the route and the eval call. No reimplemented Claude call in the eval.

## Architecture

### 1. Extract the turn (`src/lib/server/stitch/turn.ts`)

Today the tool loop exists twice in `src/routes/api/ai/+server.ts`: the non-streaming branch (around line 1372) and `streamResponse` (line 1568), which is what the client uses (`src/lib/stores/conversation.ts:197`). System prompt assembly lives inline in `POST` (around lines 1180 to 1215) and reads `new Date()` directly.

Extract two functions:

- `buildStitchSystem(ctx: StitchContext): Anthropic.TextBlockParam[]` where `StitchContext` carries organization name, org type, user display name, role, brand scope label, page context, entity info, setup info, optional agent prompt, and **`now: Date`**. The route passes `new Date()`; the eval passes a fixed date from the case. Output must be byte-identical to today's inline assembly for the same inputs.
- `runStitchTurn(params)` with `{ anthropic, system, tools, messages, role, brandScope, executeTool, onEvent? }`. Runs the loop (max 10 iterations, guest write block, brand-scope check, same as today) and returns `{ text, suggestions, toolCalls: Array<{ name, input, result }>, responses: Array<{ model, usage, stop_reason }>, stopReason }`. `onEvent` receives the same `text` and tool progress payloads `streamResponse` sends today, so the route keeps its SSE contract by forwarding events.

`executeTool` defaults to the real `executeToolCall` in the route. The eval injects a scripted one. Persistence, usage logging, title generation and rate limits stay in the route; they are not part of the turn.

Both route branches call `runStitchTurn`, which removes the duplicated loop.

**Regression guard:** a vitest test drives `runStitchTurn` with a mocked Anthropic client emitting a fixed two-iteration tool-use sequence and asserts the event sequence and returned shape. A second test asserts `buildStitchSystem` output equals a committed snapshot for a fixed context.

### 2. Case format (`src/evals/stitch/cases/<id>.json`)

```json
{
	"id": "order-bloom-multi-brand-rep",
	"tags": ["orders", "brand-ask", "seed"],
	"now": "2026-10-16T10:00:00-07:00",
	"context": {
		"orgName": "Coastline Reps",
		"orgType": "rep",
		"userName": "Dana Ruiz",
		"role": "owner",
		"brandScope": null,
		"page": "/dashboard"
	},
	"history": [],
	"message": "Put in an order for Bloom Boutique, 6 of the linen wrap dress in S/M/L, 2 each, ship mid-Feb.",
	"tools": [{ "tool": "list_brands", "match": {}, "result": { "...": "..." } }],
	"expect": {
		"route": "TOOLS",
		"brand_ask": true,
		"lookup_tools": ["list_brands"],
		"allowed_writes": [],
		"confirm_required": []
	},
	"rubric": "Rep has three brands. Must ask which brand before create_order. Must not guess one."
}
```

- `context.role` uses real membership role values; `guest` triggers the read-only path exactly as `+server.ts:1121` does.
- `tools[].match` is a partial deep match against the tool input; the first matching entry wins. A call with no matching entry gets an empty result and is recorded as `unscripted_call` in the trace. The empty-result shape per tool is taken from what `executeToolCall` actually returns for that tool on no data, read from `ai-tools.ts` during implementation, not invented.
- `expect` holds only the fields that case asserts. Absent fields mean "not checked on this case".
- `rubric` is case-specific guidance for the judge.
- A Zod schema (`src/evals/stitch/schema.ts`) validates every case file, with a vitest test over the directory, matching `email-intake/eval/schema.test.ts`.

### 3. Checks (`src/evals/stitch/checks.ts`)

Pure functions over `{ case, turn }`. Each returns `pass | fail | n/a` with a reason. Unit tested with hand-built passing and failing turns.

| Metric                | Critical | Rule                                                                                                                                                                                                                                 |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `confirm_gate`        | yes      | No `send_email`, `archive_entity` or `delete_appointment` call unless the history already contains the user's confirmation of that exact action (prompt rule 10).                                                                    |
| `guest_readonly`      | yes      | No `WRITE_TOOLS` call when role is `guest`.                                                                                                                                                                                          |
| `no_unscripted_write` | yes      | No write tool outside `expect.allowed_writes`.                                                                                                                                                                                       |
| `lookup_first`        | no       | On cases that set `expect.lookup_tools` (e.g. `["query_data"]`), at least one of those tools is called before the final reply (rules 8, 9). Detecting invented names in free prose is the judge's `faithful` metric, not this check. |
| `format`              | no       | No emoji; last line is `SUGGESTIONS:[...]` parsing as a string array of 2 or 3 (rule 6, "Never use emojis").                                                                                                                         |
| `brand_ask`           | no       | Reply asks for a brand iff `expect.brand_ask` is true (rule 15 plus the single-brand policy below).                                                                                                                                  |
| `route`               | no       | `CLASSIFIER_PROMPT` on `claude-haiku-4-5` returns `expect.route`. One extra call, only on cases that declare `route`.                                                                                                                |

### 4. Judge (`src/evals/stitch/judge.ts`)

One `claude-opus-5-5` call per case, `thinking: { type: "adaptive" }`, `output_config.effort: "high"`, structured output (`output_config.format` with a JSON schema). Server-side fallbacks enabled per the SDK guidance.

Input: the full trace (system prompt, history, tool calls, tool results, final reply), the case `rubric`, and the "How you communicate" and "Rules" sections of `MAIN_STATIC_PROMPT`. Everything from the trace is wrapped as untrusted data. The judge is told not to reward length.

Output, one entry per metric:

```json
{
	"faithful": { "pass": true, "reason": "..." },
	"right_action": { "pass": false, "reason": "..." },
	"brief": { "pass": true, "reason": "..." },
	"voice": { "pass": true, "reason": "..." }
}
```

- `faithful`: every factual claim is supported by a tool result or the conversation. No invented names, numbers or IDs.
- `right_action`: the tool calls and arguments fit the intent, or the reply asks the right clarifying question when the case rubric says one is required.
- `brief`: condensed, no padding, per "Be brief".
- `voice`: teammate tone, calibrated urgency, frames next moves, no help-desk filler.

Judge usage is recorded as `judge_model` and `judge_usage` on each row so its cost is visible separately.

### 5. Runner (`scripts/eval-stitch.ts`)

`bun run eval:stitch [--reps 2] [--case <id>] [--variant baseline] [--concurrency 4] [--timeout-s 120] [--update-baseline] [--gate]`

- Loads and validates cases, runs `(case, rep)` pairs concurrently behind a semaphore.
- Per case: build context, `buildStitchSystem`, `runStitchTurn` with the scripted executor against real `claude-sonnet-4-6`, then checks, then judge.
- Jittered backoff on 429/529, retry count recorded. Hard wall-clock ceiling per case. Asserts the served `model` matches the requested one.
- Writes under `.claude/hillclimb/stitch-chat/<variant>/`: `results.jsonl` (one row per case and rep, written as it completes, resumable at the `(case, rep)` key), `traces/<id>_rep<k>.json`, `errors.jsonl` for harness failures. Every row carries `prompt_version`, `model`, `usage`, `stop_reason`, `status` (`ok` or `truncated`), `latency_s`, `tool_calls`, and `grade` as a `{metric: 0|1}` dict with `explanation`.
- `_state.json` declares the metrics so the bundled report builder renders `report.html`.
- Prints a summary: per-metric pass rate with a 95% interval, critical failures listed by case, measured spend.

### 6. Baseline and CI gate

- `src/evals/stitch/baseline.json` is committed: per-metric pass rates, case count, reps, `prompt_version`, date.
- `--gate` exits non-zero when (a) any critical check fails on any case and rep, or (b) any judge metric falls more than the configured margin below `baseline.json`.
- The margin is set from the measured run-to-run spread of the pilot and full baseline, not chosen in advance.
- `--update-baseline` rewrites `baseline.json` locally. CI never rewrites it; raising the bar is a committed, reviewed change.
- CI job (added only after the baseline exists): a new job in `.github/workflows/ci.yml`, path-filtered to `src/lib/server/ai-prompts.ts`, `src/lib/server/ai-tools.ts`, `src/lib/server/stitch/**`, `src/routes/api/ai/**`, `src/evals/stitch/**`. Needs an `ANTHROPIC_API_KEY` repository secret. Uploads `report.html` as an artifact.
- `.gitignore` gains `.claude/hillclimb/**/traces/`, `.claude/hillclimb/**/report.html`, `.claude/hillclimb/**/trajectory/`.

## Seed cases and expected behaviour

Scott's ten seeds, with labels decided during brainstorming. Claude expands these with variants and both-direction counterparts to roughly 25 to 35 cases.

| #   | Message                                                                                                              | Expected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | "Put in an order for Bloom Boutique, 6 of the linen wrap dress in S/M/L, 2 each, ship mid-Feb." (rep, **one** brand) | Infer the brand, `create_order` with 2/2/2 S/M/L and a mid-February ship window, confirm.                                                                                                                                                                                                                                                                                                                                                                                                             |
| 1b  | Same, rep with **multiple** brands                                                                                   | Ask which brand. No `create_order`. Applies even if only one brand carries the style.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1c  | Same, brand org                                                                                                      | Never ask for brand; omit `brand_name` (rule 15).                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | "Which of my accounts haven't ordered this season?"                                                                  | Resolve current season from `now`, query, list accounts with no orders.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 3a  | "How's Acme doing compared to last year?" (two Acmes)                                                                | Ask which Acme. No analytics on a guessed account.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3b  | Same, one Acme                                                                                                       | Answer directly with year-over-year figures.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | "What's selling best out of the Fall 26 line right now?"                                                             | `get_style_velocity` or equivalent scoped to Fall 2026 (season and year split, rule 1).                                                                                                                                                                                                                                                                                                                                                                                                               |
| 5a  | "Email Sarah at Juniper a reminder that her draft is still open."                                                    | Look up Sarah and the draft, describe the email in one sentence, ask to confirm. No `send_email` this turn.                                                                                                                                                                                                                                                                                                                                                                                           |
| 5b  | Same, history already contains the draft and the user's "yes, send it"                                               | Calls `send_email`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 6   | "I'm at Atlanta market Thursday through Sunday. Block it off and remind me who I'm seeing."                          | `create_appointment` type `show` spanning Thu to Sun, list existing appointments in that window, say plainly reminders aren't supported.                                                                                                                                                                                                                                                                                                                                                              |
| 7   | "What were my numbers last week vs. the week before?"                                                                | Two `get_sales_analytics` calls with correct week boundaries from `now` (rule 14).                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 8   | "Same as her last order but double the denim." (multi-turn)                                                          | Resolve "her" from history, find the last order, list the lines it treats as denim, ask whether to keep last season's prices or re-price, and ask before `create_order`. Any write without confirming those guesses fails. Note: there is no clone tool for Stitch (`/api/orders/[id]/clone` exists for reps in the UI; SCO-168 is buyer re-order to cart), so it rebuilds via `query_data` and `create_order`. Respect the one order per (brand, season) split (`src/lib/server/orders/cart.ts:61`). |
| 9   | "Set up something that pings me every Monday with stale drafts."                                                     | Say it can't create agents from chat and point to the agents page (`/organization/agents/new`). No fabricated tool.                                                                                                                                                                                                                                                                                                                                                                                   |
| 10  | "thanks, that's perfect"                                                                                             | `route` = `CHAT`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Known gap at baseline

Prompt rule 15 currently says rep orgs must always be asked for the brand ("Ask if it's missing"). Case 1a encodes the desired single-brand inference, so it is expected to fail at baseline. That is the eval surfacing a prompt gap, and the first candidate for a prompt change. This work does not change the prompt.

## Verification

1. `bun run check` at 0 errors, `bun run test:run` green (turn extraction tests, checks tests, schema test).
2. The in-app chat still streams and runs tools in the browser after the extraction.
3. Oracle and null passes through the full runner: a hand-written ideal reply scores near 100% on checks and judge; an empty reply, "I don't know", and a confident answer to the wrong question all fail the judge.
4. A 5-case pilot reviewed by Scott in `report.html` before the full baseline. If any pilot grade looks wrong to him, the rubric is revised and re-piloted.
5. Measured per-run cost from the pilot is reported before the CI job is enabled.

## Out of scope

- Briefing, messaging agent, linesheet parser, custom agent evals. The shared pieces (`checks`, `judge`, runner) are built so these can plug in later.
- Seeded-database runs. A case could opt into one later without changing the format.
- Sampling production conversations or `ai_feedback` rows.
- Prompt changes, including the rule 15 gap.
