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

const { windowHistory, planInvalidation } = await import('./conversation.js');

describe('windowHistory', () => {
	it('passes short histories through unchanged', () => {
		const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
			{ role: 'user', content: 'hi' },
			{ role: 'assistant', content: 'hello' }
		];
		expect(windowHistory(history)).toEqual(history);
	});

	it('prepends a summary once we exceed 10 messages', () => {
		const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
		for (let i = 0; i < 15; i++) {
			history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` });
		}
		const windowed = windowHistory(history);
		expect(windowed.length).toBe(12); // 10 recent + 2 summary messages
		expect(windowed[0].role).toBe('user');
		expect(windowed[0].content).toContain('Earlier');
		expect(windowed[1].role).toBe('assistant');
		expect(windowed[windowed.length - 1].content).toBe('msg 14');
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
