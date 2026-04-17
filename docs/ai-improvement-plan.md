# AI Improvement Plan — Threadline

This is a prioritized implementation plan for improving Threadline's AI system. Each phase is scoped to be completable independently. Work through them in order — earlier phases unlock value for later ones.

Reference `docs/ai-system-breakdown.md` for full context on the current system.

---

## Phase 1: Prompt Quality (High impact, low effort)

These changes are all in `src/routes/api/ai/+server.ts` and require no schema changes or new endpoints. They directly improve response accuracy and reduce user frustration.

### 1.1 Add few-shot examples to the main system prompt

**File:** `src/routes/api/ai/+server.ts` — `staticSystem` string (line ~784)

Append 3-4 few-shot examples after the "Important rules" section showing good tool use sequences. Examples should cover:

- Creating an order with fuzzy name matching: user says "order for Nordstrom, Ulla Johnson, Fall 2026" → model calls `create_order` with `account_name: "Nordstrom"`, `brand_name: "Ulla Johnson"`, `season_name: "Fall"`, `order_year: 2026`
- Querying data then presenting it: user says "show me all draft orders" → model calls `query_data` with `entity_type: "orders"`, `filters: { status: "draft" }` → formats results as a table
- Handling a fuzzy match failure gracefully: tool returns `{ success: false, error: "Account not found matching..." }` → model asks user to clarify instead of relaying the raw error

Format these as `<example>` blocks within the system prompt. Keep each example under 100 tokens.

### 1.2 Add error recovery instructions

**File:** `src/routes/api/ai/+server.ts` — `staticSystem` string

Add a new rule after the existing 7 rules:

```
8. When a tool call fails with "not found" errors, do NOT relay the raw error to the user.
   Instead: (a) if the error is a fuzzy match failure, ask the user to clarify which
   entity they meant, or use query_data to search for similar names and suggest matches.
   (b) if the error is a permission issue, explain what access level is needed.
   (c) for all other errors, say what you tried and what went wrong in plain language.
9. Never fabricate entity names, IDs, or data. If you don't know a value, ask the user
   or look it up with query_data first.
```

### 1.3 Add datetime and timezone to dynamic context

**File:** `src/routes/api/ai/+server.ts` — `dynamicSystem` string (line ~851)

Add to the dynamic context block:

```typescript
const now = new Date();
const dateStr = now.toLocaleDateString('en-US', {
	weekday: 'long',
	year: 'numeric',
	month: 'long',
	day: 'numeric'
});
const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
```

Then include `- Current date/time: ${dateStr} at ${timeStr}` in the dynamic system string. This fixes "this week's appointments" and "orders from today" queries that currently have no time reference.

### 1.4 Pass conversation context to the classifier

**File:** `src/routes/api/ai/+server.ts` — classification block (line ~896)

Currently the classifier only sees the latest message. Change the classifier call to include the last 2 messages of history for context:

```typescript
const classifyMessages: Anthropic.MessageParam[] = [];
const history = conversationHistory ?? [];
// Include last 2 messages for context
for (const msg of history.slice(-2)) {
	classifyMessages.push({ role: msg.role, content: msg.content });
}
classifyMessages.push({ role: 'user', content: userContent });

const classifyResponse = await anthropic.messages.create({
	model: 'claude-haiku-4-5-20251001',
	max_tokens: 20,
	system: [{ type: 'text', text: '...' }], // existing classification prompt
	messages: classifyMessages
});
```

This prevents "What about the other ones?" from being classified as CHAT when the previous message was a data query.

### 1.5 Add anti-hallucination rule for entity references

**File:** `src/routes/api/ai/+server.ts` — `staticSystem` string

Add to the rules section:

```
10. When a user asks about a specific entity (account, brand, order) that you haven't
    looked up yet, ALWAYS call query_data first before responding. Never assume an
    entity exists based on the conversation alone.
```

---

## Phase 2: Tool Quality (High impact, medium effort)

These changes improve how tools work and what the model gets back from them. Touches `src/routes/api/ai/+server.ts` (definitions) and `src/lib/server/ai-tools.ts` (execution).

### 2.1 Enrich tool descriptions with usage examples

**File:** `src/routes/api/ai/+server.ts` — `_toolDefinitions` array

Update the `description` field for the most-used tools. Priority tools to update:

