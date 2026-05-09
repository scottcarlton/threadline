import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { supabase } from '$lib/supabase.js';

export type NotificationItem = {
	id: string;
	type: string;
	title: string;
	body: string | null;
	link: string | null;
	actor_name?: string | null;
	read_at: string | null;
	dismissed_at?: string | null;
	created_at: string;
};

export const notifications = writable<NotificationItem[]>([]);
export const unreadNotificationCount = writable(0);
export const newToasts = writable<NotificationItem[]>([]);

const SEEN_KEY = 'tl:notif:seen';

function loadSeen(): Set<string> {
	if (!browser) return new Set();
	try {
		const raw = localStorage.getItem(SEEN_KEY);
		return new Set(raw ? (JSON.parse(raw) as string[]) : []);
	} catch {
		return new Set();
	}
}

function saveSeen(seen: Set<string>) {
	if (!browser) return;
	// Cap to last 500 ids to keep storage bounded.
	const arr = Array.from(seen).slice(-500);
	try {
		localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
	} catch {
		// ignore quota errors
	}
}

const seenIds: Set<string> = loadSeen();

export function markToastSeen(id: string) {
	seenIds.add(id);
	saveSeen(seenIds);
	newToasts.update((items) => items.filter((n) => n.id !== id));
}

let polling = false;

export async function fetchNotifications() {
	const { data } = await supabase
		.from('notifications')
		.select('*')
		.is('dismissed_at', null)
		.order('created_at', { ascending: false })
		.limit(20);

	const items = (data ?? []) as NotificationItem[];
	notifications.set(items);
	unreadNotificationCount.set(items.filter((n) => !n.read_at).length);

	const fresh = items.filter((n) => !n.read_at && !seenIds.has(n.id));
	if (fresh.length > 0) {
		newToasts.update((existing) => {
			const have = new Set(existing.map((n) => n.id));
			const additions = fresh.filter((n) => !have.has(n.id));
			return [...additions, ...existing];
		});
	}
}

export async function markAsRead(id: string) {
	notifications.update((items) =>
		items.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
	);
	unreadNotificationCount.set(get(notifications).filter((n) => !n.read_at).length);
	await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
}

export async function markAllAsRead() {
	const now = new Date().toISOString();
	notifications.update((items) => items.map((n) => (n.read_at ? n : { ...n, read_at: now })));
	unreadNotificationCount.set(0);
	await supabase.from('notifications').update({ read_at: now }).is('read_at', null);
}

export async function dismissNotification(id: string) {
	const now = new Date().toISOString();
	notifications.update((items) => items.filter((n) => n.id !== id));
	newToasts.update((items) => items.filter((n) => n.id !== id));
	seenIds.add(id);
	saveSeen(seenIds);
	unreadNotificationCount.set(get(notifications).filter((n) => !n.read_at).length);
	await supabase.from('notifications').update({ dismissed_at: now }).eq('id', id);
}

export function startNotificationPolling(intervalMs = 30000) {
	if (polling) return;
	polling = true;
	fetchNotifications();
	const timer = setInterval(fetchNotifications, intervalMs);
	return () => {
		clearInterval(timer);
		polling = false;
	};
}
