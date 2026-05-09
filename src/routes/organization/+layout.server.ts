import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { membership, supabase, organization } = locals;

	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		throw redirect(303, '/insight');
	}

	const isBrandOrg = locals.orgType === 'brand';

	// Account-contacts count must mirror the /organization/contacts list
	// which spans own + active-connection orgs (accounts are shared context
	// across an MBISR ↔ Brand connection). See the Federation section in
	// CLAUDE.md and the permissions-implementation-map for `/organization/contacts`.
	const { data: conns } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(`rep_org_id.eq.${organization!.id},brand_org_id.eq.${organization!.id}`);
	const visibleOrgIdSet = new Set<string>([organization!.id]);
	for (const c of conns ?? []) {
		if (c.rep_org_id && c.rep_org_id !== organization!.id) visibleOrgIdSet.add(c.rep_org_id);
		if (c.brand_org_id && c.brand_org_id !== organization!.id) visibleOrgIdSet.add(c.brand_org_id);
	}
	const visibleOrgIds = Array.from(visibleOrgIdSet);

	const [teamRes, accountContactsRes, brandContactsRes, showsRes, territoriesRes, partnersRes] =
		await Promise.all([
			supabase
				.from('organization_members')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', organization!.id),
			supabaseAdmin
				.from('accounts')
				.select('id', { count: 'exact', head: true })
				.in('organization_id', visibleOrgIds)
				.is('archived_at', null)
				.not('contact_email', 'is', null),
			isBrandOrg
				? Promise.resolve({ count: 0 })
				: supabase
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
