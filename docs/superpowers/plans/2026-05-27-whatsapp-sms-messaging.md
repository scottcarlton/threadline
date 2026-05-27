# WhatsApp + SMS Messaging AI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable reps, brand admins, and buyers to place orders, check inventory, and manage accounts via WhatsApp and SMS through a conversational Claude agent.

**Architecture:** Twilio Conversations API delivers inbound messages to a single webhook (`POST /api/webhooks/messaging`). The webhook identifies the sender, manages sessions, and delegates to a multi-turn Claude agent with tool-use. The agent reuses the existing entity resolution pipeline (`resolve.ts`, `outcome.ts`, trigram RPCs) and the existing AI tool execution infrastructure (`ai-tools.ts`). Outbound replies go back through Twilio's API with channel-aware formatting (rich interactive for WhatsApp, plain text for SMS).

**Tech Stack:** Twilio Node SDK, Anthropic SDK (existing), Supabase (existing), SvelteKit API routes, Vitest

---

## File Map

### New files

| File                                                | Responsibility                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/YYYYMMDD_messaging_tables.sql` | `messaging_sessions`, `messaging_messages` tables, `profiles.messaging_phone` column, `imessage` added to `order_channel` enum |
| `src/lib/server/messaging/types.ts`                 | Shared types: `ReceivedMessage`, `MessagingSession`, `MessagingChannel`, `SessionStatus`                                       |
| `src/lib/server/messaging/inbound.ts`               | Twilio webhook signature verification + payload normalization → `ReceivedMessage`                                              |
| `src/lib/server/messaging/session.ts`               | Session CRUD: create, resume, expire, complete. Manages `messaging_sessions` table                                             |
| `src/lib/server/messaging/agent.ts`                 | Multi-turn Claude agent with tool-use loop. Manages conversation history, delegates to existing `executeToolCall`              |
| `src/lib/server/messaging/send.ts`                  | Outbound message delivery via Twilio Conversations API                                                                         |
| `src/lib/server/messaging/identity.ts`              | Identity binding: unknown phone → email verification → `profiles.messaging_phone`                                              |
| `src/routes/api/webhooks/messaging/+server.ts`      | SvelteKit POST handler: verify → identify → session → agent → reply                                                            |
| `src/lib/server/messaging/inbound.test.ts`          | Tests for Twilio payload parsing                                                                                               |
| `src/lib/server/messaging/session.test.ts`          | Tests for session lifecycle logic                                                                                              |
| `src/lib/server/messaging/identity.test.ts`         | Tests for identity binding logic                                                                                               |
| `src/lib/server/messaging/agent.test.ts`            | Tests for agent tool dispatch and conversation management                                                                      |

### Modified files

| File                                               | Change                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/lib/test-helpers/mock-env-dynamic-private.ts` | Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_CONVERSATIONS_SERVICE_SID` |
| `src/lib/test-helpers/mock-env-private.ts`         | Add same Twilio vars                                                              |
| `.env.example`                                     | Add Twilio env vars                                                               |
| `package.json`                                     | Add `twilio` dependency                                                           |

---

## Task 1: Install Twilio SDK and configure env vars

**Files:**

- Modify: `package.json`
- Modify: `.env.example`
- Modify: `src/lib/test-helpers/mock-env-dynamic-private.ts`
- Modify: `src/lib/test-helpers/mock-env-private.ts`

- [ ] **Step 1: Install Twilio SDK**

```bash
bun add twilio
```

- [ ] **Step 2: Add env vars to `.env.example`**

Add after the Brevo section:

```
# Twilio — WhatsApp + SMS messaging
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_CONVERSATIONS_SERVICE_SID=
TWILIO_MESSAGING_NUMBER=
```

- [ ] **Step 3: Add env vars to test mock files**

In `src/lib/test-helpers/mock-env-dynamic-private.ts`, add to the `env` object:

```typescript
TWILIO_ACCOUNT_SID: 'test-twilio-sid',
TWILIO_AUTH_TOKEN: 'test-twilio-auth',
TWILIO_CONVERSATIONS_SERVICE_SID: 'test-twilio-conversations-sid',
TWILIO_MESSAGING_NUMBER: '+15555555555',
```

In `src/lib/test-helpers/mock-env-private.ts`, add:

```typescript
export const TWILIO_ACCOUNT_SID = 'test-twilio-sid';
export const TWILIO_AUTH_TOKEN = 'test-twilio-auth';
export const TWILIO_CONVERSATIONS_SERVICE_SID = 'test-twilio-conversations-sid';
export const TWILIO_MESSAGING_NUMBER = '+15555555555';
```

- [ ] **Step 4: Add env vars to `.env`**

```bash
# Add empty Twilio vars (user fills in real values)
echo -e '\n# Twilio — WhatsApp + SMS messaging\nTWILIO_ACCOUNT_SID=\nTWILIO_AUTH_TOKEN=\nTWILIO_CONVERSATIONS_SERVICE_SID=\nTWILIO_MESSAGING_NUMBER=' >> .env
```

- [ ] **Step 5: Verify build**

```bash
bun run check
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lockb .env.example src/lib/test-helpers/mock-env-dynamic-private.ts src/lib/test-helpers/mock-env-private.ts
git commit -m "chore: add twilio SDK and env var configuration"
```

---

## Task 2: Database migration — messaging tables

**Files:**

- Create: `supabase/migrations/YYYYMMDD_messaging_tables.sql`

- [ ] **Step 1: Create the migration file**

Use the current timestamp for the filename. The migration creates:

```sql
-- Add imessage to order_channel enum (whatsapp and sms already exist)
ALTER TYPE order_channel ADD VALUE IF NOT EXISTS 'imessage';

