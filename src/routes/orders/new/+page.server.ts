import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization } = locals;

	// Buyer: restricted to their accounts and accessible brands
	if (locals.isBuyer) {
		const accountIds = locals.buyerAccounts?.map((a) => a.account_id) ?? [];
		const buyerBrandIds = locals.buyerBrandIds ?? [];
		const orgIds = [
			...new Set(
				locals.buyerAccounts?.map((a: any) => a.accounts?.organizations?.id).filter(Boolean) ?? []
			)
		];

		const [accountsRes, brandsRes, seasonsRes] = await Promise.all([
			supabase
				.from('accounts')
				.select('id, business_name, city, state')
				.in('id', accountIds.length > 0 ? accountIds : ['__none__']),
			supabase
				.from('brands')
				.select('id, name')
				.in('id', buyerBrandIds.length > 0 ? buyerBrandIds : ['__none__'])
				.eq('is_active', true)
				.order('name'),
			orgIds.length > 0
				? supabase
						.from('seasons')
						.select('id, name')
						.in('organization_id', orgIds)
						.eq('is_active', true)
						.order('sort_order')
				: Promise.resolve({ data: [] })
		]);

		return {
			accounts: accountsRes.data ?? [],
			brands: brandsRes.data ?? [],
			seasons: seasonsRes.data ?? [],
			showDates: [],
			deliveries: [],
			sourceTypes: []
		};
	}

	if (!organization)
		return {
			accounts: [],
			brands: [],
			seasons: [],
			showDates: [],
			deliveries: [],
			sourceTypes: []
		};

	const [accountsRes, brandsRes, seasonsRes, showDatesRes, deliveriesRes, sourceTypesRes] =
		await Promise.all([
			supabase
				.from('accounts')
				.select('id, business_name, city, state')
				.eq('organization_id', organization.id)
				.eq('is_active', true)
				.order('business_name'),
			supabase
				.from('brands')
				.select('id, name')
				.eq('organization_id', organization.id)
				.eq('is_active', true)
				.order('name'),
			supabase
				.from('seasons')
				.select('id, name')
				.eq('organization_id', organization.id)
				.eq('is_active', true)
				.order('sort_order'),
			supabase
				.from('show_dates')
				.select('*, shows(name)')
				.eq('organization_id', organization.id)
				.order('year')
				.order('month'),
			supabase
				.from('season_deliveries')
				.select('*, seasons(name)')
				.eq('organization_id', organization.id)
				.order('sort_order'),
			supabase
				.from('source_types')
				.select('*')
				.eq('organization_id', organization.id)
				.eq('is_active', true)
				.order('sort_order')
		]);

	return {
		accounts: accountsRes.data ?? [],
		brands: brandsRes.data ?? [],
		seasons: seasonsRes.data ?? [],
		showDates: showDatesRes.data ?? [],
		deliveries: deliveriesRes.data ?? [],
		sourceTypes: sourceTypesRes.data ?? []
	};
};
