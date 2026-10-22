import { describe, expect, it, vi } from 'vitest';
import { CATALOG_PAGE, loadCatalog } from './catalog';

function client(pages: Array<{ data: unknown[] | null; error?: unknown }>) {
	const ranges: Array<[number, number]> = [];
	const inArgs: unknown[] = [];
	let call = 0;
	const builder = {
		select: () => builder,
		in: (_col: string, ids: unknown) => (inArgs.push(ids), builder),
		eq: () => builder,
		is: () => builder,
		order: () => builder,
		range: (from: number, to: number) => {
			ranges.push([from, to]);
			const page = pages[call++] ?? { data: [] };
			return Promise.resolve({ data: page.data, error: page.error ?? null });
		}
	};
	return { supabase: { from: vi.fn(() => builder) }, ranges, inArgs };
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));

describe('loadCatalog', () => {
	it('returns nothing, and asks for nothing, when the scope is empty', async () => {
		const c = client([]);
		expect(await loadCatalog(c.supabase as never, [])).toEqual([]);
		expect(c.supabase.from).not.toHaveBeenCalled();
	});

	it('pages past the row cap until a short page', async () => {
		const c = client([{ data: rows(CATALOG_PAGE) }, { data: rows(3) }]);
		const out = await loadCatalog(c.supabase as never, ['b1']);
		expect(out).toHaveLength(CATALOG_PAGE + 3);
		expect(c.ranges).toEqual([
			[0, CATALOG_PAGE - 1],
			[CATALOG_PAGE, 2 * CATALOG_PAGE - 1]
		]);
		expect(c.inArgs[0]).toEqual(['b1']);
	});

	it('throws when a page fails rather than returning a partial catalog', async () => {
		const c = client([{ data: rows(CATALOG_PAGE) }, { data: null, error: new Error('boom') }]);
		await expect(loadCatalog(c.supabase as never, ['b1'])).rejects.toThrow('boom');
	});
});
