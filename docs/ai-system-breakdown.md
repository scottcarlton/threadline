# Threadline AI System — Full Breakdown

This document maps every AI surface in Threadline: what it does, how it works, what prompts drive it, and where the opportunities are.

---

## Architecture Overview

Threadline's AI runs on three Claude models across four endpoints:

| Endpoint                             | Model                | Purpose                                     |
| ------------------------------------ | -------------------- | ------------------------------------------- |
| `POST /api/ai`                       | Haiku 4.5 → Sonnet 4 | Main chat assistant (classifier + tools)    |
| `POST /api/ai/briefing`              | Haiku 4.5            | Morning briefing generation                 |
| `POST /api/products/parse-linesheet` | Sonnet 4             | Extract products from linesheet images/PDFs |
| `agent-executor.ts` (internal)       | Sonnet 4             | Event/schedule-triggered custom agents      |

The system uses a **classify-then-route** pattern: Haiku decides if a message needs tools (→ Sonnet with 41 tools) or is simple chat (→ Haiku without tools). This saves cost and latency on greetings, thanks, and general questions.

---

## 1. Main Chat Assistant (`/api/ai`)

**File:** `src/routes/api/ai/+server.ts`

This is the primary AI interface — a conversational assistant with tool use that can read and write across the entire data model.

### Request Flow

```
User message
  → Auth check
  → Agent resolution (by agentId param or @slug mention)
  → File attachment handling (images, PDFs, text → base64)
  → Classification (Haiku: "TOOLS" or "CHAT")
  → If CHAT: Haiku responds without tools (fast, cheap)
  → If TOOLS: Sonnet responds with 41 tools available
    → Tool use loop (max 10 iterations)
    → Permission checks (guest = read-only)
    → Parse suggestions from response
  → Log agent run if agent was invoked
  → Return { response, suggestions, actions }
```

### System Prompt — Static Block (cached)

This is the same for every user and every request, so it uses Anthropic's prompt caching (`cache_control: { type: 'ephemeral' }`):

```
You are the AI assistant for Threadline, a multi-brand women's wholesale
contractor portal. You help manage brands, accounts, orders, shows, seasons,
territories, and appointments.

Your capabilities:
- Brands & Accounts: create, update, archive/unarchive, assign territories
- Orders: create, add/edit/remove line items, update status, set ship dates, add notes
- Shows & Seasons: create shows and seasons
- Territories: create, update, assign accounts to territories
- Appointments: schedule (show/road/phone/video), reschedule, complete, cancel, delete
- Email: draft, send (via Gmail), search inbox
- Analytics: sales reports (by brand/account/territory/rep), commission reports,
  dashboard metrics
- Data queries: search across brands, accounts, orders, shows, seasons, territories,
  appointments, contacts, order lines, show dates
- Integrations: send Slack/Discord messages, export data to Google Sheets,
  sync/pull data with Notion

Important rules:
1. Season + year model: "Fall 2026" means season="Fall" and order_year=2026.
   Always split these when creating or querying orders.
2. When referencing accounts, brands, territories, or shows by name, use fuzzy
   matching — users may not type exact names.
3. Always confirm what you did after performing an action.
4. Be concise and professional. This is a business tool.
5. When presenting data, format it clearly with relevant details. Use markdown
   formatting (bold, lists, tables) for readability.
6. If asked to do something outside your capabilities, explain what you can and
   cannot do.
7. After every response, include 2-3 brief suggested follow-up prompts on the
   very last line, formatted as: SUGGESTIONS:["prompt 1","prompt 2","prompt 3"].
```

#### What's working

- Clear capability enumeration gives the model a good mental map of the domain.
- The season+year rule prevents a common misparse.
- Fuzzy matching instruction aligns with how `ilike` queries work in the tool implementations.
- Suggestions format is simple and parseable.

#### Opportunities

