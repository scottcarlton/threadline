import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { cart, type CartItem } from './cart.js';

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
	return {
		productId: 'prod-1',
		brandId: 'brand-1',
		productName: 'Test Product',
		styleNumber: 'TP-001',
		brandName: 'Test Brand',
		price: 49.99,
		imageUrl: null,
		colors: ['Red'],
		sizes: ['S', 'M', 'L'],
		addedAt: new Date().toISOString(),
		seasonId: null,
		seasonName: null,
		selectedColor: '',
		sizeQtys: {},
		...overrides
	};
}

describe('cart store', () => {
	beforeEach(() => {
		cart.clearCart();
	});

	it('starts empty', () => {
		expect(get(cart)).toHaveLength(0);
	});

	it('adds an item', () => {
		const item = makeCartItem();
		cart.addItem(item);

		const items = get(cart);
		expect(items).toHaveLength(1);
		expect(items[0].productId).toBe('prod-1');
	});

	it('does not add duplicate productId', () => {
		const item = makeCartItem({ productId: 'prod-1' });
		cart.addItem(item);
		cart.addItem(item);

		expect(get(cart)).toHaveLength(1);
	});

	it('adds items with different productIds', () => {
		cart.addItem(makeCartItem({ productId: 'prod-1' }));
		cart.addItem(makeCartItem({ productId: 'prod-2' }));

		expect(get(cart)).toHaveLength(2);
	});

	it('removes an item by productId', () => {
		cart.addItem(makeCartItem({ productId: 'prod-1' }));
		cart.addItem(makeCartItem({ productId: 'prod-2' }));

		cart.removeItem('prod-1');

		const items = get(cart);
		expect(items).toHaveLength(1);
		expect(items[0].productId).toBe('prod-2');
	});

	it('removeItem is a no-op for non-existent productId', () => {
		cart.addItem(makeCartItem());
		cart.removeItem('nonexistent');

		expect(get(cart)).toHaveLength(1);
	});

	it('clears all items', () => {
		cart.addItem(makeCartItem({ productId: 'prod-1' }));
		cart.addItem(makeCartItem({ productId: 'prod-2' }));

		cart.clearCart();
		expect(get(cart)).toHaveLength(0);
	});

	it('isInCart returns true for existing product', () => {
		cart.addItem(makeCartItem({ productId: 'prod-1' }));
		expect(cart.isInCart('prod-1')).toBe(true);
	});

	it('isInCart returns false for non-existent product', () => {
		expect(cart.isInCart('nonexistent')).toBe(false);
	});

	it('preserves item data correctly', () => {
		const item = makeCartItem({
			productId: 'p1',
			productName: 'Silk Blouse',
			price: 129.99,
			colors: ['Navy', 'Ivory'],
			sizes: ['XS', 'S', 'M']
		});

		cart.addItem(item);
		const stored = get(cart)[0];

		expect(stored.productName).toBe('Silk Blouse');
		expect(stored.price).toBe(129.99);
		expect(stored.colors).toEqual(['Navy', 'Ivory']);
		expect(stored.sizes).toEqual(['XS', 'S', 'M']);
	});
});
