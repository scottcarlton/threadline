# AI Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist in-app assistant conversations so a user can leave, return, browse their recent threads, and resume any of them.

**Architecture:** Two new tables (`ai_conversations`, `ai_messages`) scoped by `profile_id = auth.uid()`. `/api/ai` gains an optional `conversationId`, creates a conversation when absent, persists both turns, and sources history from the database instead of the request body. A new server module holds the pure trim and title helpers plus the database calls. The dock in `+layout.svelte` gains a list button and a recents popover.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Supabase (Postgres + RLS), Anthropic SDK, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-14-ai-conversation-history-design.md`

## Global Constraints

- Package manager is `bun`. Never `npm` or `yarn`. `bunx` instead of `npx`.
- `bun run check` must end at 0 errors.
- `bun run test:run` must pass before any task is called done.
- No em dashes in code, comments, copy, or commit messages.
- Minimum text size is `text-sm`. Never `text-xs`.
- Inline SVG icons only, paths copied verbatim from remixicon.com. Never hand-drawn `d=""` geometry.
- No native `<select>`, `<input type="checkbox">`, or `title=""` tooltips in new code.
- Tailwind arbitrary values use underscores, not commas.
- Never use `{@const}` inside a plain `<div>`.
- All work happens in the worktree at `.worktrees/ai-conversation-history` on branch `feat/ai-conversation-history`. Never edit from the primary checkout.
- Migrations run against local Supabase at `127.0.0.1:54322`, never the remote project.
- Writes from server code go through `supabaseAdmin` (`src/lib/server/supabase.ts`) with `profile_id` and `organization_id` taken from `locals`, never from the request body.

## File Structure

Create:

- `supabase/migrations/20260914000010_ai_conversations.sql` - both tables, indexes, RLS policies.
- `src/lib/server/ai-conversations.ts` - pure history/title helpers plus the database calls for conversations and messages.
- `src/lib/server/ai-conversations.test.ts` - unit tests for the pure helpers.
- `src/lib/server/ai-conversation-title.ts` - the Haiku title call. Separate from the above so `ai-conversations.ts` stays free of Anthropic and usage-logging imports.
- `src/routes/api/ai/conversations/+server.ts` - GET list.
- `src/routes/api/ai/conversations/[id]/+server.ts` - GET one with messages.
- `src/lib/components/ai/ConversationList.svelte` - the recents popover.

Modify:

- `src/lib/server/ai-history.ts` - extract the shared trim so the database path and the request-body path use one implementation.
- `src/routes/api/ai/+server.ts` - conversation resolution, persistence, database-sourced history, `conversationId` on both response paths.
- `src/lib/stores/conversation.ts` - `conversationId` state, `loadConversation`, delete `windowHistory`.
- `src/routes/+layout.svelte` - list button, popover mount, header title.
- `tests/rls/own-org.test.ts` - RLS coverage in the existing user-scoped block.

---

### Task 1: Schema and RLS

**Files:**

- Create: `supabase/migrations/20260914000010_ai_conversations.sql`
- Modify: `tests/rls/own-org.test.ts` (the `user-scoped tables (no org disjunct) are hidden from a same-org non-owner` block, currently at line 574)

**Interfaces:**

- Consumes: nothing.
- Produces: tables `ai_conversations` (`id`, `profile_id`, `organization_id`, `title`, `created_at`, `updated_at`) and `ai_messages` (`id`, `conversation_id`, `role`, `content`, `attachments`, `created_at`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260914000010_ai_conversations.sql`:

```sql
-- Persisted threads for the in-app AI assistant dock.
--
-- Visibility is person-scoped and nothing else: profile_id = auth.uid(),
-- with no organization_id predicate and no federation arm. That is a
-- product decision, not an oversight. A user reaches every conversation
-- they have ever had regardless of which org was active at the time, the
-- same shape already used by email_connections, cart_items, and
-- order_views.
--
-- organization_id is still recorded on the row. It is not used for
-- visibility; it tells the resume path which org's data the thread was
-- built against, so resuming can align the active org before handing the
-- history to a model that holds org-scoped tools.
--
-- No DELETE policy on either table. Nothing in the product deletes a
-- conversation today, and a policy that grants nothing is clearer than one
-- that exists unused.

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_conversations_profile_recent_idx
  on public.ai_conversations (profile_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  attachments jsonb,
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy "Users read their own conversations"
  on public.ai_conversations for select
  using (profile_id = auth.uid());

create policy "Users create their own conversations"
  on public.ai_conversations for insert
  with check (profile_id = auth.uid());

create policy "Users update their own conversations"
  on public.ai_conversations for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "Users read messages in their own conversations"
  on public.ai_messages for select
  using (
    conversation_id in (
      select id from public.ai_conversations where profile_id = auth.uid()
    )
  );

create policy "Users add messages to their own conversations"
  on public.ai_messages for insert
  with check (
    conversation_id in (
      select id from public.ai_conversations where profile_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration and verify it landed**

Run from the worktree root:

```bash
bunx supabase db push --local
```

Then confirm the tables and policies actually exist, rather than trusting the command's exit code:

```bash
docker exec supabase_db_threadline psql -U postgres -d postgres -c "\d public.ai_conversations"
docker exec supabase_db_threadline psql -U postgres -d postgres -c "\d public.ai_messages"
docker exec supabase_db_threadline psql -U postgres -d postgres -c "select tablename, policyname, cmd from pg_policies where tablename in ('ai_conversations','ai_messages') order by tablename, policyname;"
```

Expected: both tables present with the columns above, and exactly 5 policies (3 on `ai_conversations`, 2 on `ai_messages`).

Reload the PostgREST schema cache so the new tables are reachable over the API:

```bash
docker exec supabase_db_threadline psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
```

- [ ] **Step 3: Write the failing RLS test**

In `tests/rls/own-org.test.ts`, inside the existing `it('user-scoped tables (no org disjunct) are hidden from a same-org non-owner', ...)` block, add a probe after the existing `email_connections` probe. `repAAdmin` owns the row; `repASales` is a different user in the same org, so a hidden row can only be explained by `auth.uid()` scoping.

```ts
const { data: conversation, error: conversationErr } = await adminClient()
	.from('ai_conversations')
	.insert({
		profile_id: PERSONA_IDS.repAAdmin!,
		organization_id: RLS_ORG_IDS.repA,
		title: 'RLS probe conversation'
	})
	.select('id')
	.single();
expect(conversationErr, 'ai_conversations probe insert should succeed').toBeNull();

const { data: aiMessage, error: aiMessageErr } = await adminClient()
	.from('ai_messages')
	.insert({
		conversation_id: (conversation as { id: string }).id,
		role: 'user',
		content: 'rls probe'
	})
	.select('id')
	.single();
