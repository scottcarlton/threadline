import { toast } from 'svelte-sonner';
import type { NotificationItem } from '$lib/stores/notifications.js';
import { dismissNotification, markAsRead } from '$lib/stores/notifications.js';

export type NotificationActions = {
	primary?: { label: string; href: string };
	secondary: Array<{ label: string; run: (notif: NotificationItem) => void | Promise<void> }>;
};

const dismiss = (notif: NotificationItem) => dismissNotification(notif.id);

const snoozeStub = (label: string) => async (notif: NotificationItem) => {
	await markAsRead(notif.id);
	toast(`Snoozed for ${label}`, { description: 'Snooze isn’t wired to the backend yet.' });
};

export function notificationActions(notif: NotificationItem): NotificationActions {
	const primary = notif.link ? { label: 'View', href: notif.link } : undefined;
	const secondary: NotificationActions['secondary'] = [];

	switch (notif.type) {
		case 'order_overdue':
		case 'order_status_changed':
		case 'order_confirmed':
			secondary.push({ label: 'Snooze 1d', run: snoozeStub('1 day') });
			break;
		case 'comment':
			break;
		default:
			break;
	}

	secondary.push({ label: 'Dismiss', run: dismiss });
	return { primary, secondary };
}
