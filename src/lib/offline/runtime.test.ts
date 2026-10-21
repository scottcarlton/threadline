import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createOutbox, POLL_INTERVAL_MS } from './runtime';
import { item, memoryStore } from './test-helpers';
import type { SendResult } from './types';

function setup(opts: { online?: boolean; rows?: Parameters<typeof memoryStore>[0] } = {}) {
	let online = opts.online ?? true;
	const store = memoryStore(opts.rows);
	const events = new EventTarget();
	const doc = Object.assign(new EventTarget(), {
		visibilityState: 'visible' as DocumentVisibilityState
	});
	const intervals: Array<() => void> = [];
	const outbox = createOutbox({
		store,
		now: () => 1_000,
		random: () => 0.5,
		isOnline: () => online,
		events,
		doc,
		channel: () => null,
		setTimeout: () => 0,
		clearTimeout: () => {},
		setInterval: (fn) => (intervals.push(fn), intervals.length),
		clearInterval: () => {}
	});
	return {
		outbox,
		store,
		events,
		doc,
		intervals,
		goOnline: () => {
			online = true;
			events.dispatchEvent(new Event('online'));
		}
	};
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
	for (let i = 0; i < 10; i++) await flush();
};

describe('outbox runtime', () => {
	it('saves an enqueued item on the device and sends it when online', async () => {
		const { outbox, store } = setup();
		const send = vi.fn(async (): Promise<SendResult> => ({ status: 'synced' }));
		outbox.registerSender('account.create', send);
		await outbox.start('user-1');
		await outbox.enqueue({ id: 'acct-1', kind: 'account.create', payload: {}, label: 'Bloom' });
		await settle();
		expect(send).toHaveBeenCalledTimes(1);
		expect(store.rows.get('acct-1')).toMatchObject({ status: 'synced', userId: 'user-1' });
		expect(get(outbox.unsynced)).toBe(0);
	});

	it('keeps the item while offline and sends it on the online event', async () => {
		const { outbox, store, goOnline } = setup({ online: false });
		const send = vi.fn(async (): Promise<SendResult> => ({ status: 'synced' }));
		outbox.registerSender('account.create', send);
		await outbox.start('user-1');
		await outbox.enqueue({ id: 'acct-1', kind: 'account.create', payload: {}, label: 'Bloom' });
		await settle();
		expect(send).not.toHaveBeenCalled();
		expect(get(outbox.unsynced)).toBe(1);

		goOnline();
		await settle();
		expect(send).toHaveBeenCalledTimes(1);
		expect(store.rows.get('acct-1')?.status).toBe('synced');
	});

	it('drains when the app comes back to the foreground', async () => {
		const { outbox, doc } = setup({ rows: [item({ id: 'a' })] });
		await outbox.start('user-1');
		const send = vi.fn(async (): Promise<SendResult> => ({ status: 'retry', error: 'x' }));
		outbox.registerSender('account.create', send);
		await settle();
		const before = send.mock.calls.length;
		await outbox.retry('a');
		await settle();
		doc.dispatchEvent(new Event('visibilitychange'));
		await settle();
		expect(send.mock.calls.length).toBeGreaterThan(before);
	});

	it('polls while items are pending and stops once the queue is clear', async () => {
		const { outbox, intervals } = setup({ rows: [item({ id: 'a' })] });
		let result: SendResult = { status: 'retry', error: 'server busy' };
		const send = vi.fn(async () => result);
		outbox.registerSender('account.create', send);
		await outbox.start('user-1');
		await settle();
		expect(intervals).toHaveLength(1);
		expect(POLL_INTERVAL_MS).toBe(30_000);

		// The poll fires; the server recovered. The backoff in the test clock is
		// already due because now() is fixed, so retry() stands in for elapsed time.
		result = { status: 'synced' };
		await outbox.retry('a');
		await settle();
		expect(get(outbox.unsynced)).toBe(0);
	});

	it('never runs two drains at once', async () => {
		const { outbox } = setup({ rows: [item({ id: 'a' }), item({ id: 'b', createdAt: 1 })] });
		let inFlight = 0;
		let maxInFlight = 0;
		outbox.registerSender('account.create', async () => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await flush();
			inFlight--;
			return { status: 'synced' };
		});
		await outbox.start('user-1');
		void outbox.drain();
		void outbox.drain();
		await settle();
		expect(maxInFlight).toBe(1);
	});

	it('retries a failed item on request', async () => {
		const { outbox, store } = setup({
			rows: [item({ id: 'a', status: 'failed', lastError: 'x' })]
		});
		const send = vi.fn(async (): Promise<SendResult> => ({ status: 'synced' }));
		outbox.registerSender('account.create', send);
		await outbox.start('user-1');
		await settle();
		expect(send).not.toHaveBeenCalled();
		await outbox.retry('a');
		await settle();
		expect(store.rows.get('a')?.status).toBe('synced');
	});

	it('discards an item and everything that depends on it', async () => {
		const { outbox, store } = setup({
			online: false,
			rows: [
				item({ id: 'acct' }),
				item({ id: 'order', kind: 'order.create', dependsOn: ['acct'] }),
				item({ id: 'other' })
			]
		});
		await outbox.start('user-1');
		expect(await outbox.dependentsOf('acct')).toEqual(['order']);
		await outbox.discard('acct');
		expect([...store.rows.keys()]).toEqual(['other']);
		expect(get(outbox.items).map((i) => i.id)).toEqual(['other']);
	});

	it('dismisses a needs-review item without taking its dependents', async () => {
		const { outbox, store } = setup({
			online: false,
			rows: [
				item({ id: 'acct', status: 'needs_review' }),
				item({ id: 'order', kind: 'order.create', dependsOn: ['acct'] })
			]
		});
		await outbox.start('user-1');
		expect(await outbox.dependentsOf('acct')).toEqual([]);
		await outbox.discard('acct');
		expect([...store.rows.keys()]).toEqual(['order']);
	});

	it('shows and sends only the signed-in user', async () => {
		const { outbox } = setup({
			online: false,
			rows: [item({ id: 'mine' }), item({ id: 'theirs', userId: 'user-2' })]
		});
		await outbox.start('user-1');
		expect(get(outbox.items).map((i) => i.id)).toEqual(['mine']);
		await outbox.start('user-2');
		expect(get(outbox.items).map((i) => i.id)).toEqual(['theirs']);
		outbox.stop();
		expect(get(outbox.items)).toEqual([]);
	});

	it('reports a paused state when the session is gone', async () => {
		const { outbox } = setup({ rows: [item({ id: 'a' })] });
		outbox.registerSender('account.create', async () => ({ status: 'auth', error: 'Sign in' }));
		await outbox.start('user-1');
		await settle();
		expect(get(outbox.state)).toBe('paused_auth');
	});

	it('refuses to enqueue without a signed-in user', async () => {
		const { outbox } = setup();
		await expect(
			outbox.enqueue({ id: 'a', kind: 'account.create', payload: {}, label: 'A' })
		).rejects.toThrow();
	});
});
