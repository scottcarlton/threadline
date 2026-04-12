import { writable } from 'svelte/store';

export const unreadCount = writable(0);

let polling = false;

export async function fetchUnreadCount() {
	try {
		const res = await fetch('/api/email/unread');
		if (res.ok) {
			const data = await res.json();
			unreadCount.set(data.count ?? 0);
		}
	} catch {
		// silently fail
	}
}

export function startUnreadPolling(intervalMs = 60000) {
	if (polling) return;
	polling = true;
	fetchUnreadCount();
	const timer = setInterval(fetchUnreadCount, intervalMs);
	return () => {
		clearInterval(timer);
		polling = false;
	};
}
