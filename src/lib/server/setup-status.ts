import { supabaseAdmin } from './supabase.js';

export type SetupStatus = {
	address: boolean;
	shipping: boolean;
	payments: boolean;
	orders: boolean;
	taxes: boolean;
	returns: boolean;
	profile: boolean;
	products: boolean;
	accounts: boolean;
	members: boolean;
};

type OrgFields = {
	address_line1: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	time_zone: string | null;
	shipping_use_business_address: boolean;
	shipping_from_line1: string | null;
	default_shipping_method_id: string | null;
	default_payment_terms: string | null;
	returns_window_days: number;
	taxes_us_sales_tax_enabled: boolean;
	taxes_vat_enabled: boolean;
	taxes_gst_enabled: boolean;
};

type CountData = {
	shippingMethodCount: number;
	productCount: number;
	accountCount: number;
	memberCount: number;
	resolvedSections: string[];
};

export function deriveSetupStatus(org: OrgFields, counts: CountData): SetupStatus {
	const hasAddress = Boolean(org.address_line1 && org.city && org.state && org.zip);

	const shipFromResolved = org.shipping_use_business_address
		? hasAddress
		: Boolean(org.shipping_from_line1);

	const hasShipping =
		counts.shippingMethodCount > 0 && Boolean(org.default_shipping_method_id) && shipFromResolved;

	const resolved = new Set(counts.resolvedSections);

	return {
		address: hasAddress,
		shipping: hasShipping,
		payments: resolved.has('payments'),
		orders: resolved.has('orders'),
		taxes:
			resolved.has('taxes') ||
			org.taxes_us_sales_tax_enabled ||
			org.taxes_vat_enabled ||
			org.taxes_gst_enabled,
		returns: resolved.has('returns') || org.returns_window_days > 0,
		profile: hasAddress && Boolean(org.time_zone),
		products: counts.productCount > 0,
		accounts: counts.accountCount > 0,
		members: counts.memberCount > 1 || resolved.has('members')
	};
}

export async function getSetupStatus(orgId: string): Promise<SetupStatus> {
	const [orgResult, shippingResult, productResult, accountResult, memberResult, skipResult] =
		await Promise.all([
			supabaseAdmin
				.from('organizations')
				.select(
					'address_line1, city, state, zip, time_zone, shipping_use_business_address, shipping_from_line1, default_shipping_method_id, default_payment_terms, returns_window_days, taxes_us_sales_tax_enabled, taxes_vat_enabled, taxes_gst_enabled'
				)
				.eq('id', orgId)
				.single(),
			supabaseAdmin
				.from('organization_shipping_methods')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId),
			supabaseAdmin
				.from('products')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId),
			supabaseAdmin
				.from('accounts')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId),
			supabaseAdmin
				.from('organization_members')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId),
			supabaseAdmin
				.from('org_setup_status')
				.select('section')
				.eq('organization_id', orgId)
				.in('status', ['skipped', 'completed'])
		]);

	const org = orgResult.data as OrgFields;

	return deriveSetupStatus(org, {
		shippingMethodCount: shippingResult.count ?? 0,
		productCount: productResult.count ?? 0,
		accountCount: accountResult.count ?? 0,
		memberCount: memberResult.count ?? 0,
		resolvedSections: (skipResult.data ?? []).map((r) => (r as { section: string }).section)
	});
}
