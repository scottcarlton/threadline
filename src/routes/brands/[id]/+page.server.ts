import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { requireAdmin } from '$lib/server/auth/require-admin.js';
import { brandOrdersSchema } from '$lib/schemas/brand-orders.js';
import { brandTaxesSchema, brandSalesTaxRateSchema } from '$lib/schemas/brand-taxes.js';
import { brandShippingSchema, brandShippingMethodSchema } from '$lib/schemas/brand-shipping.js';
import { brandReturnsSchema } from '$lib/schemas/brand-returns.js';
import { brandPaymentsSchema } from '$lib/schemas/brand-payments.js';
import type { BrandSalesTaxRate, BrandShippingMethod } from '$lib/types/database.js';

// Build the Commerce modal's load-time state for a rep-owned manual
// brand. Returns a discriminated union on canEdit; consumers (the page
// component) narrow on canEdit before reading the form objects.
async function buildCommerceState(
	supabase: App.Locals['supabase'],
	brand: import('$lib/types/database.js').Brand,
	canEdit: boolean,
	brandId: string
) {
	if (!canEdit) {
		return { canEdit: false as const };
	}

	const [ordersForm, taxesForm, shippingForm, returnsForm, paymentsForm] = await Promise.all([
		superValidate(zod4(brandOrdersSchema)),
		superValidate(zod4(brandTaxesSchema)),
		superValidate(zod4(brandShippingSchema)),
		superValidate(zod4(brandReturnsSchema)),
		superValidate(zod4(brandPaymentsSchema))
	]);

	ordersForm.data.orderNumberPrefix = brand.order_number_prefix ?? '';
	ordersForm.data.nextOrderNumber = brand.next_order_number ?? 1;
	ordersForm.data.orderNumberPadWidth = brand.order_number_pad_width ?? 0;
	ordersForm.data.orderMinimumEnabled = brand.order_minimum_enabled ?? false;
	ordersForm.data.orderMinimumAmount = Number(brand.order_minimum_amount ?? 0);
	ordersForm.data.defaultCommissionRate = Number(brand.default_commission_rate ?? 10);
	ordersForm.data.handlingFeeAmount = Number(brand.handling_fee_amount ?? 0);

	taxesForm.data.pricingDisplay = brand.taxes_pricing_display ?? 'exclusive';
	taxesForm.data.usSalesTaxEnabled = brand.taxes_us_sales_tax_enabled ?? false;
	taxesForm.data.usEin = brand.taxes_us_ein ?? '';
	taxesForm.data.usGeneralRate =
		brand.taxes_us_general_rate === null ? '' : Number(brand.taxes_us_general_rate);
	taxesForm.data.vatEnabled = brand.taxes_vat_enabled ?? false;
	taxesForm.data.vatRegistration = brand.taxes_vat_registration ?? '';
	taxesForm.data.vatRate = brand.taxes_vat_rate === null ? '' : Number(brand.taxes_vat_rate);
	taxesForm.data.gstEnabled = brand.taxes_gst_enabled ?? false;
	taxesForm.data.gstRegistration = brand.taxes_gst_registration ?? '';
	taxesForm.data.gstRate = brand.taxes_gst_rate === null ? '' : Number(brand.taxes_gst_rate);

	shippingForm.data.useBusinessAddress = brand.shipping_use_business_address ?? true;
	shippingForm.data.shippingFromLine1 = brand.shipping_from_line1 ?? '';
	shippingForm.data.shippingFromLine2 = brand.shipping_from_line2 ?? '';
	shippingForm.data.shippingFromCity = brand.shipping_from_city ?? '';
	shippingForm.data.shippingFromState = brand.shipping_from_state ?? '';
	shippingForm.data.shippingFromZip = brand.shipping_from_zip ?? '';
	shippingForm.data.shippingFromCountry = brand.shipping_from_country ?? '';
	shippingForm.data.freeThresholdEnabled = brand.shipping_free_threshold_enabled ?? false;
	shippingForm.data.freeThresholdAmount = Number(brand.shipping_free_threshold_amount ?? 0);

	returnsForm.data.windowDays = brand.returns_window_days ?? 0;
	returnsForm.data.policyText = brand.returns_policy_text ?? '';
	returnsForm.data.useShipFromAddress = brand.returns_use_ship_from_address ?? true;
	returnsForm.data.returnsAddressLine1 = brand.returns_address_line1 ?? '';
	returnsForm.data.returnsAddressLine2 = brand.returns_address_line2 ?? '';
	returnsForm.data.returnsAddressCity = brand.returns_address_city ?? '';
	returnsForm.data.returnsAddressState = brand.returns_address_state ?? '';
	returnsForm.data.returnsAddressZip = brand.returns_address_zip ?? '';
	returnsForm.data.returnsAddressCountry = brand.returns_address_country ?? '';
	returnsForm.data.restockingFeeType = brand.returns_restocking_fee_type ?? 'percent';
	returnsForm.data.restockingFeeValue = Number(brand.returns_restocking_fee_value ?? 0);
	returnsForm.data.buyerPaysShipping = brand.returns_buyer_pays_shipping ?? false;

	paymentsForm.data.processor = brand.payments_processor ?? 'manual';
	paymentsForm.data.stripeLinkEnabled = brand.payments_stripe_link_enabled ?? false;
	paymentsForm.data.acceptedMethods = (brand.accepted_payment_methods ?? []) as string[];
	paymentsForm.data.defaultMethod = brand.default_payment_method ?? '';
	paymentsForm.data.defaultTerm = brand.default_payment_terms ?? '';
	paymentsForm.data.requiredDepositEnabled = brand.payments_required_deposit_enabled ?? false;
	paymentsForm.data.requiredDepositPercent = Number(brand.payments_required_deposit_percent ?? 0);
	paymentsForm.data.depositAccountName = brand.payments_deposit_account_name ?? '';
	paymentsForm.data.surchargePassToBuyer = brand.payments_surcharge_pass_to_buyer ?? false;

	const [ratesRes, methodsRes, taxRateForm, shippingMethodForm] = await Promise.all([
		supabase.from('brand_sales_tax_rates').select('*').eq('brand_id', brandId).order('state_code'),
		supabase.from('brand_shipping_methods').select('*').eq('brand_id', brandId).order('name'),
		superValidate(zod4(brandSalesTaxRateSchema)),
		superValidate(zod4(brandShippingMethodSchema))
	]);

	return {
		canEdit: true as const,
		ordersForm,
		taxesForm,
		shippingForm,
		returnsForm,
		paymentsForm,
		taxRateForm,
		shippingMethodForm,
		taxRates: (ratesRes.data ?? []) as BrandSalesTaxRate[],
		shippingMethods: (methodsRes.data ?? []) as BrandShippingMethod[]
	};
}

