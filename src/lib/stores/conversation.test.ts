import { describe, it, expect, vi } from 'vitest';

// Stub $app modules before importing the store so the module can load in a
// test environment — the store imports invalidate/invalidateAll/page eagerly.
vi.mock('$app/navigation', () => ({
	invalidate: vi.fn(),
	invalidateAll: vi.fn()
}));
vi.mock('$app/stores', () => ({
	page: { subscribe: () => () => {} }
}));

const { messagesFromStored, planInvalidation } = await import('./conversation.js');

// windowHistory used to live here. It trimmed to the last 10 messages and
// replaced the rest with a topic summary plus a fabricated "Understood, I have
// that context." assistant turn. The server now trims real rows out of
// ai_messages, so both the function and its tests are gone.
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

describe('planInvalidation', () => {
	it('returns no keys for an empty action list', () => {
		expect(planInvalidation([])).toEqual({ keys: [], full: false });
	});

	it('skips invalidation when only read-only tools were called', () => {
		const plan = planInvalidation([{ tool: 'query_data' }, { tool: 'list_brands' }]);
		expect(plan).toEqual({ keys: [], full: false });
	});

	it('collects keys for known write tools without duplicates', () => {
		const plan = planInvalidation([
			{ tool: 'create_order' },
			{ tool: 'update_order_status' },
			{ tool: 'query_data' }
		]);
		expect(plan.full).toBe(false);
		expect(plan.keys.sort()).toEqual(['data:dashboard', 'data:orders']);
	});

	it('falls back to full invalidation for unknown tools', () => {
		const plan = planInvalidation([{ tool: 'a_new_write_tool_not_in_the_map' }]);
		expect(plan).toEqual({ keys: [], full: true });
	});
});