expect(aiMessageErr, 'ai_messages probe insert should succeed').toBeNull();

await expectVisible(owner, 'ai_conversations', (conversation as { id: string }).id);
await expectHidden(sameOrgNonOwner, 'ai_conversations', (conversation as { id: string }).id);
await expectVisible(owner, 'ai_messages', (aiMessage as { id: string }).id);
await expectHidden(sameOrgNonOwner, 'ai_messages', (aiMessage as { id: string }).id);

await adminClient()
	.from('ai_conversations')
	.delete()
	.eq('id', (conversation as { id: string }).id);
```

Import `RLS_ORG_IDS` from `./setup/ids.js` if the file does not already import it. Deleting the conversation cascades the message, so no separate `ai_messages` cleanup is needed.

- [ ] **Step 4: Run the RLS suite**

Run: `bun run test:rls`
Expected: PASS. If the probe insert fails with a missing-table error, the PostgREST cache reload in Step 2 did not take; repeat it.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260914000010_ai_conversations.sql tests/rls/own-org.test.ts
git commit -m "feat: add ai_conversations and ai_messages tables

Person-scoped RLS (profile_id = auth.uid()) with no org predicate, matching
email_connections and order_views. organization_id is recorded for the
resume path but never gates visibility.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Extract the shared history trim

**Files:**

- Modify: `src/lib/server/ai-history.ts`
- Test: `src/lib/server/ai-history.test.ts` (exists)

**Interfaces:**

- Consumes: nothing.
- Produces: `export type PlainTurn = { role: 'user' | 'assistant'; content: string }` and `export function applyHistoryLimits(turns: PlainTurn[], limits: HistoryLimits): PlainTurn[]`, used by Task 3.

Rationale: `sanitizeConversationHistory` currently does validation and trimming in one pass. The database path needs the trimming half but not the validation half, because rows the server wrote are trustworthy by construction. Extracting it keeps one implementation of the turn cap, character cap, alternation repair, and trailing-user-turn drop.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/server/ai-history.test.ts`:

```ts
import { applyHistoryLimits, type PlainTurn } from './ai-history.js';

describe('applyHistoryLimits', () => {
	const limits = { maxTurns: 4, maxCharsPerTurn: 10, maxTotalChars: 100 };

	it('keeps the most recent turns up to maxTurns', () => {
		const turns: PlainTurn[] = [
			{ role: 'user', content: 'a1' },
			{ role: 'assistant', content: 'b1' },
			{ role: 'user', content: 'a2' },
			{ role: 'assistant', content: 'b2' },
			{ role: 'user', content: 'a3' },
			{ role: 'assistant', content: 'b3' }
		];
		expect(applyHistoryLimits(turns, limits)).toEqual([
			{ role: 'user', content: 'a2' },
			{ role: 'assistant', content: 'b2' },
			{ role: 'user', content: 'a3' },
			{ role: 'assistant', content: 'b3' }
		]);
	});

	it('truncates an over-long turn rather than dropping it', () => {
		const turns: PlainTurn[] = [
			{ role: 'user', content: 'x'.repeat(25) },
			{ role: 'assistant', content: 'ok' }
		];
		const result = applyHistoryLimits(turns, limits);
		expect(result[0].content).toBe('x'.repeat(10) + ' [truncated]');
	});

	it('drops a trailing user turn so the caller can append the live message', () => {
		const turns: PlainTurn[] = [
			{ role: 'user', content: 'a1' },
			{ role: 'assistant', content: 'b1' },
			{ role: 'user', content: 'a2' }
		];
		expect(applyHistoryLimits(turns, limits)).toEqual([
			{ role: 'user', content: 'a1' },
			{ role: 'assistant', content: 'b1' }
		]);
	});

	it('repairs alternation by skipping same-role runs', () => {
		const turns: PlainTurn[] = [
			{ role: 'assistant', content: 'orphan' },
			{ role: 'user', content: 'a1' },
			{ role: 'user', content: 'a2' },
			{ role: 'assistant', content: 'b1' }
		];
		expect(applyHistoryLimits(turns, limits)).toEqual([
			{ role: 'user', content: 'a1' },
			{ role: 'assistant', content: 'b1' }
		]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/lib/server/ai-history.test.ts`
Expected: FAIL with an import error, `applyHistoryLimits` is not exported.

- [ ] **Step 3: Extract the function**

In `src/lib/server/ai-history.ts`, change the `PlainTurn` type from private to exported, then add `applyHistoryLimits` holding the logic currently at lines 85 to 121, and have `sanitizeConversationHistory` call it.

```ts
export type PlainTurn = { role: 'user' | 'assistant'; content: string };

/**
 * Cap, truncate, and repair a run of turns so the Messages API will accept
 * it. Split out of sanitizeConversationHistory so the database-sourced
 * path can reuse the trimming without re-running validation that only
 * matters for client input.
 */
export function applyHistoryLimits(turns: PlainTurn[], limits: HistoryLimits): PlainTurn[] {
	// Newest turns are the useful ones, so trim from the front.
	const recent = turns.slice(-limits.maxTurns);

	const capped = recent.map((turn) => ({
		role: turn.role,
		content:
			turn.content.length > limits.maxCharsPerTurn
				? turn.content.slice(0, limits.maxCharsPerTurn) + TRUNCATION_MARKER
				: turn.content
	}));

	// Total budget, applied oldest-first so the most recent context survives.
	const withinBudget: PlainTurn[] = [];
	let total = 0;
	for (let i = capped.length - 1; i >= 0; i--) {
		const turn = capped[i];
		if (total + turn.content.length > limits.maxTotalChars) break;
		total += turn.content.length;
		withinBudget.unshift(turn);
	}

	// Strict alternation starting with user.
	const alternating: PlainTurn[] = [];
	for (const turn of withinBudget) {
		const previous = alternating[alternating.length - 1];
		if (!previous) {
			if (turn.role !== 'user') continue;
			alternating.push(turn);
			continue;
		}
		if (turn.role === previous.role) continue;
		alternating.push(turn);
	}

	// The caller appends the live user message next, so history ending on a
	// user turn would put two user turns back to back.
	if (alternating[alternating.length - 1]?.role === 'user') alternating.pop();

	return alternating;
}
```

Then replace the body of `sanitizeConversationHistory` from the `const recent = valid.slice(...)` line through the `if (alternating[...]) alternating.pop();` line with:

```ts
const alternating = applyHistoryLimits(valid, limits);

return {
	messages: alternating.map((turn) => ({ role: turn.role, content: turn.content })),
	rejected
};
```

- [ ] **Step 4: Run the tests**

