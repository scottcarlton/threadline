import { describe, it, expect, vi, beforeEach } from 'vitest';

// Generic chainable Supabase mock: every filter/select method returns the
// same chain, and the chain resolves to whatever response was queued for
// that table when awaited (directly, or via .single()/.maybeSingle()).
function makeChain(response: { data: unknown; error: unknown }) {
	const chain: Record<string, unknown> = {};
	const passthrough = () => chain;
	chain.select = vi.fn(passthrough);
	chain.eq = vi.fn(passthrough);
	chain.is = vi.fn(passthrough);
	chain.neq = vi.fn(passthrough);
	chain.ilike = vi.fn(passthrough);
	chain.update = vi.fn(passthrough);
	chain.insert = vi.fn(() => Promise.resolve(response));
	chain.single = vi.fn(() => Promise.resolve(response));
	chain.maybeSingle = vi.fn(() => Promise.resolve(response));
	chain.then = (onResolve: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) =>
		Promise.resolve(response).then(onResolve, onReject);
	return chain;
}

const INVITE_EMAIL = 'invitee@example.com';
const ORG_ID = 'org-1';
const INVITATION_ID = 'invitation-1';

function baseInvitation(over: Record<string, unknown> = {}) {
	return {
		id: INVITATION_ID,
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

const notifyOrgMembersMock = vi.fn();
vi.mock('$lib/server/notifications.js', () => ({
	notifyOrgMembers: (...args: unknown[]) => notifyOrgMembersMock(...args)
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
		invitations: { data: baseInvitation(), error: null },
		organization_members: { data: { id: 'member-1' }, error: null },
		profiles: { data: { display_name: 'Jane Invitee' }, error: null }
	};
});

describe('POST /api/invite/accept', () => {
	it('rejects with 401 when there is no session', async () => {
		const res = await POST(makeEvent({ userId: 'session-user', sessionUser: null }));

		expect(res.status).toBe(401);
		expect(fromMock).not.toHaveBeenCalledWith('organization_members');
	});

	it('rejects when the body userId does not match the session user (leaked-token IDOR)', async () => {
		const res = await POST(
			makeEvent({
				userId: 'victim-profile-id',
				sessionUser: { id: 'attacker-session', email: INVITE_EMAIL }
			})
		);

		expect(res.status).toBe(403);
		// Asserting the exact error string (not just the status) so this test
		// cannot pass for the wrong reason if the email guard fires instead of
		// the userId guard.
		const body = await res.json();
		expect(body.error).toBe('Invitation must be accepted by the signed-in user');
		expect(fromMock).not.toHaveBeenCalledWith('organization_members');
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
		expect(fromMock).not.toHaveBeenCalledWith('organization_members');
	});

	it('accepts the legitimate path and creates membership for the session user', async () => {
		const res = await POST(
			makeEvent({
				userId: 'session-user',
				sessionUser: { id: 'session-user', email: INVITE_EMAIL }
			})
		);

		expect(res.status).toBe(200);
		const insertChainTable = fromMock.mock.calls.find(
			([table]) => table === 'organization_members'
		);
		expect(insertChainTable).toBeTruthy();

		const orgMembersChain = fromMock.mock.results.find(
			(_r, i) => fromMock.mock.calls[i][0] === 'organization_members'
		)?.value as { insert: ReturnType<typeof vi.fn> };
		expect(orgMembersChain.insert).toHaveBeenCalledWith(
			expect.objectContaining({ organization_id: ORG_ID, profile_id: 'session-user' })
		);
	});
});
