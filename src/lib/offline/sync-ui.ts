import { get, writable, type Readable } from 'svelte/store';

/** Whether the sync panel is open. The banner and the navbar count open it. */
export const syncPanelOpen = writable(false);

export type SignOutRequest = { count: number; answer: (proceed: boolean) => void };

/** Set while the sign-out warning is showing. SignOutWarning renders it. */
export const signOutRequest = writable<SignOutRequest | null>(null);

/**
 * Resolves true when sign-out may go ahead. Sign-out deletes the outbox, so
 * with unsynced items the rep confirms first; otherwise this resolves at once.
 */
export function confirmSignOut(unsynced: Readable<number>): Promise<boolean> {
	const count = get(unsynced);
	if (count === 0) return Promise.resolve(true);
	return new Promise((resolve) => {
		signOutRequest.set({
			count,
			answer: (proceed) => {
				signOutRequest.set(null);
				resolve(proceed);
			}
		});
	});
}
