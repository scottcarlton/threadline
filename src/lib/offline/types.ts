/**
 * Offline outbox (SCO-206). Every offline-capable create goes through here:
 * the form enqueues an item, and the drain loop sends it when the device is
 * online. Spec: Notion "Offline Mode (MVP)", Proposed solution / outbox.
 */

/** What an item creates. Each kind registers a sender (SCO-207, SCO-208). */
export type OutboxKind = 'account.create' | 'order.create';

/**
 * pending      waiting to send (possibly backing off, or waiting on a dependency)
 * syncing      a send is in flight
 * synced       the server stored it (or replayed a stored copy)
 * failed       the server refused it (validation, permission); needs the rep
 * needs_review stored, but not as captured (price or terms drift, SCO-209)
 */
export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'needs_review';

export type OutboxItem<P = unknown> = {
	/** Client-generated UUID. Also the record id and the idempotency key. */
	id: string;
	/** Only this user's session may send or see the item. */
	userId: string;
	kind: OutboxKind;
	payload: P;
	/** Item ids that must sync first, e.g. an order on an offline-created account. */
	dependsOn: string[];
	status: OutboxStatus;
	/** Short human label for the sync view, e.g. the account or brand name. */
	label: string;
	attempts: number;
	lastError: string | null;
	/** Epoch ms. A pending item is not sent before this (backoff). */
	nextAttemptAt: number;
	createdAt: number;
	updatedAt: number;
	/** Whatever the sender returned on success, e.g. the order numbers. */
	result?: unknown;
};

/**
 * What a sender reports back for one item.
 *
 * synced        2xx; stored or replayed
 * needs_review  2xx, but the server changed something the rep should see
 * retry         network error, timeout, 429 or 5xx; try again later
 * failed        any other 4xx; retrying would get the same answer
 * auth          401; the session is gone. Keep the item and pause until sign-in
 */
export type SendResult =
	| { status: 'synced'; result?: unknown }
	| { status: 'needs_review'; reason: string; result?: unknown }
	| { status: 'retry'; error: string }
	| { status: 'failed'; error: string }
	| { status: 'auth'; error: string };

export type Sender<P = unknown> = (item: OutboxItem<P>) => Promise<SendResult>;

export type Senders = Partial<Record<OutboxKind, Sender>>;
