import type { OutboxItem, SendResult } from './types';

/** First retry after 5s, doubling to a 15 minute ceiling. */
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 15 * 60_000;

/** Synced items stay visible this long so the rep sees them land, then go. */
export const SYNCED_RETENTION_MS = 24 * 60 * 60_000;

/**
 * Delay before the next attempt, after `attempts` failed ones. Jitter (plus or
 * minus 20%) keeps a fleet of devices that reconnect together from retrying in
 * lockstep. `random` is injectable for tests.
 */
export function backoffDelay(attempts: number, random: () => number = Math.random): number {
	const exp = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);
	const jitter = 1 + (random() * 0.4 - 0.2);
	return Math.round(exp * jitter);
}

/** The next state of an item after a send, without touching storage. */
export function applySendResult(
	item: OutboxItem,
	result: SendResult,
	now: number,
	random: () => number = Math.random
): OutboxItem {
	const base = { ...item, updatedAt: now };
	switch (result.status) {
		case 'synced':
			return { ...base, status: 'synced', lastError: null, result: result.result };
		case 'needs_review':
			return { ...base, status: 'needs_review', lastError: result.reason, result: result.result };
		case 'failed':
			return { ...base, status: 'failed', attempts: item.attempts + 1, lastError: result.error };
		case 'retry': {
			const attempts = item.attempts + 1;
			return {
				...base,
				status: 'pending',
				attempts,
				lastError: result.error,
				nextAttemptAt: now + backoffDelay(attempts, random)
			};
		}
		case 'auth':
			// Not the item's fault: no attempt is counted and no backoff applies.
			// The drain pauses until the rep signs back in.
			return { ...base, status: 'pending', lastError: result.error };
	}
}

export type DependencyState = 'ready' | 'waiting' | 'blocked';

/**
 * Whether an item's dependencies let it send.
 *
 * ready    every dependency reached the server (synced, or needs_review:
 *          stored, just not exactly as captured), or is gone (pruned)
 * waiting  a dependency is still pending or syncing
 * blocked  a dependency failed; the rep has to act first
 */
export function dependencyState(item: OutboxItem, byId: Map<string, OutboxItem>): DependencyState {
	let waiting = false;
	for (const depId of item.dependsOn) {
		const dep = byId.get(depId);
		if (!dep || dep.status === 'synced' || dep.status === 'needs_review') continue;
		if (dep.status === 'failed') return 'blocked';
		waiting = true;
	}
	return waiting ? 'waiting' : 'ready';
}

/** Pending items that may send now, oldest first. */
export function runnableItems(items: OutboxItem[], now: number): OutboxItem[] {
	const byId = new Map(items.map((i) => [i.id, i]));
	return items
		.filter(
			(i) =>
				i.status === 'pending' && i.nextAttemptAt <= now && dependencyState(i, byId) === 'ready'
		)
		.sort((a, b) => a.createdAt - b.createdAt);
}

/** Earliest time a backing-off item becomes due, or null if none is waiting. */
export function nextWakeAt(items: OutboxItem[], now: number): number | null {
	let next: number | null = null;
	for (const i of items) {
		if (i.status !== 'pending' || i.nextAttemptAt <= now) continue;
		if (next === null || i.nextAttemptAt < next) next = i.nextAttemptAt;
	}
	return next;
}

/** Items the rep still has to think about: anything not yet synced. */
export function unsyncedCount(items: OutboxItem[]): number {
	return items.filter((i) => i.status !== 'synced').length;
}

export function isExpiredSynced(item: OutboxItem, now: number): boolean {
	return item.status === 'synced' && now - item.updatedAt > SYNCED_RETENTION_MS;
}

/**
 * Ids of items that can never send once `id` is discarded: everything that
 * depends on it, directly or through another dependent.
 */
export function dependentsOf(id: string, items: OutboxItem[]): string[] {
	const out = new Set<string>();
	const queue = [id];
	while (queue.length) {
		const current = queue.shift()!;
		for (const i of items) {
			if (i.dependsOn.includes(current) && !out.has(i.id)) {
				out.add(i.id);
				queue.push(i.id);
			}
		}
	}
	return [...out];
}

/** Map an HTTP response from a sync endpoint to a send result. */
export function classifyResponse(status: number, message?: string): SendResult {
	if (status >= 200 && status < 300) return { status: 'synced' };
	const error = message?.trim() || `Server responded ${status}`;
	if (status === 401) return { status: 'auth', error };
	if (status === 408 || status === 429 || status >= 500) return { status: 'retry', error };
	return { status: 'failed', error };
}
