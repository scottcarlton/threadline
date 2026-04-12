import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization, orgType } = locals;

	if (!organization) throw redirect(303, '/insight');

	// For brand orgs, /products shows the self-brand's product catalog
	if (orgType === 'brand') {
		const { data: selfBrand } = await supabase
			.from('brands')
			.select('id')
			.eq('organization_id', organization.id)
			.eq('is_self_brand', true)
			.single();

		if (selfBrand) {
			throw redirect(303, `/brands/${selfBrand.id}/products`);
		}
	}

	// Rep orgs shouldn't hit this route — redirect to brands
	throw redirect(303, '/brands');
};
