import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { getConnectedBrandOrgIds } from '$lib/server/federation.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ brands: [] });
	}

	const { data: ownBrands } = await locals.supabase
		.from('brands')
		.select('id, name')
		.eq('organization_id', locals.organization.id)
		.eq('is_active', true)
		.order('name');

	let brands = ownBrands ?? [];

	if (locals.orgType === 'rep') {
		const connectedOrgIds = await getConnectedBrandOrgIds(supabaseAdmin, locals.organization.id);
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

	return json({ brands });
};
