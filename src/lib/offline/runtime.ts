import { derived, writable, type Readable } from 'svelte/store';
import type { OutboxStore } from './db';
import type { OutboxItem, OutboxKind, Sender, Senders } from './types';
import { drainOutbox, type DrainOutcome } from './drain';
import { dependentsOf, nextWakeAt, unsyncedCount } from './machine';

/** While anything is pending, check again at least this often. */
export const POLL_INTERVAL_MS = 30_000;

const LOCK_NAME = 'threadline-outbox-drain';

export type SyncState = 'idle' | 'syncing' | 'stalled' | 'paused_auth';

export type EnqueueInput<P = unknown> = {
	/** The record id the server will store. Generate it when the form opens. */
	id: string;
	kind: OutboxKind;
	payload: P;
	label: string;
	dependsOn?: string[];
};

export type OutboxEnv = {
	store: OutboxStore;
	now?: () => number;
	random?: () => number;
	isOnline?: () => boolean;
	/** Web Locks, so two tabs never send the same item at once. */
	locks?: LockManager;
	channel?: () => BroadcastChannel | null;
	setTimeout?: (fn: () => void, ms: number) => unknown;
	clearTimeout?: (handle: unknown) => void;
	setInterval?: (fn: () => void, ms: number) => unknown;
	clearInterval?: (handle: unknown) => void;
	events?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
	doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null;
};

export type Outbox = ReturnType<typeof createOutbox>;

/**
 * The outbox as the app sees it: a store of the signed-in user's items plus
 * the triggers that drain it (enqueue, `online`, returning to the foreground,
 * start, a timer while items are pending). No Background Sync: iPad Safari,
 * the design baseline, does not support it.
 */