- `create_order`: Add "Fuzzy matches account and brand by name. Provide season_name and order_year separately (e.g., season_name='Fall', order_year=2026). Auto-sets expected ship date from season delivery schedule."
- `query_data`: Add "Use entity_type to specify what to search. Supported: brands, accounts, orders, shows, seasons, territories, appointments, contacts, order_lines, show_dates. Use filters object for field-level filtering (e.g., { status: 'draft' }). Use search for fuzzy text matching."
- `add_order_lines`: Add "Each line needs at minimum a description, qty, and unit_price. style_number is optional but recommended. Color and size are optional."
- `draft_email`: Add "Looks up contact by name (fuzzy). Returns a draft preview — the email is NOT sent. Use send_email separately to actually send it."

### 2.2 Format tool results for readability

**File:** `src/lib/server/ai-tools.ts`

Add a `formatToolResult` utility that strips unnecessary fields from Supabase responses before returning them to Claude. This reduces token usage and improves response quality.

```typescript
function formatToolResult(
	data: Record<string, unknown>,
	keepFields: string[]
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key of keepFields) {
		if (data[key] !== undefined && data[key] !== null) {
			result[key] = data[key];
		}
	}
	return result;
}
```

Apply to high-frequency tools first:

- `query_data` results: strip `organization_id`, `created_at`, `updated_at` unless relevant
- `create_order` results: return `order_number`, `status`, `brand.name`, `account.business_name`, `season.name`, `total_amount` — not the full row
- `get_dashboard_metrics`: already fairly clean, leave as-is

### 2.3 Add confirmation step for destructive actions

**Files:** `src/routes/api/ai/+server.ts` (new tool definition), `src/lib/server/ai-tools.ts` (execution), `src/lib/stores/conversation.ts` (client handling)

Add a new rule to the system prompt:

```
11. Before executing send_email, delete_appointment, or archive_entity, describe what
    you're about to do and ask the user to confirm. Only proceed after they confirm.
```

This is a prompt-level solution that doesn't require new tools — just behavioral guidance. The model should say "I'm about to send an email to jane@nordstrom.com with subject 'Fall 2026 Order Follow-up'. Should I go ahead?" before calling `send_email`.

### 2.4 Add `list_brands` and `list_accounts` convenience tools

**Files:** `src/routes/api/ai/+server.ts`, `src/lib/server/ai-tools.ts`

Add two lightweight tools that return name+id pairs without requiring the full `query_data` machinery:

```typescript
{
  name: 'list_brands',
  description: 'List all active brands. Returns brand names and IDs. Use this for quick lookups before creating orders or when the user asks "what brands do we have".',
  input_schema: { type: 'object', properties: {}, required: [] }
}
```

Implementation: simple `select('id, name').eq('is_active', true).order('name')` query. Same pattern for `list_accounts` returning `id, business_name, city, state`.

This reduces misuse of `query_data` for simple list requests and gives the model a faster path for common lookups.

---

## Phase 3: Briefing Improvements (Medium impact, medium effort)

### 3.1 Add user/role scoping to briefings

**File:** `src/routes/api/ai/briefing/+server.ts`

If the user has `brandScope`, filter all queries by those brand IDs. If territories are assigned to the user, filter accounts by territory. This makes briefings relevant to the individual user rather than showing the whole org's data.

Add `brandScope` and `membership.role` to the data-gathering queries:

```typescript
let ordersQuery = supabase.from('orders').select('...').eq('organization_id', orgId);
if (brandScope) {
	ordersQuery = ordersQuery.in('brand_id', brandScope);
}
```

### 3.2 Add week-over-week comparison data

**File:** `src/routes/api/ai/briefing/+server.ts`

Add two new parallel queries:

- Orders created in the last 7 days (count + total)
- Orders created 8-14 days ago (count + total)

Include in the context: `This week: X orders ($Y) vs last week: A orders ($B)`. Update the briefing prompt to include a rule: "If week-over-week data is available, mention the trend (up/down/flat) with percentages."

### 3.3 Cache briefings per org

**File:** `src/routes/api/ai/briefing/+server.ts`

Add a simple in-memory cache (or use Supabase) keyed by `orgId`:

```typescript
const briefingCache = new Map<string, { text: string; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// At the start of the handler:
const cached = briefingCache.get(orgId);
if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
	return json({ briefing: cached.text });
}

// After generating:
briefingCache.set(orgId, { text: briefing, timestamp: Date.now() });
```

---

## Phase 4: Agent System Hardening (Medium impact, medium effort)

### 4.1 Add per-agent tool whitelists

**DB migration:** Add a `tool_whitelist text[]` column to `org_agents` (nullable — null means all tools).

