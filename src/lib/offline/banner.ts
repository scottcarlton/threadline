import type { SyncState } from './runtime';
import type { OutboxItem } from './types';

export type BannerInput = {
	online: boolean;
	items: OutboxItem[];
	state: SyncState;
	/** True when at least one form in this build can save offline. */
	canQueue: boolean;
	/** True for a few seconds after the queue empties, to confirm it landed. */
	justSynced: boolean;
};

export type Banner = {
	text: string;
	/** Offer to open the sync panel. */
	review: boolean;
} | null;

const plural = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

/**
 * What the connection banner says, or null for nothing. One message at a time,
 * most urgent first. Every promise to sync is conditional on something that
 * can actually sync: an offline device with no queueable form is told its
 * changes will not save, never that they will sync.
 */
export function bannerFor({ online, items, state, canQueue, justSynced }: BannerInput): Banner {
	const unsynced = items.filter((i) => i.status !== 'synced');
	const attention = unsynced.filter((i) => i.status === 'failed' || i.status === 'needs_review');
	const waiting = unsynced.length - attention.length;

	if (!online) {
		if (unsynced.length > 0) {
			// Failed items will not sync on their own, so they are never counted
			// in the "will sync" promise.
			const parts = ["You're offline."];
			if (waiting > 0) {
				parts.push(`${plural(waiting)} saved on this device will sync when you reconnect.`);
			}
			if (attention.length > 0) parts.push(`${plural(attention.length)} couldn't sync.`);
			return { text: parts.join(' '), review: true };
		}
		return canQueue
			? {
					text: "You're offline. New accounts and orders save on this device and sync when you reconnect.",
					review: false
				}
			: { text: "You're offline. Changes won't save until you reconnect.", review: false };
	}

	if (attention.length > 0) {
		return { text: `${plural(attention.length)} couldn't sync.`, review: true };
	}
	if (state === 'paused_auth' && waiting > 0) {
		return { text: `Sign in to sync ${plural(waiting)}.`, review: true };
	}
	if (state === 'syncing' && waiting > 0) {
		return { text: `Syncing ${plural(waiting)}.`, review: false };
	}
	if (waiting > 0) {
		return { text: `${plural(waiting)} waiting to sync.`, review: true };
	}
	if (justSynced) return { text: 'Everything synced.', review: false };
	return null;
}

export const KIND_LABELS: Record<OutboxItem['kind'], string> = {
	'account.create': 'New account',
	'order.create': 'New order'
};
