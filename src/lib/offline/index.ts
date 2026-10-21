import { browser } from '$app/environment';
import { createIdbOutboxStore, deleteOfflineDb, openOfflineDb } from './db';
import { createOutbox } from './runtime';

export type { OutboxItem, OutboxKind, OutboxStatus, SendResult, Sender } from './types';
export type { SyncState } from './runtime';
export { classifyResponse } from './machine';

const CHANNEL_NAME = 'threadline-outbox';

/**
 * The app's one outbox. Created on the server too (nothing touches IndexedDB
 * until `start`), so components can import it without a browser guard.
 */
export const outbox = createOutbox({
	store: createIdbOutboxStore(() => openOfflineDb()),
	locks: browser && 'locks' in navigator ? navigator.locks : undefined,
	channel: () =>
		typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
});

/**
 * Ask the browser not to evict offline data. Safari can clear storage for a
 * site after days without a visit unless it is installed and persisted, and
 * losing the outbox loses the rep's unsent work. Best effort.
 */
export async function requestPersistentStorage(): Promise<boolean> {
	if (!browser || !navigator.storage?.persist) return false;
	try {
		if (await navigator.storage.persisted()) return true;
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}

/** Stop the outbox and delete everything this device holds offline. */
export async function clearOfflineData(): Promise<void> {
	if (!browser || typeof indexedDB === 'undefined') return;
	outbox.stop();
	await deleteOfflineDb();
}
