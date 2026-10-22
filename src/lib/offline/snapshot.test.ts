import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { IDBFactory } from 'fake-indexeddb';
import { createIdbOutboxStore, openOfflineDb } from './db';
import {
	SNAPSHOT_STALE_MS,
	createIdbSnapshotStore,
	createSnapshotSync,
	fetchSnapshot,
	snapshotKey,
	type OrderSnapshot,
	type SnapshotStore
} from './snapshot';
import { item } from './test-helpers';

function memorySnapshots(initial: OrderSnapshot[] = []): SnapshotStore & {
	rows: Map<string, OrderSnapshot>;
} {
	const rows = new Map(initial.map((s) => [s.key, s]));
	return {
		rows,
		async get(key) {
			return rows.get(key);
		},
		async put(s) {
			rows.set(s.key, s);
		}
	};
}

function snap(over: Partial<OrderSnapshot> = {}): OrderSnapshot {
	return {
		key: snapshotKey('user-1', 'org-1'),
		userId: 'user-1',
		orgId: 'org-1',
		fetchedAt: 0,
		prereqs: { accounts: [] } as unknown as OrderSnapshot['prereqs'],
		products: [],
		...over
	};
}

const serverReply = (body: object, status = 200) =>
	vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('fetchSnapshot', () => {
	it('stores what the server returns under the user and org', async () => {
		const store = memorySnapshots();
		const fetchFn = serverReply({ orgId: 'org-1', fetchedAt: 5, prereqs: {}, products: [] });
		const out = await fetchSnapshot('user-1', 'org-1', store, fetchFn);
		expect(out).toMatchObject({ key: 'user-1:org-1', fetchedAt: 5 });
		expect(store.rows.get('user-1:org-1')?.fetchedAt).toBe(5);
	});

	it('keeps the stored copy when offline or refused', async () => {
		const store = memorySnapshots([snap({ fetchedAt: 1 })]);
		const offline = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		expect(await fetchSnapshot('user-1', 'org-1', store, offline)).toBeNull();
		expect(await fetchSnapshot('user-1', 'org-1', store, serverReply({}, 403))).toBeNull();
		expect(store.rows.get('user-1:org-1')?.fetchedAt).toBe(1);
	});

	it('never files one org under another', async () => {
		const store = memorySnapshots();
		const fetchFn = serverReply({ orgId: 'org-2', fetchedAt: 5, prereqs: {}, products: [] });
		expect(await fetchSnapshot('user-1', 'org-1', store, fetchFn)).toBeNull();
		expect(store.rows.size).toBe(0);
	});
});

describe('createSnapshotSync', () => {
	function setup(opts: { online?: boolean; stored?: OrderSnapshot[]; now?: number } = {}) {
		let online = opts.online ?? true;
		const store = memorySnapshots(opts.stored);
		const events = new EventTarget();
		const fetchFn = serverReply({ orgId: 'org-1', fetchedAt: 100, prereqs: {}, products: [] });
		const sync = createSnapshotSync({
			store,
			fetchFn,
			now: () => opts.now ?? 0,
			isOnline: () => online,
			events,
			doc: null,
			setInterval: () => 1,
			clearInterval: () => {}
		});
		return {
			sync,
			store,
			fetchFn,
			goOnline: () => {
				online = true;
				events.dispatchEvent(new Event('online'));
			}
		};
	}

	it('serves the stored copy offline and refreshes nothing', async () => {
		const { sync, fetchFn } = setup({ online: false, stored: [snap({ fetchedAt: 1 })] });
		await sync.start('user-1', 'org-1');
		expect(get(sync.current)?.fetchedAt).toBe(1);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('refreshes on start when online', async () => {
		const { sync } = setup({ stored: [snap({ fetchedAt: 1 })] });
		await sync.start('user-1', 'org-1');
		expect(get(sync.current)?.fetchedAt).toBe(100);
	});

	it('refreshes a stale copy when the connection returns', async () => {
		const { sync, fetchFn, goOnline } = setup({
			online: false,
			stored: [snap({ fetchedAt: 0 })],
			now: SNAPSHOT_STALE_MS + 1
		});
		await sync.start('user-1', 'org-1');
		goOnline();
		await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
	});

	it('does not show another user or org a copy', async () => {
		const { sync } = setup({
			online: false,
			stored: [snap({ key: 'user-2:org-1', userId: 'user-2' })]
		});
		await sync.start('user-1', 'org-1');
		expect(get(sync.current)).toBeNull();
	});

	it('clears on stop', async () => {
		const { sync } = setup({ online: false, stored: [snap()] });
		await sync.start('user-1', 'org-1');
		sync.stop();
		expect(get(sync.current)).toBeNull();
	});
});

describe('IndexedDB snapshot store', () => {
	it('round-trips a snapshot', async () => {
		const factory = new IDBFactory();
		const store = createIdbSnapshotStore(() => openOfflineDb(factory));
		await store.put(snap({ fetchedAt: 9 }));
		expect((await store.get('user-1:org-1'))?.fetchedAt).toBe(9);
	});

	it('upgrades a v1 device without losing queued work', async () => {
		const factory = new IDBFactory();
		// A device still on the v1 schema, with an item in the outbox.
		await new Promise<void>((resolve, reject) => {
			const req = factory.open('threadline-offline', 1);
			req.onupgradeneeded = () => {
				const s = req.result.createObjectStore('outbox', { keyPath: 'id' });
				s.createIndex('userId', 'userId', { unique: false });
				s.put(item({ id: 'queued' }));
			};
			req.onsuccess = () => {
				req.result.close();
				resolve();
			};
			req.onerror = () => reject(req.error);
		});
		const outbox = createIdbOutboxStore(() => openOfflineDb(factory));
		expect((await outbox.list('user-1')).map((i) => i.id)).toEqual(['queued']);
		const snapshots = createIdbSnapshotStore(() => openOfflineDb(factory));
		await snapshots.put(snap());
		expect(await snapshots.get('user-1:org-1')).toBeDefined();
	});
});
