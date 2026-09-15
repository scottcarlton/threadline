/**
 * Persistence side of the cart store (SCO-167). The main cart.test.ts runs with
 * the default `browser = false` mock, which makes every network call a no-op;
 * this file flips that on so the writes themselves can be asserted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({
	browser: true,
	building: false,
	dev: true,
	version: 'test'
}));

const { cart } = await import('./cart.js');
type CartItem = import('./cart.js').CartItem;

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
	return {
		productId: 'prod-1',
		brandId: 'brand-1',
		productName: 'Test Product',
		styleNumber: 'TP-001',
		brandName: 'Test Brand',
		price: 49.99,
		imageUrl: null,
		colors: ['Red', 'Navy'],
		sizes: ['S', 'M', 'L'],
		addedAt: new Date().toISOString(),
		seasonId: null,
		seasonName: null,
		selectedColor: 'Red',
		sizeQtys: {},
		...overrides
	};
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Calls recorded so far, as [method, url, parsed body]. */
function calls(): Array<[string, string, unknown]> {
	return fetchMock.mock.calls.map(([url, init]) => {
		const opts = (init ?? {}) as RequestInit;
		return [
			(opts.method ?? 'GET') as string,
			String(url),
			opts.body ? JSON.parse(opts.body as string) : undefined
		];
	});
}

