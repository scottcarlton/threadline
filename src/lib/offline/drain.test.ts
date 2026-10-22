import { describe, expect, it, vi } from 'vitest';
import { drainOutbox } from './drain';
import { SYNCED_RETENTION_MS } from './machine';
import { item, memoryStore } from './test-helpers';
import type { OutboxItem, SendResult } from './types';

const ok = async (): Promise<SendResult> => ({ status: 'synced' });

describe('drainOutbox', () => {
	it('sends every runnable item oldest first and marks them synced', async () => {
		const store = memoryStore([item({ id: 'b', createdAt: 2 }), item({ id: 'a', createdAt: 1 })]);
		const sent: string[] = [];
		const outcome = await drainOutbox({
			store,
			userId: 'user-1',
			senders: { 'account.create': async (i) => (sent.push(i.id), { status: 'synced' }) },
			now: () => 100
		});
		expect(outcome).toBe('idle');
		expect(sent).toEqual(['a', 'b']);
		expect([...store.rows.values()].every((i) => i.status === 'synced')).toBe(true);
	});

	it('sends an order only after the account it depends on has synced', async () => {
		const store = memoryStore([
			item({ id: 'order', kind: 'order.create', dependsOn: ['acct'], createdAt: 0 }),
			item({ id: 'acct', kind: 'account.create', createdAt: 1 })
		]);
		const sent: string[] = [];
		const send = async (i: OutboxItem): Promise<SendResult> => {
			sent.push(i.id);
			return { status: 'synced' };
		};
		await drainOutbox({
			store,
			userId: 'user-1',
			senders: { 'account.create': send, 'order.create': send }
		});
		expect(sent).toEqual(['acct', 'order']);
	});

	it('holds a dependent back when its dependency fails', async () => {
		const store = memoryStore([
			item({ id: 'acct', createdAt: 0 }),
			item({ id: 'order', kind: 'order.create', dependsOn: ['acct'], createdAt: 1 })
		]);
		const orderSend = vi.fn(ok);
		await drainOutbox({
			store,
			userId: 'user-1',
			senders: {
				'account.create': async () => ({ status: 'failed', error: 'Business name is required' }),
				'order.create': orderSend
			}
		});
		expect(orderSend).not.toHaveBeenCalled();
		expect(store.rows.get('acct')).toMatchObject({ status: 'failed' });
		expect(store.rows.get('order')).toMatchObject({ status: 'pending' });
	});

	it('stops at the first network error so the rest wait for the connection', async () => {
		const store = memoryStore([item({ id: 'a', createdAt: 0 }), item({ id: 'b', createdAt: 1 })]);
		const send = vi.fn(async (): Promise<SendResult> => ({ status: 'retry', error: 'offline' }));
		const outcome = await drainOutbox({
			store,
			userId: 'user-1',
			senders: { 'account.create': send },
			now: () => 1_000,
			random: () => 0.5
		});
		expect(outcome).toBe('stalled');
		expect(send).toHaveBeenCalledTimes(1);
		expect(store.rows.get('a')).toMatchObject({ status: 'pending', attempts: 1 });
		expect(store.rows.get('a')!.nextAttemptAt).toBeGreaterThan(1_000);
		expect(store.rows.get('b')).toMatchObject({ status: 'pending', attempts: 0 });
	});

	it('treats a thrown sender as a retryable network error', async () => {
		const store = memoryStore([item({ id: 'a' })]);
		const outcome = await drainOutbox({
			store,
			userId: 'user-1',
			senders: {
				'account.create': async () => {
					throw new TypeError('Failed to fetch');
				}
			}
		});
		expect(outcome).toBe('stalled');
		expect(store.rows.get('a')).toMatchObject({ status: 'pending', lastError: 'Failed to fetch' });
	});

	it('pauses on a lost session without spending an attempt', async () => {
		const store = memoryStore([item({ id: 'a' }), item({ id: 'b', createdAt: 1 })]);
		const outcome = await drainOutbox({
			store,
			userId: 'user-1',
			senders: { 'account.create': async () => ({ status: 'auth', error: 'Sign in again' }) }
		});
		expect(outcome).toBe('paused_auth');
		expect(store.rows.get('a')).toMatchObject({ status: 'pending', attempts: 0 });
	});

	it('only touches the signed-in user', async () => {
		const store = memoryStore([item({ id: 'mine' }), item({ id: 'theirs', userId: 'user-2' })]);
		const sent: string[] = [];
		await drainOutbox({
			store,
			userId: 'user-1',
			senders: { 'account.create': async (i) => (sent.push(i.id), { status: 'synced' }) }
		});
		expect(sent).toEqual(['mine']);
		expect(store.rows.get('theirs')).toMatchObject({ status: 'pending' });
	});

	it('keeps items of a kind this build cannot send yet', async () => {
		const store = memoryStore([
			item({ id: 'order', kind: 'order.create', createdAt: 0 }),
			item({ id: 'acct', createdAt: 1 })
		]);
		await drainOutbox({ store, userId: 'user-1', senders: { 'account.create': ok } });
		expect(store.rows.get('order')).toMatchObject({ status: 'pending' });
		expect(store.rows.get('acct')).toMatchObject({ status: 'synced' });
	});

	it('resends an item a previous drain left mid-send', async () => {
		const store = memoryStore([item({ id: 'a', status: 'syncing' })]);
		const send = vi.fn(ok);
		await drainOutbox({ store, userId: 'user-1', senders: { 'account.create': send } });
		expect(send).toHaveBeenCalledTimes(1);
		expect(store.rows.get('a')).toMatchObject({ status: 'synced' });
	});

	it('prunes synced items past the retention window', async () => {
		const store = memoryStore([
			item({ id: 'old', status: 'synced', updatedAt: 0 }),
			item({ id: 'fresh', status: 'synced', updatedAt: SYNCED_RETENTION_MS })
		]);
		await drainOutbox({
			store,
			userId: 'user-1',
			senders: {},
			now: () => SYNCED_RETENTION_MS + 10
		});
		expect(store.rows.has('old')).toBe(false);
		expect(store.rows.has('fresh')).toBe(true);
	});

	it('does not send an item before its backoff ends', async () => {
		const store = memoryStore([item({ id: 'a', nextAttemptAt: 5_000 })]);
		const send = vi.fn(ok);
		await drainOutbox({
			store,
			userId: 'user-1',
			senders: { 'account.create': send },
			now: () => 1_000
		});
		expect(send).not.toHaveBeenCalled();
	});
});
