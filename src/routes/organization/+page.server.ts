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
			? {
					id: organization.id,
					name: organization.name,
					logo_url: organization.logo_url,
					address_line1: organization.address_line1,
					address_line2: organization.address_line2,
					city: organization.city,
					state: organization.state,
					zip: organization.zip,
					default_commission_rate:
						(organization as { default_commission_rate?: number }).default_commission_rate ?? 10,
					accepted_payment_methods: organization.accepted_payment_methods ?? [],
					default_payment_method: organization.default_payment_method ?? null
				}
			: null,
		orgType,
		selfBrand
	};
};
