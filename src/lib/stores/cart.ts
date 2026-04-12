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
};

const STORAGE_KEY = 'threadline_cart';

function loadFromStorage(): CartItem[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function saveToStorage(items: CartItem[]) {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function createCartStore() {
	const { subscribe, set, update } = writable<CartItem[]>(loadFromStorage());

	// Persist on every change
	subscribe((items) => saveToStorage(items));

	return {
		subscribe,
		addItem(item: CartItem) {
			update((items) => {
				if (items.some((i) => i.productId === item.productId)) return items;
				return [...items, item];
			});
		},
		removeItem(productId: string) {
			update((items) => items.filter((i) => i.productId !== productId));
		},
		clearCart() {
			set([]);
		},
		isInCart(productId: string): boolean {
			return get({ subscribe }).some((i) => i.productId === productId);
		}
	};
}

export const cart = createCartStore();
