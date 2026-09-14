# AI Conversation History

Date: 2026-09-14
Branch: `feat/ai-conversation-history`

## Problem

The in-app AI assistant has no memory beyond the current page view.

The conversation store (`src/lib/stores/conversation.ts`) is in-memory only. There is no `ai_conversations` table. The close button in the dock (`src/routes/+layout.svelte:889`) calls `conversation.clear()`, so closing the panel destroys the thread with no warning, and a page reload does the same. A user who spends twenty minutes working through an order with the assistant loses all of it by clicking X.

Context is separately capped in two places, which is worth recording because it shapes what this work does and does not fix:

- `stores/conversation.ts:75` (`windowHistory`) keeps the last 10 messages. Everything older collapses into a synthetic user turn listing topic fragments, followed by a fabricated assistant turn reading "Understood, I have that context."
- `src/lib/server/ai-history.ts` re-caps at 20 turns, 8,000 characters per turn, 40,000 characters total.

Roughly 10,000 tokens against a 200,000 token window. Token limits are not the problem. The problems are that the thread is destroyed rather than kept, that the client-side trim is silent and lossy, and that the fabricated assistant turn tells the model it retains detail it does not have.

The BRD already specs persistence for the messaging channel (`docs/brd/features.md:656,714`, `messaging_sessions` with a `conversation_history` JSONB column). The in-app assistant is the only chat surface with no equivalent. That gap looks unintentional rather than decided.

## Locked decisions

These were settled during brainstorming and are not open for relitigation during implementation.

1. **A user sees their own recent conversations, period.** Regardless of how many organizations they belong to, regardless of role. No organization filter on the recents list.
2. **Conversations are private to the person who had them.** An admin sees their own conversations, not other members'.
3. **Retention is unbounded.** Nothing ages out.
4. **Starting a conversation is implicit.** Typing the first message into the input when no conversation is active creates one. There is no "new conversation" button.
5. **X ends the conversation.** It closes the panel and leaves the active conversation. The thread is saved. Typing again starts a fresh one.
6. **Titles are generated automatically.** No rename affordance in this work.

## Scope

In scope:

- Persist every conversation and message for the in-app assistant dock.
- A list button in the dock toolbar opening a recents popup.
- Conversation titles, replacing the static "Conversation" label in the panel header.
- Resuming a past conversation from the popup.
- Server-side conversation history, replacing client-supplied history.

Out of scope:

- Renaming, deleting, searching, pinning, or archiving conversations.
- Sharing a conversation with another user. Planned for post-launch, deliberately deferred. The person-scoped RLS below is the thing that would change, so it is worth knowing that a future sharing model bolts onto this rather than replacing it: an `ai_conversation_shares` join table OR'd into the SELECT predicate, with the base `profile_id = auth.uid()` clause untouched.
- Persisting the messaging channel (`messaging_sessions` already covers it, separately).
- `AssistantPanel.svelte` and `InlineChat.svelte` under `src/lib/components/ai/`. Nothing imports either one. They are dead code and this work does not touch or revive them.

## UX

The only live chat surface is the dock in `src/routes/+layout.svelte`. All UI changes land there.

### List button

Goes in the left toolbar group, immediately to the right of the attach button at `+layout.svelte:1176`. The agent picker at `:1198` follows it, and renders only when `availableAgents.length > 0`, so in an org with no agents the toolbar shows two buttons rather than three.

Icon is an inline SVG copied verbatim from remixicon.com. No custom path geometry.

### Recents popup

Opens anchored above the list button, matching the agent picker's existing popover behavior rather than introducing a modal. Shows the 20 most recent conversations ordered by `updated_at` descending, each rendering its title and a relative timestamp.

Rows follow the inset highlight pattern: container gets `p-2`, each row `rounded-lg px-3`. No edge-to-edge bands.

If the user has no conversations yet, the popup does not open at all and the button is disabled. A full empty state is disproportionate for a popover this small.

### Panel header

`+layout.svelte:869` currently renders:

```svelte
<span class="text-xs font-medium text-zinc-500">Conversation</span>
```

This becomes the active conversation's title. Two changes beyond the text itself:

- `text-xs` becomes `text-sm`. The existing value violates the typography minimum in CLAUDE.md, and since this element is being rewritten anyway, it gets fixed here rather than inherited.
- While `title` is still null, it reads "New conversation".

### Resuming

Clicking a row in the popup loads that conversation's full message list into the store, closes the popup, opens the panel, and scrolls to the bottom so the most recent turn is visible and ready to continue. It replaces the current thread rather than appending to it.

## Data model

Two tables. Own-org table conventions from `docs/brd/permissions-implementation-map.md` section A.3.

### `ai_conversations`

