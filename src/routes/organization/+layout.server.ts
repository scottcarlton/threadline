import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { membership, supabase, organization } = locals;

	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		throw redirect(303, '/insight');
	}

	const isBrandOrg = locals.orgType === 'brand';

	const [teamRes, accountContactsRes, brandContactsRes, showsRes, territoriesRes, partnersRes] =
		await Promise.all([
			supabase
				.from('organization_members')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', organization!.id),
			supabase
				.from('accounts')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', organization!.id)
				.not('contact_email', 'is', null),
			supabase
				.from('brands')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', organization!.id)
				.not('contact_email', 'is', null),
			supabase
				.from('show_dates')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', organization!.id),
			supabase
				.from('territories')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', organization!.id),
			isBrandOrg
				? supabase
						.from('org_connections')
						.select('id', { count: 'exact', head: true })
						.eq('brand_org_id', organization!.id)
						.eq('status', 'active')
				: Promise.resolve({ count: 0 })
		]);

	return {
		teamCount: teamRes.count ?? 0,
		contactsCount: (accountContactsRes.count ?? 0) + (brandContactsRes.count ?? 0),
		showsCount: showsRes.count ?? 0,
		territoriesCount: territoriesRes.count ?? 0,
		partnersCount: partnersRes.count ?? 0,
		orgType: locals.orgType
	};
};
