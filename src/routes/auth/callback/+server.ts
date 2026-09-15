import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { isEmailWhitelisted, isBetaWhitelistEnabled } from '$lib/server/beta-whitelist';
import { landingPathForOrgType } from '$lib/server/landing';
import type { OrgType } from '$lib/types/database';
import { isSsoSession } from '$lib/server/auth';
import { isSystemAdminEmail } from '$lib/server/system-admin.js';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { supabase } = locals;
	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next');

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			// Beta whitelist gate — check after OAuth succeeds
			if (isBetaWhitelistEnabled()) {
				const {
					data: { user: whitelistUser }
				} = await supabase.auth.getUser();
				if (whitelistUser?.email) {
					const allowed = await isEmailWhitelisted(whitelistUser.email);
					if (!allowed) {
						// The credentials were good; the gate turned them away. Recorded
						// as a failed sign-in because that is what the person
						// experienced, and it is the row support needs when someone
						// says they cannot get in.
						locals.audit.setActor({
							id: whitelistUser.id,
							email: whitelistUser.email,
							label: null,
							kind: 'user'
						});
						locals.audit.record('auth.sign_in_failed', {
							subjectId: whitelistUser.id,
							subjectLabel: whitelistUser.email,
							status: 'failure',
							errorCode: 'beta_not_whitelisted'
						});
						await supabase.auth.signOut();
						throw redirect(303, '/login?error=beta_not_whitelisted');
					}
				}
			}

			// Resolved before the `next` short-circuit so a deep-linked sign-in is
			// recorded too. This route is public, so the auth hook never set an
			// actor on the recorder, and the exchange above only just happened:
			// the actor has to be named here or the row lands anonymous.
			const {
				data: { user }
			} = await supabase.auth.getUser();

			if (user) {
				locals.audit.setActor({
					id: user.id,
					email: user.email ?? null,
					label: null,
					kind: isSystemAdminEmail(user.email) ? 'system_admin' : 'user'
				});
				locals.audit.record('auth.signed_in', {
					subjectId: user.id,
					subjectLabel: user.email ?? user.id,
					metadata: {
						provider: user.app_metadata?.provider ?? null,
						sso: isSsoSession(user)
					}
				});
			}

			if (next && next.startsWith('/') && !next.startsWith('//')) {
				throw redirect(303, next);
			}

			if (user) {
				const { data: membership } = await supabase
					.from('organization_members')
					.select('organizations(org_type)')
					.eq('profile_id', user.id)
					.limit(1)
					.maybeSingle();

				if (membership) {
					// Retailer-org members are buyers → /dashboard; rep/brand → /insight.
					const orgRel = (
						membership as {
							organizations?: { org_type?: string } | { org_type?: string }[] | null;
						}
					).organizations;
					const orgType = Array.isArray(orgRel) ? orgRel[0]?.org_type : orgRel?.org_type;
					throw redirect(303, landingPathForOrgType((orgType as OrgType) ?? 'rep'));
				}

				const { data: buyerAccess } = await supabase
					.from('account_users')
					.select('id')
					.eq('profile_id', user.id)
					.limit(1)
					.maybeSingle();

				if (buyerAccess) {
					throw redirect(303, '/dashboard');
				}

				// SSO users without membership: auto-link to org via domain.
				// Gate on an actual SSO session — a plain OAuth/magic-link signup whose
				// email domain happens to match an org's SSO provider must NOT be
				// auto-joined to that org. Only the org's IdP can vouch for membership.
				if (user.email && isSsoSession(user)) {
					const emailDomain = user.email.split('@')[1]?.toLowerCase();
					if (emailDomain) {
						const { data: ssoProvider } = await supabaseAdmin
							.from('organization_sso_providers')
							.select('organization_id')
							.eq('domain', emailDomain)
							.limit(1)
							.single();

						if (ssoProvider) {
							await supabaseAdmin.from('organization_members').insert({
								organization_id: ssoProvider.organization_id,
								profile_id: user.id,
								role: 'member'
							});
							throw redirect(303, '/insight');
						}
					}
				}
			}

			// New user with no org/buyer access — send to onboarding
			throw redirect(303, '/onboarding');
		}
	}

	// No code, or the exchange failed. There is no identity to attribute this to,
	// so it stays on the anonymous actor and renders as "An unauthenticated
	// visitor failed to sign in".
	locals.audit.record('auth.sign_in_failed', {
		status: 'failure',
		errorCode: code ? 'code_exchange_failed' : 'missing_code'
	});

	throw redirect(303, '/login?error=auth_failed');
};