**File:** `src/lib/server/agent-executor.ts`

Before passing tools to the API call, filter by whitelist:

```typescript
const agentTools = agent.tool_whitelist
	? _toolDefinitions.filter((t) => agent.tool_whitelist.includes(t.name))
	: _toolDefinitions;
```

**File:** Agent creation UI (`src/routes/organization/agents/new/+page.svelte`)

Add a multi-select for tools, grouped by category (Data, Analytics, Email, Integrations). Default to all tools.

### 4.2 Add rate limiting to agent triggers

**File:** `src/lib/server/integrations/events.ts` — `dispatchAgentTriggers`

Add a cooldown check per trigger:

```typescript
// Skip if trigger ran within the last 60 seconds
if (trigger.last_run_at) {
	const lastRun = new Date(trigger.last_run_at).getTime();
	if (Date.now() - lastRun < 60_000) continue;
}
```

This prevents runaway agent execution during bulk operations.

### 4.3 Add agent prompt templates

**File:** New file `src/lib/server/agent-templates.ts`

Create 3-4 starter templates:

```typescript
export const AGENT_TEMPLATES = [
	{
		name: 'Order Notification Agent',
		slug: 'order-notifier',
		description: 'Sends a summary to Slack when orders are submitted',
		system_prompt: `When an order is submitted, summarize it concisely: order number, account, brand, total amount. Then send a Slack message with this summary. Keep it to 2-3 sentences.`,
		suggested_triggers: [{ trigger_type: 'event', event_name: 'order_submitted' }],
		suggested_tools: ['query_data', 'send_slack_message']
	},
	{
		name: 'Weekly Sales Summary Agent',
		slug: 'weekly-summary',
		description: 'Generates a weekly sales report',
		system_prompt: `Generate a concise weekly sales summary. Use get_sales_report for the last 7 days, broken down by brand. Highlight top-performing brands and any notable changes. Keep it under 200 words.`,
		suggested_triggers: [{ trigger_type: 'schedule', cron_expression: '0 9 * * 1' }],
		suggested_tools: ['get_sales_report', 'get_dashboard_metrics', 'send_slack_message']
	},
	{
		name: 'At-Risk Account Monitor',
		slug: 'risk-monitor',
		description: 'Checks for at-risk accounts and alerts the team',
		system_prompt: `Check account health using get_account_health. For any accounts labeled "at_risk", look up their last order date and total lifetime value. Send a Discord message listing at-risk accounts with recommended actions (follow-up call, email, etc).`,
		suggested_triggers: [{ trigger_type: 'schedule', cron_expression: '0 8 * * *' }],
		suggested_tools: ['get_account_health', 'query_data', 'send_discord_message']
	}
];
```

Surface these in the agent creation UI as a "Start from template" option.

### 4.4 Implement cron-based schedule triggers

The `org_agent_triggers` table already has `trigger_type: 'schedule'` and `cron_expression` fields, but nothing runs them.

**Option A (Supabase):** Create a Supabase Edge Function that runs on a cron schedule (e.g., every 5 minutes), queries for due triggers, and calls the agent executor.

**Option B (Vercel):** Create a Vercel Cron Job at `src/routes/api/cron/agent-triggers/+server.ts` that runs every 5 minutes. Protect with a `CRON_SECRET` env var.

Implementation:

```typescript
// Query triggers where cron_expression is due
// For each: check if enough time has passed since last_run_at
// Execute agent
// Update last_run_at
```

Use a cron parser library (`cron-parser` via bun) to evaluate expressions.

---

## Phase 5: Client Experience (Medium impact, higher effort)

### 5.1 Add response streaming

**File:** `src/routes/api/ai/+server.ts`

Switch from `anthropic.messages.create()` to `anthropic.messages.stream()` for the Sonnet calls. Return a `ReadableStream` instead of JSON.

For tool use iterations, stream the text portions and send tool execution status as SSE events:

```
event: text
data: {"delta": "Looking up your orders..."}

event: tool_start
data: {"tool": "query_data", "description": "Searching orders"}

event: tool_result
data: {"tool": "query_data", "success": true}

event: text
data: {"delta": "Here are your draft orders:\n\n"}
```

**File:** `src/lib/stores/conversation.ts`

Update `sendMessage` to consume the stream with `EventSource` or `fetch` + `ReadableStream` reader. Append text deltas to the message in real-time.

This is the highest-effort item in the plan but has the biggest UX impact. Users currently wait 3-8 seconds with no feedback during multi-tool queries.

