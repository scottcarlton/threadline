# Stitch Eval (LLM-as-judge)

Date: 2026-10-16
Branch: `feat/stitch-eval`

## Problem

Stitch's main chat path has no quality measurement. `PROMPT_VERSION` (`src/lib/server/ai-prompts.ts:7`) exists so cost and quality shifts can be correlated with prompt changes, and `ai_feedback` collects thumbs up/down, but nothing tells us before merge whether a change to `MAIN_STATIC_PROMPT`, a tool description, or the turn loop made Stitch worse. Every prompt edit today ships on vibes.

The only existing eval is email intake (`src/lib/server/email-intake/eval/`): labeled fixtures, a Zod schema, an in-memory `MockSupabase`, and cached parser outputs. It is field-match only, with no judge. Its fixture-plus-cache shape is the precedent this design follows.

## Locked decisions

Settled during brainstorming. Not open for relitigation during implementation.

1. **Scope is Stitch's main chat as it runs in production, per turn:** the Haiku classifier, then either the Haiku CHAT reply or the Sonnet tools loop. Cases are live multi-turn conversations: user turns are fixed, every assistant turn is generated, and history between turns is rebuilt exactly as production does (text only, `toHistoryMessages`, 20-turn limit). Briefing, messaging agent, linesheet parser and custom agents are out of scope.
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

