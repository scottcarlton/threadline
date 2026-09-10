import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from '@sveltejs/kit';

function makeChain(response: { data: unknown; error: unknown }) {
	const chain: Record<string, unknown> = {};
	const passthrough = () => chain;
	chain.select = vi.fn(passthrough);
	chain.eq = vi.fn(passthrough);
	chain.is = vi.fn(passthrough);
	chain.neq = vi.fn(passthrough);
	chain.ilike = vi.fn(passthrough);
	chain.update = vi.fn(passthrough);
	chain.upsert = vi.fn(() => Promise.resolve(response));
	chain.single = vi.fn(() => Promise.resolve(response));
	chain.maybeSingle = vi.fn(() => Promise.resolve(response));
	chain.then = (onResolve: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) =>
		Promise.resolve(response).then(onResolve, onReject);
	return chain;
}

const INVITE_EMAIL = 'buyer@example.com';

function primaryInvitation(over: Record<string, unknown> = {}) {
	return {
		id: 'invite-primary',
		token: 'tok-primary',
		account_id: 'account-1',
		invited_by: 'admin-1',
		role: 'buyer',
		email: INVITE_EMAIL,
		accepted_at: null,
		expires_at: new Date(Date.now() + 86_400_000).toISOString(),
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

const { GET } = await import('./+server.js');

function makeEvent(sessionEmail: string | null, token = 'tok-primary') {
	return {
		params: { token },
		locals: {
			safeGetSession: async () => ({
				session: sessionEmail ? { user: { id: 'session-user', email: sessionEmail } } : null,
				user: sessionEmail ? { id: 'session-user', email: sessionEmail } : null
			})
		}
	} as unknown as Parameters<typeof GET>[0];
}

function redirectLocation(err: unknown): string {
	// @sveltejs/kit redirect() throws a Redirect object with a `location`.
	return (err as { location?: string }).location ?? '';
}

beforeEach(() => {
	vi.clearAllMocks();
	tableResponses = {
		buyer_invitations: { data: primaryInvitation(), error: null },
		account_users: { data: null, error: null }
	};
});

describe('GET /buyer-invite/[token]/accept', () => {
	it('rejects when the session email does not match the invitation email', async () => {
		try {
			await GET(makeEvent('someone-else@example.com'));
			expect.unreachable('expected a redirect throw');
		} catch (err) {
			expect(redirectLocation(err)).toContain('/login');
			expect(redirectLocation(err)).toContain('error=');
		}

		const upsertCalled = fromMock.mock.results.some((r) => {
			const chain = r.value as { upsert: ReturnType<typeof vi.fn> };
			return chain.upsert.mock.calls.length > 0;
		});
		expect(upsertCalled).toBe(false);
	});

	it('accepts the legitimate path and merges sibling invitations for the same email', async () => {
		tableResponses.buyer_invitations = { data: primaryInvitation(), error: null };

		// The sibling lookup query is a separate `.from('buyer_invitations')`
		// call; since our mock keys purely by table name, both the primary
		// lookup and the sibling lookup would return the same canned response.
		// To exercise the merge behavior distinctly, override `from` for this
		// test to distinguish call order.
		let callCount = 0;
		fromMock.mockImplementation((table: string) => {
			if (table === 'buyer_invitations') {
				callCount += 1;
				if (callCount === 1) {
					// Primary invitation lookup (by token).
					return makeChain({ data: primaryInvitation(), error: null });
				}
				// Sibling lookup (by email, excluding primary id).
				return makeChain({
					data: [
						{
							id: 'invite-sibling',
							account_id: 'account-2',
							invited_by: 'admin-1',
							role: 'buyer',
							email: INVITE_EMAIL,
							expires_at: new Date(Date.now() + 86_400_000).toISOString()
						}
					],
					error: null
				});
			}
			return makeChain(tableResponses[table] ?? { data: null, error: null });
		});

		try {
			await GET(makeEvent(INVITE_EMAIL));
			expect.unreachable('expected a redirect throw');
		} catch (err) {
			expect(redirectLocation(err)).toBe('/dashboard');
		}

		const accountUsersCalls = fromMock.mock.calls.filter(([table]) => table === 'account_users');
		// One upsert per target: the primary invitation plus the merged sibling.
		expect(accountUsersCalls.length).toBe(2);
	});
});

// Sanity check that redirect() from SvelteKit actually throws an object
// shaped like { location }, so the assertions above are meaningful.
describe('redirect() shape (sanity)', () => {
	it('throws an object with a location property', () => {
		try {
			redirect(303, '/dashboard');
			expect.unreachable();
		} catch (err) {
			expect((err as { location?: string }).location).toBe('/dashboard');
		}
	});
});
