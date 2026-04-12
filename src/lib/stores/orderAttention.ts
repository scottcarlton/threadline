import { writable } from 'svelte/store';

export const orderAttentionCount = writable(0);

let polling = false;

export async function fetchOrderAttentionCount() {
	try {
		const res = await fetch('/api/orders/attention');
		if (res.ok) {
			const data = await res.json();
			orderAttentionCount.set(data.count ?? 0);
		}
	} catch {
		// silently fail
	}
}

export function startOrderAttentionPolling(intervalMs = 60000) {
	if (polling) return;
	polling = true;
	fetchOrderAttentionCount();
	const timer = setInterval(fetchOrderAttentionCount, intervalMs);
	return () => {
		clearInterval(timer);
		polling = false;
	};
}