// Resolve the brand once per request and gate the Commerce modal.
// Modal is shown only for rep-owned manual brands; admin/owner of the
// owning rep org can edit. BO-owned brands route their commerce to
// /organization/{...}; this page never edits commerce on a BO brand.
async function loadBrandWithGate(
	supabase: App.Locals['supabase'],
	brandId: string,
	locals: App.Locals
) {
	const { data: brand } = await supabase.from('brands').select('*').eq('id', brandId).single();
	if (!brand) throw error(404, 'Brand not found');

	const isOwnOrgBrand = brand.organization_id === locals.organization?.id;
	const role = locals.membership?.role;
	const ownerOrgIsRep = brand.organization_id
		? // Look up the brand's owning org_type. The current user's locals.orgType
			// only matches when isOwnOrgBrand=true; for federated views we need to
			// check the brand's actual owner.
			isOwnOrgBrand
			? locals.orgType === 'rep'
			: false
		: false;

	const canEditCommerce =
		ownerOrgIsRep && isOwnOrgBrand && !!role && ['admin', 'owner'].includes(role);

	return { brand, canEditCommerce };
}

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('data:brands');
	depends('data:products');
	if (locals.isBuyer) throw redirect(303, '/shop');
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const brandId = params.id;
	const { brand, canEditCommerce } = await loadBrandWithGate(supabase, brandId, locals);

	const isFederated = brand.organization_id !== organization.id;

	const [assetsResult, productCountResult, expenseSummaryResult] = await Promise.all([
		supabase
			.from('brand_assets')
			.select('*')
			.eq('brand_id', brandId)
			.order('created_at', { ascending: false }),
		supabase
			.from('products')
			.select('id', { count: 'exact', head: true })
			.eq('brand_id', brandId)
			.is('archived_at', null),
		supabase.from('brand_expenses').select('status, amount').eq('brand_id', brandId)
	]);

	// Performance metrics: orders for this brand (own-org orders only — federated orders are separate)
	const currentYear = new Date().getFullYear();
	const { data: brandOrders } = await supabase
		.from('orders')
		.select('id, account_id, total_amount, shipped_amount, status, order_year, created_at')
		.eq('brand_id', brandId)
		.neq('status', 'cancelled');

	const allOrders = brandOrders ?? [];
	const ytdOrders = allOrders.filter((o) => o.order_year === currentYear);
	const prevYearOrders = allOrders.filter((o) => o.order_year === currentYear - 1);

	const ytdRevenue = ytdOrders.reduce((s, o) => s + Number(o.total_amount), 0);
	const prevRevenue = prevYearOrders.reduce((s, o) => s + Number(o.total_amount), 0);
	const ytdShipped = ytdOrders.reduce((s, o) => s + Number(o.shipped_amount ?? 0), 0);
	const uniqueAccounts = new Set(ytdOrders.map((o) => o.account_id)).size;
	const avgOrderValue = ytdOrders.length > 0 ? ytdRevenue / ytdOrders.length : 0;
	const yoyGrowth = prevRevenue > 0 ? ((ytdRevenue - prevRevenue) / prevRevenue) * 100 : 0;

	// Top accounts by revenue
	const accountTotals: Record<string, number> = {};
	for (const o of ytdOrders) {
		accountTotals[o.account_id] = (accountTotals[o.account_id] ?? 0) + Number(o.total_amount);
	}
	const topAccountIds = Object.entries(accountTotals)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([id]) => id);

	let topAccounts: { id: string; name: string; total: number }[] = [];
	if (topAccountIds.length > 0) {
		const { data: accts } = await supabase
			.from('accounts')
			.select('id, business_name')
			.in('id', topAccountIds);
		topAccounts = topAccountIds.map((id) => ({
			id,
			name: (accts ?? []).find((a) => a.id === id)?.business_name ?? 'Unknown',
			total: accountTotals[id]
		}));
	}

	const performance = {
		ytdRevenue,
		ytdShipped,
		ytdOrders: ytdOrders.length,
		totalOrders: allOrders.length,
		uniqueAccounts,
		avgOrderValue,
		yoyGrowth,
		topAccounts
	};

	const allExpenses = expenseSummaryResult.data ?? [];
	const pendingExpenses = allExpenses.filter((e) => e.status === 'submitted');
	const expenseSummary = {
		total: allExpenses.length,
		pendingCount: pendingExpenses.length,
		pendingAmount: pendingExpenses.reduce((s, e) => s + Number(e.amount), 0)
	};

	// For federated brands, pull the brand org admin's profile as the contact
	let orgAdminContact: { display_name: string; email: string } | null = null;
	if (isFederated) {
		const { data: adminMember } = await supabaseAdmin
			.from('organization_members')
			.select('profiles!organization_members_profile_id_fkey(id, display_name)')
			.eq('organization_id', brand.organization_id)
			.in('role', ['admin', 'owner'])
			.limit(1)
			.single();

		if (adminMember) {
			const profile = adminMember.profiles as
				| { id: string; display_name: string }
				| { id: string; display_name: string }[]
				| null;
			const p = Array.isArray(profile) ? profile[0] : profile;
			if (p) {
				// Get the email from auth.users
				const { data: authData } = await supabaseAdmin.auth.admin.getUserById(p.id);
				orgAdminContact = {
					display_name: p.display_name ?? '',
					email: authData?.user?.email ?? ''
				};
			}
		}
	}

	// Commerce modal state — only built when the viewer can edit commerce
	// on this brand (rep-owned manual brand + admin/owner of that rep org).
	// Returned shape is a discriminated union on `canEdit` so consumers can
	// narrow safely.
	const commerce = await buildCommerceState(supabase, brand, canEditCommerce, brandId);

	return {
		brand,
		brandAssets: assetsResult.data ?? [],
		productCount: productCountResult.count ?? 0,
		expenseSummary,
		performance,
		isFederated,
		orgAdminContact,
		commerce
	};
};