Run: `bun run test:run src/lib/server/ai-history.test.ts`
Expected: PASS, including every pre-existing `sanitizeConversationHistory` test. Those tests are the regression net for this extraction; if any of them changed behavior, the extraction is wrong.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/ai-history.ts src/lib/server/ai-history.test.ts
git commit -m "refactor: extract applyHistoryLimits from sanitizeConversationHistory

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Conversation server module

**Files:**

- Create: `src/lib/server/ai-conversations.ts`
- Create: `src/lib/server/ai-conversations.test.ts`

**Interfaces:**

- Consumes: `applyHistoryLimits`, `PlainTurn`, `DEFAULT_HISTORY_LIMITS`, `HistoryLimits` from `./ai-history.js`. `supabaseAdmin` from `./supabase.js`.
- Produces:
  - `type StoredAttachment = { name: string; type: string; size: number }`
  - `type ConversationSummary = { id: string; title: string | null; updated_at: string }`
  - `type ConversationDetail = { id: string; title: string | null; organizationId: string; messages: Array<{ role: 'user' | 'assistant'; content: string; attachments: StoredAttachment[] | null }> }`
  - `function toHistoryMessages(rows: PlainTurn[], limits?: HistoryLimits): Anthropic.MessageParam[]`
  - `function fallbackTitle(firstUserMessage: string): string | null`
  - `function normalizeTitle(raw: string): string | null`
  - `async function createConversation(profileId: string, organizationId: string): Promise<string | null>`
  - `async function conversationBelongsTo(conversationId: string, profileId: string): Promise<boolean>`
  - `async function appendMessage(conversationId: string, role: 'user' | 'assistant', content: string, attachments?: StoredAttachment[] | null): Promise<void>`
  - `async function loadHistory(conversationId: string, limits?: HistoryLimits): Promise<Anthropic.MessageParam[]>`
  - `async function listConversations(profileId: string, limit?: number): Promise<ConversationSummary[]>`
  - `async function getConversation(conversationId: string, profileId: string): Promise<ConversationDetail | null>`
  - `async function setTitle(conversationId: string, title: string): Promise<void>`

The four pure functions carry the unit tests. The database functions are thin enough that mocking Supabase to test them would test the mock, which matches how `briefing.test.ts` already handles this surface.

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/ai-conversations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fallbackTitle, normalizeTitle, toHistoryMessages } from './ai-conversations.js';
import type { PlainTurn } from './ai-history.js';

describe('toHistoryMessages', () => {
	it('returns rows as Messages API params in order', () => {
		const rows: PlainTurn[] = [
			{ role: 'user', content: 'first' },
			{ role: 'assistant', content: 'second' }
		];
		expect(toHistoryMessages(rows)).toEqual([
			{ role: 'user', content: 'first' },
			{ role: 'assistant', content: 'second' }
		]);
	});

	it('drops a trailing user turn so the live message can be appended', () => {
		const rows: PlainTurn[] = [
			{ role: 'user', content: 'first' },
			{ role: 'assistant', content: 'second' },
			{ role: 'user', content: 'third' }
		];
		expect(toHistoryMessages(rows)).toEqual([
			{ role: 'user', content: 'first' },
			{ role: 'assistant', content: 'second' }
		]);
	});

	it('skips rows with empty content rather than sending an empty turn', () => {
		const rows: PlainTurn[] = [
			{ role: 'user', content: '   ' },
			{ role: 'user', content: 'real' },
			{ role: 'assistant', content: 'reply' }
		];
		expect(toHistoryMessages(rows)).toEqual([
			{ role: 'user', content: 'real' },
			{ role: 'assistant', content: 'reply' }
		]);
	});

	it('returns an empty array for no rows', () => {
		expect(toHistoryMessages([])).toEqual([]);
	});
});

describe('normalizeTitle', () => {
	it('trims whitespace', () => {
		expect(normalizeTitle('  Spring order review  ')).toBe('Spring order review');
	});

	it('strips surrounding quotes the model sometimes adds', () => {
		expect(normalizeTitle('"Spring order review"')).toBe('Spring order review');
	});

	it('strips a trailing period', () => {
		expect(normalizeTitle('Spring order review.')).toBe('Spring order review');
	});

	it('returns null for empty or whitespace-only input', () => {
		expect(normalizeTitle('')).toBeNull();
		expect(normalizeTitle('   ')).toBeNull();
	});

	it('caps an over-long title at 60 characters', () => {
		expect(normalizeTitle('x'.repeat(80))).toHaveLength(60);
	});
});