- **No examples.** The prompt tells the model _what_ to do but never shows it _how_. Adding 2-3 few-shot examples of good tool use sequences (e.g., "create an order for Nordstrom, brand Ulla Johnson, Fall 2026") would reduce hallucinated tool inputs and improve first-try accuracy.
- **No error recovery guidance.** When a fuzzy match fails, the model gets `{ success: false, error: "Account not found..." }` but there's no instruction to try alternative names, ask the user for clarification, or list similar matches. It tends to just relay the error verbatim.
- **"Be concise" is vague.** Consider specifying a target length (e.g., "keep responses under 150 words unless presenting data tables") or formatting rules for different response types.
- **Suggestions are appended as raw text.** The model sometimes puts the SUGGESTIONS line inside code blocks or forgets it entirely. A structured output approach (separate field in tool_choice, or post-processing) would be more reliable.
- **No persona/tone guidance.** The prompt says "professional" but doesn't define voice. For a fashion industry tool, a slightly warmer, industry-aware tone could land better.
- **Missing "don't" rules.** No instruction to avoid fabricating data, inventing IDs, or making up account/brand names that don't exist. The model occasionally hallucinates entity names when fuzzy matching fails.

### System Prompt — Dynamic Block (per-request)

This block changes every request and includes:

```
Current user context:
- Organization: {org.name}
- Org type: Rep (sales agency) | Brand (manufacturer)
- User: {display_name}
- Role: {role}
- Brand access: {scoped or full}
- Currently viewing: {page description}
- Entity in view: {entity summary, if applicable}
- Setup status: {missing steps for new orgs}
- Permission warning: {read-only notice for guests}
```

#### What's working

- Page context awareness means the user can say "show me this account's orders" without specifying which account.
- Entity context injection is smart — it reads from a client-side `entityContext` store.
- New user setup detection guides onboarding naturally.

#### Opportunities

- **No time context.** The model doesn't know what time it is, what day of the week, or where the user is. Adding timezone and current datetime would improve "this week's appointments" queries.
- **No recent activity context.** The model can't see what the user just did (created an order, updated a brand). Adding the last 2-3 actions would enable better continuity.
- **Org type behavior is a single sentence.** Brand orgs get `"Focus on products, rep performance, and order fulfillment"` — this could be a full behavioral section with brand-specific tool priorities and language.

### Classification Prompt (Haiku)

```
Classify whether this user message to a business assistant requires looking
up or modifying data (tools), or can be answered conversationally (e.g.
greetings, thanks, general knowledge, clarifying questions, opinions).
Respond with exactly one word: TOOLS or CHAT
```

#### What's working

- Binary classification is fast and cheap (~20 tokens max).
- Skipped when files are attached or a custom agent is active (both always need Sonnet).

#### Opportunities

- **No conversation history in classification.** The classifier only sees the latest message. "What about the other accounts?" looks like CHAT without context but clearly needs TOOLS. Passing a 1-2 message window would improve accuracy.
- **Ambiguous messages default to TOOLS.** The fallback is `'TOOLS'` if parsing fails, which is safe but expensive. Consider adding a third class (`CLARIFY`) for ambiguous messages.
- **No confidence signal.** Sometimes the model is 60/40 — there's no way to express uncertainty. A simple `TOOLS_MAYBE` class could trigger Sonnet without tools first, falling back to tool use if the response is insufficient.

### Agent Injection

When a custom agent is active (via `agentId` param or `@slug` mention in the message):

```
CUSTOM AGENT INSTRUCTIONS:
{agent.system_prompt}
```

This is appended as a third system block after static + dynamic.

#### Opportunities

- **No guardrails on agent prompts.** Users write free-text `system_prompt` values. A malicious or poorly written prompt could override safety rules, leak data, or cause infinite tool loops. Consider sandboxing agent prompts or validating them.
- **No agent-specific tool filtering.** Every agent gets all 41 tools. A "sales report agent" doesn't need `create_brand` or `send_email`. Allowing per-agent tool whitelists would improve safety and focus.

---

## 2. Tool System

**Definitions:** `src/routes/api/ai/+server.ts` (lines 9–643)
**Execution:** `src/lib/server/ai-tools.ts`

### All 41 Tools

#### Data Management (14 tools)

