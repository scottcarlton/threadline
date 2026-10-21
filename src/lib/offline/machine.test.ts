import { describe, expect, it } from 'vitest';
import {
	BACKOFF_BASE_MS,
	BACKOFF_MAX_MS,
	SYNCED_RETENTION_MS,
	applySendResult,
	backoffDelay,
	classifyResponse,
	dependencyState,
	dependentsOf,
	isExpiredSynced,
	nextWakeAt,
	runnableItems,
	unsyncedCount
} from './machine';
import { item } from './test-helpers';

const noJitter = () => 0.5;

describe('backoffDelay', () => {
	it('doubles from the base up to the ceiling', () => {
		expect(backoffDelay(1, noJitter)).toBe(BACKOFF_BASE_MS);
		expect(backoffDelay(2, noJitter)).toBe(BACKOFF_BASE_MS * 2);
		expect(backoffDelay(4, noJitter)).toBe(BACKOFF_BASE_MS * 8);
		expect(backoffDelay(40, noJitter)).toBe(BACKOFF_MAX_MS);
	});

	it('jitters within plus or minus 20 percent', () => {
		expect(backoffDelay(1, () => 0)).toBe(BACKOFF_BASE_MS * 0.8);
		expect(backoffDelay(1, () => 1)).toBe(BACKOFF_BASE_MS * 1.2);
	});
});

describe('applySendResult', () => {
	const base = item({ id: 'a', status: 'syncing', attempts: 1 });

	it('marks a success synced and clears the error', () => {
		const next = applySendResult(
			{ ...base, lastError: 'old' },
			{ status: 'synced', result: 7 },
			10
		);
		expect(next).toMatchObject({ status: 'synced', lastError: null, result: 7, updatedAt: 10 });
	});

	it('keeps a needs-review reason for the rep', () => {
		expect(
			applySendResult(base, { status: 'needs_review', reason: 'Price changed' }, 10)
		).toMatchObject({ status: 'needs_review', lastError: 'Price changed' });
	});

	it('fails a 4xx straight away without scheduling a retry', () => {
		const next = applySendResult(base, { status: 'failed', error: 'Not allowed' }, 10);
		expect(next).toMatchObject({ status: 'failed', attempts: 2, lastError: 'Not allowed' });
	});

	it('backs off a retryable error and returns it to the queue', () => {
		const next = applySendResult(base, { status: 'retry', error: 'offline' }, 1_000, noJitter);
		expect(next).toMatchObject({ status: 'pending', attempts: 2 });
		expect(next.nextAttemptAt).toBe(1_000 + BACKOFF_BASE_MS * 2);
	});

	it('does not count a lost session as an attempt', () => {
		const next = applySendResult(base, { status: 'auth', error: 'Sign in' }, 10);
		expect(next).toMatchObject({ status: 'pending', attempts: 1, nextAttemptAt: 0 });
	});
});

describe('dependencies', () => {
	it('is ready when every dependency synced or was pruned', () => {
		const acct = item({ id: 'acct', status: 'synced' });
		const order = item({ id: 'order', dependsOn: ['acct', 'gone'] });
		expect(dependencyState(order, new Map([[acct.id, acct]]))).toBe('ready');
	});

	it('waits on a pending dependency and blocks on a failed one', () => {
		const order = item({ id: 'order', dependsOn: ['acct'] });
		expect(dependencyState(order, new Map([['acct', item({ id: 'acct' })]]))).toBe('waiting');
		expect(
			dependencyState(order, new Map([['acct', item({ id: 'acct', status: 'failed' })]]))
		).toBe('blocked');
	});

	it('lets a dependent through once its dependency reached the server for review', () => {
		const order = item({ id: 'order', dependsOn: ['acct'] });
		expect(
			dependencyState(order, new Map([['acct', item({ id: 'acct', status: 'needs_review' })]]))
		).toBe('ready');
	});

	it('finds every transitive dependent', () => {
		const rows = [
			item({ id: 'acct' }),
			item({ id: 'order', dependsOn: ['acct'] }),
			item({ id: 'later', dependsOn: ['order'] }),
			item({ id: 'other' })
		];
		expect(dependentsOf('acct', rows).sort()).toEqual(['later', 'order']);
	});
});

describe('runnableItems', () => {
	it('returns due pending items with ready dependencies, oldest first', () => {
		const rows = [
			item({ id: 'b', createdAt: 2 }),
			item({ id: 'a', createdAt: 1 }),
			item({ id: 'later', nextAttemptAt: 500 }),
			item({ id: 'done', status: 'synced' }),
			item({ id: 'bad', status: 'failed' }),
			item({ id: 'waits', dependsOn: ['b'], createdAt: 0 })
		];
		expect(runnableItems(rows, 100).map((i) => i.id)).toEqual(['a', 'b']);
	});
});

describe('nextWakeAt and counts', () => {
	it('finds the earliest future retry', () => {
		const rows = [
			item({ id: 'a', nextAttemptAt: 900 }),
			item({ id: 'b', nextAttemptAt: 300 }),
			item({ id: 'c', nextAttemptAt: 50 })
		];
		expect(nextWakeAt(rows, 100)).toBe(300);
		expect(nextWakeAt([], 100)).toBeNull();
	});

	it('counts everything not yet synced', () => {
		const rows = [
			item({ id: 'a' }),
			item({ id: 'b', status: 'failed' }),
			item({ id: 'c', status: 'synced' })
		];
		expect(unsyncedCount(rows)).toBe(2);
	});

	it('expires synced items after the retention window only', () => {
		expect(
			isExpiredSynced(item({ id: 'a', status: 'synced', updatedAt: 0 }), SYNCED_RETENTION_MS + 1)
		).toBe(true);
		expect(isExpiredSynced(item({ id: 'a', status: 'synced', updatedAt: 0 }), 1)).toBe(false);
		expect(
			isExpiredSynced(item({ id: 'a', status: 'failed', updatedAt: 0 }), SYNCED_RETENTION_MS + 1)
		).toBe(false);
	});
});

describe('classifyResponse', () => {
	it.each([
		[200, 'synced'],
		[201, 'synced'],
		[401, 'auth'],
		[408, 'retry'],
		[429, 'retry'],
		[500, 'retry'],
		[503, 'retry'],
		[400, 'failed'],
		[403, 'failed'],
		[409, 'failed']
	])('maps %i to %s', (status, expected) => {
		expect(classifyResponse(status, 'msg').status).toBe(expected);
	});

	it('falls back to the status when the server sent no message', () => {
		expect(classifyResponse(403)).toEqual({ status: 'failed', error: 'Server responded 403' });
	});
});
