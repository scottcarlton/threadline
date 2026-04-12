import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next');

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			if (next) {
				throw redirect(303, next);
			}

			// Check if user has an org membership or buyer access
			const {
				data: { user }
			} = await supabase.auth.getUser();

			if (user) {
				const { data: membership } = await supabase
					.from('organization_members')
					.select('id')
					.eq('profile_id', user.id)
					.limit(1)
					.single();

				if (membership) {
					throw redirect(303, '/insight');
				}

				const { data: buyerAccess } = await supabase
					.from('account_users')
					.select('id')
					.eq('profile_id', user.id)
					.limit(1)
					.single();

				if (buyerAccess) {
					throw redirect(303, '/dashboard');
				}

				// SSO users without membership: auto-link to org via domain
				if (user.email) {
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

	throw redirect(303, '/login?error=auth_failed');
};
