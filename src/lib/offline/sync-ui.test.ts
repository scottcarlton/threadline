import { describe, expect, it } from 'vitest';
import { get, writable } from 'svelte/store';
import { confirmSignOut, signOutRequest } from './sync-ui';

describe('confirmSignOut', () => {
	it('lets sign-out through when nothing is waiting', async () => {
		await expect(confirmSignOut(writable(0))).resolves.toBe(true);
		expect(get(signOutRequest)).toBeNull();
	});

	it('asks first when items would be lost, and honours the answer', async () => {
		const pending = confirmSignOut(writable(3));
		const request = get(signOutRequest);
		expect(request?.count).toBe(3);
		request!.answer(false);
		await expect(pending).resolves.toBe(false);
		expect(get(signOutRequest)).toBeNull();

		const again = confirmSignOut(writable(3));
		get(signOutRequest)!.answer(true);
		await expect(again).resolves.toBe(true);
	});
});
