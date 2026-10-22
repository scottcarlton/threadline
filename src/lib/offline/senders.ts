import type { Outbox } from './runtime';
import type { OutboxItem, SendResult } from './types';
import { classifyResponse } from './machine';

type AccountSyncBody = {
	accountId?: string;
	inserted?: boolean;
	inviteFailed?: boolean;
	message?: string;
};

/** POST one queued account to /api/sync/accounts (SCO-207). */
export async function sendAccount(
	item: OutboxItem,
	fetchFn: typeof fetch = fetch
): Promise<SendResult> {
	const res = await fetchFn('/api/sync/accounts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(item.payload)
	});
	let body: AccountSyncBody = {};
	try {
		body = (await res.json()) as AccountSyncBody;
	} catch {
		// A proxy or the platform answered with something other than our JSON.
	}
	const result = classifyResponse(res.status, body.message);
	if (result.status !== 'synced') return result;
	const stored = { accountId: body.accountId, inserted: body.inserted };
	if (body.inviteFailed) {
		return {
			status: 'needs_review',
			reason: "Account created. The buyer invite email didn't send.",
			result: stored
		};
	}
	return { status: 'synced', result: stored };
}

type OrderSyncBody = {
	orders?: Array<{ id: string; order_number: string; inserted: boolean }>;
	message?: string;
};

/** POST one queued order submission to /api/sync/orders (SCO-208). */
export async function sendOrder(
	item: OutboxItem,
	fetchFn: typeof fetch = fetch
): Promise<SendResult> {
	const res = await fetchFn('/api/sync/orders', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(item.payload)
	});
	let body: OrderSyncBody = {};
	try {
		body = (await res.json()) as OrderSyncBody;
	} catch {
		// A proxy or the platform answered with something other than our JSON.
	}
	const result = classifyResponse(res.status, body.message);
	if (result.status !== 'synced') return result;
	// The order numbers the server assigned replace the local "Pending sync"
	// reference in the sync panel.
	return { status: 'synced', result: { orders: body.orders ?? [] } };
}

/** Every kind this build can send. Called once the outbox has started. */
export function registerSenders(outbox: Outbox): void {
	outbox.registerSender('account.create', (item) => sendAccount(item));
	outbox.registerSender('order.create', (item) => sendOrder(item));
}