| Column            | Type            | Notes                                            |
| ----------------- | --------------- | ------------------------------------------------ |
| `id`              | `uuid` PK       | `gen_random_uuid()`                              |
| `profile_id`      | `uuid` NOT NULL | References `profiles(id)` on delete cascade      |
| `organization_id` | `uuid` NOT NULL | References `organizations(id)` on delete cascade |
| `title`           | `text` NULL     | Null until generated                             |
| `created_at`      | `timestamptz`   | Default `now()`                                  |
| `updated_at`      | `timestamptz`   | Default `now()`, bumped on every message insert  |

Index on `(profile_id, updated_at desc)`, which is exactly the recents query.

`organization_id` is stored even though the list does not filter by it. It records which org's data the conversation ran against, which the resume path needs (see Edge cases) and which any future per-org view would need. Storing it costs nothing; adding it later would require a backfill that cannot be reconstructed.

### `ai_messages`

| Column            | Type            | Notes                                               |
| ----------------- | --------------- | --------------------------------------------------- |
| `id`              | `uuid` PK       | `gen_random_uuid()`                                 |
| `conversation_id` | `uuid` NOT NULL | References `ai_conversations(id)` on delete cascade |
| `role`            | `text` NOT NULL | Check constraint: `'user'` or `'assistant'`         |
| `content`         | `text` NOT NULL | May be empty string when a turn is attachments only |
| `attachments`     | `jsonb` NULL    | Array of `{ name, type, size }`                     |
| `created_at`      | `timestamptz`   | Default `now()`                                     |

Index on `(conversation_id, created_at)`.

On attachments: the client `Message` type (`stores/conversation.ts:13`) carries base64 file data, suggestions, and tool progress. Only the file metadata is persisted, never the base64 payload. Suggestions and tool progress are transient UI and are not stored, so a resumed thread renders without suggestion chips under its last answer. Persisting the bytes would put multi-megabyte blobs in a jsonb column for no benefit, since a resumed thread cannot re-run vision over them.

## RLS

Both tables get RLS enabled.

`ai_conversations`:

- SELECT: `profile_id = auth.uid()`
- INSERT: `profile_id = auth.uid()`
- UPDATE: `profile_id = auth.uid()`
- DELETE: no policy. Nothing in scope deletes.

`ai_messages`, gated through the parent:

- SELECT: `conversation_id IN (SELECT id FROM ai_conversations WHERE profile_id = auth.uid())`
- INSERT: same predicate as a `WITH CHECK`
- UPDATE and DELETE: no policy.

No `is_org_member` and no `organization_id` predicate, per locked decision 1. This is deliberate: a user reaches every conversation they created regardless of which org was active at the time. The precedent is `email_connections`, `cart_items`, and `order_views`, all of which are `profile_id = auth.uid()` alone.

This table sits outside federation entirely. It is not in `get_connected_org_ids()` territory in either direction, and no connection state affects visibility.

Writes go through `supabaseAdmin` with server-derived ownership, matching the existing workaround for the `@supabase/ssr` JWT-drop bug on writes. `profile_id` comes from `locals.user.id` and `organization_id` from `locals.organization.id`. Neither is ever read from the request body, so there is no IDOR surface. Any request supplying a `conversationId` has that id verified against `profile_id = auth.uid()` before a single message is read or written.

## API

### `POST /api/ai` (existing, modified)

Request gains an optional `conversationId: string | null`.

- When null or absent, the handler creates an `ai_conversations` row before calling the model and returns the new id to the client.
- When present, the handler verifies the conversation belongs to the caller. A mismatch is a 403, not a silent new conversation.

The handler persists the user turn before the model call and the assistant turn after it completes, then bumps `updated_at`.

Both response paths must carry the id back:

- The JSON path returns `conversationId` alongside `response` and `suggestions`.
- The streaming path adds `conversationId` to the `done` event payload at `+server.ts:1627`. The client needs it on the first turn of a new conversation in order to send it on the second.

Persistence failures are logged and swallowed rather than failing the request. A user should never lose an answer because a history insert failed. This mirrors how `logUsage` (`src/lib/server/ai-usage.ts:16`) already behaves.

### `GET /api/ai/conversations` (new)

Returns the caller's 20 most recent conversations: `id`, `title`, `updated_at`. Ordered by `updated_at` descending.

### `GET /api/ai/conversations/[id]` (new)

Returns the conversation's messages in `created_at` order, plus its `title` and `organization_id`. 403 if the conversation does not belong to the caller.

## Server-side history

Today the client sends `conversationHistory` on every request and the server sanitizes it. `src/lib/server/ai-history.ts` exists precisely because that input is untrusted: its header comment explains that a caller could otherwise hand the model a fabricated account of its own past, including forged tool results.

Once messages are in the database, that stops being necessary. When a request carries a verified `conversationId`, the server loads recent turns from `ai_messages` and ignores whatever history the request body contained. The forgery vector closes by construction rather than by validation.

Consequences:

