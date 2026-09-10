import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from '@sveltejs/kit';

function makeChain(response: { data: unknown; error: unknown }) {
	const chain: Record<string, unknown> = {};
	const passthrough = () => chain;
	chain.select = vi.fn(passthrough);
	chain.eq = vi.fn(passthrough);
	chain.is = vi.fn(passthrough);
	chain.update = vi.fn(passthrough);
	chain.insert = vi.fn(() => chain);
	chain.single = vi.fn(() => Promise.resolve(response));
	chain.then = (onResolve: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) =>
		Promise.resolve(response).then(onResolve, onReject);
	return chain;
}

const INVITE_EMAIL = 'invitee@example.com';
const ORG_ID = 'org-1';

function baseInvitation(over: Record<string, unknown> = {}) {
	return {
		id: 'invitation-1',
		token: 'tok-abc',
		organization_id: ORG_ID,
		email: INVITE_EMAIL,
		role: 'admin',
		commission_rate: null,
		manages_others: false,
		manager_id: null,
		invited_by: 'inviter-1',
		brand_ids: [],
		territory_ids: [],
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

const { GET } = await import('./+server.js');

function makeEvent(sessionUser: { id: string; email: string | null } | null, token = 'tok-abc') {
	return {
		params: { token },
		locals: {
			safeGetSession: async () => ({
				session: sessionUser ? { user: sessionUser } : null,
				user: sessionUser
			}),
			audit: { record: vi.fn() }
		}
	} as unknown as Parameters<typeof GET>[0];
}

function redirectLocation(err: unknown): string {
	return (err as { location?: string }).location ?? '';
}

beforeEach(() => {
	vi.clearAllMocks();
	tableResponses = {
		invitations: { data: baseInvitation(), error: null },
		organization_members: { data: { id: 'member-1' }, error: null }
	};
});

describe('GET /invite/[token]/accept (Google/OAuth path)', () => {
	it('rejects when the session email does not match the invitation email', async () => {
		// This is the route the "Continue with Google" button targets, which
		// never runs the OTP email-verification step. Before the fix this
		// route bound profile_id to the session but never checked email, so
		// any authenticated Google account holding the token could join.
		try {
			await GET(makeEvent({ id: 'session-user', email: 'not-the-invitee@example.com' }));
			expect.unreachable('expected a redirect throw');
		} catch (err) {
			const location = redirectLocation(err);
			expect(location).toContain('/login');
			expect(location).toContain('error=invite_email_mismatch');
		}

		expect(fromMock).not.toHaveBeenCalledWith('organization_members');
	});

	it('accepts the legitimate path and creates membership for the session user', async () => {
		try {
			await GET(makeEvent({ id: 'session-user', email: INVITE_EMAIL }));
			expect.unreachable('expected a redirect throw');
		} catch (err) {
			expect(redirectLocation(err)).toBe('/insight');
		}

		const orgMembersChain = fromMock.mock.results.find(
			(_r, i) => fromMock.mock.calls[i][0] === 'organization_members'
		)?.value as { insert: ReturnType<typeof vi.fn> };
		expect(orgMembersChain.insert).toHaveBeenCalledWith(
			expect.objectContaining({ organization_id: ORG_ID, profile_id: 'session-user' })
		);
	});
});

// Sanity check that redirect() from SvelteKit actually throws an object
// shaped like { location }, so the assertions above are meaningful.
describe('redirect() shape (sanity)', () => {
	it('throws an object with a location property', () => {
		try {
			redirect(303, '/insight');
			expect.unreachable();
		} catch (err) {
			expect((err as { location?: string }).location).toBe('/insight');
		}
	});
});