| Tool                  | What it does               | Key behavior                                                                                                    |
| --------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `create_brand`        | Create a new brand         | Inserts into `brands` table                                                                                     |
| `update_brand`        | Update existing brand      | Requires `brand_id`                                                                                             |
| `create_account`      | Create wholesale account   | Auto-invites contact to buyer portal                                                                            |
| `update_account`      | Update account             | Requires `account_id`                                                                                           |
| `create_order`        | Create order               | Fuzzy matches account, brand, season, show by name; auto-sets ship date from season delivery                    |
| `add_order_lines`     | Add line items to order    | Matches by style_number; recalculates total                                                                     |
| `update_order_status` | Change order status        | Emits integration events on submit/confirm/ship/cancel                                                          |
| `update_order`        | Update order details       | Notes, dates, misc fields                                                                                       |
| `update_order_line`   | Change line item quantity  | Recalculates order total                                                                                        |
| `remove_order_line`   | Remove line item           | Requires reason; recalculates total                                                                             |
| `create_season`       | Create a season            | Name + year                                                                                                     |
| `create_show`         | Create a trade show        | Name, dates, location, season                                                                                   |
| `query_data`          | Search across all entities | Supports brands, accounts, orders, shows, seasons, territories, appointments, contacts, order_lines, show_dates |
| `archive_entity`      | Archive/unarchive          | Works on brands and accounts                                                                                    |

#### Territory & Appointments (6 tools)

| Tool                       | What it does                                 |
| -------------------------- | -------------------------------------------- |
| `create_territory`         | Create geographic territory                  |
| `update_territory`         | Update territory                             |
| `assign_account_territory` | Assign account to territory                  |
| `create_appointment`       | Schedule appointment (show/road/phone/video) |
| `update_appointment`       | Reschedule or complete                       |
| `delete_appointment`       | Delete appointment                           |

#### Analytics & Reporting (5 tools)

| Tool                    | What it does                                          |
| ----------------------- | ----------------------------------------------------- |
| `get_dashboard_metrics` | Order counts, revenue, status breakdowns              |
| `get_sales_report`      | Sales by brand/account/territory/rep with date ranges |
| `get_style_velocity`    | Trending styles ranked by number of accounts ordering |
| `get_commission_report` | Commission breakdown by brand and rep                 |
| `get_account_health`    | Account health scores with at-risk detection          |

#### Email (3 tools)

| Tool            | What it does                               |
| --------------- | ------------------------------------------ |
| `draft_email`   | Draft email to contact (fuzzy name lookup) |
| `send_email`    | Send via connected Gmail                   |
| `search_emails` | Search Gmail inbox                         |

#### Integrations (7 tools)

| Tool                     | What it does                                   |
| ------------------------ | ---------------------------------------------- |
| `send_slack_message`     | Send to connected Slack channel                |
| `send_discord_message`   | Send to connected Discord webhook              |
| `export_to_google_sheet` | Export orders/accounts/brands to Google Sheets |
| `list_notion_databases`  | List available Notion databases                |
| `sync_to_notion`         | Sync Threadline data to Notion                 |
| `pull_from_notion`       | Pull pages from Notion database                |
| `add_product`            | Add product to brand catalog                   |

### Permission Model

23 tools are classified as "write tools" and blocked for guest users:

```typescript
const WRITE_TOOLS = new Set([
	'send_email',
	'create_brand',
	'update_brand',
	'create_account',
	'update_account',
	'create_order',
	'add_order_lines',
	'update_order_status',
	'update_order',
	'update_order_line',
	'remove_order_line',
	'create_season',
	'create_show',
	'create_territory',
	'update_territory',
	'assign_account_territory',
	'create_appointment',
	'update_appointment',
	'delete_appointment',
	'archive_entity',
	'add_product',
	'send_slack_message',
	'send_discord_message',
	'export_to_google_sheet',
	'sync_to_notion'
]);
```

Brand-scoped users additionally can't `update_brand` for brands outside their scope.

#### Opportunities

- **`query_data` is a mega-tool.** It handles 10+ entity types with different filter shapes. The model has to guess the right `entity_type` and `filters` structure. Splitting into `query_brands`, `query_orders`, etc. with typed schemas would improve accuracy and reduce malformed queries.
- **No confirmation step for destructive actions.** `delete_appointment`, `archive_entity`, `send_email` execute immediately. Adding a confirmation tool (`confirm_action`) that requires user approval before execution would prevent accidental deletions and sends.
- **Tool descriptions lack examples.** `create_order`'s description says "Create a new order" — it doesn't mention that it fuzzy-matches by name or auto-resolves seasons. Richer descriptions would help the model use tools more effectively.
- **No bulk operations.** Creating 5 orders requires 5 sequential tool calls. A `create_orders_batch` tool would be faster for import scenarios.
- **Missing `draft_email` → `send_email` workflow.** There's no way for the model to show the user a draft before sending. The two tools are independent — linking them into a draft-review-send flow would add a safety net.
- **No `list_*` tools for quick lookups.** To find all brands, the model must use `query_data` with `entity_type: 'brands'`. Dedicated `list_brands`, `list_accounts` tools with simpler schemas would reduce friction for common lookups.
- **Tool result data is raw database rows.** The model receives full Supabase row objects including IDs, timestamps, and join artifacts. A presentation layer that formats results into human-readable summaries before returning to Claude would reduce token usage and improve response quality.