export function createOutbox(env: OutboxEnv) {
	const now = env.now ?? Date.now;
	const isOnline = env.isOnline ?? (() => navigator.onLine);
	const setT = env.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
	const clearT =
		env.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
	const setI = env.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
	const clearI =
		env.clearInterval ?? ((h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>));

	const items = writable<OutboxItem[]>([]);
	const state = writable<SyncState>('idle');
	const senders: Senders = {};
	const queueable = writable<OutboxKind[]>([]);

	let userId: string | null = null;
	let draining = false;
	let rerun = false;
	let wakeTimer: unknown = null;
	let pollTimer: unknown = null;
	let channel: BroadcastChannel | null = null;
	const cleanups: Array<() => void> = [];

	async function refresh() {
		if (!userId) return items.set([]);
		const rows = await env.store.list(userId);
		items.set(rows.sort((a, b) => a.createdAt - b.createdAt));
	}

	function announce() {
		channel?.postMessage('changed');
	}

	function schedule(rows: OutboxItem[]) {
		if (wakeTimer !== null) clearT(wakeTimer);
		wakeTimer = null;
		const at = nextWakeAt(rows, now());
		if (at !== null) wakeTimer = setT(() => void drain(), Math.max(0, at - now()));

		const hasPending = rows.some((i) => i.status === 'pending');
		if (hasPending && pollTimer === null) pollTimer = setI(() => void drain(), POLL_INTERVAL_MS);
		if (!hasPending && pollTimer !== null) {
			clearI(pollTimer);
			pollTimer = null;
		}
	}

	async function runDrain(uid: string): Promise<DrainOutcome> {
		return drainOutbox({
			store: env.store,
			userId: uid,
			senders,
			now,
			random: env.random,
			onChange: () => {
				// Only report syncing once something is actually sent, so the
				// periodic check does not flash the indicator with nothing to do.
				state.set('syncing');
				void refresh();
				announce();
			}
		});
	}

	/** Send what can be sent. Safe to call from any trigger, any number of times. */
	async function drain(): Promise<void> {
		const uid = userId;
		if (!uid || !isOnline()) return;
		if (draining) {
			rerun = true;
			return;
		}
		draining = true;
		try {
			let outcome: DrainOutcome | null = null;
			const run = async () => {
				outcome = await runDrain(uid);
			};
			if (env.locks) {
				// ifAvailable: another tab is already draining; it will pick up our
				// items too, since the queue is shared per origin.
				await env.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
					if (lock) await run();
				});
			} else {
				await run();
			}
			state.set(outcome === 'stalled' || outcome === 'paused_auth' ? outcome : 'idle');
		} catch (err) {
			console.error('[outbox] drain failed', err);
			state.set('stalled');
		} finally {
			draining = false;
			await refresh();
			schedule(await env.store.list(uid));
			if (rerun) {
				rerun = false;
				void drain();
			}
		}
	}

	function on(
		target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null | undefined,
		type: string,
		fn: () => void
	) {
		if (!target) return;
		target.addEventListener(type, fn);
		cleanups.push(() => target.removeEventListener(type, fn));
	}

	return {
		items: items as Readable<OutboxItem[]>,
		state: state as Readable<SyncState>,
		/** Everything the rep still has to think about. Drives the shell count. */
		unsynced: derived(items, (rows) => unsyncedCount(rows)),

		/**
		 * Kinds this build can send. A form only offers to save offline when its
		 * kind is here, so the UI never promises a sync that cannot happen.
		 */
		queueable: queueable as Readable<OutboxKind[]>,

		registerSender<P>(kind: OutboxKind, sender: Sender<P>) {
			senders[kind] = sender as Sender;
			queueable.set(Object.keys(senders) as OutboxKind[]);
			void drain();
		},

		/** Begin for a signed-in user. Calling again for another user switches. */
		async start(uid: string) {
			this.stop();
			userId = uid;
			const events = env.events === undefined ? globalThis.window : env.events;
			const doc = env.doc === undefined ? globalThis.document : env.doc;
			on(events, 'online', () => void drain());
			on(doc, 'visibilitychange', () => {
				if (doc?.visibilityState === 'visible') void drain();
			});
			channel = env.channel ? env.channel() : null;
			if (channel) {
				const onMessage = () => void refresh();
				channel.addEventListener('message', onMessage);
				cleanups.push(() => channel?.close());
			}
			await refresh();
			void drain();
		},

		stop() {
			for (const fn of cleanups.splice(0)) fn();
			if (wakeTimer !== null) clearT(wakeTimer);
			if (pollTimer !== null) clearI(pollTimer);
			wakeTimer = pollTimer = null;
			channel = null;
			userId = null;
			items.set([]);
			state.set('idle');
		},

		/** Save an item on this device and try to send it straight away. */
		async enqueue<P>(input: EnqueueInput<P>): Promise<OutboxItem<P>> {
			if (!userId) throw new Error('Outbox is not started for a signed-in user');
			const t = now();
			const item: OutboxItem<P> = {
				id: input.id,
				userId,
				kind: input.kind,
				payload: input.payload,
				label: input.label,
				dependsOn: input.dependsOn ?? [],
				status: 'pending',
				attempts: 0,
				lastError: null,
				nextAttemptAt: t,
				createdAt: t,
				updatedAt: t
			};
			await env.store.put(item);
			await refresh();
			announce();
			void drain();
			return item;
		},

		/** Send a failed or backing-off item again now. */
		async retry(id: string) {
			const item = await env.store.get(id);
			if (!item || item.userId !== userId || item.status === 'synced') return;
			await env.store.put({
				...item,
				status: 'pending',
				nextAttemptAt: now(),
				updatedAt: now()
			});
			await refresh();
			announce();
			void drain();
		},

		/**
		 * Drop an item for good, along with everything that depends on it (an
		 * order cannot sync once the account it was written for is gone). The UI
		 * confirms first and names what else goes.
		 */
		async discard(id: string) {
			if (!userId) return;
			const rows = await env.store.list(userId);
			const target = rows.find((i) => i.id === id);
			if (!target) return;
			// A needs_review item is already on the server; removing it from the list
			// takes nothing away from the items that depend on it.
			const cascade = target.status === 'needs_review' ? [] : dependentsOf(id, rows);
			await env.store.remove([id, ...cascade]);
			await refresh();
			announce();
		},

		/** Ids that `discard(id)` would also remove. */
		async dependentsOf(id: string): Promise<string[]> {
			if (!userId) return [];
			const rows = await env.store.list(userId);
			const target = rows.find((i) => i.id === id);
			if (!target || target.status === 'needs_review') return [];
			return dependentsOf(id, rows);
		},

		drain
	};
}
