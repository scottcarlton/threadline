import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Top-level "Add Product" for brand orgs. Single-brand: derives the org's
// self-brand and renders the same form. Multi-brand orgs (Nx-BLSR) can't
// reach this without picking a brand first; the /products list hides the
// Add button in multi-brand mode for that reason.
export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization, membership, orgType } = locals;
	if (!organization) throw error(404, 'Organization not found');
	if (!['admin', 'owner', 'member'].includes(membership?.role ?? '')) {
		throw error(403, 'Not allowed');
	}
	if (orgType !== 'brand') throw error(404, 'Add Product lives under each brand for rep orgs');

	const { data: brand } = await supabase
		.from('brands')
		.select('id, name')
		.eq('organization_id', organization.id)
		.eq('is_self_brand', true)
		.single();
	if (!brand) throw error(404, 'Self-brand not found for this organization');

	const seasonsRes = await supabase
		.from('seasons')
		.select('id, name')
		.eq('organization_id', organization.id)
		.eq('is_active', true)
		.order('name');

	return {
		brand,
		seasons: seasonsRes.data ?? []
	};
};
