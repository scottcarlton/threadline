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

/**
 * Quantity steppers fire one update per tap. Coalesce the writes for a given
 * line so a buyer clicking + eight times sends one request, not eight.
 */
const UPSERT_DEBOUNCE_MS = 400;
const pendingUpserts = new Map<string, ReturnType<typeof setTimeout>>();

async function postUpsert(item: Pick<CartItem, 'productId' | 'selectedColor' | 'sizeQtys'>) {
	if (!browser) return;
	try {
		await fetch('/api/cart', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				productId: item.productId,
				selectedColor: item.selectedColor,
				sizeQtys: item.sizeQtys
			})
		});
	} catch {
		// Optimistic local state already updated; the next page load reconciles
		// from the server. Silent failure is intentional here so UI stays snappy.
	}
}

function queueUpsert(item: Pick<CartItem, 'productId' | 'selectedColor' | 'sizeQtys'>) {
	if (!browser) return;
	const key = cartKey(item);
	const existing = pendingUpserts.get(key);
	if (existing) clearTimeout(existing);
	pendingUpserts.set(
		key,
		setTimeout(() => {
			pendingUpserts.delete(key);
			void postUpsert(item);
		}, UPSERT_DEBOUNCE_MS)
	);
}

/** Drops a queued write, for when the line is being deleted anyway. */
function cancelQueuedUpsert(key: string) {
	const existing = pendingUpserts.get(key);
	if (existing) {
		clearTimeout(existing);
		pendingUpserts.delete(key);
	}
}

function cancelAllQueuedUpserts() {
	for (const timer of pendingUpserts.values()) clearTimeout(timer);
	pendingUpserts.clear();
}

async function postRemove(productId: string, selectedColor?: string) {
	if (!browser) return;
	try {
		const qs = selectedColor === undefined ? '' : `?color=${encodeURIComponent(selectedColor)}`;
		await fetch(`/api/cart/${productId}${qs}`, { method: 'DELETE' });
	} catch {
		// See note in postUpsert.
	}
}

async function postClear() {
	if (!browser) return;
	try {
		await fetch('/api/cart', { method: 'DELETE' });
	} catch {
		// See note in postUpsert.
	}
}

function cartKey(item: { productId: string; selectedColor: string }): string {
	return item.selectedColor ? `${item.productId}::${item.selectedColor}` : item.productId;
}

function createCartStore() {
	const { subscribe, set, update } = writable<CartItem[]>([]);

	/** Persists whatever the line looks like after a local mutation. */
	function persistKey(key: string) {
		const item = get({ subscribe }).find((i) => cartKey(i) === key);
		if (item) queueUpsert(item);
	}

	return {
		subscribe,
		hydrate(items: CartItem[]) {
			// A hydrate can land mid-edit: the root layout re-runs this whenever its
			// `data` prop changes, which includes navigations that did not re-run the
			// server load. Lines with a write still queued are newer than the rows
			// that came back, so they win instead of being reset to stale quantities.
			if (pendingUpserts.size === 0) {
				set(items);
				return;
			}
			const pendingLocal = new Map(
				get({ subscribe })
					.filter((i) => pendingUpserts.has(cartKey(i)))
					.map((i) => [cartKey(i), i] as const)
			);
			const merged = items.map((i) => {
				const key = cartKey(i);
				const local = pendingLocal.get(key);
				pendingLocal.delete(key);
				return local ?? i;
			});
			// Anything still pending is a line added since the load: keep it.
			set([...merged, ...pendingLocal.values()]);
		},
		addItem(item: CartItem) {
			const key = cartKey(item);
			update((items) => {
				if (items.some((i) => cartKey(i) === key)) return items;
				return [...items, item];
			});
			queueUpsert(item);
		},
		updateItem(productId: string, patch: Partial<CartItem>) {
			const before = get({ subscribe }).filter((i) => i.productId === productId);
			update((items) => items.map((i) => (i.productId === productId ? { ...i, ...patch } : i)));
			for (const prev of before) {
				const prevKey = cartKey(prev);
				const nextKey = cartKey({ ...prev, ...patch });
				if (nextKey !== prevKey) {
					cancelQueuedUpsert(prevKey);
					void postRemove(prev.productId, prev.selectedColor);
				}
				persistKey(nextKey);
			}
		},
		updateItemByKey(key: string, patch: Partial<CartItem>) {
			const prev = get({ subscribe }).find((i) => cartKey(i) === key);
			update((items) => items.map((i) => (cartKey(i) === key ? { ...i, ...patch } : i)));
			if (!prev) return;
			const nextKey = cartKey({ ...prev, ...patch });
			if (nextKey !== key) {
				// The colour moved, so the row's identity moved with it: drop the old
				// line before writing the new one.
				cancelQueuedUpsert(key);
				void postRemove(prev.productId, prev.selectedColor);
			}
			persistKey(nextKey);
		},
		removeItem(productId: string) {
			for (const item of get({ subscribe })) {
				if (item.productId === productId) cancelQueuedUpsert(cartKey(item));
			}
			update((items) => items.filter((i) => i.productId !== productId));
			postRemove(productId);
		},
		removeItemByKey(key: string) {
			const items = get({ subscribe });
			const item = items.find((i) => cartKey(i) === key);
			cancelQueuedUpsert(key);
			update((items) => items.filter((i) => cartKey(i) !== key));
			if (item) postRemove(item.productId, item.selectedColor);
		},
		clearCart() {
			cancelAllQueuedUpserts();
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
