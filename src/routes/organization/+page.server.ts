import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { organization, orgType, supabase } = locals;

	let selfBrand: {
		id: string;
		website: string | null;
		contact_email: string | null;
		contact_phone: string | null;
	} | null = null;

	if (orgType === 'brand' && organization) {
		const { data } = await supabase
			.from('brands')
			.select('id, website, contact_email, contact_phone')
			.eq('organization_id', organization.id)
			.eq('is_self_brand', true)
			.maybeSingle();
		selfBrand = data ?? null;
	}

	return {
		org: organization
			? { id: organization.id, name: organization.name, logo_url: organization.logo_url }
			: null,
		orgType,
		selfBrand
	};
};
