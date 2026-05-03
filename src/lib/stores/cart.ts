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

function createCartStore() {
	const { subscribe, set, update } = writable<CartItem[]>([]);

	return {
		subscribe,
		hydrate(items: CartItem[]) {
			set(items);
		},
		addItem(item: CartItem) {
			update((items) => {
				if (items.some((i) => i.productId === item.productId)) return items;
				return [...items, item];
			});
			postAdd(item.productId);
		},
		updateItem(productId: string, patch: Partial<CartItem>) {
			update((items) => items.map((i) => (i.productId === productId ? { ...i, ...patch } : i)));
		},
		removeItem(productId: string) {
			update((items) => items.filter((i) => i.productId !== productId));
			postRemove(productId);
		},
		clearCart() {
			set([]);
			postClear();
		},
		isInCart(productId: string): boolean {
			return get({ subscribe }).some((i) => i.productId === productId);
		}
	};
}

export const cart = createCartStore();
