import type { OutboxStore } from './db';
import type { OutboxItem, Senders } from './types';
import { applySendResult, isExpiredSynced, runnableItems } from './machine';

export type DrainOutcome =
	/** Nothing left that can send right now. */
	| 'idle'
	/** A send hit the network or a 5xx; the device is probably offline. */
	| 'stalled'
	/** The session is gone. Items wait until the rep signs back in. */
	| 'paused_auth';

export type DrainOptions = {
	store: OutboxStore;
	userId: string;
	senders: Senders;
	now?: () => number;
	random?: () => number;
	/** Called after every state change so the UI can refresh. */
	onChange?: () => void;
};

/**
 * Sends every runnable item for one user, oldest first, re-reading the queue
 * after each send so an order unblocks as soon as its account syncs.
 *
 * Callers must make sure only one drain runs at a time (see runtime.ts). An
 * item whose kind has no sender yet stays pending: the queue may hold work for
 * a feature this build cannot send, and dropping it would lose the rep's work.
 */
export async function drainOutbox({
	store,
	userId,
	senders,
	now = Date.now,
	random = Math.random,
	onChange
}: DrainOptions): Promise<DrainOutcome> {
	const initial = await store.list(userId);
	const expired = initial.filter((i) => isExpiredSynced(i, now())).map((i) => i.id);
	if (expired.length) {
		await store.remove(expired);
		onChange?.();
	}

	// An item left in `syncing` means a previous drain died mid-send (tab
	// closed, crash). The server is idempotent on the item id, so resending is
	// safe; put it back in the queue.
	for (const stuck of initial.filter((i) => i.status === 'syncing')) {
		await store.put({ ...stuck, status: 'pending', updatedAt: now() });
	}

	const skipped = new Set<string>();
	for (;;) {
		const items = await store.list(userId);
		const next = runnableItems(items, now()).find((i) => !skipped.has(i.id));
		if (!next) return 'idle';

		const send = senders[next.kind];
		if (!send) {
			skipped.add(next.id);
			continue;
		}

		const inFlight: OutboxItem = { ...next, status: 'syncing', updatedAt: now() };
		await store.put(inFlight);
		onChange?.();

		let result;
		try {
			result = await send(inFlight);
		} catch (err) {
			result = {
				status: 'retry' as const,
				error: err instanceof Error ? err.message : 'Network error'
			};
		}

		await store.put(applySendResult(inFlight, result, now(), random));
		onChange?.();

		if (result.status === 'retry') return 'stalled';
		if (result.status === 'auth') return 'paused_auth';
	}
}