- `sanitizeConversationHistory` stays, for the first message of a new conversation (no id yet) and as defense in depth. Its tests stay.
- `windowHistory` in `stores/conversation.ts:75` is deleted, along with the synthetic summary turn and the fabricated "Understood, I have that context." assistant turn. The server trims real data instead.
- The trim limits in `DEFAULT_HISTORY_LIMITS` continue to apply, now against database rows rather than client input.
- One extra database read per turn, on an endpoint that already makes at least two model calls. Not a latency concern.

The classifier call at `+server.ts:1229` continues to receive the last two turns, now sourced from the database on the same path.

## Titles

Generated once, server side, immediately after the first assistant reply of a conversation completes.

- Model: `claude-haiku-4-5`, matching the existing classifier call at `+server.ts:1229`.
- `max_tokens` of 20. Prompt asks for a 3 to 6 word noun phrase describing the topic, no trailing punctuation, no quotes.
- Fire and forget, the way `logUsage` is. A failure never blocks or delays the response.
- Logged through `ai_usage_logs` with `purpose: 'title'`, so it stays visible in cost tracking.
- Fallback when the call fails or returns something unusable: the first user message trimmed to 50 characters. If that is also empty, `title` stays null and the header keeps reading "New conversation".

Rejected alternatives: deriving the title from the first message alone is free but yields titles like "hey can you check" for a thread that is actually about Q3 reorders. Having Sonnet emit a title inline in its main response mixes a UI concern into the answer format and costs a retry whenever it forgets.

## Client store changes

`src/lib/stores/conversation.ts`:

- New `conversationId` writable, null when no conversation is active.
- `sendMessage` includes `conversationId` in the request body and captures the id from the JSON response or the stream's `done` event.
- `loadConversation(id)` fetches messages, replaces `messages`, sets `conversationId`.
- `clear()` resets `messages`, `conversationId`, and `activeAgent` in memory only. It no longer implies data loss, because the thread is already persisted.
- `windowHistory` and `MAX_HISTORY` are removed. The client stops sending history entirely once a `conversationId` exists.

`src/routes/+layout.svelte`:

- List button and recents popup.
- Header title bound to the active conversation.
- The X handler at `:889` keeps calling `conversation.clear()`, which is now non-destructive.

## Edge cases

- **Conversation started, first request fails before any message is persisted.** The row exists with a null title and no messages. It is excluded from the recents query, which requires at least one message. No orphan appears in the list.
- **Attachments-only turn.** `content` is an empty string and `attachments` carries the metadata. The resumed thread shows the attachment names with no text, which is what the user actually sent.
- **Resuming a conversation whose `organization_id` is not the active org.** Only reachable for multi-org members. The resume path switches the active org to the conversation's org first, using the existing membership-verified endpoint at `src/routes/api/org/switch/+server.ts`, then loads the thread. This keeps the model from running with a history from one org and tool scope from another. For the overwhelmingly common single-org user, this branch never executes.
- **User is removed from the org a conversation belonged to.** The conversation still lists and still opens, because visibility is person-scoped. Any tool call made while resuming it is scoped at execution time and will simply return nothing for that org. No special handling.
- **Two tabs open on the same conversation.** Both append to it. Ordering is by `created_at`, so the merged thread interleaves. Not worth locking against for this work.
- **Agent selection.** `activeAgent` is not persisted. Resuming a conversation does not restore the agent that was active during it. Called out so it is a known omission rather than a bug report.

## Testing

Colocated Vitest, per CLAUDE.md.

- `src/lib/server/ai-conversations.test.ts`: history loading trims to `DEFAULT_HISTORY_LIMITS`, preserves alternation, and returns oldest-to-newest order. Ownership verification rejects a `conversationId` belonging to another profile.
- Title generation: falls back to the truncated first message when the model call throws, and when it returns empty or whitespace.
- `src/lib/stores/conversation.test.ts`: `conversationId` is captured from both the JSON response and the stream `done` event. `loadConversation` replaces rather than appends.
- Existing `ai-history` tests stay green. `windowHistory` tests are deleted along with the function.
- RLS: extend the existing RLS sweep so a second profile cannot select another profile's `ai_conversations` or `ai_messages` rows.

Not tested: popup markup and button rendering, per the presentational-component exclusion in CLAUDE.md.

## Files touched

New:

- `supabase/migrations/<timestamp>_ai_conversations.sql`
- `src/lib/server/ai-conversations.ts`
- `src/lib/server/ai-conversations.test.ts`
- `src/routes/api/ai/conversations/+server.ts`
- `src/routes/api/ai/conversations/[id]/+server.ts`
- `src/lib/components/ai/ConversationList.svelte`

Modified:

- `src/routes/api/ai/+server.ts`
- `src/lib/stores/conversation.ts`
- `src/routes/+layout.svelte`

## Verification

Before this is called done: `bun run check` at zero errors, `bun run test:run` green, the migration verified applied against local Supabase by inspecting the tables directly, and the dock exercised in the browser across start, close, reopen, resume, and reload.
