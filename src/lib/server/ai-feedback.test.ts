import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake admin client that answers each lookup from `rows`, but only when
// every .eq() filter the code applied matches the row. A lookup that forgets
// an owner filter therefore finds rows it should not, and the tests catch it.
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
const lookups: Array<{ table: string; filters: Row }> = [];

function from(table: string) {
	const filters: Row = {};
	const builder = {
		select: () => builder,
		limit: () => builder,
		eq: (column: string, value: unknown) => {
			filters[column] = value;
			return builder;
		},
		maybeSingle: async () => {
			lookups.push({ table, filters });
			const match = (rows[table] ?? []).find((r) =>
				Object.entries(filters).every(([k, v]) => r[k] === v)
			);
			return { data: match ?? null, error: null };
		}
	};
	return builder;
}

vi.mock('./supabase.js', () => ({ supabaseAdmin: { from } }));

const { resolveFeedbackLinks } = await import('./ai-feedback.js');

const USER = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const CONVO = '33333333-3333-4333-8333-333333333333';
const MSG = '44444444-4444-4444-8444-444444444444';
const TURN = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';
const rater = { userId: USER, organizationId: ORG };

beforeEach(() => {
	lookups.length = 0;
	rows = {
		ai_conversations: [{ id: CONVO, profile_id: USER, organization_id: ORG }],
		ai_messages: [
			{ id: MSG, conversation_id: CONVO, role: 'assistant', turn_id: TURN },
			{ id: OTHER, conversation_id: CONVO, role: 'user', turn_id: TURN }
		],
		ai_usage_logs: [{ id: 'u1', turn_id: TURN, user_id: USER, organization_id: ORG }]
	};
});

describe('resolveFeedbackLinks', () => {
	it('links nothing when no ids are sent', async () => {
		expect(await resolveFeedbackLinks({}, rater)).toEqual({
			ok: true,
			links: { conversation_id: null, message_id: null, turn_id: null }
		});
		expect(lookups).toEqual([]);
	});

	it('links the conversation, the answer, and the turn stored on the answer', async () => {
		expect(
			await resolveFeedbackLinks({ conversationId: CONVO, messageId: MSG, turnId: TURN }, rater)
		).toEqual({ ok: true, links: { conversation_id: CONVO, message_id: MSG, turn_id: TURN } });
	});

	it('takes the turn from the stored answer when the client sends none', async () => {
		const r = await resolveFeedbackLinks({ conversationId: CONVO, messageId: MSG }, rater);
		expect(r).toEqual({
			ok: true,
			links: { conversation_id: CONVO, message_id: MSG, turn_id: TURN }
		});
	});

	it('refuses a conversation that belongs to someone else', async () => {
		rows.ai_conversations[0].profile_id = OTHER;
		expect(await resolveFeedbackLinks({ conversationId: CONVO }, rater)).toEqual({
			ok: false,
			status: 404,
			error: 'Conversation not found'
		});
	});

	it('refuses a conversation from another org the rater belongs to', async () => {
		rows.ai_conversations[0].organization_id = OTHER;
		const r = await resolveFeedbackLinks({ conversationId: CONVO }, rater);
		expect(r.ok).toBe(false);
	});

	it('refuses a message outside the conversation', async () => {
		rows.ai_messages[0].conversation_id = OTHER;
		expect(await resolveFeedbackLinks({ conversationId: CONVO, messageId: MSG }, rater)).toEqual({
			ok: false,
			status: 404,
			error: 'Message not found'
		});
	});

	it('refuses to rate a user message', async () => {
		const r = await resolveFeedbackLinks({ conversationId: CONVO, messageId: OTHER }, rater);
		expect(r).toMatchObject({ ok: false, status: 404 });
	});

	it('refuses a turn that disagrees with the stored answer', async () => {
		expect(
			await resolveFeedbackLinks({ conversationId: CONVO, messageId: MSG, turnId: OTHER }, rater)
		).toEqual({ ok: false, status: 400, error: 'turnId does not match the message' });
	});

	it('stores no turn for an answer saved before turns were recorded', async () => {
		rows.ai_messages[0].turn_id = null;
		const r = await resolveFeedbackLinks({ conversationId: CONVO, messageId: MSG }, rater);
		expect(r).toEqual({
			ok: true,
			links: { conversation_id: CONVO, message_id: MSG, turn_id: null }
		});
	});

	it("checks a bare turn against the rater's own usage rows", async () => {
		expect(await resolveFeedbackLinks({ turnId: TURN }, rater)).toEqual({
			ok: true,
			links: { conversation_id: null, message_id: null, turn_id: TURN }
		});
		expect(lookups).toEqual([
			{
				table: 'ai_usage_logs',
				filters: { turn_id: TURN, user_id: USER, organization_id: ORG }
			}
		]);
	});

	it('refuses a bare turn the rater did not make', async () => {
		rows.ai_usage_logs[0].user_id = OTHER;
		expect(await resolveFeedbackLinks({ turnId: TURN }, rater)).toEqual({
			ok: false,
			status: 404,
			error: 'Turn not found'
		});
	});
});