describe('fallbackTitle', () => {
	it('uses the first user message when short', () => {
		expect(fallbackTitle('Check the Bloom order')).toBe('Check the Bloom order');
	});

	it('truncates a long message to 50 characters with an ellipsis', () => {
		const result = fallbackTitle('x'.repeat(80));
		expect(result).toBe('x'.repeat(50) + '...');
	});

	it('collapses newlines into single spaces', () => {
		expect(fallbackTitle('line one\n\nline two')).toBe('line one line two');
	});

	it('returns null when there is nothing usable', () => {
		expect(fallbackTitle('   ')).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/lib/server/ai-conversations.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Write the module**

Create `src/lib/server/ai-conversations.ts`:

```ts
/**
 * Persistence for the in-app assistant's conversations.
 *
 * History for an existing conversation is read from here rather than from
 * the request body. ai-history.ts exists because client-supplied history is
 * untrusted: a caller could hand the model a fabricated account of its own
 * past. Rows this module wrote have no such problem, so the database path
 * skips validation and applies only the trim.
 *
 * Every write goes through supabaseAdmin because @supabase/ssr drops the
 * JWT on writes. That bypasses RLS, so every function taking a
 * conversationId either verifies ownership itself or documents that its
 * caller already did.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './supabase.js';
import {
	applyHistoryLimits,
	DEFAULT_HISTORY_LIMITS,
	type HistoryLimits,
	type PlainTurn
} from './ai-history.js';

export type StoredAttachment = { name: string; type: string; size: number };

export type ConversationSummary = {
	id: string;
	title: string | null;
	updated_at: string;
};

export type ConversationDetail = {
	id: string;
	title: string | null;
	organizationId: string;
	messages: Array<{
		role: 'user' | 'assistant';
		content: string;
		attachments: StoredAttachment[] | null;
	}>;
};

const MAX_TITLE_CHARS = 60;
const FALLBACK_TITLE_CHARS = 50;
const DEFAULT_LIST_LIMIT = 20;

/** Stored rows to Messages API params. Empty turns are dropped, not sent. */
export function toHistoryMessages(
	rows: PlainTurn[],
	limits: HistoryLimits = DEFAULT_HISTORY_LIMITS
): Anthropic.MessageParam[] {
	const nonEmpty = rows
		.map((row) => ({ role: row.role, content: row.content.trim() }))
		.filter((row) => row.content.length > 0);
	return applyHistoryLimits(nonEmpty, limits).map((turn) => ({
		role: turn.role,
		content: turn.content
	}));
}

/** Clean a model-generated title, or null if nothing usable came back. */
export function normalizeTitle(raw: string): string | null {
	let title = raw.trim();
	if (title.startsWith('"') && title.endsWith('"') && title.length > 1) {
		title = title.slice(1, -1).trim();
	}
	if (title.endsWith('.')) title = title.slice(0, -1).trim();
	if (!title) return null;
	return title.length > MAX_TITLE_CHARS ? title.slice(0, MAX_TITLE_CHARS) : title;
}

/** Used when title generation fails or returns nothing usable. */
export function fallbackTitle(firstUserMessage: string): string | null {
	const flat = firstUserMessage.replace(/\s+/g, ' ').trim();
	if (!flat) return null;
	return flat.length > FALLBACK_TITLE_CHARS ? flat.slice(0, FALLBACK_TITLE_CHARS) + '...' : flat;
}

/** Returns the new conversation id, or null if the insert failed. */
export async function createConversation(
	profileId: string,
	organizationId: string
): Promise<string | null> {
	const { data, error } = await supabaseAdmin
		.from('ai_conversations')
		.insert({ profile_id: profileId, organization_id: organizationId })
		.select('id')
		.single();
	if (error) {
		console.error('ai_conversations insert failed:', error.message);
		return null;
	}
	return (data as { id: string }).id;
}

/**
 * Ownership gate for every caller that accepts a conversationId from a
 * request body. supabaseAdmin bypasses RLS, so this is the only thing
 * standing between a guessed id and another user's thread.
 */
export async function conversationBelongsTo(
	conversationId: string,
	profileId: string
): Promise<boolean> {
	const { data, error } = await supabaseAdmin
		.from('ai_conversations')
		.select('id')
		.eq('id', conversationId)
		.eq('profile_id', profileId)
		.maybeSingle();
	if (error) {
		console.error('ai_conversations ownership check failed:', error.message);
		return false;
	}
	return data !== null;
}

/**
 * Append a turn and bump the conversation's updated_at so it sorts to the
 * top of the recents list. Caller must have verified ownership.
 *
 * Failures are logged and swallowed: a user should never lose an answer
 * because a history insert failed.
 */
export async function appendMessage(
	conversationId: string,
	role: 'user' | 'assistant',
	content: string,
	attachments: StoredAttachment[] | null = null
): Promise<void> {
	const { error } = await supabaseAdmin.from('ai_messages').insert({
		conversation_id: conversationId,
		role,
		content,
		attachments
	});
	if (error) {
		console.error('ai_messages insert failed:', error.message);
		return;
	}
	const { error: bumpError } = await supabaseAdmin
		.from('ai_conversations')
		.update({ updated_at: new Date().toISOString() })
		.eq('id', conversationId);
	if (bumpError) console.error('ai_conversations updated_at bump failed:', bumpError.message);
}

/** Caller must have verified ownership. */
export async function loadHistory(
	conversationId: string,
	limits: HistoryLimits = DEFAULT_HISTORY_LIMITS
): Promise<Anthropic.MessageParam[]> {
	const { data, error } = await supabaseAdmin
		.from('ai_messages')
		.select('role, content')
		.eq('conversation_id', conversationId)
		.order('created_at', { ascending: true });
	if (error) {
		console.error('ai_messages select failed:', error.message);
		return [];
	}
	const rows = (data ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>;
	return toHistoryMessages(rows, limits);
}

/**
 * The recents list. Conversations with no messages are excluded so a thread
 * whose very first request failed never appears as an empty row.
 */
export async function listConversations(
	profileId: string,
	limit: number = DEFAULT_LIST_LIMIT
): Promise<ConversationSummary[]> {
	const { data, error } = await supabaseAdmin
		.from('ai_conversations')
		.select('id, title, updated_at, ai_messages!inner(id)')
		.eq('profile_id', profileId)
		.order('updated_at', { ascending: false })
		.limit(limit);
	if (error) {
		console.error('ai_conversations list failed:', error.message);
		return [];
	}
	// !inner filters to conversations that have at least one message. PostgREST
	// embeds the join as a nested array, so this is already one row per
	// conversation; the nested field is selected only to drive the filter and
	// is discarded here.
	const rows = (data ?? []) as Array<{
		id: string;
		title: string | null;
		updated_at: string;
	}>;
	return rows.map((row) => ({ id: row.id, title: row.title, updated_at: row.updated_at }));
}

/** Null when the conversation does not exist or belongs to someone else. */
export async function getConversation(
	conversationId: string,
	profileId: string
): Promise<ConversationDetail | null> {
	const { data: conversation, error } = await supabaseAdmin
		.from('ai_conversations')
		.select('id, title, organization_id')
		.eq('id', conversationId)
		.eq('profile_id', profileId)
		.maybeSingle();
	if (error || !conversation) {
		if (error) console.error('ai_conversations select failed:', error.message);
		return null;
	}
	const row = conversation as { id: string; title: string | null; organization_id: string };

	const { data: messages, error: messagesError } = await supabaseAdmin
		.from('ai_messages')
		.select('role, content, attachments')
		.eq('conversation_id', conversationId)
		.order('created_at', { ascending: true });
	if (messagesError) {
		console.error('ai_messages select failed:', messagesError.message);
		return null;
	}

	return {
		id: row.id,
		title: row.title,
		organizationId: row.organization_id,
		messages: (messages ?? []) as ConversationDetail['messages']
	};
}

/** Caller must have verified ownership. */
export async function setTitle(conversationId: string, title: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from('ai_conversations')
		.update({ title })
		.eq('id', conversationId);
	if (error) console.error('ai_conversations title update failed:', error.message);
}
```

- [ ] **Step 4: Run the tests**

Run: `bun run test:run src/lib/server/ai-conversations.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Type check and commit**

```bash
bun run check
git add src/lib/server/ai-conversations.ts src/lib/server/ai-conversations.test.ts
git commit -m "feat: add conversation persistence module

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Title generation

**Files:**

- Create: `src/lib/server/ai-conversation-title.ts`

**Interfaces:**

- Consumes: `normalizeTitle`, `fallbackTitle`, `setTitle` from `./ai-conversations.js`. `logUsage` from `./ai-usage.js`.
- Produces: `function generateTitle(params: { anthropic: Anthropic; conversationId: string; firstUserMessage: string; firstAssistantMessage: string; organizationId: string; userId: string }): void` - synchronous signature, fire and forget internally.

- [ ] **Step 1: Write the module**

There is no unit test for this file. Its only branch worth testing is the fallback, and both `normalizeTitle` and `fallbackTitle` are already covered in Task 3. Mocking the Anthropic client here would test the mock.

Create `src/lib/server/ai-conversation-title.ts`:

```ts
/**
 * One-shot title generation for a new conversation.
 *
 * Fire and forget, the same shape as logUsage: a title is cosmetic and must
 * never delay or fail the answer the user is waiting on. Runs on Haiku,
 * matching the classifier call in /api/ai.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { fallbackTitle, normalizeTitle, setTitle } from './ai-conversations.js';
import { logUsage } from './ai-usage.js';

const TITLE_MODEL = 'claude-haiku-4-5';

const TITLE_PROMPT = `Write a short title for this conversation.

Rules:
- 3 to 6 words
- A noun phrase describing the topic, not a sentence
- No quotes, no trailing punctuation
- Name the concrete subject where there is one (a brand, an account, a season)

Respond with the title only.`;

export function generateTitle(params: {
	anthropic: Anthropic;
	conversationId: string;
	firstUserMessage: string;
	firstAssistantMessage: string;
	organizationId: string;
	userId: string;
}): void {
	const fallback = fallbackTitle(params.firstUserMessage);

	void (async () => {
		try {
			const response = await params.anthropic.messages.create({
				model: TITLE_MODEL,
				max_tokens: 20,
				system: [{ type: 'text', text: TITLE_PROMPT }],
				messages: [
					{
						role: 'user',
						content: `User: ${params.firstUserMessage}\n\nAssistant: ${params.firstAssistantMessage}`
					}
				]
			});
			logUsage({
				endpoint: 'chat',
				purpose: 'title',
				model: TITLE_MODEL,
				organizationId: params.organizationId,
				userId: params.userId,
				response
			});
			const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
			const title = normalizeTitle(raw) ?? fallback;
			if (title) await setTitle(params.conversationId, title);
		} catch (err) {
			console.error('conversation title generation failed:', err);
			if (fallback) await setTitle(params.conversationId, fallback);
		}
	})();
}
```

- [ ] **Step 2: Type check**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/ai-conversation-title.ts
git commit -m "feat: generate conversation titles with Haiku

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire persistence into /api/ai

**Files:**

- Modify: `src/routes/api/ai/+server.ts`

**Interfaces:**

- Consumes: everything produced by Tasks 3 and 4.
- Produces: `conversationId` on the JSON response body and on the stream's `done` event. `StreamResponseParams` gains `conversationId: string | null` and `firstUserMessage: string | null`.

- [ ] **Step 1: Accept and resolve the conversation**

Add to the imports at the top of the file:

```ts
import {
	appendMessage,
	conversationBelongsTo,
	createConversation,
	loadHistory,
	type StoredAttachment
} from '$lib/server/ai-conversations.js';
import { generateTitle } from '$lib/server/ai-conversation-title.js';
```

Add `conversationId` to the destructure at line 1015:

```ts
const {
	message,
	files,
	conversationHistory,
	conversationId,
	currentPage,
	entityContext: entityCtx,
	agentId,
	stream
} = await request.json();
```

After the rate-limit check that ends at line 1042, insert the conversation resolution:

```ts
// Resolve the conversation before anything else touches the model, so a
// forged id fails closed rather than silently starting a new thread.
// supabaseAdmin bypasses RLS, which is why ownership is checked here.
let activeConversationId: string | null = null;
let isNewConversation = false;
if (typeof conversationId === 'string' && conversationId) {
	const owns = await conversationBelongsTo(conversationId, locals.user.id);
	if (!owns) return json({ error: 'Conversation not found' }, { status: 403 });
	activeConversationId = conversationId;
} else {
	activeConversationId = await createConversation(locals.user.id, locals.organization.id);
	isNewConversation = activeConversationId !== null;
}
```

- [ ] **Step 2: Source history from the database**

Replace the history block at lines 1203 to 1214 with:

```ts
// For an existing conversation, history comes from rows this server
// wrote, so the forgery vector ai-history.ts guards against does not
// apply. The sanitizer stays for the first turn of a new conversation
// and as a fallback when the conversation row could not be created.
let historyMessages: Anthropic.MessageParam[];
if (activeConversationId && !isNewConversation) {
	historyMessages = await loadHistory(activeConversationId);
} else {
	const history = sanitizeConversationHistory(conversationHistory);
	if (history.rejected > 0) {
		console.warn(
			`[ai] discarded ${history.rejected} malformed history turn(s) from user ${locals.user!.id}`
		);
	}
	historyMessages = history.messages;
}
const messages: Anthropic.MessageParam[] = [
	...historyMessages,
	{ role: 'user' as const, content: userContent }
];
```

Then update the classifier at line 1224 to read from the same source:

```ts
const classifyMessages: Anthropic.MessageParam[] = [
	...historyMessages.slice(-2),
	{ role: 'user', content: userContent }
];
```

- [ ] **Step 3: Persist the user turn**

Immediately after the `messages` array is built in Step 2, add:

```ts
// Persist the user turn before the model call. Attachment bytes are
// never stored, only enough metadata to render the turn on resume.
if (activeConversationId) {
	const storedAttachments: StoredAttachment[] | null = Array.isArray(files)
		? files.map((f: { name: string; type: string; data: string }) => ({
				name: f.name,
				type: f.type,
				size: f.data?.length ?? 0
			}))
		: null;
	await appendMessage(
		activeConversationId,
		'user',
		cleanMessage,
		storedAttachments && storedAttachments.length > 0 ? storedAttachments : null
	);
}
```

- [ ] **Step 4: Persist the assistant turn on the Haiku branch**

In the `if (useHaiku)` block, replace the `return json({ response: responseText, suggestions });` at line 1283 with:

```ts
if (activeConversationId) {
	await appendMessage(activeConversationId, 'assistant', responseText);
	if (isNewConversation) {
		generateTitle({
			anthropic,
			conversationId: activeConversationId,
			firstUserMessage: cleanMessage,
			firstAssistantMessage: responseText,
			organizationId: locals.organization!.id,
			userId: locals.user!.id
		});
	}
}

return json({ response: responseText, suggestions, conversationId: activeConversationId });
```

- [ ] **Step 5: Pass the conversation into the streaming branch**

Add two fields to the `StreamResponseParams` type declaration:

```ts
conversationId: string | null;
isNewConversation: boolean;
```

And pass them at the `streamResponse({...})` call at line 1290:

```ts
return streamResponse({
	anthropic,
	systemBlocks,
	cachedTools,
	messages,
	locals,
	role,
	origin,
	resolvedAgentId,
	cleanMessage,
	requestStartTime,
	conversationId: activeConversationId,
	isNewConversation
});
```

In `streamResponse`, replace the `send(controller, { type: 'done', ... })` call at line 1627 with:

```ts
if (params.conversationId) {
	await appendMessage(params.conversationId, 'assistant', responseText);
	if (params.isNewConversation) {
		generateTitle({
			anthropic: params.anthropic,
			conversationId: params.conversationId,
			firstUserMessage: params.cleanMessage,
			firstAssistantMessage: responseText,
			organizationId: params.locals.organization!.id,
			userId: params.locals.user!.id
		});
	}
}

send(controller, {
	type: 'done',
	response: responseText,
	actions: actions.length > 0 ? actions : undefined,
	suggestions,
	conversationId: params.conversationId
});
```

- [ ] **Step 6: Persist the assistant turn on the non-streaming tool path**

Find the final `return json({ ... })` of the tool-loop branch (after the `while (response.stop_reason === 'tool_use' ...)` loop at line 1325) and add the same persistence and title call used in Step 4 before it, then add `conversationId: activeConversationId` to the returned object. The response variable name in that branch is whatever the existing code already assembles as the text payload; do not rename it.

- [ ] **Step 7: Type check**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 8: Verify by hand against local Supabase**

Start the dev server, open any authenticated page, send one message in the dock, then:

```bash
docker exec supabase_db_threadline psql -U postgres -d postgres -c "select c.id, c.title, count(m.id) as messages from ai_conversations c left join ai_messages m on m.conversation_id = c.id group by c.id, c.title order by c.updated_at desc limit 5;"
```

Expected: one conversation with 2 messages, and a non-null title within a few seconds of the reply landing.

- [ ] **Step 9: Commit**

```bash
git add src/routes/api/ai/+server.ts
git commit -m "feat: persist assistant conversations and source history from the database

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Conversation list and detail endpoints

**Files:**

- Create: `src/routes/api/ai/conversations/+server.ts`
- Create: `src/routes/api/ai/conversations/[id]/+server.ts`

**Interfaces:**

- Consumes: `listConversations`, `getConversation` from `$lib/server/ai-conversations.js`.
- Produces: `GET /api/ai/conversations` returning `{ conversations: ConversationSummary[] }`. `GET /api/ai/conversations/[id]` returning `{ id, title, organizationId, messages }`.

- [ ] **Step 1: Write the list endpoint**

Create `src/routes/api/ai/conversations/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listConversations } from '$lib/server/ai-conversations.js';

export const GET: RequestHandler = async ({ locals }) => {
	// Same gate as /api/ai: buyers never reach the org assistant.
	if (!locals.session || !locals.user || !locals.organization || locals.isBuyer) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const conversations = await listConversations(locals.user.id);
	return json({ conversations });
};
```

- [ ] **Step 2: Write the detail endpoint**

Create `src/routes/api/ai/conversations/[id]/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConversation } from '$lib/server/ai-conversations.js';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization || locals.isBuyer) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// getConversation filters on profile_id itself, so a conversation owned by
	// someone else is indistinguishable from one that does not exist.
	const conversation = await getConversation(params.id, locals.user.id);
	if (!conversation) return json({ error: 'Conversation not found' }, { status: 404 });

	return json(conversation);
};
```

- [ ] **Step 3: Type check and verify**

Run: `bun run check`
Expected: 0 errors.

With the dev server running and at least one conversation saved from Task 5:

```bash
curl -s -b "<your session cookie>" http://localhost:5173/api/ai/conversations | head -c 400
```

Expected: a JSON body with a `conversations` array containing at least one entry with `id`, `title`, and `updated_at`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/ai/conversations
git commit -m "feat: add conversation list and detail endpoints

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Client store

**Files:**

- Modify: `src/lib/stores/conversation.ts`
- Create: `src/lib/stores/conversation.test.ts`

**Interfaces:**

- Consumes: the endpoints from Tasks 5 and 6.
- Produces: `conversation.conversationId` (a readable store of `string | null`), `conversation.title` (`string | null`), `conversation.loadConversation(id: string): Promise<void>`. `windowHistory` and `MAX_HISTORY` are deleted.

- [ ] **Step 1: Write the failing test**

The existing `planInvalidation` tests in this project live alongside the store. Create `src/lib/stores/conversation.test.ts` with tests for the one piece of new logic that is pure:

```ts
import { describe, it, expect } from 'vitest';
import { messagesFromStored } from './conversation.js';

