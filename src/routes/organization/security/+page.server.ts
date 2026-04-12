import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = locals.organization!.id;

	const [providersRes, orgRes] = await Promise.all([
		supabaseAdmin
			.from('organization_sso_providers')
			.select('*')
			.eq('organization_id', orgId)
			.order('created_at', { ascending: true }),
		supabaseAdmin
			.from('organizations')
			.select('sso_enforced')
			.eq('id', orgId)
			.single()
	]);

	return {
		providers: providersRes.data ?? [],
		ssoEnforced: orgRes.data?.sso_enforced ?? false,
		isOwner: locals.membership?.role === 'owner'
	};
};
