/**
 * Binds the accepting identity for a pending invitation (org or buyer) to
 * the caller's own session, rather than trusting whatever profile_id the
 * request body names. Shared by all four accept routes:
 *   - src/routes/api/invite/accept/+server.ts (org, OTP client, POST)
 *   - src/routes/invite/[token]/accept/+server.ts (org, OAuth client, GET)
 *   - src/routes/api/buyer-invite/accept/+server.ts (buyer, OTP client, POST)
 *   - src/routes/buyer-invite/[token]/accept/+server.ts (buyer, OAuth, GET)
 * The GET routes derive identity from the session alone and have no request
 * body, so they call this with `bodyUserId: undefined`.
 */

export type SessionUser = {
	id: string;
	email?: string | null;
};

export type AuthorizeAcceptResult =
	| { ok: true; profileId: string }
	| { ok: false; status: number; error: string };

/**
 * `bodyUserId` is optional/legacy: the current client always sends it, so we
 * still accept it, but only as a value that must agree with the session.
 * A mismatch is rejected outright rather than silently overridden, so a
 * forged body is visible as an error instead of quietly succeeding with the
 * session's own id.
 */
export function resolveAcceptingProfileId(
	sessionUser: SessionUser | null,
	bodyUserId: string | undefined,
	invitationEmail: string
): AuthorizeAcceptResult {
	if (!sessionUser) {
		return { ok: false, status: 401, error: 'Authentication required' };
	}

	if (bodyUserId && bodyUserId !== sessionUser.id) {
		return { ok: false, status: 403, error: 'Invitation must be accepted by the signed-in user' };
	}

	const sessionEmail = sessionUser.email?.toLowerCase();
	if (!sessionEmail || sessionEmail !== invitationEmail.toLowerCase()) {
		return { ok: false, status: 403, error: 'Invitation email does not match the signed-in user' };
	}

	return { ok: true, profileId: sessionUser.id };
}