---

## 3. Morning Briefing (`/api/ai/briefing`)

**File:** `src/routes/api/ai/briefing/+server.ts`

### How it works

1. Gathers 8 data points in parallel:
   - Order pipeline (by status, via RPC)
   - Recent orders (last 10)
   - Upcoming shows (next 5)
   - Active brands and accounts counts
   - Stale draft orders (14+ days old)
   - Upcoming appointments (next 7 days)
   - Account health scores
2. Formats all data as a markdown context string
3. Sends to Haiku with a tightly scoped prompt
4. Returns the briefing text

### Briefing Prompt

```
You are a concise business assistant for a wholesale fashion company.
Generate a brief morning briefing based on the data provided.

Rules:
- Write 4-6 short bullet points, each starting with a bold category label
- PRIORITIZE: (1) at-risk accounts and stale orders, (2) upcoming appointments,
  (3) pipeline status, (4) shows, (5) opportunities
- If accounts are at risk, name them and suggest action
- If stale draft orders, flag the dollar amount at risk
- If appointments this week, mention them
- Skip empty categories — don't mention them
- Be direct and actionable, use specific numbers and names
- Keep total response under 200 words
- Do NOT use markdown headers. Use bullet points with **bold labels** only.
```

#### What's working

- Priority ordering is smart — it surfaces the most important things first.
- Data gathering is parallelized for speed.
- Haiku keeps it fast and cheap.
- "Skip empty categories" prevents useless filler.

#### Opportunities

- **Static data window.** "Last 10 orders" and "next 5 shows" are hardcoded. For a large org with 200 orders/week, the last 10 might all be from today. Consider scaling the window based on org activity level.
- **No personalization.** Every user in the org gets the same briefing. A rep who manages only the Southeast territory doesn't need to see West Coast accounts. Scoping data by user role/territory would make it more relevant.
- **No trend comparison.** The briefing shows current state but not change. "Revenue is $45K" is less useful than "Revenue is $45K, up 12% from last week." Adding week-over-week deltas would make it actionable.
- **No caching.** The briefing is regenerated on every request. Since the underlying data changes slowly, caching for 15-30 minutes per org would reduce costs.
- **Max 200 words is sometimes too tight.** For orgs with 5 at-risk accounts, 3 stale orders, and 4 appointments, the model has to make hard tradeoffs. Consider dynamic length based on data density.
- **No follow-up actions.** The briefing says "Nordstrom hasn't ordered in 6 weeks" but doesn't offer a button to draft an email or create an appointment. Returning structured actions alongside the text would close the loop.

---

## 4. Linesheet Parser (`/api/products/parse-linesheet`)

**File:** `src/routes/api/products/parse-linesheet/+server.ts`

### How it works

1. Accepts a file upload (image or PDF, max 20MB)
2. Converts to base64
3. Sends to Sonnet with a `parse_products` tool (forced via `tool_choice`)
4. Extracts structured JSON from the tool_use response
5. Normalizes product data
6. Returns array of products

### Linesheet Prompt

```
You are a product data extraction assistant for a wholesale fashion business.
Analyze the linesheet and extract ALL products by calling the parse_products tool.

Rules:
- Extract every product visible in the document
- If a price has currency symbol like $, remove it and return just the number
- If cannot determine wholesale vs retail price, assume lower price is wholesale
- If only one price shown, treat it as wholesale price
- If no price visible, use 0 for wholesale_price
- Extract sizes and colors whenever visible
- Do NOT put sizes or colors in description field — use arrays
- You MUST call the parse_products tool with your results
```

### Tool Schema

```json
{
	"name": "parse_products",
	"input_schema": {
		"properties": {
			"products": {
				"type": "array",
				"items": {
					"properties": {
						"style_number": { "type": "string" },
						"name": { "type": "string" },
						"wholesale_price": { "type": "number" },
						"retail_price": { "type": "number" },
						"category": { "type": "string" },
						"description": { "type": "string" },
						"sizes": { "type": "array", "items": { "type": "string" } },
						"colors": { "type": "array", "items": { "type": "string" } }
					},
					"required": ["style_number", "name", "wholesale_price"]
				}
			}
		}
	}
}
```