### 5.2 Implement conversation windowing

**File:** `src/lib/stores/conversation.ts`

Instead of sending the full `conversationHistory` array, send only the last 10 messages. For conversations longer than 10 messages, prepend a summary of the earlier context:

```typescript
const MAX_HISTORY = 10;
if (history.length > MAX_HISTORY) {
	const older = history.slice(0, -MAX_HISTORY);
	const summary = `[Earlier in this conversation: the user asked about ${summarizeTopics(older)}]`;
	history = [
		{ role: 'user', content: summary },
		{ role: 'assistant', content: 'Understood, I have that context.' },
		...history.slice(-MAX_HISTORY)
	];
}
```

This prevents token limit issues on long conversations and reduces cost.

### 5.3 Add targeted invalidation after tool use

**File:** `src/lib/stores/conversation.ts`

Replace `invalidateAll()` with targeted invalidation based on which tools were called:

```typescript
const toolToInvalidation: Record<string, string[]> = {
	create_order: ['orders', 'dashboard'],
	update_order_status: ['orders', 'dashboard'],
	create_brand: ['brands'],
	create_account: ['accounts']
	// ... etc
};

if (data.actions?.length > 0) {
	const keys = new Set<string>();
	for (const action of data.actions) {
		for (const key of toolToInvalidation[action.tool] ?? []) {
			keys.add(key);
		}
	}
	// Use SvelteKit's invalidate() with specific keys instead of invalidateAll()
	for (const key of keys) {
		invalidate(key);
	}
}
```

---

## Phase 6: Observability & Learning (Lower urgency, high long-term value)

### 6.1 Add token usage logging

**File:** `src/routes/api/ai/+server.ts`

After every Anthropic API call, log the usage:

```typescript
const response = await anthropic.messages.create({ ... });
console.log('AI usage', {
  model: response.model,
  input_tokens: response.usage.input_tokens,
  output_tokens: response.usage.output_tokens,
  cache_read: response.usage.cache_read_input_tokens,
  cache_creation: response.usage.cache_creation_input_tokens,
  endpoint: 'chat',
  orgId: locals.organization.id,
  classified_as: useHaiku ? 'chat' : 'tools'
});
```

Optionally insert into a `ai_usage_logs` table for dashboarding.

### 6.2 Add user feedback mechanism

**DB migration:** Create an `ai_feedback` table:

```sql
create table ai_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  user_id uuid references auth.users(id),
  message_content text not null,
  response_content text not null,
  rating smallint check (rating in (-1, 1)), -- thumbs down / up
  feedback_text text,
  created_at timestamptz default now()
);
```

**Client:** Add thumbs up/down buttons to assistant messages in `AssistantPanel.svelte`. On click, POST to a new `/api/ai/feedback` endpoint.

This data is gold for prompt iteration — you can see exactly which responses users disliked and why.

### 6.3 Add prompt versioning

**File:** New file `src/lib/server/ai-prompts.ts`

Extract all prompts from their current locations into a single module:

```typescript
export const PROMPTS = {
	MAIN_STATIC: `You are the AI assistant for Threadline...`,
	CLASSIFIER: `Classify whether this user message...`,
	BRIEFING: `You are a concise business assistant...`,
	LINESHEET: `You are a product data extraction assistant...`,
	AGENT_BASE: `You are a custom AI agent for...`
} as const;

export const PROMPT_VERSION = '2.0.0';
```

Log `PROMPT_VERSION` alongside token usage. When you change prompts, bump the version — this lets you correlate prompt changes with feedback quality and cost changes.

---

## Implementation Order Summary

| Phase                    | Effort      | Impact                                    | Depends on                  |
| ------------------------ | ----------- | ----------------------------------------- | --------------------------- |
| **1. Prompt Quality**    | ~2-3 hours  | High — immediate accuracy improvement     | Nothing                     |
| **2. Tool Quality**      | ~4-6 hours  | High — fewer failed tool calls, better UX | Nothing                     |
| **3. Briefing**          | ~3-4 hours  | Medium — better daily experience          | Nothing                     |
| **4. Agent Hardening**   | ~6-8 hours  | Medium — unlocks agent reliability & cron | Nothing                     |
| **5. Client Experience** | ~8-12 hours | High — streaming alone transforms the UX  | Phase 1-2 recommended first |
| **6. Observability**     | ~4-6 hours  | Low now, high long-term                   | Phase 1-2 recommended first |

Start with Phase 1 — it's the fastest path to better AI responses and everything else builds on it.