-- Add messaging_phone to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS messaging_phone text UNIQUE;

-- Session status enum
CREATE TYPE messaging_session_status AS ENUM ('active', 'expired', 'completed');

-- Messaging channel enum
CREATE TYPE messaging_channel AS ENUM ('whatsapp', 'sms', 'imessage');

-- Sessions table
CREATE TABLE messaging_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  channel messaging_channel NOT NULL,
  conversation_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  status messaging_session_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX idx_messaging_sessions_phone ON messaging_sessions (phone_number, status);
CREATE INDEX idx_messaging_sessions_profile ON messaging_sessions (profile_id, status);

-- Messages table
CREATE TABLE messaging_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES messaging_sessions(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text,
  media_url text,
  media_type text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messaging_messages_session ON messaging_messages (session_id, created_at);

-- RLS: messaging tables are server-only (supabaseAdmin), no anon/authenticated access
ALTER TABLE messaging_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_messages ENABLE ROW LEVEL SECURITY;
-- No policies = deny all for anon/authenticated. supabaseAdmin bypasses RLS.
```

- [ ] **Step 2: Apply the migration locally**

```bash
bunx supabase db reset
```

Or if you want to apply incrementally:

```bash
bunx supabase migration up --local
```

- [ ] **Step 3: Verify tables exist**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d messaging_sessions"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d messaging_messages"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d profiles" | grep messaging_phone
```

Expected: All three produce output showing the columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add messaging_sessions and messaging_messages tables"
```

---

## Task 3: Shared types

**Files:**

- Create: `src/lib/server/messaging/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
export type MessagingChannel = 'whatsapp' | 'sms';

export type SessionStatus = 'active' | 'expired' | 'completed';

export type ReceivedMessage = {
	messageId: string;
	from: string; // E.164 phone number
	to: string;
	body: string | null;
	mediaUrl: string | null;
	mediaType: string | null;
	channel: MessagingChannel;
	timestamp: string;
};

export type MessagingSession = {
	id: string;
	profileId: string;
	organizationId: string;
	phoneNumber: string;
	channel: MessagingChannel;
	conversationHistory: ConversationMessage[];
	status: SessionStatus;
	createdAt: string;
	updatedAt: string;
	expiresAt: string;
};

export type ConversationMessage = {
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
	mediaUrl?: string;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/server/messaging/types.ts
git commit -m "feat: add messaging shared types"
```

---

## Task 4: Twilio inbound webhook parsing

**Files:**

- Create: `src/lib/server/messaging/inbound.ts`
- Create: `src/lib/server/messaging/inbound.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/server/messaging/inbound.test.ts
import { describe, it, expect } from 'vitest';
import { parseTwilioWebhook, verifyTwilioSignature } from './inbound.js';

describe('parseTwilioWebhook', () => {
	it('parses a WhatsApp message', () => {
		const params = new URLSearchParams({
			MessageSid: 'SM123',
			From: 'whatsapp:+14155551234',
			To: 'whatsapp:+15555555555',
			Body: 'Order 3 M Classic Tee for Bloom Boutique',
			NumMedia: '0'
		});

		const result = parseTwilioWebhook(params);

		expect(result).toEqual({
			messageId: 'SM123',
			from: '+14155551234',
			to: '+15555555555',
			body: 'Order 3 M Classic Tee for Bloom Boutique',
			mediaUrl: null,
			mediaType: null,
			channel: 'whatsapp',
			timestamp: expect.any(String)
		});
	});

	it('parses an SMS message', () => {
		const params = new URLSearchParams({
			MessageSid: 'SM456',
			From: '+14155551234',
			To: '+15555555555',
			Body: 'Check inventory Classic Tee',
			NumMedia: '0'
		});

		const result = parseTwilioWebhook(params);

		expect(result.channel).toBe('sms');
		expect(result.from).toBe('+14155551234');
	});

	it('parses a message with media', () => {
		const params = new URLSearchParams({
			MessageSid: 'SM789',
			From: 'whatsapp:+14155551234',
			To: 'whatsapp:+15555555555',
			Body: '',
			NumMedia: '1',
			MediaUrl0: 'https://api.twilio.com/media/123.jpg',
			MediaContentType0: 'image/jpeg'
		});

		const result = parseTwilioWebhook(params);

		expect(result.mediaUrl).toBe('https://api.twilio.com/media/123.jpg');
		expect(result.mediaType).toBe('image/jpeg');
		expect(result.body).toBeNull();
	});

	it('returns null body for empty string', () => {
		const params = new URLSearchParams({
			MessageSid: 'SM000',
			From: '+14155551234',
			To: '+15555555555',
			Body: '',
			NumMedia: '0'
		});

		const result = parseTwilioWebhook(params);
		expect(result.body).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test:run -- src/lib/server/messaging/inbound.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/server/messaging/inbound.ts
import crypto from 'node:crypto';
import type { ReceivedMessage, MessagingChannel } from './types.js';

/**
 * Parse a Twilio webhook form body into a ReceivedMessage.
 * Twilio sends webhooks as application/x-www-form-urlencoded.
 */
export function parseTwilioWebhook(params: URLSearchParams): ReceivedMessage {
	const from = params.get('From') ?? '';
	const to = params.get('To') ?? '';
	const body = params.get('Body')?.trim() || null;
	const numMedia = parseInt(params.get('NumMedia') ?? '0', 10);

	const channel: MessagingChannel = from.startsWith('whatsapp:') ? 'whatsapp' : 'sms';
	const cleanPhone = (raw: string) => raw.replace('whatsapp:', '');

	return {
		messageId: params.get('MessageSid') ?? '',
		from: cleanPhone(from),
		to: cleanPhone(to),
		body,
		mediaUrl: numMedia > 0 ? (params.get('MediaUrl0') ?? null) : null,
		mediaType: numMedia > 0 ? (params.get('MediaContentType0') ?? null) : null,
		channel,
		timestamp: new Date().toISOString()
	};
}

/**
 * Verify Twilio webhook signature.
 * See: https://www.twilio.com/docs/usage/security#validating-requests
 */
export function verifyTwilioSignature(
	authToken: string,
	signature: string,
	url: string,
	params: URLSearchParams
): boolean {
	const sortedParams = Array.from(params.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}${v}`)
		.join('');

	const data = url + sortedParams;
	const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64');

	return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test:run -- src/lib/server/messaging/inbound.test.ts
```

Expected: PASS — all 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/messaging/inbound.ts src/lib/server/messaging/inbound.test.ts
git commit -m "feat: twilio inbound webhook parser with tests"
```

---

## Task 5: Identity binding

**Files:**

- Create: `src/lib/server/messaging/identity.ts`
- Create: `src/lib/server/messaging/identity.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/server/messaging/identity.test.ts
import { describe, it, expect } from 'vitest';
import { parseVerificationReply, isVerificationPrompt } from './identity.js';

describe('parseVerificationReply', () => {
	it('extracts a valid email from a reply', () => {
		expect(parseVerificationReply('jane@acmereps.com')).toBe('jane@acmereps.com');
	});

	it('extracts email with surrounding text', () => {
		expect(parseVerificationReply('My email is jane@acmereps.com thanks')).toBe(
			'jane@acmereps.com'
		);
	});

	it('returns null for no email', () => {
		expect(parseVerificationReply('hello there')).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(parseVerificationReply('')).toBeNull();
	});
});

describe('isVerificationPrompt', () => {
	it('returns true for the verification message', () => {
		expect(
			isVerificationPrompt(
				'Welcome to Threadline. To get started, reply with the email address you use to sign in.'
			)
		).toBe(true);
	});

	it('returns false for a regular message', () => {
		expect(isVerificationPrompt('Order 3 M Classic Tee')).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test:run -- src/lib/server/messaging/identity.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/server/messaging/identity.ts
import { supabaseAdmin } from '$lib/server/supabase.js';

const VERIFICATION_MESSAGE =
	'Welcome to Threadline. To get started, reply with the email address you use to sign in.';

const MAX_ATTEMPTS = 3;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Extract an email address from a user's reply text.
 */
export function parseVerificationReply(text: string): string | null {
	const match = text.match(EMAIL_RE);
	return match ? match[0].toLowerCase() : null;
}

/**
 * Check if a message is the verification prompt we sent.
 */
export function isVerificationPrompt(text: string): boolean {
	return text === VERIFICATION_MESSAGE;
}

/**
 * Look up a user by their messaging phone number.
 * Returns { profileId, organizationId, userId } or null if not bound.
 */
export async function lookupByPhone(
	phone: string
): Promise<{ profileId: string; userId: string } | null> {
	const { data } = await supabaseAdmin
		.from('profiles')
		.select('id')
		.eq('messaging_phone', phone)
		.maybeSingle();

	if (!data) return null;
	return { profileId: data.id, userId: data.id };
}

/**
 * Attempt to bind a phone number to a user via email verification.
 * Returns the profile if successful, or an error message.
 */
export async function bindPhoneToUser(
	phone: string,
	email: string
): Promise<
	{ success: true; profileId: string; userId: string } | { success: false; message: string }
> {
	// Look up the user by email in auth.users
	const { data: authUsers } = await supabaseAdmin.rpc('get_user_id_by_email', {
		lookup_email: email
	});

	const userId =
		Array.isArray(authUsers) && authUsers.length > 0 ? (authUsers[0] as { id: string }).id : null;

	if (!userId) {
		return {
			success: false,
			message: "I couldn't find an account with that email. Please check and try again."
		};
	}

	// Check if this phone is already bound to someone else
	const { data: existing } = await supabaseAdmin
		.from('profiles')
		.select('id')
		.eq('messaging_phone', phone)
		.maybeSingle();

	if (existing && existing.id !== userId) {
		return {
			success: false,
			message: 'This phone number is already linked to a different account.'
		};
	}

	// Bind the phone
	const { error } = await supabaseAdmin
		.from('profiles')
		.update({ messaging_phone: phone })
		.eq('id', userId);

	if (error) {
		return {
			success: false,
			message: 'Something went wrong linking your phone. Please try again.'
		};
	}

	return { success: true, profileId: userId, userId };
}

/**
 * Get the verification prompt message.
 */
export function getVerificationPrompt(): string {
	return VERIFICATION_MESSAGE;
}

/**
 * Get the rejection message after max failed attempts.
 */
export function getMaxAttemptsMessage(): string {
	return 'Too many failed verification attempts. Please sign in to Threadline and add your phone number in your profile settings.';
}

export { MAX_ATTEMPTS };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test:run -- src/lib/server/messaging/identity.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/messaging/identity.ts src/lib/server/messaging/identity.test.ts
git commit -m "feat: identity binding for messaging (phone → email → profile)"
```

---

## Task 6: Session management

**Files:**

- Create: `src/lib/server/messaging/session.ts`
- Create: `src/lib/server/messaging/session.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/server/messaging/session.test.ts
import { describe, it, expect } from 'vitest';
import { buildConversationHistory, shouldExpireSession } from './session.js';
import type { ConversationMessage } from './types.js';

describe('shouldExpireSession', () => {
	it('returns false for a session updated recently', () => {
		const updatedAt = new Date().toISOString();
		expect(shouldExpireSession(updatedAt, 30)).toBe(false);
	});

	it('returns true for a session updated 31 minutes ago', () => {
		const updatedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
		expect(shouldExpireSession(updatedAt, 30)).toBe(true);
	});
});

describe('buildConversationHistory', () => {
	it('formats conversation history for Claude messages array', () => {
		const history: ConversationMessage[] = [
			{
				role: 'user',
				content: 'Order 3 M Classic Tee for Bloom',
				timestamp: '2026-01-01T00:00:00Z'
			},
			{ role: 'assistant', content: 'Which brand?', timestamp: '2026-01-01T00:00:01Z' }
		];

		const messages = buildConversationHistory(history);

		expect(messages).toEqual([
			{ role: 'user', content: 'Order 3 M Classic Tee for Bloom' },
			{ role: 'assistant', content: 'Which brand?' }
		]);
	});

	it('returns empty array for empty history', () => {
		expect(buildConversationHistory([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test:run -- src/lib/server/messaging/session.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/server/messaging/session.ts
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { MessagingChannel, MessagingSession, ConversationMessage } from './types.js';

const SESSION_TIMEOUT_MINUTES = 30;

/**
 * Check if a session should be expired based on its last update time.
 */
export function shouldExpireSession(updatedAt: string, timeoutMinutes: number): boolean {
	const elapsed = Date.now() - new Date(updatedAt).getTime();
	return elapsed > timeoutMinutes * 60 * 1000;
}

/**
 * Convert conversation history to Claude-compatible messages array.
 */
export function buildConversationHistory(
	history: ConversationMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
	return history.map((msg) => ({
		role: msg.role,
		content: msg.content
	}));
}

/**
 * Find or create an active session for a phone number + channel.
 * If the previous session expired, marks it as expired and creates a new one.
 */
export async function getOrCreateSession(
	profileId: string,
	organizationId: string,
	phone: string,
	channel: MessagingChannel
): Promise<MessagingSession> {
	// Look for an active session
	const { data: existing } = await supabaseAdmin
		.from('messaging_sessions')
		.select('*')
		.eq('phone_number', phone)
		.eq('channel', channel)
		.eq('status', 'active')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (existing) {
		const session = existing as Record<string, unknown>;

		if (shouldExpireSession(session.updated_at as string, SESSION_TIMEOUT_MINUTES)) {
			// Expire the old session
			await supabaseAdmin
				.from('messaging_sessions')
				.update({ status: 'expired' })
				.eq('id', session.id as string);
		} else {
			return rowToSession(session);
		}
	}

	// Create a new session
	const { data: newSession, error } = await supabaseAdmin
		.from('messaging_sessions')
		.insert({
			profile_id: profileId,
			organization_id: organizationId,
			phone_number: phone,
			channel,
			conversation_history: [],
			status: 'active',
			expires_at: new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString()
		})
		.select()
		.single();

	if (error || !newSession) {
		throw new Error(`Failed to create messaging session: ${error?.message ?? 'unknown'}`);
	}

	return rowToSession(newSession as Record<string, unknown>);
}

/**
 * Append a message to the session's conversation history and reset the expiry.
 */
export async function appendToSession(
	sessionId: string,
	message: ConversationMessage
): Promise<void> {
	// Fetch current history
	const { data } = await supabaseAdmin
		.from('messaging_sessions')
		.select('conversation_history')
		.eq('id', sessionId)
		.single();

	const history = ((data as Record<string, unknown> | null)?.conversation_history ??
		[]) as ConversationMessage[];
	history.push(message);

	await supabaseAdmin
		.from('messaging_sessions')
		.update({
			conversation_history: history,
			updated_at: new Date().toISOString(),
			expires_at: new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString()
		})
		.eq('id', sessionId);
}

/**
 * Record a message in the messaging_messages audit log.
 */
export async function recordMessage(
	sessionId: string,
	direction: 'inbound' | 'outbound',
	body: string | null,
	providerMessageId: string | null,
	mediaUrl?: string | null,
	mediaType?: string | null
): Promise<void> {
	await supabaseAdmin.from('messaging_messages').insert({
		session_id: sessionId,
		direction,
		body,
		media_url: mediaUrl ?? null,
		media_type: mediaType ?? null,
		provider_message_id: providerMessageId
	});
}

/**
 * Mark a session as completed.
 */
export async function completeSession(sessionId: string): Promise<void> {
	await supabaseAdmin
		.from('messaging_sessions')
		.update({ status: 'completed', updated_at: new Date().toISOString() })
		.eq('id', sessionId);
}

function rowToSession(row: Record<string, unknown>): MessagingSession {
	return {
		id: row.id as string,
		profileId: row.profile_id as string,
		organizationId: row.organization_id as string,
		phoneNumber: row.phone_number as string,
		channel: row.channel as MessagingChannel,
		conversationHistory: (row.conversation_history ?? []) as ConversationMessage[],
		status: row.status as MessagingSession['status'],
		createdAt: row.created_at as string,
		updatedAt: row.updated_at as string,
		expiresAt: row.expires_at as string
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test:run -- src/lib/server/messaging/session.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/messaging/session.ts src/lib/server/messaging/session.test.ts
git commit -m "feat: messaging session management with expiry"
```

---

## Task 7: Outbound messaging via Twilio

**Files:**

- Create: `src/lib/server/messaging/send.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/server/messaging/send.ts
import twilio from 'twilio';
import { env } from '$env/dynamic/private';
import type { MessagingChannel } from './types.js';

function getClient() {
	const sid = env.TWILIO_ACCOUNT_SID;
	const token = env.TWILIO_AUTH_TOKEN;
	if (!sid || !token) throw new Error('Twilio credentials not configured');
	return twilio(sid, token);
}

/**
 * Send a text reply back to the user via Twilio.
 * Returns the Twilio message SID.
 */
export async function sendReply(
	to: string,
	body: string,
	channel: MessagingChannel
): Promise<string> {
	const client = getClient();
	const from = env.TWILIO_MESSAGING_NUMBER;
	if (!from) throw new Error('TWILIO_MESSAGING_NUMBER not configured');

	const formatPhone = (phone: string, ch: MessagingChannel) =>
		ch === 'whatsapp' ? `whatsapp:${phone}` : phone;

	const message = await client.messages.create({
		from: formatPhone(from, channel),
		to: formatPhone(to, channel),
		body
	});

	return message.sid;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/server/messaging/send.ts
git commit -m "feat: outbound messaging via Twilio"
```

---

## Task 8: Conversational Claude agent

**Files:**

- Create: `src/lib/server/messaging/agent.ts`
- Create: `src/lib/server/messaging/agent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/server/messaging/agent.test.ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, MESSAGING_TOOLS } from './agent.js';

describe('buildSystemPrompt', () => {
	it('includes the org name and user role', () => {
		const prompt = buildSystemPrompt({
			orgName: 'Acme Reps',
			userName: 'Jane',
			role: 'Owner',
			channel: 'whatsapp'
		});

		expect(prompt).toContain('Acme Reps');
		expect(prompt).toContain('Jane');
		expect(prompt).toContain('Owner');
	});

	it('mentions SMS plain text for sms channel', () => {
		const prompt = buildSystemPrompt({
			orgName: 'Acme Reps',
			userName: 'Jane',
			role: 'Owner',
			channel: 'sms'
		});

		expect(prompt).toContain('plain text');
	});
});

describe('MESSAGING_TOOLS', () => {
	it('includes the core tools', () => {
		const names = MESSAGING_TOOLS.map((t) => t.name);
		expect(names).toContain('place_order');
		expect(names).toContain('lookup_inventory');
		expect(names).toContain('check_order_status');
		expect(names).toContain('search_accounts');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test:run -- src/lib/server/messaging/agent.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/server/messaging/agent.ts
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { logUsage } from '$lib/server/ai-usage.js';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { MessagingChannel, ConversationMessage } from './types.js';
import { buildConversationHistory } from './session.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

type AgentContext = {
	orgName: string;
	userName: string;
	role: string;
	channel: MessagingChannel;
};

type AgentInput = {
	context: AgentContext;
	conversationHistory: ConversationMessage[];
	newMessage: string;
	organizationId: string;
	userId: string;
	brandScope: string[] | null;
	mediaUrl?: string | null;
};

export function buildSystemPrompt(ctx: AgentContext): string {
	const channelNote =
		ctx.channel === 'sms'
			? 'You are responding via SMS. Keep replies under 160 characters when possible. Use plain text only — no markdown, no emojis, no formatting.'
			: 'You are responding via WhatsApp. You can use *bold* and _italic_ formatting. Keep replies concise but informative.';

	return `You are Threadline's messaging assistant for ${ctx.orgName}. You are chatting with ${ctx.userName} (${ctx.role}).

You help with:
- Placing wholesale orders (ask for account, brand, products, sizes, quantities, ship dates)
- Checking inventory and product availability
- Looking up order status
- Searching accounts
- Answering questions about sales and reports

${channelNote}

Rules:
- Be direct and concise. This is a text conversation, not an email.
- Use industry language naturally (line sheets, at-once orders, sell-through).
- If you're not sure about something, ask to clarify rather than guessing.
- Orders you create start as drafts unless the user says to submit.
- If you can't help with something, say so clearly.
- Never make up data. Only report what the tools return.`;
}

export const MESSAGING_TOOLS: Anthropic.Tool[] = [
	{
		name: 'place_order',
		description:
			'Create a draft order. Requires account_name, brand_name, ship dates, and at least one line item with product and sizes/quantities.',
		input_schema: {
			type: 'object' as const,
			properties: {
				account_name: { type: 'string', description: 'Buyer/retailer name (fuzzy match)' },
				brand_name: { type: 'string', description: 'Brand name (fuzzy match)' },
				start_ship_date: { type: 'string', description: 'Ship window start, YYYY-MM-DD' },
				complete_ship_date: { type: 'string', description: 'Ship window end, YYYY-MM-DD' },
				lines: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							description: { type: 'string', description: 'Product name' },
							style_number: { type: 'string', description: 'Style number if known' },
							color: { type: 'string' },
							size: { type: 'string' },
							qty: { type: 'number' }
						},
						required: ['qty']
					}
				},
				notes: { type: 'string' }
			},
			required: ['account_name', 'brand_name', 'start_ship_date', 'complete_ship_date', 'lines']
		}
	},
	{
		name: 'lookup_inventory',
		description:
			'Check product inventory/availability. Search by product name, style number, or brand.',
		input_schema: {
			type: 'object' as const,
			properties: {
				query: { type: 'string', description: 'Product name, style number, or brand to search' },
				brand_name: { type: 'string', description: 'Filter by brand name (optional)' }
			},
			required: ['query']
		}
	},
	{
		name: 'check_order_status',
		description: 'Look up the status of an order by order number or account name.',
		input_schema: {
			type: 'object' as const,
			properties: {
				order_number: { type: 'string', description: 'Order number (e.g. "1042")' },
				account_name: { type: 'string', description: 'Account name to find recent orders' }
			},
			required: []
		}
	},
	{
		name: 'search_accounts',
		description: 'Search for buyer accounts by name.',
		input_schema: {
			type: 'object' as const,
			properties: {
				query: { type: 'string', description: 'Account name to search' }
			},
			required: ['query']
		}
	}
];

/**
 * Execute a tool call from the messaging agent.
 * Delegates to Supabase queries scoped by the user's org.
 */
async function executeMessagingTool(
	toolName: string,
	input: Record<string, unknown>,
	organizationId: string,
	userId: string,
	brandScope: string[] | null
): Promise<string> {
	switch (toolName) {
		case 'lookup_inventory': {
			const query = input.query as string;
			const brandName = input.brand_name as string | undefined;

			let productQuery = supabaseAdmin
				.from('products')
				.select('id, name, style_number, wholesale_price, brands!inner(name)')
				.eq('organization_id', organizationId)
				.eq('status', 'active')
				.ilike('name', `%${query}%`)
				.limit(5);

			if (brandScope) {
				productQuery = productQuery.in('brand_id', brandScope);
			}

			const { data: products } = await productQuery;
			if (!products || products.length === 0) {
				return `No products found matching "${query}".`;
			}

			return products
				.map((p: Record<string, unknown>) => {
					const brand = p.brands as Record<string, unknown> | null;
					return `${p.name} (${p.style_number ?? 'no style#'}) — ${brand?.name ?? 'unknown brand'} — $${p.wholesale_price ?? '?'}`;
				})
				.join('\n');
		}

		case 'check_order_status': {
			const orderNumber = input.order_number as string | undefined;
			const accountName = input.account_name as string | undefined;

			let orderQuery = supabaseAdmin
				.from('orders')
				.select(
					'order_number, status, created_at, accounts!inner(business_name), brands!inner(name)'
				)
				.eq('organization_id', organizationId)
				.order('created_at', { ascending: false })
				.limit(5);

			if (orderNumber) {
				orderQuery = orderQuery.eq('order_number', parseInt(orderNumber, 10));
			}
			if (accountName) {
				orderQuery = orderQuery.ilike('accounts.business_name', `%${accountName}%`);
			}

			const { data: orders } = await orderQuery;
			if (!orders || orders.length === 0) {
				return 'No orders found.';
			}

			return orders
				.map((o: Record<string, unknown>) => {
					const account = o.accounts as Record<string, unknown> | null;
					const brand = o.brands as Record<string, unknown> | null;
					const date = new Date(o.created_at as string).toLocaleDateString();
					return `#${o.order_number} — ${account?.business_name ?? '?'} / ${brand?.name ?? '?'} — ${o.status} (${date})`;
				})
				.join('\n');
		}

		case 'search_accounts': {
			const query = input.query as string;
			const { data: accounts } = await supabaseAdmin
				.from('accounts')
				.select('id, business_name, city, state')
				.eq('organization_id', organizationId)
				.ilike('business_name', `%${query}%`)
				.limit(5);

			if (!accounts || accounts.length === 0) {
				return `No accounts found matching "${query}".`;
			}

			return accounts
				.map(
					(a: Record<string, unknown>) =>
						`${a.business_name}${a.city ? ` — ${a.city}, ${a.state}` : ''}`
				)
				.join('\n');
		}

		case 'place_order': {
			// Use the existing create_order AI tool infrastructure
			// Import executeToolCall dynamically to avoid circular deps
			const { executeToolCall } = await import('$lib/server/ai-tools.js');

			const result = await executeToolCall(
				'create_order',
				{
					...input,
					status: 'draft'
				},
				{
					supabase: supabaseAdmin,
					organizationId,
					userId,
					brandScope,
					orgType: 'rep',
					origin: 'messaging'
				}
			);

			if (!result.success) {
				return `Order failed: ${result.error ?? 'Unknown error'}`;
			}

			const order = result.data as Record<string, unknown>;
			return `Draft order #${order.order_number} created for ${(order.accounts as Record<string, unknown>)?.business_name ?? input.account_name}.`;
		}

		default:
			return `Unknown tool: ${toolName}`;
	}
}

/**
 * Run the messaging agent: takes conversation history + new message,
 * returns the agent's text reply.
 */
export async function runAgent(input: AgentInput): Promise<string> {
	const systemPrompt = buildSystemPrompt(input.context);
	const priorMessages = buildConversationHistory(input.conversationHistory);

	// Build the new user message content
	const userContent: Anthropic.ContentBlockParam[] = [];
	if (input.mediaUrl) {
		userContent.push({
			type: 'text',
			text: `[User sent an image: ${input.mediaUrl}]`
		});
	}
	userContent.push({
		type: 'text',
		text: input.newMessage || '(no text — image only)'
	});

	const messages: Anthropic.MessageParam[] = [
		...priorMessages.map((m) => ({
			role: m.role as 'user' | 'assistant',
			content: m.content
		})),
		{ role: 'user', content: userContent }
	];

	// Tool-use loop (max 5 iterations to prevent runaway)
	let iterations = 0;
	const maxIterations = 5;

	while (iterations < maxIterations) {
		iterations++;

		const response = await anthropic.messages.create({
			model: 'claude-sonnet-4-6',
			max_tokens: 1024,
			system: systemPrompt,
			tools: MESSAGING_TOOLS,
			messages
		});

		logUsage({
			endpoint: 'messaging-agent',
			purpose: 'messaging_conversation',
			model: 'claude-sonnet-4-6',
			organizationId: input.organizationId,
			userId: input.userId,
			response
		});

		// Check if the model wants to use tools
		if (response.stop_reason === 'tool_use') {
			const toolBlocks = response.content.filter(
				(b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
			);

			// Add the assistant's response (with tool calls) to messages
			messages.push({ role: 'assistant', content: response.content });

			// Execute each tool and add results
			const toolResults: Anthropic.ToolResultBlockParam[] = [];
			for (const tool of toolBlocks) {
				const result = await executeMessagingTool(
					tool.name,
					tool.input as Record<string, unknown>,
					input.organizationId,
					input.userId,
					input.brandScope
				);
				toolResults.push({
					type: 'tool_result',
					tool_use_id: tool.id,
					content: result
				});
			}

			messages.push({ role: 'user', content: toolResults });
			continue;
		}

		// Extract the final text response
		const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');

		return textBlock?.text ?? "I couldn't process that. Could you try rephrasing?";
	}

	return 'I hit a processing limit. Could you try a simpler request?';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test:run -- src/lib/server/messaging/agent.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/messaging/agent.ts src/lib/server/messaging/agent.test.ts
git commit -m "feat: conversational Claude agent for messaging with tool-use"
```

---

## Task 9: Webhook endpoint

**Files:**

- Create: `src/routes/api/webhooks/messaging/+server.ts`

- [ ] **Step 1: Write the webhook handler**

```typescript
// src/routes/api/webhooks/messaging/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { parseTwilioWebhook, verifyTwilioSignature } from '$lib/server/messaging/inbound.js';
import {
	lookupByPhone,
	bindPhoneToUser,
	parseVerificationReply,
	getVerificationPrompt,
	getMaxAttemptsMessage,
	MAX_ATTEMPTS
} from '$lib/server/messaging/identity.js';
import {
	getOrCreateSession,
	appendToSession,
	recordMessage
} from '$lib/server/messaging/session.js';
import { runAgent } from '$lib/server/messaging/agent.js';
import { sendReply } from '$lib/server/messaging/send.js';
import { supabaseAdmin } from '$lib/server/supabase.js';

const RATE_LIMIT_PER_HOUR = 120;

export const POST: RequestHandler = async ({ request, url }) => {
	// Parse the form body
	const body = await request.text();
	const params = new URLSearchParams(body);

	// Verify Twilio signature
	const signature = request.headers.get('x-twilio-signature') ?? '';
	const authToken = env.TWILIO_AUTH_TOKEN;
	if (!authToken) return json({ error: 'Not configured' }, { status: 500 });

	const isValid = verifyTwilioSignature(authToken, signature, url.toString(), params);
	if (!isValid) {
		return new Response('<Response></Response>', {
			status: 403,
			headers: { 'Content-Type': 'text/xml' }
		});
	}

	// Parse the message
	const message = parseTwilioWebhook(params);

	// Rate limiting: count messages from this number in the last hour
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
	const { count } = await supabaseAdmin
		.from('messaging_messages')
		.select('id', { count: 'exact', head: true })
		.gte('created_at', oneHourAgo);

	if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
		await sendReply(
			message.from,
			"You've sent a lot of messages recently. Please wait a bit before trying again.",
			message.channel
		);
		return twimlResponse();
	}

	// Identity check: is this phone number bound to a user?
	const identity = await lookupByPhone(message.from);

	if (!identity) {
		// Not bound — handle verification flow
		await handleVerification(message.from, message.body, message.channel);
		return twimlResponse();
	}

	// Get the user's org membership
	const { data: membership } = await supabaseAdmin
		.from('organization_members')
		.select('organization_id, role, brand_scope')
		.eq('user_id', identity.userId)
		.limit(1)
		.maybeSingle();

	if (!membership) {
		await sendReply(
			message.from,
			"Your account isn't associated with any organization. Please contact your admin.",
			message.channel
		);
		return twimlResponse();
	}

	const orgMembership = membership as Record<string, unknown>;
	const organizationId = orgMembership.organization_id as string;
	const role = orgMembership.role as string;
	const brandScope = (orgMembership.brand_scope as string[] | null) ?? null;

	// Get the org name
	const { data: org } = await supabaseAdmin
		.from('organizations')
		.select('name')
		.eq('id', organizationId)
		.single();

	const orgName = ((org as Record<string, unknown> | null)?.name as string) ?? 'your organization';

	// Get user display name
	const { data: profile } = await supabaseAdmin
		.from('profiles')
		.select('display_name')
		.eq('id', identity.userId)
		.single();

	const userName = ((profile as Record<string, unknown> | null)?.display_name as string) ?? 'there';

	// Get or create session
	const session = await getOrCreateSession(
		identity.profileId,
		organizationId,
		message.from,
		message.channel
	);

	// Record inbound message
	await recordMessage(
		session.id,
		'inbound',
		message.body,
		message.messageId,
		message.mediaUrl,
		message.mediaType
	);

	// Append to session history
	await appendToSession(session.id, {
		role: 'user',
		content: message.body ?? '(image)',
		timestamp: message.timestamp,
		mediaUrl: message.mediaUrl ?? undefined
	});

	// Run the agent
	const reply = await runAgent({
		context: { orgName, userName, role, channel: message.channel },
		conversationHistory: session.conversationHistory,
		newMessage: message.body ?? '(image sent)',
		organizationId,
		userId: identity.userId,
		brandScope,
		mediaUrl: message.mediaUrl
	});

	// Send reply
	const replySid = await sendReply(message.from, reply, message.channel);

	// Record outbound message
	await recordMessage(session.id, 'outbound', reply, replySid);

	// Append assistant reply to session
	await appendToSession(session.id, {
		role: 'assistant',
		content: reply,
		timestamp: new Date().toISOString()
	});

	return twimlResponse();
};

/**
 * Handle the identity verification flow for unbound phone numbers.
 * Tracks attempts in a simple in-memory map (resets on deploy — acceptable for MVP).
 */
const verificationAttempts = new Map<string, number>();

async function handleVerification(
	phone: string,
	body: string | null,
	channel: 'whatsapp' | 'sms'
): Promise<void> {
	const attempts = verificationAttempts.get(phone) ?? 0;

	if (attempts >= MAX_ATTEMPTS) {
		await sendReply(phone, getMaxAttemptsMessage(), channel);
		return;
	}

	if (!body) {
		await sendReply(phone, getVerificationPrompt(), channel);
		return;
	}

	const email = parseVerificationReply(body);
	if (!email) {
		verificationAttempts.set(phone, attempts + 1);
		await sendReply(
			phone,
			"I didn't catch an email address. Please reply with the email you use to sign in to Threadline.",
			channel
		);
		return;
	}

	const result = await bindPhoneToUser(phone, email);
	if (!result.success) {
		verificationAttempts.set(phone, attempts + 1);
		await sendReply(phone, result.message, channel);
		return;
	}

	// Success — clear attempts and welcome the user
	verificationAttempts.delete(phone);
	await sendReply(
		phone,
		"You're verified. You can now place orders, check inventory, and more — just text naturally.",
		channel
	);
}

function twimlResponse(): Response {
	return new Response('<Response></Response>', {
		headers: { 'Content-Type': 'text/xml' }
	});
}
```

- [ ] **Step 2: Run type check**

```bash
bun run check
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/webhooks/messaging/+server.ts
git commit -m "feat: messaging webhook endpoint with identity binding and agent dispatch"
```

---

## Task 10: Wire up get_user_id_by_email RPC

The identity binding module calls `supabaseAdmin.rpc('get_user_id_by_email', ...)`. This RPC may or may not exist. Check and create if needed.

**Files:**

- Create (if needed): `supabase/migrations/YYYYMMDD_get_user_id_by_email.sql`

- [ ] **Step 1: Check if the RPC exists**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "SELECT proname FROM pg_proc WHERE proname = 'get_user_id_by_email';"
```

- [ ] **Step 2: If it doesn't exist, create a migration**

```sql
CREATE OR REPLACE FUNCTION get_user_id_by_email(lookup_email text)
RETURNS TABLE(id uuid) AS $$
  SELECT id FROM auth.users WHERE email = lower(lookup_email);
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

- [ ] **Step 3: Apply migration and verify**

```bash
bunx supabase migration up --local
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "SELECT get_user_id_by_email('test@example.com');"
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add get_user_id_by_email RPC for identity binding"
```

---

## Task 11: End-to-end verification

- [ ] **Step 1: Run all tests**

```bash
bun run test:run
```

Expected: All tests pass, including new messaging tests.

- [ ] **Step 2: Run type check**

```bash
bun run check
```

Expected: 0 errors.

- [ ] **Step 3: Manual smoke test (if Twilio credentials available)**

Set up a Twilio trial account, configure the webhook URL to point to a tunnel (e.g., `bunx localtunnel` or ngrok), and send a WhatsApp message to the Twilio sandbox number.

Verify:

1. First message triggers verification prompt
2. Replying with email binds the phone
3. Subsequent messages get agent responses
4. "Check inventory Classic Tee" returns product data
5. Messages are recorded in `messaging_messages` table

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete WhatsApp + SMS messaging integration (Phase 1)"
```
