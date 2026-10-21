import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createIdbOutboxStore, deleteOfflineDb, openOfflineDb } from './db';
import { item } from './test-helpers';

function freshStore() {
	const factory = new IDBFactory();
	return { factory, store: createIdbOutboxStore(() => openOfflineDb(factory)) };
}

describe('IndexedDB outbox store', () => {
	it('round-trips items and lists only the given user', async () => {
		const { store } = freshStore();
		await store.put(item({ id: 'a', payload: { business_name: 'Shop' } }));
		await store.put(item({ id: 'b', userId: 'user-2' }));
		expect((await store.list('user-1')).map((i) => i.id)).toEqual(['a']);
		expect(await store.get('a')).toMatchObject({ payload: { business_name: 'Shop' } });
	});

	it('updates in place by id', async () => {
		const { store } = freshStore();
		await store.put(item({ id: 'a' }));
		await store.put(item({ id: 'a', status: 'synced' }));
		const rows = await store.list('user-1');
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe('synced');
	});

	it('removes by id', async () => {
		const { store } = freshStore();
		await store.put(item({ id: 'a' }));
		await store.put(item({ id: 'b' }));
		await store.remove(['a']);
		expect((await store.list('user-1')).map((i) => i.id)).toEqual(['b']);
	});

	it('survives reopening, as after a reload or app restart', async () => {
		const factory = new IDBFactory();
		const first = createIdbOutboxStore(() => openOfflineDb(factory));
		await first.put(item({ id: 'a' }));
		const second = createIdbOutboxStore(() => openOfflineDb(factory));
		expect((await second.list('user-1')).map((i) => i.id)).toEqual(['a']);
	});

	it('deletes everything on sign-out', async () => {
		const factory = new IDBFactory();
		const store = createIdbOutboxStore(() => openOfflineDb(factory));
		await store.put(item({ id: 'a' }));
		// The store's connection is still open; it must step aside for the delete.
		await deleteOfflineDb(factory);
		expect(await store.list('user-1')).toEqual([]);
	});
});
