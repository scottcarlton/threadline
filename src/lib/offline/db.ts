import type { OutboxItem } from './types';

/**
 * The device's offline store. One database per origin; rows carry the user id
 * so a second rep signing in on the same iPad never reads the first rep's
 * items.
 *
 * v1  outbox
 * v2  snapshot: reference data and catalog for the order wizard (SCO-208)
 */
export const OFFLINE_DB_NAME = 'threadline-offline';
const DB_VERSION = 2;
const OUTBOX = 'outbox';
export const SNAPSHOT = 'snapshot';

export function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export function done(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
		tx.onerror = () => reject(tx.error);
	});
}

export function openOfflineDb(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = factory.open(OFFLINE_DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(OUTBOX)) {
				const store = db.createObjectStore(OUTBOX, { keyPath: 'id' });
				store.createIndex('userId', 'userId', { unique: false });
			}
			if (!db.objectStoreNames.contains(SNAPSHOT)) {
				db.createObjectStore(SNAPSHOT, { keyPath: 'key' });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		// Another tab still has an older version open. It closes on
		// `versionchange` (see connection below), and then this open succeeds;
		// rejecting here would fail every upgrade that races a second tab.
		req.onblocked = () => console.warn('[offline] waiting for another tab to release the store');
	});
}

/**
 * A lazily opened connection that steps aside when another tab, or sign-out,
 * deletes or upgrades the database, and reopens on the next call.
 */
export function connection(open: () => Promise<IDBDatabase>): () => Promise<IDBDatabase> {
	let dbPromise: Promise<IDBDatabase> | null = null;
	return () =>
		(dbPromise ??= open().then((conn) => {
			conn.addEventListener('versionchange', () => {
				conn.close();
				dbPromise = null;
			});
			return conn;
		}));
}

/** Storage the drain loop needs. The IndexedDB one below is the only real one. */
export type OutboxStore = {
	list(userId: string): Promise<OutboxItem[]>;
	get(id: string): Promise<OutboxItem | undefined>;
	put(item: OutboxItem): Promise<void>;
	remove(ids: string[]): Promise<void>;
};

export function createIdbOutboxStore(open: () => Promise<IDBDatabase>): OutboxStore {
	const db = connection(open);

	return {
		async list(userId) {
			const tx = (await db()).transaction(OUTBOX, 'readonly');
			const rows = await request(tx.objectStore(OUTBOX).index('userId').getAll(userId));
			return rows as OutboxItem[];
		},
		async get(id) {
			const tx = (await db()).transaction(OUTBOX, 'readonly');
			return (await request(tx.objectStore(OUTBOX).get(id))) as OutboxItem | undefined;
		},
		async put(item) {
			const tx = (await db()).transaction(OUTBOX, 'readwrite');
			tx.objectStore(OUTBOX).put(item);
			await done(tx);
		},
		async remove(ids) {
			if (ids.length === 0) return;
			const tx = (await db()).transaction(OUTBOX, 'readwrite');
			const store = tx.objectStore(OUTBOX);
			for (const id of ids) store.delete(id);
			await done(tx);
		}
	};
}

/**
 * Deletes the whole offline database. Sign-out calls this so no customer data
 * stays on the device. Resolves even if another tab holds it open: the delete
 * then completes when that tab closes or reloads.
 */
export function deleteOfflineDb(factory: IDBFactory = indexedDB): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = factory.deleteDatabase(OFFLINE_DB_NAME);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
		req.onblocked = () => resolve();
	});
}