#### What's working

- Forced tool use (`tool_choice: { type: 'tool', name: 'parse_products' }`) guarantees structured output — no parsing ambiguity.
- Price disambiguation rules handle the most common linesheet formats.
- High max_tokens (16384) accommodates large linesheets.

#### Opportunities

- **No confidence scoring.** Products extracted from blurry images or dense PDFs may have wrong prices or missing fields. Adding a `confidence` field per product (0-1) would let the UI flag low-confidence extractions for human review.
- **No multi-page awareness.** For multi-page PDFs, there's no instruction about handling products that span pages or headers that apply to all subsequent products.
- **Size run patterns aren't taught.** Fashion linesheets often show a size run like "S-XL" or "2-12" rather than listing each size. The model may or may not expand these correctly.
- **No image region context.** The model processes the entire image at once. For dense linesheets with 50+ products, accuracy drops. Tiling the image or processing page-by-page could help.
- **`0` as default price is ambiguous.** It's indistinguishable from a free product. Using `null` and handling it in the UI ("price not detected") would be clearer.
- **No duplicate detection.** If the same product appears on multiple pages or in different sections, it'll be extracted twice.

---

## 5. Custom Agent System

**Executor:** `src/lib/server/agent-executor.ts`
**Triggers:** `src/lib/server/integrations/events.ts`
**DB:** `org_agents`, `org_agent_triggers`, `org_agent_runs`

### How it works

Organizations can create custom AI agents with:

- A **name** and **slug** (for `@mention` in chat)
- A **custom system prompt** (free text)
- **Triggers**: event-based (`order_submitted`, `order_confirmed`, `order_shipped`, `order_cancelled`, `new_account`) or schedule-based (cron)
- **Notification channel**: none, Slack, or Discord

### Agent Execution Flow

```
Trigger fires (event or schedule or @mention)
  → Create run record (status: running)
  → Build system prompt: org context + custom prompt + event context
  → Call Sonnet with all 41 tools
  → Tool use loop (max 10 iterations)
  → Strip SUGGESTIONS line
  → Update run record (status: completed/failed, duration, tools used)
  → Send notification to configured channel
```

### Agent System Prompt

```
You are a custom AI agent for {org_name} on Threadline, a wholesale fashion platform.

{custom system_prompt from agent config}

You have access to tools to query and modify data. Be thorough but concise
in your responses.
{optional event context as JSON}
```

#### What's working

- Full audit trail — every run is logged with input, output, tools used, duration, and status.
- Event-triggered automation is powerful (e.g., "when an order is submitted, check inventory and notify Slack").
- Agents run with admin-level access via `supabaseAdmin`, bypassing RLS.

#### Opportunities

- **Agents run as system with no brand scope.** `brandScope: null` and `userId: ''` means agents have unrestricted access. This is intentional for automation but dangerous — a misconfigured agent could modify data across all brands.
- **No rate limiting on agent triggers.** If 100 orders are submitted in bulk, 100 agent runs fire simultaneously. Consider debouncing or batching.
- **Schedule triggers exist in the schema but aren't implemented.** The `cron_expression` field is there, but there's no cron runner. This is a gap.
- **No agent testing/dry-run mode.** Users can't test an agent without it actually executing tools. A sandbox mode that shows what tools _would_ be called without executing them would be valuable.
- **Event context is raw JSON.** The agent receives `{"orderNumber": "ORD-001", "accountName": "Nordstrom", ...}` but no guidance on how to interpret it. Adding structured context descriptions per event type would improve agent behavior.
- **No inter-agent communication.** Agents can't trigger other agents or share state. For complex workflows (e.g., "when order submitted → check inventory → if low, notify purchasing"), you need a single monolithic agent.
- **Custom prompts have no validation or templates.** Users write from scratch. Providing starter templates ("Order notification agent", "Weekly summary agent") would lower the barrier.

---

## 6. Client-Side Integration

**Store:** `src/lib/stores/conversation.ts`
**UI:** `src/lib/components/ai/AssistantPanel.svelte`

### Conversation Store

```typescript
type Message = {
	role: 'user' | 'assistant';
	content: string;
	suggestions?: string[];
	attachments?: FileAttachment[];
};
```