Only the streaming branch (`streamResponse`) calls `runStitchTurn`. The non-streaming tools branch is still used by `ComposeModal.svelte:296` and the client fallback, returns only the final response's text, and allows 11 model calls; it is left as is. Also extracted, and used by the route: the classifier (`stitch/classify.ts`), the Haiku CHAT reply (`stitch/chat.ts`), tool definitions (`stitch/tools.ts`), and `toHistoryMessages`, which moves from `ai-conversations.ts` into `ai-history.ts` so it can be imported without the database client.

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
	"turns": [
		"Put in an order for Bloom Boutique, 6 of the linen wrap dress in S/M/L, 2 each, ship mid-Feb.",
		"Saltwater Linen"
	],
	"tools": [{ "tool": "list_brands", "match": {}, "result": { "...": "..." } }],
	"expect": {
		"routes": ["TOOLS", "TOOLS"],
		"brand_ask": true,
		"lookup_tools": ["list_brands"],
		"allowed_writes": [],
		"confirm_required": []
	},
	"rubric": "Rep has three brands. Must ask which brand before create_order. Must not guess one."
}
```

- `turns` is the list of user messages, sent one at a time. Each assistant turn is generated live. `history` is an optional hand-written prefix (for context that predates the conversation, or to exceed the 20-turn limit).
- Between turns the driver stores the user message and the assistant's suggestions-stripped reply as plain text and rebuilds the next turn's history with `toHistoryMessages`, so tool results from earlier turns are not visible later, as in production.
- Each turn is classified; CHAT runs the Haiku reply with no tools, TOOLS runs the Sonnet loop. `expect.routes` (one entry per turn) asserts the classifier's decisions.
- `tools[].match` is a partial deep match against the tool input (strings match case-insensitively by substring); first match wins; an unmatched call gets `{ "success": true, "data": [] }` and is recorded as unscripted. Scripts apply to every turn.
- `expect.confirmed_at` maps a confirm-gated tool to the 0-based index of the user turn that confirms it (0 when the confirmation is already in `history`).
- `expect` holds only what that case asserts; absent means not checked. `rubric` describes the pass condition for the whole conversation.

### 3. Checks (`src/evals/stitch/checks.ts`)

Pure functions over `{ case, turn }`. Each returns `pass | fail | n/a` with a reason. Unit tested with hand-built passing and failing turns.

| Metric                | Critical | Rule                                                                                                                                                                                               |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `confirm_gate`        | yes      | No `send_email`, `archive_entity` or `delete_appointment` call in any turn before `expect.confirmed_at[tool]` (prompt rule 10).                                                                    |
| `guest_readonly`      | yes      | No `WRITE_TOOLS` call when role is `guest`.                                                                                                                                                        |
| `no_unscripted_write` | yes      | No write tool outside `expect.allowed_writes`.                                                                                                                                                     |
| `lookup_first`        | no       | On cases that set `expect.lookup_tools` (e.g. `["query_data"]`), at least one of those tools runs during the conversation (rules 8, 9). Invented names in prose are the judge's `faithful` metric. |
| `format`              | no       | No emoji; last line is `SUGGESTIONS:[...]` parsing as a string array of 2 or 3 (rule 6, "Never use emojis"), applied to every assistant turn.                                                      |
| `brand_ask`           | no       | When true, the first turn asks for the brand and does not call `create_order`; when false, no turn asks (rule 15).                                                                                 |
| `route`               | no       | `CLASSIFIER_PROMPT` on `claude-haiku-4-5`: each turn's classifier decision equals `expect.routes[i]`.                                                                                              |

### 4. Judge (`src/evals/stitch/judge.ts`)

One `claude-opus-5-5` call per case, `thinking: { type: "adaptive" }`, `output_config.effort: "high"`, structured output (`output_config.format` with a JSON schema). No server-side fallbacks: SDK 0.82.0 does not type the parameter. A judge refusal is recorded in `errors.jsonl`, never scored.

Input: the full trace (system prompt, history, tool calls, tool results, final reply), the case `rubric`, and the "How you communicate" and "Rules" sections of `MAIN_STATIC_PROMPT`. Everything from the trace is wrapped as untrusted data. The judge is told not to reward length.

The judge grades the conversation outcome, not each turn in isolation: a later turn that builds on an earlier mistake fails. It is told that tool results from earlier turns were not visible to Stitch in later turns, only the text of earlier replies.

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

`bun run eval:stitch [--variant baseline] [--reps 2] [--concurrency 4] [--timeout-s 300] [--approve-harness]` (flags owned by the bundled scaffold). Filter cases with `STITCH_EVAL_CASES=id1,id2`. Gate and baseline: `bun run eval:stitch:gate [--variant baseline] [--reps 2] [--update-baseline]`.

- Loads and validates cases, runs `(case, rep)` pairs concurrently behind a semaphore.
- Per case: build context, `buildStitchSystem`, then for each turn: classify with `CLASSIFIER_PROMPT`, run either Haiku CHAT or the Sonnet tools loop with history rebuilt via `toHistoryMessages`, then checks, then judge.
- Jittered backoff on 429/529, retry count recorded. Hard wall-clock ceiling per case. Asserts the served `model` matches the requested one.
- Writes under `.claude/hillclimb/stitch-chat/<variant>/`: `results.jsonl` (one row per case and rep, written as it completes, resumable at the `(case, rep)` key), `traces/<id>_rep<k>.json`, `errors.jsonl` for harness failures. Every row carries `prompt_version`, `model`, `usage`, `stop_reason`, `status` (`ok` or `truncated`), `latency_s`, `tool_calls`, and `grade` as a `{metric: 0|1}` dict with `explanation`.
- `_state.json` declares the metrics so the bundled report builder renders `report.html`. Committed metric template is `src/evals/stitch/state.template.json`.
- Prints a summary: per-metric pass rate with a 95% interval, critical failures listed by case, measured spend.

### 6. Baseline and CI gate

- `src/evals/stitch/baseline.json` is committed: per-metric pass rates, case count, reps, `prompt_version`, date.
- `bun run eval:stitch:gate` exits non-zero when (a) any critical check fails on any case and rep, or (b) any judge metric falls more than the configured margin below `baseline.json`.
- The margin is set from the measured run-to-run spread of the pilot and full baseline, not chosen in advance.
- `bun run eval:stitch:gate --update-baseline` rewrites `baseline.json` locally. CI never rewrites it; raising the bar is a committed, reviewed change.
- CI job (added only after the baseline exists): a new job in `.github/workflows/ci.yml`, path-filtered to `src/lib/server/ai-prompts.ts`, `src/lib/server/ai-tools.ts`, `src/lib/server/stitch/**`, `src/routes/api/ai/**`, `src/evals/stitch/**`. Needs an `ANTHROPIC_API_KEY` repository secret. Uploads `report.html` as an artifact.
- `.gitignore` gains `.claude/hillclimb/**/traces/`, `.claude/hillclimb/**/report.html`, `.claude/hillclimb/**/trajectory/`.

## Seed cases and expected behaviour

Scott's ten seeds, with labels decided during brainstorming. Claude expands these with variants and both-direction counterparts to roughly 25 to 35 cases.

| #   | Message                                                                                                                                                | Expected                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | "Put in an order for Bloom Boutique, 6 of the linen wrap dress in S/M/L, 2 each, ship mid-Feb." (rep, **one** brand)                                   | Infer the brand, `create_order` with 2/2/2 S/M/L and a mid-February ship window, confirm.                                                                                                                                                                                           |
| 1b  | Turn 1: the Bloom order (multi-brand rep). Turn 2: "Saltwater Linen"                                                                                   | Turn 1 asks which brand, no `create_order`. Turn 2 routes TOOLS and creates the order for Saltwater Linen, 2 each S/M/L, February ship window.                                                                                                                                      |
| 1c  | Same, brand org                                                                                                                                        | Never ask for brand; omit `brand_name` (rule 15).                                                                                                                                                                                                                                   |
| 2   | "Which of my accounts haven't ordered this season?"                                                                                                    | Resolve current season from `now`, query, list accounts with no orders.                                                                                                                                                                                                             |
| 3a  | Turn 1: "How's Acme doing compared to last year?" (two Acmes). Turn 2: "Acme Outfitters"                                                               | Turn 1 asks which. Turn 2 reports Acme Outfitters year over year from tool data.                                                                                                                                                                                                    |
| 3b  | Same, one Acme                                                                                                                                         | Answer directly with year-over-year figures.                                                                                                                                                                                                                                        |
| 4   | "What's selling best out of the Fall 26 line right now?"                                                                                               | `get_style_velocity` or equivalent scoped to Fall 2026 (season and year split, rule 1).                                                                                                                                                                                             |
| 5a  | Turn 1: "Email Sarah at Juniper a reminder that her draft is still open." Turn 2: "yes, send it"                                                       | Turn 1 looks up Sarah and the draft, describes the email, asks to confirm, no `send_email`. Turn 2 sends it.                                                                                                                                                                        |
| 5b  | Same turn 1. Turn 2: "actually hold off"                                                                                                               | No `send_email` in any turn.                                                                                                                                                                                                                                                        |
| 6   | "I'm at Atlanta market Thursday through Sunday. Block it off and remind me who I'm seeing."                                                            | `create_appointment` needs an account and one date, so a personal Thu to Sun block is not representable. Pass: list appointments already booked Thu to Sun, say plainly it cannot block calendar time or set reminders. Fail: inventing an account or calling `create_appointment`. |
| 7   | "What were my numbers last week vs. the week before?"                                                                                                  | Two `get_sales_analytics` calls with correct week boundaries from `now` (rule 14).                                                                                                                                                                                                  |
| 8   | History names Sarah at Juniper. Turn 1: "Same as her last order but double the denim." Turn 2: "yes, those two, and re-price from the current catalog" | Turn 1 finds the last order, lists the lines it treats as denim, asks about pricing, no write. Turn 2 creates the order with the denim quantities doubled and lines described so the server prices them from the catalog. Respect the one order per (brand, season) split.          |
| 8b  | 24 turns of history; Sarah mentioned only in the first. Turn 1: "Same as her last order but double the denim."                                         | The referent falls outside the 20-turn window, so Stitch must ask who "her" is. No lookup on a guessed account.                                                                                                                                                                     |
| 9   | "Set up something that pings me every Monday with stale drafts."                                                                                       | Say it can't create agents from chat and point to the agents page (`/organization/agents/new`). No fabricated tool.                                                                                                                                                                 |
| 10  | "thanks, that's perfect"                                                                                                                               | `route` = `CHAT`.                                                                                                                                                                                                                                                                   |

## Known gap at baseline

Prompt rule 15 currently says rep orgs must always be asked for the brand ("Ask if it's missing"). Case 1a encodes the desired single-brand inference, so it is expected to fail at baseline. That is the eval surfacing a prompt gap, and the first candidate for a prompt change. This work does not change the prompt.

`MAIN_STATIC_PROMPT`'s examples call `query_data` with `entity_type` and `search`, but the tool schema is `entity` with `filters` (`+server.ts:266`). Separate ticket; not fixed here.

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
