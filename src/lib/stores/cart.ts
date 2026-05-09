import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export type CartItem = {
	productId: string;
	brandId: string;
	productName: string;
	styleNumber: string;
	brandName: string;
	price: number;
	imageUrl: string | null;
	colors: string[];
	sizes: string[];
	addedAt: string;
	seasonId: string | null;
	seasonName: string | null;
	selectedColor: string;
	sizeQtys: Record<string, number>;
};

async function postAdd(productId: string) {
	if (!browser) return;
	try {
		await fetch('/api/cart', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ productId })
		});
	} catch {
		// Optimistic local state already updated; the next page load reconciles
		// from the server. Silent failure is intentional here so UI stays snappy.
	}
}

async function postRemove(productId: string) {
	if (!browser) return;
	try {
		await fetch(`/api/cart/${productId}`, { method: 'DELETE' });
	} catch {
		// See note in postAdd.
	}
}

async function postClear() {
	if (!browser) return;
	try {
		await fetch('/api/cart', { method: 'DELETE' });
	} catch {
		// See note in postAdd.
	}
}

function cartKey(item: { productId: string; selectedColor: string }): string {
	return item.selectedColor ? `${item.productId}::${item.selectedColor}` : item.productId;
}

function createCartStore() {
	const { subscribe, set, update } = writable<CartItem[]>([]);

	return {
		subscribe,
		hydrate(items: CartItem[]) {
			set(items);
		},
		addItem(item: CartItem) {
			const key = cartKey(item);
			update((items) => {
				if (items.some((i) => cartKey(i) === key)) return items;
				return [...items, item];
			});
			postAdd(item.productId);
		},
		updateItem(productId: string, patch: Partial<CartItem>) {
			update((items) => items.map((i) => (i.productId === productId ? { ...i, ...patch } : i)));
		},
		updateItemByKey(key: string, patch: Partial<CartItem>) {
			update((items) => items.map((i) => (cartKey(i) === key ? { ...i, ...patch } : i)));
		},
		removeItem(productId: string) {
			update((items) => items.filter((i) => i.productId !== productId));
			postRemove(productId);
		},
		removeItemByKey(key: string) {
			const items = get({ subscribe });
			const item = items.find((i) => cartKey(i) === key);
			update((items) => items.filter((i) => cartKey(i) !== key));
			if (item) postRemove(item.productId);
		},
		clearCart() {
			set([]);
			postClear();
		},
		isInCart(productId: string): boolean {
			return get({ subscribe }).some((i) => i.productId === productId);
		},
		cartKey
	};
}

export const cart = createCartStore();