The store sends the full conversation history with every request. After receiving a response with `actions` (tool executions), it calls `invalidateAll()` to refresh page data.

### UI Features

- Text input with file attachment (drag-and-drop)
- Speech-to-text via Web Speech API
- Text-to-speech for responses
- Suggested follow-up prompts
- Role-based starter prompts
- Agent switching via `@slug`

#### Opportunities

- **Full history sent every request.** For long conversations, this gets expensive and may hit token limits. Implement a sliding window (last N messages) or summarize older messages.
- **No streaming.** Responses arrive all at once after the full tool loop completes. Streaming would improve perceived latency, especially for multi-tool sequences.
- **No typing indicator for tool execution.** The user sees "loading" but doesn't know if the AI is thinking, querying data, or creating an order. Streaming tool execution status would build trust.
- **`invalidateAll()` is a sledgehammer.** It refreshes all page data, even if the tool only touched one entity. Targeted invalidation based on which tools were called would be more efficient.
- **No undo.** If the AI creates the wrong order or sends the wrong email, there's no way to revert. An undo buffer for recent write actions would be a safety net.

---

## 7. Prompt Caching Strategy

The system uses Anthropic's prompt caching in two places:

1. **Static system prompt** — marked with `cache_control: { type: 'ephemeral' }`
2. **Last tool definition** — marked with `cache_control: { type: 'ephemeral' }` (caches all tools)

The dynamic system block (user context, page, entity) is NOT cached because it changes per request.

#### Opportunities

- **Conversation history isn't optimized for caching.** Since history is sent as-is, earlier messages aren't cacheable across turns. Structuring the first N messages as a cached block and appending new ones would save tokens on long conversations.
- **Tool definitions never change but are re-sent every request.** They could be more aggressively cached or even defined once in a system prompt block.

---

## 8. Cross-Cutting Opportunities

### Teaching the AI

- **Create a knowledge base tool.** Let the AI access org-specific knowledge (preferred terminology, seasonal calendars, price tier rules) via a retrieval tool rather than cramming it into the system prompt.
- **Feedback loop.** There's no mechanism for users to rate AI responses or correct mistakes. Adding thumbs up/down and feeding corrections back into agent prompts would enable continuous improvement.
- **Prompt versioning.** Prompts are hardcoded in source. A prompt management system (even a simple DB table) would let you A/B test and iterate without deploys.

### Optimization

- **Token usage tracking.** There's no logging of input/output tokens or costs per request. Adding this would let you identify expensive patterns and optimize.
- **Parallel tool execution.** The current loop executes tools sequentially within each iteration. When Claude returns multiple independent tool calls, executing them in parallel would cut latency.
- **Semantic caching for common queries.** "How many orders this month?" is asked frequently and returns similar data. Caching recent query results and serving them for semantically similar questions would reduce tool calls.

### Enhancement

- **Multi-turn tool planning.** The model currently reacts to each message independently. Adding a planning step ("To answer this, I'll need to: 1. look up the account, 2. get their orders, 3. calculate totals") would improve complex query handling and transparency.
- **Proactive notifications.** The briefing is pull-based (user requests it). Push-based alerts ("Order ORD-042 has been in draft for 14 days") via the existing Slack/Discord integrations would be more useful.
- **Voice-first interaction.** Speech-to-text already exists on the client. Adding a dedicated voice mode with shorter, punchier responses optimized for audio would make the assistant usable hands-free at trade shows.

---

## File Reference

| File                                                 | What it contains                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/routes/api/ai/+server.ts`                       | Main chat endpoint, all 41 tool definitions, system prompts, classification |
| `src/lib/server/ai-tools.ts`                         | Tool execution logic (all 41 handlers)                                      |
| `src/routes/api/ai/briefing/+server.ts`              | Briefing data gathering + prompt                                            |
| `src/routes/api/products/parse-linesheet/+server.ts` | Linesheet parser endpoint + prompt                                          |
| `src/lib/server/agent-executor.ts`                   | Custom agent executor                                                       |
| `src/lib/server/integrations/events.ts`              | Event emission + agent trigger dispatch                                     |
| `src/lib/stores/conversation.ts`                     | Client-side conversation state                                              |
| `src/lib/components/ai/AssistantPanel.svelte`        | Chat UI component                                                           |
