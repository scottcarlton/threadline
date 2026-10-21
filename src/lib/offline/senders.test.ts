import { describe, expect, it, vi } from 'vitest';
import { sendAccount } from './senders';
import { item } from './test-helpers';

const respond = (status: number, body: unknown) =>
	vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('sendAccount', () => {
	const queued = item({ id: 'acct-1', payload: { organization_id: 'org', account: {} } });

	it('posts the payload to the sync endpoint', async () => {
		const fetchFn = respond(200, { accountId: 'acct-1', inserted: true, inviteFailed: false });
		const result = await sendAccount(queued, fetchFn);
		expect(result).toEqual({ status: 'synced', result: { accountId: 'acct-1', inserted: true } });
		const [url, init] = vi.mocked(fetchFn).mock.calls[0];
		expect(url).toBe('/api/sync/accounts');
		expect(JSON.parse(String(init?.body))).toEqual(queued.payload);
	});

	it('flags a failed buyer invite for review instead of failing the account', async () => {
		const result = await sendAccount(
			queued,
			respond(200, { accountId: 'acct-1', inserted: true, inviteFailed: true })
		);
		expect(result).toMatchObject({ status: 'needs_review' });
	});

	it.each([
		[400, 'failed'],
		[403, 'failed'],
		[409, 'failed'],
		[401, 'auth'],
		[500, 'retry'],
		[503, 'retry']
	])('maps %i to %s with the server message', async (status, expected) => {
		const result = await sendAccount(queued, respond(status, { message: 'Nope' }));
		expect(result.status).toBe(expected);
		if ('error' in result) expect(result.error).toBe('Nope');
	});

	it('copes with a non-JSON error page', async () => {
		const fetchFn = vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
		expect(await sendAccount(queued, fetchFn as unknown as typeof fetch)).toEqual({
			status: 'retry',
			error: 'Server responded 502'
		});
	});
});
