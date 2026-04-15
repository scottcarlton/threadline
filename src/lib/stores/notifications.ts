import { writable } from 'svelte/store';
import { supabase } from '$lib/supabase.js';

export type NotificationItem = {
	id: string;
	type: string;
	title: string;
	body: string | null;
	link: string | null;
	read_at: string | null;
	created_at: string;
};

export const notifications = writable<NotificationItem[]>([]);
export const unreadNotificationCount = writable(0);

let polling = false;

export async function fetchNotifications() {
	const { data } = await supabase
		.from('notifications')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(20);

	const items = (data ?? []) as NotificationItem[];
	notifications.set(items);
	unreadNotificationCount.set(items.filter((n) => !n.read_at).length);
}

export async function markAsRead(id: string) {
	await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
	fetchNotifications();
}

export async function markAllAsRead() {
	await supabase
		.from('notifications')
		.update({ read_at: new Date().toISOString() })
		.is('read_at', null);
	fetchNotifications();
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
