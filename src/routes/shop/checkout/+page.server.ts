import { redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { PageServerLoad, Actions } from './$types';
import {
	resolveOrderSettings,
	type BrandCommerceSettings
} from '$lib/server/orders/resolve-order-settings.js';
import { submitOrder } from '$lib/server/orders/submit-order.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.isBuyer) throw redirect(303, '/insight');

	const { organization } = locals;
	if (!organization) throw redirect(303, '/dashboard');

	const accountId = locals.buyerAccounts?.[0]?.account_id;
	if (!accountId) throw redirect(303, '/dashboard');

	const buyerBrandIds = locals.buyerBrandIds ?? [];

	const [
		{ data: deliveries },
		{ data: seasons },
		{ data: account },
		{ data: locations },
		{ data: brandTerms },
		{ data: portalSource }
	] = await Promise.all([
		supabaseAdmin
			.from('season_deliveries')
			.select('*, seasons(name)')
			.eq('organization_id', organization.id)
			.order('sort_order'),
		supabaseAdmin
			.from('seasons')
			.select('id, name, sort_order')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('sort_order'),
		supabaseAdmin
			.from('accounts')
			.select(
				'id, business_name, contact_email, address_line1, address_line2, city, state, zip, payment_preference, payment_terms, shipping_method'
			)
			.eq('id', accountId)
			.single(),
		supabaseAdmin
			.from('account_locations')
			.select(
				'id, account_id, label, contact_first_name, contact_last_name, contact_email, phone, address_line1, address_line2, city, state, zip, is_default, sort_order'
			)
			.eq('account_id', accountId)
			.order('sort_order'),
		supabaseAdmin
			.from('brand_terms')
			.select('id, brand_id, title, body, version')
			.in('brand_id', buyerBrandIds.length ? buyerBrandIds : ['__none__'])
			.eq('is_current', true),
		supabaseAdmin
			.from('source_types')
			.select('id')
			.eq('organization_id', organization.id)
			.eq('name', 'Portal')
			.eq('is_system', true)
			.maybeSingle()
	]);

	const brandSettingsMap = await resolveOrderSettings(supabaseAdmin, buyerBrandIds);
	const brandSettings: Record<string, BrandCommerceSettings> = Object.fromEntries(brandSettingsMap);

	const orgRow = organization as typeof organization & {
		default_payment_terms?: string | null;
		default_shipping_method?: string | null;
	};

	const user = locals.user;

	return {
		deliveries: deliveries ?? [],
		seasons: seasons ?? [],
		accountId,
		organizationId: organization.id,
		userId: locals.user?.id,
		account: account ?? null,
		locations: locations ?? [],
		brandTerms: brandTerms ?? [],
		portalSourceTypeId: portalSource?.id ?? null,
		acceptedPaymentMethods: (organization.accepted_payment_methods ?? []) as string[],
		defaultPaymentMethod: (organization.default_payment_method ?? null) as string | null,
		defaultPaymentTerms: (orgRow.default_payment_terms ?? null) as string | null,
		defaultShippingMethod: (orgRow.default_shipping_method ?? null) as string | null,
		brandSettings,
		currentUser: user ? { id: user.id } : null
	};
};

export const actions: Actions = {
	submit: async ({ request, locals }) => submitOrder(request, locals)
};
