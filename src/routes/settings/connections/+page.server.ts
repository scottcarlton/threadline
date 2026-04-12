import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization, orgType, membership } = locals;

	if (!organization || !membership) throw redirect(303, '/insight');

	const orgId = organization.id;
	const isAdmin = ['admin', 'owner'].includes(membership.role);

	// Get connections for this org (as either rep or brand side)
	const { data: connections } = await supabaseAdmin
		.from('org_connections')
		.select('*, rep_org:rep_org_id(id, name, slug), brand_org:brand_org_id(id, name, slug)')
		.or(`rep_org_id.eq.${orgId},brand_org_id.eq.${orgId}`)
		.order('created_at', { ascending: false });

	// Get invite codes (brand orgs only)
	let invites: any[] = [];
	if (orgType === 'brand' && isAdmin) {
		const { data } = await supabase
			.from('connection_invites')
			.select('*')
			.eq('brand_org_id', orgId)
			.order('created_at', { ascending: false });
		invites = data ?? [];
	}

	// Get brands for rep orgs (for mapping when connecting)
	let brands: any[] = [];
	if (orgType === 'rep') {
		const { data } = await supabase
			.from('brands')
			.select('id, name')
			.eq('organization_id', orgId)
			.eq('is_active', true)
			.order('name');
		brands = data ?? [];
	}

	return {
		connections: connections ?? [],
		invites,
		brands,
		orgType,
		isAdmin
	};
};
