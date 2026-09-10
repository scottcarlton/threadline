import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same chainable-mock pattern as src/routes/api/invite/accept/server.test.ts
// and src/lib/server/orders/authorize-order.test.ts.
function makeChain(response: { data: unknown; error: unknown }) {
	const chain: Record<string, unknown> = {};
	const passthrough = () => chain;
	chain.select = vi.fn(passthrough);
	chain.eq = vi.fn(passthrough);
	chain.is = vi.fn(passthrough);
	chain.update = vi.fn(passthrough);
	chain.insert = vi.fn(() => Promise.resolve(response));
	chain.single = vi.fn(() => Promise.resolve(response));
	chain.then = (onResolve: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) =>
		Promise.resolve(response).then(onResolve, onReject);
	return chain;
}

const INVITE_EMAIL = 'buyer@example.com';
const ACCOUNT_ID = 'account-1';
const INVITATION_ID = 'buyer-invitation-1';

function baseInvitation(over: Record<string, unknown> = {}) {
	return {
		id: INVITATION_ID,
		token: 'tok-abc',
		account_id: ACCOUNT_ID,
		organization_id: 'org-1',
		email: INVITE_EMAIL,
		role: 'buyer',
		invited_by: 'admin-1',
		accepted_at: null,
		expires_at: new Date(Date.now() + 86_400_000).toISOString(),
		organizations: { name: 'Acme Org' },
		...over
	};
}

let tableResponses: Record<string, { data: unknown; error: unknown }>;
const fromMock = vi.fn((table: string) => {
	const response = tableResponses[table] ?? { data: null, error: null };
	return makeChain(response);
});

vi.mock('$lib/server/supabase.js', () => ({
	supabaseAdmin: { from: (table: string) => fromMock(table) }
}));

const { POST } = await import('./+server.js');

function makeEvent({
	token = 'tok-abc',
	userId,
	sessionUser
}: {
	token?: string;
	userId?: string;
	sessionUser: { id: string; email: string | null } | null;
}) {
	const audit = { record: vi.fn() };
	return {
		request: { json: async () => ({ token, userId }) },
		locals: {
			safeGetSession: async () => ({
				session: sessionUser ? { user: sessionUser } : null,
				user: sessionUser
			}),
			audit
		}
	} as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
	vi.clearAllMocks();
	tableResponses = {
		buyer_invitations: { data: baseInvitation(), error: null },
		account_users: { data: null, error: null }
	};
});

describe('POST /api/buyer-invite/accept', () => {
	it('rejects with 401 when there is no session', async () => {
		const res = await POST(makeEvent({ userId: 'session-user', sessionUser: null }));

		expect(res.status).toBe(401);
		expect(fromMock).not.toHaveBeenCalledWith('account_users');
	});

	it('rejects when the body userId does not match the session user (leaked-token IDOR)', async () => {
		// This is the exact vulnerability from the ticket: a caller holding a
		// valid pending buyer-invite token names a different profile_id,
		// trying to grant that profile buyer access to the account instead
		// of their own.
		const res = await POST(
			makeEvent({
				userId: 'victim-profile-id',
				sessionUser: { id: 'attacker-session', email: INVITE_EMAIL }
			})
		);

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toBe('Invitation must be accepted by the signed-in user');
		expect(fromMock).not.toHaveBeenCalledWith('account_users');
	});

	it('rejects when the session email does not match the invitation email', async () => {
		const res = await POST(
			makeEvent({
				userId: 'session-user',
				sessionUser: { id: 'session-user', email: 'not-the-invitee@example.com' }
			})
		);

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toBe('Invitation email does not match the signed-in user');
		expect(fromMock).not.toHaveBeenCalledWith('account_users');
	});

	it('accepts the legitimate path and creates buyer access for the session user', async () => {
		const res = await POST(
			makeEvent({
				userId: 'session-user',
				sessionUser: { id: 'session-user', email: INVITE_EMAIL }
			})
		);

		expect(res.status).toBe(200);

		const accountUsersChain = fromMock.mock.results.find(
			(_r, i) => fromMock.mock.calls[i][0] === 'account_users'
		)?.value as { insert: ReturnType<typeof vi.fn> };
		expect(accountUsersChain.insert).toHaveBeenCalledWith(
			expect.objectContaining({ account_id: ACCOUNT_ID, profile_id: 'session-user' })
		);
	});
});
