import { writable, type Readable } from 'svelte/store';
import type { CatalogProduct } from '$lib/components/shared/catalog-picker-types';
import type { OrderPrereqs } from '$lib/server/orders/load-order-prereqs';
import { connection, done, request, SNAPSHOT } from './db';

/**
 * The order wizard's reference data on this device (SCO-208): what
 * GET /api/offline/snapshot returned, keyed by user and org so switching org,
 * or a second rep on the same iPad, never reads someone else's copy.
 */
export type OrderSnapshot = {
	key: string;
	userId: string;
	orgId: string;
	/** Epoch ms when the server built it. */
	fetchedAt: number;
	prereqs: OrderPrereqs;
	products: CatalogProduct[];
};

/** Refresh on reconnect when older than this. */
export const SNAPSHOT_STALE_MS = 15 * 60_000;
/** While online and visible, refresh at least this often. */
export const SNAPSHOT_REFRESH_MS = 30 * 60_000;

export const snapshotKey = (userId: string, orgId: string) => `${userId}:${orgId}`;

export type SnapshotStore = {
	get(key: string): Promise<OrderSnapshot | undefined>;
	put(snapshot: OrderSnapshot): Promise<void>;
};

export function createIdbSnapshotStore(open: () => Promise<IDBDatabase>): SnapshotStore {
	const db = connection(open);
	return {
		async get(key) {
			const tx = (await db()).transaction(SNAPSHOT, 'readonly');
			return (await request(tx.objectStore(SNAPSHOT).get(key))) as OrderSnapshot | undefined;
		},
		async put(snapshot) {
			const tx = (await db()).transaction(SNAPSHOT, 'readwrite');
			tx.objectStore(SNAPSHOT).put(snapshot);
			await done(tx);
		}
	};
}

type SnapshotResponse = Omit<OrderSnapshot, 'key' | 'userId'>;

/**
 * Fetch a fresh snapshot and keep it. Returns null when the device is offline
 * or the server said no, leaving the stored copy untouched: an old snapshot
 * beats none when the rep is standing in a showroom with no signal.
 */
export async function fetchSnapshot(
	userId: string,
	orgId: string,
	store: SnapshotStore,
	fetchFn: typeof fetch = fetch
): Promise<OrderSnapshot | null> {
	let res: Response;
	try {
		res = await fetchFn('/api/offline/snapshot', { cache: 'no-store' });
	} catch {
		return null;
	}
	if (!res.ok) return null;
	const body = (await res.json()) as SnapshotResponse;
	// The org may have switched server-side; never file one org's data under another.
	if (body.orgId !== orgId) return null;
	const snapshot: OrderSnapshot = { ...body, key: snapshotKey(userId, orgId), userId, orgId };
	await store.put(snapshot);
	return snapshot;
}

export type SnapshotEnv = {
	store: SnapshotStore;
	fetchFn?: typeof fetch;
	now?: () => number;
	isOnline?: () => boolean;
	events?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
	doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null;
	setInterval?: (fn: () => void, ms: number) => unknown;
	clearInterval?: (handle: unknown) => void;
};

/**
 * The snapshot as the app sees it: the stored copy at once, then a refresh on
 * start, on reconnect when stale, on return to the foreground when stale, and
 * every 30 minutes while online.
 */
export function createSnapshotSync(env: SnapshotEnv) {
	const now = env.now ?? Date.now;
	const isOnline = env.isOnline ?? (() => navigator.onLine);
	const setI = env.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
	const clearI =
		env.clearInterval ?? ((h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>));

	const current = writable<OrderSnapshot | null>(null);
	let active: { userId: string; orgId: string } | null = null;
	let refreshing: Promise<void> | null = null;
	let timer: unknown = null;
	const cleanups: Array<() => void> = [];

	async function refresh(): Promise<void> {
		const target = active;
		if (!target || !isOnline()) return;
		refreshing ??= (async () => {
			try {
				const fresh = await fetchSnapshot(target.userId, target.orgId, env.store, env.fetchFn);
				// Ignore a result for a user or org that is no longer active.
				if (fresh && active === target) current.set(fresh);
			} catch (err) {
				console.error('[offline] snapshot refresh failed', err);
			} finally {
				refreshing = null;
			}
		})();
		return refreshing;
	}

	function refreshIfStale() {
		let stale = true;
		const unsubscribe = current.subscribe((s) => {
			stale = !s || now() - s.fetchedAt > SNAPSHOT_STALE_MS;
		});
		unsubscribe();
		if (stale) void refresh();
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
		current: current as Readable<OrderSnapshot | null>,

		async start(userId: string, orgId: string) {
			this.stop();
			const target = { userId, orgId };
			active = target;
			const stored = await env.store.get(snapshotKey(userId, orgId));
			if (active === target) current.set(stored ?? null);

			const events = env.events === undefined ? globalThis.window : env.events;
			const doc = env.doc === undefined ? globalThis.document : env.doc;
			on(events, 'online', refreshIfStale);
			on(doc, 'visibilitychange', () => {
				if (doc?.visibilityState === 'visible') refreshIfStale();
			});
			timer = setI(() => void refresh(), SNAPSHOT_REFRESH_MS);
			await refresh();
		},

		/**
		 * The snapshot for this user and org, for a page that needs it now: the
		 * current copy if it is the right one, else the stored copy, else (when
		 * online) a fresh fetch. Null means none is available on this device.
		 */
		async ensure(userId: string, orgId: string): Promise<OrderSnapshot | null> {
			const key = snapshotKey(userId, orgId);
			let found: OrderSnapshot | null = null;
			current.subscribe((s) => (found = s))();
			if (found && (found as OrderSnapshot).key === key) return found;
			const stored = await env.store.get(key);
			if (stored) return stored;
			if (!isOnline()) return null;
			return fetchSnapshot(userId, orgId, env.store, env.fetchFn);
		},

		stop() {
			for (const fn of cleanups.splice(0)) fn();
			if (timer !== null) clearI(timer);
			timer = null;
			active = null;
			current.set(null);
		},

		refresh
	};
}