describe('cart persistence', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		fetchMock = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal('fetch', fetchMock);
		cart.clearCart();
		vi.runAllTimers();
		fetchMock.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('writes colour and quantities when a line is added', async () => {
		cart.addItem(makeCartItem({ selectedColor: 'Navy', sizeQtys: { S: 2, M: 1 } }));
		await vi.runAllTimersAsync();

		expect(calls()).toEqual([
			[
				'POST',
				'/api/cart',
				{ productId: 'prod-1', selectedColor: 'Navy', sizeQtys: { S: 2, M: 1 } }
			]
		]);
	});

	it('persists quantity edits, which the old store never sent at all', async () => {
		cart.addItem(makeCartItem({ selectedColor: 'Red', sizeQtys: { S: 1 } }));
		await vi.runAllTimersAsync();
		fetchMock.mockClear();

		cart.updateItemByKey('prod-1::Red', { sizeQtys: { S: 1, M: 4 } });
		await vi.runAllTimersAsync();

		expect(calls()).toEqual([
			['POST', '/api/cart', { productId: 'prod-1', selectedColor: 'Red', sizeQtys: { S: 1, M: 4 } }]
		]);
	});

	it('coalesces rapid stepper taps into a single write', async () => {
		cart.addItem(makeCartItem({ selectedColor: 'Red', sizeQtys: {} }));
		await vi.runAllTimersAsync();
		fetchMock.mockClear();

		for (const qty of [1, 2, 3, 4, 5]) {
			cart.updateItemByKey('prod-1::Red', { sizeQtys: { M: qty } });
			vi.advanceTimersByTime(50);
		}
		await vi.runAllTimersAsync();

		const sent = calls();
		expect(sent).toHaveLength(1);
		expect(sent[0][2]).toMatchObject({ sizeQtys: { M: 5 } });
	});

	it('keeps two colourways of one style as two independent writes', async () => {
		cart.addItem(makeCartItem({ selectedColor: 'Red', sizeQtys: { S: 1 } }));
		cart.addItem(makeCartItem({ selectedColor: 'Navy', sizeQtys: { M: 3 } }));
		await vi.runAllTimersAsync();

		const bodies = calls().map(([, , body]) => body);
		expect(bodies).toEqual([
			{ productId: 'prod-1', selectedColor: 'Red', sizeQtys: { S: 1 } },
			{ productId: 'prod-1', selectedColor: 'Navy', sizeQtys: { M: 3 } }
		]);
	});

	it('deletes only the colourway removed, not every line for the style', async () => {
		cart.addItem(makeCartItem({ selectedColor: 'Red', sizeQtys: { S: 1 } }));
		cart.addItem(makeCartItem({ selectedColor: 'Navy', sizeQtys: { M: 3 } }));
		await vi.runAllTimersAsync();
		fetchMock.mockClear();

		cart.removeItemByKey('prod-1::Red');
		await vi.runAllTimersAsync();

		expect(calls()).toEqual([['DELETE', '/api/cart/prod-1?color=Red', undefined]]);
	});

	it('deletes every colourway when the whole product is removed', async () => {
		cart.addItem(makeCartItem({ selectedColor: 'Red' }));
		await vi.runAllTimersAsync();
		fetchMock.mockClear();

		cart.removeItem('prod-1');
		await vi.runAllTimersAsync();

		expect(calls()).toEqual([['DELETE', '/api/cart/prod-1', undefined]]);
	});

	it('moves the row when a line changes colour', async () => {
		cart.addItem(makeCartItem({ selectedColor: 'Red', sizeQtys: { S: 1 } }));
		await vi.runAllTimersAsync();
		fetchMock.mockClear();

		cart.updateItemByKey('prod-1::Red', { selectedColor: 'Navy' });
		await vi.runAllTimersAsync();

		expect(calls()).toEqual([
			['DELETE', '/api/cart/prod-1?color=Red', undefined],
			['POST', '/api/cart', { productId: 'prod-1', selectedColor: 'Navy', sizeQtys: { S: 1 } }]
		]);
	});

	it('does not fire a stale write after the line is deleted', async () => {
		cart.addItem(makeCartItem({ selectedColor: 'Red', sizeQtys: { S: 1 } }));
		await vi.runAllTimersAsync();
		fetchMock.mockClear();

		cart.updateItemByKey('prod-1::Red', { sizeQtys: { S: 9 } });
		cart.removeItemByKey('prod-1::Red');
		await vi.runAllTimersAsync();

		expect(calls()).toEqual([['DELETE', '/api/cart/prod-1?color=Red', undefined]]);
	});

	it('clears the cart server-side and drops pending writes', async () => {
		cart.addItem(makeCartItem({ selectedColor: 'Red', sizeQtys: { S: 1 } }));
		cart.clearCart();
		await vi.runAllTimersAsync();

		expect(calls()).toEqual([['DELETE', '/api/cart', undefined]]);
	});

	it('keeps a mid-edit line when a hydrate lands before the write goes out', async () => {
		const server = makeCartItem({ selectedColor: 'Red', sizeQtys: { S: 1 } });
		cart.hydrate([server]);

		cart.updateItemByKey('prod-1::Red', { sizeQtys: { S: 7 } });
		// Navigation re-runs the layout effect with the pre-edit server rows.
		cart.hydrate([server]);
		await vi.runAllTimersAsync();

		expect(get(cart)[0].sizeQtys).toEqual({ S: 7 });
		expect(calls()).toEqual([
			['POST', '/api/cart', { productId: 'prod-1', selectedColor: 'Red', sizeQtys: { S: 7 } }]
		]);
	});

	it('keeps a line added since the load when a hydrate lands', async () => {
		cart.addItem(makeCartItem({ productId: 'prod-2', selectedColor: 'Navy' }));
		cart.hydrate([makeCartItem({ productId: 'prod-1', selectedColor: 'Red' })]);
		await vi.runAllTimersAsync();

		expect(get(cart).map((i) => i.productId)).toEqual(['prod-1', 'prod-2']);
	});

	it('takes server rows wholesale when nothing is pending', async () => {
		cart.hydrate([makeCartItem({ productId: 'prod-9', selectedColor: 'Red', sizeQtys: { L: 4 } })]);

		expect(get(cart)).toHaveLength(1);
		expect(get(cart)[0].sizeQtys).toEqual({ L: 4 });
	});

	it('encodes colour labels that need escaping in the delete URL', async () => {
		cart.addItem(makeCartItem({ selectedColor: 'Off White / Ecru' }));
		await vi.runAllTimersAsync();
		fetchMock.mockClear();

		cart.removeItemByKey('prod-1::Off White / Ecru');
		await vi.runAllTimersAsync();

		expect(calls()[0][1]).toBe('/api/cart/prod-1?color=Off%20White%20%2F%20Ecru');
	});

	it('sends an explicit empty colour for a product with no colourways', async () => {
		cart.addItem(makeCartItem({ selectedColor: '', colors: [], sizeQtys: { OS: 2 } }));
		await vi.runAllTimersAsync();
		fetchMock.mockClear();

		cart.removeItemByKey('prod-1');
		await vi.runAllTimersAsync();

		expect(calls()).toEqual([['DELETE', '/api/cart/prod-1?color=', undefined]]);
	});
});
