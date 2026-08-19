# Stitch AI security sweep

Read-only audit. No code changed. Dated 2026-08-19, against `dev` @ 8e7c1d9.

Scope: every path that sends data to Anthropic or acts on a model's output.

## 1. Inventory: what talks to Anthropic

| Surface           | Entry point                                         | Auth                         | Model      | max_tokens | Write-capable tools      |
| ----------------- | --------------------------------------------------- | ---------------------------- | ---------- | ---------- | ------------------------ |
| Stitch chat       | `routes/api/ai/+server.ts:1001`                     | session, non-buyer           | sonnet-4-6 | 4096       | yes, full tool set       |
| Intent classifier | `routes/api/ai/+server.ts:1221`                     | same                         | haiku-4-5  | 20         | no                       |
| Fast path         | `routes/api/ai/+server.ts:1244`                     | same                         | haiku-4-5  | 1024       | no                       |
| Daily briefing    | `routes/api/ai/briefing/+server.ts`                 | session                      | sonnet-4-6 | 4096       | no                       |
| Line sheet parse  | `routes/api/products/parse-linesheet/+server.ts:82` | session                      | sonnet-4-6 | 16384      | no (returns JSON)        |
| Org agents        | `lib/server/agent-executor.ts:75`                   | cron secret / internal event | sonnet-4-6 | 4096       | yes, whitelist optional  |
| SMS + WhatsApp    | `lib/server/messaging/agent.ts:278`                 | Twilio signature             | sonnet-4-6 | 1024       | yes, `place_order`       |
| Inbound email     | `lib/server/email-intake/parser.ts:100`             | Brevo webhook signature      | sonnet-4-6 | 4096       | yes, auto-submits orders |

Tool loops are capped at 10 iterations in chat (`+server.ts:1312`, `:1465`) and in the agent executor (`agent-executor.ts:87`).

## 2. Limits: what exists today

**Per-call token caps** exist at every call site, hard-coded, no config and no per-org override.

**Rate limits** exist on exactly two surfaces, both inbound webhooks:

- `api/webhooks/inbound-email/+server.ts:16`: 60/hour, correctly scoped per sender email.
- `api/webhooks/messaging/+server.ts:22`: 120/hour, **unscoped** (see F-2).

**Nothing else is limited.** No request rate limit, no per-org token budget, no daily spend cap, and no kill switch on `/api/ai`, `/api/ai/briefing`, or `/api/products/parse-linesheet`. A single authenticated user can loop `/api/ai` at network speed, and each request can fan out to 10 sonnet round trips at 4096 output tokens each.

## 3. Audit trail: what exists today

`ai_usage_logs` (migration `20260416000002_ai_observability.sql`) is the only cross-surface record. It stores org, user, endpoint, purpose, model, prompt version, and four token counts.

What it does **not** store: the prompt, the response, which tools ran, what those tools wrote, a request or correlation id, latency, stop reason, or the client IP. It is fire-and-forget (`ai-usage.ts:33`), so a failed insert is swallowed, and it is only called on a successful API response, so errors, refusals, and timeouts leave no trace at all.

Content lands in scattered channel-specific tables instead: `org_agent_runs` (agents only), `email_intakes` (raw email body), `messaging_messages` (SMS and WhatsApp), `ai_feedback` (only when a user clicks thumbs up or down). The highest-volume and most write-capable surface, Stitch chat, persists nothing.

Immutability today: `ai_usage_logs` has a SELECT policy only, so RLS clients cannot write it, but there are no grant revocations, so anything holding the service role key can UPDATE or DELETE rows freely.

## 4. Findings

Ordered by severity. Each one is verified against the code, not inferred.

### F-1 (high) Inbound email trusts the `From` header alone

`lib/server/email-intake/route.ts:19` resolves the sending organization by matching `fromEmail` against `auth.users`. There is no SPF, DKIM, or DMARC check anywhere in `lib/server/email-intake/` (grep for spf/dkim/dmarc returns nothing). The Brevo webhook signature (`brevo-inbound.ts`) authenticates Brevo as the deliverer, not the sender as the claimed human.

Anyone who knows a rep's email address can send a spoofed message to the intake address. If the parse resolves cleanly, `decideOutcome` (`outcome.ts:64`) returns `submitted` and the order is written with no human review.

**Fix direction:** require an authenticated-sender signal from the provider payload and fail closed when absent. At minimum, downgrade any unauthenticated sender to `needs_review` rather than `submitted`.

### F-2 (high) Messaging rate limit is global, not per-sender

`api/webhooks/messaging/+server.ts:41` counts every row in `messaging_messages` from the last hour with no `.eq()` filter at all, then refuses at 120. This is a platform-wide cap: one active user, or one attacker with a verified number, silently locks messaging for every org. It also fails open on the real threat, since the count is not per phone number.

**Fix direction:** filter by `from_phone` (and separately by `organization_id`), and treat the global number as a separate, much higher circuit breaker.

### F-3 (high) No rate limit or spend cap on authenticated AI endpoints