describe('messagesFromStored', () => {
	it('maps stored rows into store messages', () => {
		expect(
			messagesFromStored([
				{ role: 'user', content: 'hi', attachments: null },
				{ role: 'assistant', content: 'hello', attachments: null }
			])
		).toEqual([
			{ role: 'user', content: 'hi' },
			{ role: 'assistant', content: 'hello' }
		]);
	});

	it('carries attachment metadata through without file data', () => {
		const result = messagesFromStored([
			{
				role: 'user',
				content: 'see attached',
				attachments: [{ name: 'po.pdf', type: 'application/pdf', size: 1024 }]
			}
		]);
		expect(result[0].attachments).toEqual([
			{ name: 'po.pdf', type: 'application/pdf', size: 1024, data: '' }
		]);
	});

	it('returns an empty array for no rows', () => {
		expect(messagesFromStored([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:run src/lib/stores/conversation.test.ts`
Expected: FAIL, `messagesFromStored` is not exported.

- [ ] **Step 3: Update the store**

In `src/lib/stores/conversation.ts`:

Delete `const MAX_HISTORY = 10;` (line 30) and the entire `windowHistory` function (lines 75 to 97). The synthetic summary turn and the fabricated "Understood, I have that context." assistant turn go with it. The server now trims real rows.

Add above `createConversationStore`:

```ts
export type StoredRow = {
	role: 'user' | 'assistant';
	content: string;
	attachments: Array<{ name: string; type: string; size: number }> | null;
};

/**
 * Stored rows to store messages. Attachment bytes are never persisted, so
 * `data` comes back empty; it exists only to satisfy FileAttachment, and
 * nothing re-sends a resumed attachment to the model.
 */
export function messagesFromStored(rows: StoredRow[]): Message[] {
	return rows.map((row) => {
		const message: Message = { role: row.role, content: row.content };
		if (row.attachments && row.attachments.length > 0) {
			message.attachments = row.attachments.map((a) => ({
				name: a.name,
				type: a.type,
				size: a.size,
				data: ''
			}));
		}
		return message;
	});
}
```

Inside `createConversationStore`, add the new state:

```ts
const conversationId = writable<string | null>(null);
const title = writable<string | null>(null);
```

In `sendMessage`, replace the history block at lines 140 to 144 with:

```ts
// Once a conversation exists the server reads history from the
// database and ignores anything sent here, so only the very first
// message of a new thread needs to carry it.
const activeId = get(conversationId);
const history = activeId
	? []
	: get(messages)
			.slice(0, -1)
			.map((m) => ({ role: m.role, content: m.content }));
```

Add `conversationId: activeId` to the `body` object alongside `conversationHistory: history`.

In the non-streaming response branch, capture the id before appending the message:

```ts
if (!isStream) {
	const data = await res.json();
	if (data.conversationId) conversationId.set(data.conversationId);
	const assistantMessage: Message = {
		role: 'assistant',
		content: data.response ?? "Sorry, I couldn't process that request.",
		suggestions: data.suggestions
	};
	messages.update((m) => [...m, assistantMessage]);
	if (data.actions?.length) await invalidateAfterActions(data.actions);
	return;
}
```

In the stream loop, capture it from the `done` event alongside `finalActions`:

```ts
if (event.type === 'done') {
	finalActions = event.actions as Array<{ tool: string }> | undefined;
	if (typeof event.conversationId === 'string') {
		conversationId.set(event.conversationId);
	}
}
```

Add the loader:

```ts
async function loadConversation(id: string) {
	loading.set(true);
	try {
		const res = await fetch(`/api/ai/conversations/${id}`);
		if (!res.ok) return;
		const data = await res.json();
		messages.set(messagesFromStored(data.messages ?? []));
		conversationId.set(data.id);
		title.set(data.title ?? null);
	} finally {
		loading.set(false);
	}
}
```

Update `clear` so it resets the new state. It is no longer destructive: the thread is already persisted, this only ends the session in the UI.

```ts
function clear() {
	messages.set([]);
	conversationId.set(null);
	title.set(null);
	activeAgent.set(null);
}
```

Update the returned object:

```ts
return {
	messages,
	loading,
	activeAgent,
	conversationId,
	title,
	sendMessage,
	loadConversation,
	clear,
	setAgent
};
```

- [ ] **Step 4: Run the tests**

Run: `bun run test:run`
Expected: PASS. Any existing `windowHistory` test must be deleted in the same change, since the function is gone.

- [ ] **Step 5: Type check and commit**

```bash
bun run check
git add src/lib/stores/conversation.ts src/lib/stores/conversation.test.ts
git commit -m "feat: track conversation id in the store and drop client-side windowing

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Recents popover and panel title

**Files:**

- Create: `src/lib/components/ai/ConversationList.svelte`
- Modify: `src/routes/+layout.svelte` (header at 869, toolbar at 1176)

**Interfaces:**

- Consumes: `conversation.loadConversation`, `conversation.title` from Task 7. `GET /api/ai/conversations` from Task 6.
- Produces: nothing downstream.

- [ ] **Step 1: Write the popover component**

Markup mirrors the agent picker at `+layout.svelte:1223` to 1264: absolutely positioned above the trigger, `bg-zinc-800`, `p-2` container with `rounded-lg px-3 py-2` rows. That is the inset row pattern, so highlights never run edge to edge inside the rounded panel.

Create `src/lib/components/ai/ConversationList.svelte`:

```svelte
<script lang="ts">
	type Summary = { id: string; title: string | null; updated_at: string };

	let { onselect }: { onselect: (id: string) => void } = $props();

	let conversations = $state<Summary[]>([]);
	let loaded = $state(false);

	export async function load() {
		const res = await fetch('/api/ai/conversations');
		if (!res.ok) return;
		const data = await res.json();
		conversations = data.conversations ?? [];
		loaded = true;
	}

	function relativeTime(iso: string): string {
		const then = new Date(iso).getTime();
		const minutes = Math.floor((Date.now() - then) / 60000);
		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<div
	class="absolute bottom-full left-0 mb-2 max-h-80 w-72 overflow-y-auto rounded-xl bg-zinc-800 p-2 shadow-xl ring-1 ring-white/10"
>
	{#each conversations as item (item.id)}
		<button
			class="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
			onclick={() => onselect(item.id)}
		>
			<span class="line-clamp-1 text-sm font-medium">{item.title ?? 'New conversation'}</span>
			<span class="text-sm text-zinc-500">{relativeTime(item.updated_at)}</span>
		</button>
	{/each}
	{#if loaded && conversations.length === 0}
		<p class="px-3 py-2 text-sm text-zinc-500">No conversations yet.</p>
	{/if}
</div>
```

- [ ] **Step 2: Add the list button to the toolbar**

In `src/routes/+layout.svelte`, import the component alongside the existing AI imports at line 16:

```ts
import ConversationList from '$lib/components/ai/ConversationList.svelte';
```

Add state near the existing `showAgentPicker` declaration:

```ts
let showConversationList = $state(false);
let conversationListRef = $state<ConversationList | null>(null);
```

Insert this immediately after the attach button's closing `</button>` at line 1196, before the `{#if availableAgents.length > 0}` block. The icon is Remix Icon `chat-history-line`, path copied verbatim.

```svelte
<div class="relative">
	<button
		onclick={async () => {
			showConversationList = !showConversationList;
			if (showConversationList) await conversationListRef?.load();
		}}
		disabled={$loading}
		class="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50 lg:p-1.5"
		aria-label="Recent conversations"
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
			<path
				d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C10.298 22 8.69525 21.5748 7.29229 20.8248L2 22L3.17629 16.7097C2.42562 15.3063 2 13.7028 2 12C2 6.47715 6.47715 2 12 2ZM12 4C7.58172 4 4 7.58172 4 12C4 13.3347 4.32563 14.6181 4.93987 15.7664L5.28952 16.4201L4.63445 19.3663L7.58189 18.7118L8.23518 19.061C9.38315 19.6747 10.6659 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4ZM13 7V12H17V14H11V7H13Z"
			/>
		</svg>
	</button>

	{#if showConversationList}
		<ConversationList
			bind:this={conversationListRef}
			onselect={async (id) => {
				showConversationList = false;
				aiPanelOpen = true;
				await conversation.loadConversation(id);
			}}
		/>
	{/if}
</div>
```

The path above is Remix Icon `chat-history-line`, copied verbatim from the source SVG. Remix "line" icons are filled paths that read as outlines, so this element uses `fill="currentColor"` and no `stroke`, unlike the stroke-based attach and agent icons beside it. Do not convert it to a stroke icon and do not redraw it.

- [ ] **Step 3: Bind the header title**

Add `title` to the existing store destructure near the top of the script block (wherever `messages`, `loading`, and `activeAgent` are pulled off `conversation`).

Replace line 869:

```svelte
<span class="text-sm font-medium text-zinc-500">{$title ?? 'New conversation'}</span>
```

Note the size change from `text-xs` to `text-sm`, per the typography minimum.

- [ ] **Step 4: Type check**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 5: Exercise it in the browser**

With `bun run dev` running, walk the whole loop and confirm each step visually:

1. Send a message. The header shows "New conversation", then the generated title within a few seconds.
2. Click X. The panel closes.
3. Type a new message. A second, separate conversation starts.
4. Click the list button. Both conversations appear, newest first, each with its title.
5. Click the older one. The panel opens with its full history, scrolled to the last message.
6. Send another message in it. The reply lands in that same thread.
7. Reload the page, click the list button, reopen the thread. Everything is still there.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/ai/ConversationList.svelte src/routes/+layout.svelte
git commit -m "feat: add recents popover and conversation title to the assistant dock

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Resume across orgs

**Files:**

- Modify: `src/lib/stores/conversation.ts`
- Modify: `src/routes/+layout.svelte`

**Interfaces:**

- Consumes: `organizationId` from `GET /api/ai/conversations/[id]`, and the existing `POST /api/org/switch` at `src/routes/api/org/switch/+server.ts`.
- Produces: nothing downstream.

Only reachable for a user with `organization_members` rows in more than one org. It exists so a resumed thread's history and the model's tool scope always describe the same org. For a single-org user this code never runs.

- [ ] **Step 1: Pass the active org into the store**

`loadConversation` cannot read `locals`, so the caller supplies the current org id. In `src/lib/stores/conversation.ts`, change the signature and add the switch:

```ts
async function loadConversation(id: string, activeOrgId?: string) {
	loading.set(true);
	try {
		const res = await fetch(`/api/ai/conversations/${id}`);
		if (!res.ok) return;
		const data = await res.json();

		// Align the active org with the thread before its history reaches a
		// model holding org-scoped tools. Only multi-org members can ever
		// hit this branch.
		if (activeOrgId && data.organizationId && data.organizationId !== activeOrgId) {
			const switched = await fetch('/api/org/switch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orgId: data.organizationId })
			});
			if (!switched.ok) return;
			await invalidateAll();
		}

		messages.set(messagesFromStored(data.messages ?? []));
		conversationId.set(data.id);
		title.set(data.title ?? null);
	} finally {
		loading.set(false);
	}
}
```

`invalidateAll` is already imported at the top of the file.

- [ ] **Step 2: Pass the org id from the layout**

In `src/routes/+layout.svelte`, update the `onselect` handler added in Task 8:

```svelte
onselect={async (id) => {
	showConversationList = false;
	aiPanelOpen = true;
	await conversation.loadConversation(id, data.organization?.id);
}}
```

Confirm the property path against what the root layout's `load` actually returns before writing it. If the organization is exposed under a different key, use that key; do not guess from the name.

- [ ] **Step 3: Type check**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/conversation.ts src/routes/+layout.svelte
git commit -m "feat: align active org when resuming a conversation from another org

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Documentation and final verification

**Files:**

- Modify: `docs/brd/permissions-implementation-map.md` (the "Own-org tables (no federation SELECT)" table in section A.3)

- [ ] **Step 1: Document the new tables**

Add two rows to the own-org contract table, keeping the existing column order (Table, SELECT, INSERT, UPDATE, DELETE):

```markdown
| `ai_conversations` | `profile_id = auth.uid()` | own (`profile_id = auth.uid()`) | own (`profile_id = auth.uid()`) | -- |
| `ai_messages` | parent conversation's `profile_id = auth.uid()` | parent conversation owned by caller | -- | -- |
```

Add a sentence under the table noting that `ai_conversations.organization_id` exists but does not gate visibility, so a reader does not mistake its absence from the policy for a bug.

- [ ] **Step 2: Run the full gate**

```bash
bun run check
bun run test:run
bun run test:rls
bun run lint
```

Expected: 0 type errors, all unit tests pass, all RLS tests pass, lint clean.

- [ ] **Step 3: Commit**

```bash
git add docs/brd/permissions-implementation-map.md
git commit -m "docs: record ai_conversations and ai_messages in the permissions map

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Known omissions

Recorded so they surface as decisions rather than bug reports:

- `activeAgent` is not persisted. Resuming a conversation does not restore the agent that was active during it.
- Suggestion chips and tool progress are not stored, so a resumed thread renders without suggestions under its last answer.
- Two tabs on the same conversation both append to it, interleaved by `created_at`. No locking.
- The recents popover shows 20 threads with no path to older ones. Unbounded retention means this list will eventually hide history from heavy users, which is a known follow-up, not a defect in this work.

---

## What changed during implementation

This plan is the record of what was intended. Where the shipped code diverges, the spec is the current description and this list is why.

**Found by the tooling, not by review:**

- **Migration version collision.** `20260914000001` was already taken in the shared local database by an unrelated `invoices` migration from another worktree, so `db push` recorded the version without running the SQL. Renamed to `20260914000010`. The CLI's suggested fix (`migration repair --status reverted`) would have deleted another branch's history row and was not used.
- **supabaseAdmin bypass inventory.** `tests/rls/admin-bypass.test.ts` pins every `supabaseAdmin` call site and failed on the new ones. `ai-conversations.ts` is a real bypass and was registered. `/api/ai/+server.ts` was flagged only because a code comment contained the literal string, since the inventory is a `grep -rl`; the comment was reworded rather than polluting the inventory with a non-bypass.
- **`RLS_IDS.orgRepA`, not `RLS_ORG_IDS.repA`.** The plan named a helper that does not exist in that shape; `RLS_ORG_IDS` is a string array.
- **`no-useless-assignment`.** `let activeConversationId: string | null = null` with both branches assigning is a lint error. Dropped the initializer.

**Found by exercising the UI, which the unit and RLS suites could not have caught:**

- **Title never reached the header.** Generation is fire and forget on the server, so nothing pushed the result to the client and the header stayed "New conversation" until a later resume. Added a one-shot client fetch with a single retry.
- **`bind:this` race.** The parent mounted `ConversationList` and called `conversationListRef?.load()` in the same tick, so the reference was still null and the first open silently rendered an empty list. Fixed by moving the fetch, and later by lifting it to the layout entirely.
- **Row selection reopened the list.** The dock card sits in the click path and re-toggled the state the same tick the parent closed it. Fixed with `stopPropagation` on the row.

**Design changes requested after the walkthrough:**

- Remix `chat-history-line` replaced with `list-unordered`.
- Rows went from stacked title-over-timestamp to a single line, title left and timestamp right.
- The list moved from a floating popover to taking over the prompt area, headed by "Recent" with a close button.
- The list button is disabled when there are no conversations, which moved the fetch from on-open to on-mount. This reverses the earlier spec note that argued for an in-popover empty state instead.
- Bits UI tooltips on add files, recents, and voice mode.
- The `-` button now collapses the panel to a header strip behind the prompt bar, mirroring the onboarding preflight panel, instead of closing it.
