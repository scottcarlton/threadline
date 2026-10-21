import { describe, expect, it } from 'vitest';
import { bannerFor, type BannerInput } from './banner';
import { item } from './test-helpers';

const input = (over: Partial<BannerInput> = {}): BannerInput => ({
	online: true,
	items: [],
	state: 'idle',
	canQueue: false,
	justSynced: false,
	...over
});

describe('bannerFor', () => {
	it('shows nothing when online with an empty queue', () => {
		expect(bannerFor(input())).toBeNull();
	});

	it('never promises a sync offline when nothing can queue yet', () => {
		const banner = bannerFor(input({ online: false }));
		expect(banner?.text).toBe("You're offline. Changes won't save until you reconnect.");
		expect(banner?.text).not.toMatch(/sync/);
	});

	it('says new work saves on the device once a form can queue', () => {
		expect(bannerFor(input({ online: false, canQueue: true }))?.text).toBe(
			"You're offline. New accounts and orders save on this device and sync when you reconnect."
		);
	});

	it('counts what is waiting while offline and offers review', () => {
		const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c', status: 'synced' })];
		expect(bannerFor(input({ online: false, items }))).toEqual({
			text: "You're offline. 2 items saved on this device will sync when you reconnect.",
			review: true
		});
	});

	it('never counts a failed item as one that will sync', () => {
		expect(
			bannerFor(input({ online: false, items: [item({ id: 'a', status: 'failed' })] }))?.text
		).toBe("You're offline. 1 item couldn't sync.");
		expect(
			bannerFor(
				input({
					online: false,
					items: [item({ id: 'a' }), item({ id: 'b', status: 'failed' })]
				})
			)?.text
		).toBe(
			"You're offline. 1 item saved on this device will sync when you reconnect. 1 item couldn't sync."
		);
	});

	it('uses the singular for one item', () => {
		expect(bannerFor(input({ online: false, items: [item({ id: 'a' })] }))?.text).toContain(
			'1 item saved'
		);
	});

	it('puts failures ahead of everything else once online', () => {
		const items = [
			item({ id: 'a', status: 'failed' }),
			item({ id: 'b', status: 'needs_review' }),
			item({ id: 'c' })
		];
		expect(bannerFor(input({ items, state: 'syncing' }))).toEqual({
			text: "2 items couldn't sync.",
			review: true
		});
	});

	it('asks for sign-in when the session lapsed', () => {
		expect(bannerFor(input({ items: [item({ id: 'a' })], state: 'paused_auth' }))?.text).toBe(
			'Sign in to sync 1 item.'
		);
	});

	it('shows progress while syncing', () => {
		expect(
			bannerFor(
				input({
					items: [item({ id: 'a' }), item({ id: 'b', status: 'syncing' })],
					state: 'syncing'
				})
			)
		).toEqual({ text: 'Syncing 2 items.', review: false });
	});

	it('notes items still waiting between retries', () => {
		expect(bannerFor(input({ items: [item({ id: 'a' })], state: 'stalled' }))?.text).toBe(
			'1 item waiting to sync.'
		);
	});

	it('confirms briefly when everything landed', () => {
		expect(bannerFor(input({ justSynced: true }))?.text).toBe('Everything synced.');
		expect(
			bannerFor(input({ justSynced: true, items: [item({ id: 'a', status: 'synced' })] }))?.text
		).toBe('Everything synced.');
	});
});