Covered in section 2. The exposure is cost and availability rather than data. With `max_tokens: 16384` on line sheet parse and a 10-iteration tool loop on chat, a single compromised or careless session can run up an unbounded Anthropic bill with no alert, because `ai_usage_logs` records spend but nothing reads it.

**Fix direction:** per-user and per-org request rate limits at the endpoint, plus a per-org daily token budget checked before the call, sourced from `ai_usage_logs`.

### F-4 (medium) Prompt injection reaches write-capable tools

Two surfaces feed attacker-controlled text into models that hold mutating tools:

- Inbound email body → `parseInboundOrder` → order creation.
- Inbound SMS and WhatsApp body → `runAgent`, whose tool list includes `place_order` (`messaging/agent.ts:56`).

A third path is user-supplied files in chat (see F-5). The system prompts contain no injection-resistance instructions, and there is no post-hoc validation that the tool arguments relate to the requesting user's own data beyond org scoping.

**Fix direction:** keep untrusted content in a clearly delimited block, never in the system prompt, and require a confirmation step for any write initiated from an untrusted channel. F-1's fix reduces the email half of this considerably.

### F-5 (medium) Unbounded, unfiltered attachment handling in chat

`routes/api/ai/+server.ts:1078` takes any non-image attachment, base64-decodes it, and inlines the whole thing into the prompt as text. There is no size cap, no MIME allowlist, and no count limit on the `files` array. Compare `parse-linesheet/+server.ts:97`, which does enforce a 20MB cap. Image branches also cast `file.type` straight to a media type without validating it is one of the four Anthropic accepts.

**Fix direction:** mirror the line sheet cap, allowlist MIME types, cap the array length, and validate image media types against the accepted set.

### F-6 (medium) Agent runs are unattributable and unscoped

`agent-executor.ts:104` calls `executeToolCall` with `userId: ''` and `brandScope: null`, commented "Full access". Scheduled and event-triggered agents therefore write rows with no actor, and bypass the brand scoping that constrains the same tools for a human. `create_account` writes `invited_by: ctx.userId` (`ai-tools.ts:301`), which becomes an empty string on this path.

The trigger itself is properly gated: `api/cron/agent-triggers/+server.ts:31` requires `Bearer ${CRON_SECRET}`.

**Fix direction:** give agents a real service principal user id, and honor a brand scope stored on the agent record.

### F-7 (low) `list_entities` filters can probe omitted columns

`ai-tools.ts:912` applies every key in the model-supplied `filters` object directly as a column predicate. Org scoping is applied first, so this is not a cross-org leak, but it does let a caller filter on columns that `QUERY_OMIT_FIELDS` deliberately strips from the output, turning a stripped field into an oracle you can binary-search within your own org.

**Fix direction:** allowlist filterable columns per entity.

### F-8 (low, correctness not security) Sender lookup misses paginated users

`route.ts:21` calls `supabaseAdmin.auth.admin.listUsers()` with no pagination and scans only the returned page, which defaults to 50 users. Once the user table exceeds one page, email intake will silently fail to resolve senders that sort later. Use a filtered lookup instead of a full list scan.

### F-9 (medium, correctness) Agent-created accounts silently never send their buyer invite

Follows from F-6. `ai-tools.ts:300` inserts into `buyer_invitations` with `invited_by: ctx.userId`, and `buyer_invitations.invited_by` is `UUID NOT NULL` (`20260407000001_buyer_portal.sql`). On the agent path `ctx.userId` is `''`, which Postgres rejects with 22P02. The call discards its result rather than destructuring `{ error }`, so the failure is silent: the account is created, the tool reports success, and the buyer is never invited.

Credit to the `feat/system-audit` session for spotting this while reviewing F-6.

**Fix direction:** the service principal from F-6 fixes the cause. Check the insert result regardless, so the next silent failure surfaces.

### F-10 (low) Verification attempt counter is per-instance and unbounded

`api/webhooks/messaging/+server.ts:145` tracks failed verification attempts in a module-level `Map`. On Fluid Compute that lives per instance, so the `MAX_ATTEMPTS` cap resets whenever a request lands on a fresh one, and the map is never pruned. Unverified senders also produce no `messaging_messages` rows, so the per-sender rate limit in F-2 cannot see them either: the verification path is the one place a stranger can make us send outbound SMS with no durable limiter.

**Fix direction:** persist attempts, keyed by phone with a timestamp, and count them toward a limit.

### Checked and found sound

- Federation boundaries in `ai-tools.ts` hold. `listBrands` and `listAccounts` deliberately omit `organization_id` and lean on RLS, which is the documented federation-view pattern; own-org entity lists keep `.eq('organization_id', ctx.organizationId)` (`:934`).
- `supabaseAdmin` use inside `ai-tools.ts` (lines 33, 39, 890, 978, 1122, 1139, 1579) is scoped by a server-derived `ctx.organizationId` or by federated id lists in every case.
- Chat tool calls run through `locals.supabase` with `locals.brandScope` (`+server.ts:1358`), so RLS still applies to the human path.
- Buyers are explicitly barred from `/api/ai` (`+server.ts:1004`).
- `org_agents` SELECT is org-scoped by RLS, which covers the `agentId` lookup at `+server.ts:1053` that has no explicit org filter.
- Both webhooks verify provider signatures before doing any work.
- `ai_feedback` truncates stored content at 10,000 and 2,000 characters.