// Shared gate for every commerce save action: app-layer admin/owner check
// on the brand's owning rep org. Returns either a fail() Response or the
// confirmed brand_id to write against.
async function gateCommerceWrite(locals: App.Locals, brandId: string) {
	const denied = requireAdmin(locals);
	if (denied) return { fail: fail(denied.status, { message: denied.error }) };

	// Confirm the brand belongs to the active org and the active org is a
	// rep org. BO commerce writes belong on /organization/{...}, not here.
	const { data: brand } = await supabaseAdmin
		.from('brands')
		.select('id, organization_id, organizations(org_type)')
		.eq('id', brandId)
		.single();
	const ownerOrgType = (brand?.organizations as { org_type?: string } | null)?.org_type;
	if (!brand || brand.organization_id !== locals.organization?.id || ownerOrgType !== 'rep') {
		return { fail: fail(404, { message: 'Brand not found' }) };
	}
	return { brandId: brand.id };
}

export const actions: Actions = {
	saveCommerceOrders: async ({ request, locals, params }) => {
		const gate = await gateCommerceWrite(locals, params.id);
		if ('fail' in gate) return gate.fail;

		const form = await superValidate(request, zod4(brandOrdersSchema));
		if (!form.valid) return fail(400, { form });

		const update = {
			order_number_prefix: form.data.orderNumberPrefix,
			next_order_number: form.data.nextOrderNumber,
			order_number_pad_width: form.data.orderNumberPadWidth,
			order_minimum_enabled: form.data.orderMinimumEnabled,
			order_minimum_amount: form.data.orderMinimumEnabled ? form.data.orderMinimumAmount : null,
			default_commission_rate: form.data.defaultCommissionRate,
			handling_fee_amount: form.data.handlingFeeAmount,
			updated_at: new Date().toISOString()
		};

		const { error: err } = await supabaseAdmin.from('brands').update(update).eq('id', gate.brandId);
		if (err) return fail(500, { form, message: err.message });
		return message(form, { success: true });
	},

	saveCommerceTaxes: async ({ request, locals, params }) => {
		const gate = await gateCommerceWrite(locals, params.id);
		if ('fail' in gate) return gate.fail;

		const form = await superValidate(request, zod4(brandTaxesSchema));
		if (!form.valid) return fail(400, { form });

		const update = {
			taxes_pricing_display: form.data.pricingDisplay,
			taxes_us_sales_tax_enabled: form.data.usSalesTaxEnabled,
			taxes_us_ein: form.data.usEin || null,
			taxes_us_general_rate: form.data.usGeneralRate === '' ? null : form.data.usGeneralRate,
			taxes_vat_enabled: form.data.vatEnabled,
			taxes_vat_registration: form.data.vatRegistration || null,
			taxes_vat_rate: form.data.vatRate === '' ? null : form.data.vatRate,
			taxes_gst_enabled: form.data.gstEnabled,
			taxes_gst_registration: form.data.gstRegistration || null,
			taxes_gst_rate: form.data.gstRate === '' ? null : form.data.gstRate,
			updated_at: new Date().toISOString()
		};

		const { error: err } = await supabaseAdmin.from('brands').update(update).eq('id', gate.brandId);
		if (err) return fail(500, { form, message: err.message });
		return message(form, { success: true });
	},

	saveCommerceShipping: async ({ request, locals, params }) => {
		const gate = await gateCommerceWrite(locals, params.id);
		if ('fail' in gate) return gate.fail;

		const form = await superValidate(request, zod4(brandShippingSchema));
		if (!form.valid) return fail(400, { form });

		const useBiz = form.data.useBusinessAddress;
		const update = {
			shipping_use_business_address: useBiz,
			shipping_from_line1: useBiz ? null : form.data.shippingFromLine1 || null,
			shipping_from_line2: useBiz ? null : form.data.shippingFromLine2 || null,
			shipping_from_city: useBiz ? null : form.data.shippingFromCity || null,
			shipping_from_state: useBiz ? null : form.data.shippingFromState || null,
			shipping_from_zip: useBiz ? null : form.data.shippingFromZip || null,
			shipping_from_country: useBiz ? null : form.data.shippingFromCountry || null,
			shipping_free_threshold_enabled: form.data.freeThresholdEnabled,
			shipping_free_threshold_amount: form.data.freeThresholdEnabled
				? form.data.freeThresholdAmount
				: null,
			updated_at: new Date().toISOString()
		};

		const { error: err } = await supabaseAdmin.from('brands').update(update).eq('id', gate.brandId);
		if (err) return fail(500, { form, message: err.message });
		return message(form, { success: true });
	},

	saveCommerceReturns: async ({ request, locals, params }) => {
		const gate = await gateCommerceWrite(locals, params.id);
		if ('fail' in gate) return gate.fail;

		const form = await superValidate(request, zod4(brandReturnsSchema));
		if (!form.valid) return fail(400, { form });

		const useShip = form.data.useShipFromAddress;
		const update = {
			returns_window_days: form.data.windowDays,
			returns_policy_text: form.data.policyText || null,
			returns_use_ship_from_address: useShip,
			returns_address_line1: useShip ? null : form.data.returnsAddressLine1 || null,
			returns_address_line2: useShip ? null : form.data.returnsAddressLine2 || null,
			returns_address_city: useShip ? null : form.data.returnsAddressCity || null,
			returns_address_state: useShip ? null : form.data.returnsAddressState || null,
			returns_address_zip: useShip ? null : form.data.returnsAddressZip || null,
			returns_address_country: useShip ? null : form.data.returnsAddressCountry || null,
			returns_restocking_fee_type: form.data.restockingFeeType,
			returns_restocking_fee_value: form.data.restockingFeeValue,
			returns_buyer_pays_shipping: form.data.buyerPaysShipping,
			updated_at: new Date().toISOString()
		};

		const { error: err } = await supabaseAdmin.from('brands').update(update).eq('id', gate.brandId);
		if (err) return fail(500, { form, message: err.message });
		return message(form, { success: true });
	},

	saveCommercePayments: async ({ request, locals, params }) => {
		const gate = await gateCommerceWrite(locals, params.id);
		if ('fail' in gate) return gate.fail;

		const form = await superValidate(request, zod4(brandPaymentsSchema));
		if (!form.valid) return fail(400, { form });

		const update = {
			payments_processor: form.data.processor,
			payments_stripe_link_enabled: form.data.stripeLinkEnabled,
			accepted_payment_methods: form.data.acceptedMethods,
			default_payment_method: form.data.defaultMethod || null,
			default_payment_terms: form.data.defaultTerm || null,
			payments_required_deposit_enabled: form.data.requiredDepositEnabled,
			payments_required_deposit_percent: form.data.requiredDepositEnabled
				? form.data.requiredDepositPercent
				: null,
			payments_deposit_account_name: form.data.depositAccountName || null,
			payments_surcharge_pass_to_buyer: form.data.surchargePassToBuyer,
			updated_at: new Date().toISOString()
		};

		const { error: err } = await supabaseAdmin.from('brands').update(update).eq('id', gate.brandId);
		if (err) return fail(500, { form, message: err.message });
		return message(form, { success: true });
	},

	saveTaxRate: async ({ request, locals, params }) => {
		const gate = await gateCommerceWrite(locals, params.id);
		if ('fail' in gate) return gate.fail;

		const form = await superValidate(request, zod4(brandSalesTaxRateSchema));
		if (!form.valid) return fail(400, { form });

		const payload = {
			brand_id: gate.brandId,
			state_code: form.data.stateCode,
			rate: form.data.rate,
			tax_type: form.data.taxType,
			updated_at: new Date().toISOString()
		};

		if (form.data.id) {
			const { error: err } = await supabaseAdmin
				.from('brand_sales_tax_rates')
				.update(payload)
				.eq('id', form.data.id)
				.eq('brand_id', gate.brandId);
			if (err) return fail(500, { form, message: err.message });
		} else {
			const { error: err } = await supabaseAdmin.from('brand_sales_tax_rates').insert(payload);
			if (err) return fail(500, { form, message: err.message });
		}
		return message(form, { success: true });
	},

	deleteTaxRate: async ({ request, locals, params }) => {
		const gate = await gateCommerceWrite(locals, params.id);
		if ('fail' in gate) return gate.fail;

		const fd = await request.formData();
		const id = fd.get('id');
		if (typeof id !== 'string' || !id) return fail(400, { message: 'Missing id' });

		const { error: err } = await supabaseAdmin
			.from('brand_sales_tax_rates')
			.delete()
			.eq('id', id)
			.eq('brand_id', gate.brandId);
		if (err) return fail(500, { message: err.message });
		return { success: true };
	},

	saveShippingMethod: async ({ request, locals, params }) => {
		const gate = await gateCommerceWrite(locals, params.id);
		if ('fail' in gate) return gate.fail;

		const form = await superValidate(request, zod4(brandShippingMethodSchema));
		if (!form.valid) return fail(400, { form });

		const payload = {
			brand_id: gate.brandId,
			name: form.data.name,
			cost_type: form.data.costType,
			cost_amount: form.data.costType === 'flat' ? Number(form.data.costAmount) : null,
			delivery_window: form.data.deliveryWindow || null,
			updated_at: new Date().toISOString()
		};

		if (form.data.id) {
			const { error: err } = await supabaseAdmin
				.from('brand_shipping_methods')
				.update(payload)
				.eq('id', form.data.id)
				.eq('brand_id', gate.brandId);
			if (err) return fail(500, { form, message: err.message });
		} else {
			const { error: err } = await supabaseAdmin.from('brand_shipping_methods').insert(payload);
			if (err) return fail(500, { form, message: err.message });
		}
		return message(form, { success: true });
	},

	deleteShippingMethod: async ({ request, locals, params }) => {
		const gate = await gateCommerceWrite(locals, params.id);
		if ('fail' in gate) return gate.fail;

		const fd = await request.formData();
		const id = fd.get('id');
		if (typeof id !== 'string' || !id) return fail(400, { message: 'Missing id' });

		// Block deletion if this method is the brand's current default.
		const { count: defaultCount } = await supabaseAdmin
			.from('brands')
			.select('id', { count: 'exact', head: true })
			.eq('default_shipping_method_id', id);
		if ((defaultCount ?? 0) > 0) {
			return fail(400, {
				message: 'This method is set as the brand default. Change the default before removing.'
			});
		}

		const { error: err } = await supabaseAdmin
			.from('brand_shipping_methods')
			.delete()
			.eq('id', id)
			.eq('brand_id', gate.brandId);
		if (err) return fail(500, { message: err.message });
		return { success: true };
	},

	makeDefaultShippingMethod: async ({ request, locals, params }) => {
		const gate = await gateCommerceWrite(locals, params.id);
		if ('fail' in gate) return gate.fail;

		const fd = await request.formData();
		const id = fd.get('id');
		if (typeof id !== 'string' || !id) return fail(400, { message: 'Missing id' });

		const { error: err } = await supabaseAdmin
			.from('brands')
			.update({ default_shipping_method_id: id, updated_at: new Date().toISOString() })
			.eq('id', gate.brandId);
		if (err) return fail(500, { message: err.message });
		return { success: true };
	}
};
