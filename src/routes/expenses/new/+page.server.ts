import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { getConnectedBrandOrgIds } from '$lib/server/federation.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;

	if (!organization) return { brands: [] };

	const { data: ownBrands } = await supabase
		.from('brands')
		.select('id, name')
		.eq('organization_id', organization.id)
		.eq('is_active', true)
		.order('name');

	let brands = ownBrands ?? [];

	if (locals.orgType === 'rep') {
		const connectedOrgIds = await getConnectedBrandOrgIds(supabaseAdmin, organization.id);
		if (connectedOrgIds.length > 0) {
			const { data: fedBrands } = await supabaseAdmin
				.from('brands')
				.select('id, name')
				.in('organization_id', connectedOrgIds)
				.eq('is_active', true)
				.order('name');
			const ownIds = new Set(brands.map((b) => b.id));
			brands = [...brands, ...(fedBrands ?? []).filter((b) => !ownIds.has(b.id))];
		}
	}

	return { brands };
};