## 5. Audit trail: how this fits `audit_log`

A parallel branch (`feat/system-audit`) is building a platform-wide `public.audit_log`: monthly-partitioned, append-only via both `revoke update, delete` from `service_role` and a statement-level reject trigger, RLS enabled with no policies so reads are service-role only behind `locals.isSystemAdmin`, with a `correlation_id` shared across one request. That table is the right spine for AI accountability. This sweep should not add a competing one.

Split of responsibility:

- **`audit_log` owns "who did what".** Every AI tool call emits an event (`ai.tool_call`, `ai.order_created`, and so on) carrying `actor_id`, `organization_id`, `subject_type`/`subject_id` for the row it touched, `correlation_id` for the turn, `status`, and `duration_ms`. This is what makes an AI-initiated write indistinguishable in reviewability from a human one.
- **`ai_usage_logs` stays as the token ledger.** Cheap, high-volume, no content. No change needed beyond also writing on failure (see below).
- **Prompt and response content has no home yet.** It does not belong in `audit_log.metadata`, which is documented as allow-listed fields rather than payload dumps, and `audit_log` retention is whole-partition drop, so content could not be expired earlier than the accountability rows. Content is the PII-heavy part and wants its own retention clock.

Contract for the AI emit sites, settled with the `feat/system-audit` session:

- **Actor.** `audit_log` has an `actor_service` text column and a check constraint requiring `actor_id`, or `actor_kind = 'service'` with `actor_service` set, or `anonymous`. A machine-originated row cannot be actor-less. Use the exported `serviceActor(name)` with three stable names: `agent-executor`, `cron-agent-triggers`, `integration-events`. Those strings are the only thing tying a row to a runner and carry no constraint, so renaming one later silently splits that runner's history in two.
- **Correlation.** `locals.audit` buffers and the request hook flushes once, so every event in a request shares a `correlation_id`. Do not construct a recorder inside a request. The cron and event paths have no `locals`, so they build an `AuditRecorder` directly and flush explicitly.
- **`tool_input` is allow-listed, not filtered.** `redact.ts` masks PII-shaped keys at any depth (emails partially masked, phones to last four, addresses and tax ids replaced) and secret rules win over PII rules. That is a safety net, not the policy. Tool inputs go through the exported `pick(input, [...])`, because a heuristic catches a key named `contact_email` but not a free-text `notes` field containing an address.
- **Delivery.** The recorder defers via `waitUntil` and reports insert failures to Sentry rather than swallowing them, which is a completion guarantee off the critical path rather than lossy fire-and-forget. Emit sites should not await.

Open questions this sweep cannot answer alone:

1. **Do we store prompt/response content at all before beta?** If yes, it needs a small dedicated table with a short retention job (90 days suggested), a truncation ceiling, and a `correlation_id` join back to `audit_log`. If no, we accept that we can reconstruct _that_ a tool ran and what it changed, but not the text that caused it.
2. **F-6 gates this work.** Agents currently run with `userId: ''` (`agent-executor.ts:104`). The service principal above is the fix, and it also resolves F-9.
3. **Failure coverage.** Nothing today writes a row on error, refusal, or timeout. Both tables need that.

## 6. Status

Fixed on branches, not yet merged:

- **F-2** on `fix/messaging-rate-limit`. Per-sender count joins through `messaging_sessions`, plus a separate global breaker at 2000/hour. Over-limit messages are dropped silently instead of answered, since replying to each one made our own rate limit an outbound-SMS amplifier. 7 unit tests. `bun run check` 0 errors, 833 tests pass.
- **F-5** on `fix/ai-attachment-limits`. New `lib/server/ai-attachments.ts`: 5 files, 5MB each, 15MB total, 512KB for inlined text, images restricted to the four types Anthropic accepts. Binary office formats are rejected rather than utf-8 decoded into mojibake, and the picker's `accept` list is narrowed to match. 13 unit tests. `bun run check` 0 errors, 839 tests pass.

Open: F-1, F-3, F-4, F-6, F-7, F-8, F-9, F-10.

## 7. Suggested order of work

1. ~~F-2, the messaging rate limit filter.~~ Done, see Status.
2. ~~F-5, attachment caps.~~ Done, see Status.
3. F-6, agent service principal. Unblocks meaningful AI events in `audit_log`, so it should land before or alongside that branch.
4. AI event emission into `audit_log`, once `feat/system-audit` merges.
5. F-3, rate limits and per-org budgets, reading spend from `ai_usage_logs`.
6. F-1, sender authentication on email intake.
7. F-4 hardening, then F-7, F-8, F-9, F-10.

Items 1, 2, 5, 6, 7 are independent of the `audit_log` branch and can proceed in parallel. Item 3 is the only real coupling.
