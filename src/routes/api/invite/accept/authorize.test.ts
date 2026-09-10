import { describe, it, expect } from 'vitest';
import { resolveAcceptingProfileId } from './authorize.js';

const INVITE_EMAIL = 'invitee@example.com';

describe('resolveAcceptingProfileId', () => {
	it('rejects with 401 when there is no session', () => {
		const result = resolveAcceptingProfileId(null, 'attacker-id', INVITE_EMAIL);

		expect(result).toEqual({ ok: false, status: 401, error: 'Authentication required' });
	});

	it('rejects when the body userId does not match the session user', () => {
		const session = { id: 'session-user', email: INVITE_EMAIL };

		// An attacker with a valid pending invite token names a different
		// profile_id in the body, trying to grant that profile the
		// invitation's role instead of their own.
		const result = resolveAcceptingProfileId(session, 'victim-id', INVITE_EMAIL);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(403);
		}
	});

	it('rejects when the session email does not match the invitation email', () => {
		const session = { id: 'session-user', email: 'someone-else@example.com' };

		const result = resolveAcceptingProfileId(session, 'session-user', INVITE_EMAIL);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(403);
		}
	});

	it('rejects when the session has no email at all', () => {
		const session = { id: 'session-user', email: null };

		const result = resolveAcceptingProfileId(session, 'session-user', INVITE_EMAIL);

		expect(result.ok).toBe(false);
	});

	it('compares invitation email case-insensitively', () => {
		const session = { id: 'session-user', email: 'Invitee@Example.com' };

		const result = resolveAcceptingProfileId(session, 'session-user', INVITE_EMAIL);

		expect(result).toEqual({ ok: true, profileId: 'session-user' });
	});

	it('accepts the legitimate path: matching session, matching email, no body userId', () => {
		const session = { id: 'session-user', email: INVITE_EMAIL };

		// Client may omit userId entirely; the session is authoritative.
		const result = resolveAcceptingProfileId(session, undefined, INVITE_EMAIL);

		expect(result).toEqual({ ok: true, profileId: 'session-user' });
	});

	it('accepts the legitimate path when the client sends a matching userId', () => {
		const session = { id: 'session-user', email: INVITE_EMAIL };

		const result = resolveAcceptingProfileId(session, 'session-user', INVITE_EMAIL);

		expect(result).toEqual({ ok: true, profileId: 'session-user' });
	});
});
