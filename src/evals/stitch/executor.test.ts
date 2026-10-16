import { describe, it, expect } from 'vitest';
import { matches, createScriptedExecutor, UNSCRIPTED_RESULT } from './executor';

describe('matches', () => {
	it('empty pattern matches anything', () => {
		expect(matches({ a: 1 }, {})).toBe(true);
		expect(matches(undefined, {})).toBe(true);
	});
	it('strings match case-insensitively by substring', () => {
		expect(
			matches({ filters: { business_name: 'Acme Corp' } }, { filters: { business_name: 'acme' } })
		).toBe(true);
		expect(
			matches({ filters: { business_name: 'Bloom' } }, { filters: { business_name: 'acme' } })
		).toBe(false);
	});
	it('numbers and booleans match exactly', () => {
		expect(matches({ order_year: 2026 }, { order_year: 2026 })).toBe(true);
		expect(matches({ order_year: 2025 }, { order_year: 2026 })).toBe(false);
	});
	it('does not throw when the input is the wrong shape', () => {
		expect(matches({ filters: 'oops' }, { filters: { status: 'draft' } })).toBe(false);
		expect(matches(null, { entity: 'orders' })).toBe(false);
	});
});

describe('createScriptedExecutor', () => {
	const ex = () =>
		createScriptedExecutor([
			{
				tool: 'query_data',
				match: { entity: 'accounts' },
				result: { success: true, data: [{ id: 'a1' }] }
			},
			{ tool: 'query_data', match: {}, result: { success: true, data: ['fallback'] } }
		]);

	it('returns the first matching script', async () => {
		const e = ex();
		expect(await e.execute('query_data', { entity: 'accounts' })).toEqual({
			success: true,
			data: [{ id: 'a1' }]
		});
		expect(await e.execute('query_data', { entity: 'orders' })).toEqual({
			success: true,
			data: ['fallback']
		});
	});
	it('returns an empty success and records unscripted calls', async () => {
		const e = ex();
		expect(await e.execute('list_brands', {})).toEqual(UNSCRIPTED_RESULT);
		expect(e.calls).toEqual([{ name: 'list_brands', input: {}, scripted: false }]);
	});
	it('returns a copy so the model loop cannot mutate the script', async () => {
		const e = ex();
		const r = (await e.execute('query_data', { entity: 'accounts' })) as {
			data: Array<{ id: string }>;
		};
		r.data[0].id = 'changed';
		expect(await e.execute('query_data', { entity: 'accounts' })).toEqual({
			success: true,
			data: [{ id: 'a1' }]
		});
	});
});
