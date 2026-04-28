import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { organizationTaxesSchema, salesTaxRateSchema } from '$lib/schemas/organization-taxes.js';
import type { OrganizationSalesTaxRate } from '$lib/types/database.js';
import { requireAdmin } from '$lib/server/auth/require-admin.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.orgType !== 'brand') throw error(404, 'Not found');
	const { organization, supabase } = locals;

	const form = await superValidate(zod4(organizationTaxesSchema));
	let rates: OrganizationSalesTaxRate[] = [];

	if (organization) {
		form.data.pricingDisplay = organization.taxes_pricing_display ?? 'exclusive';
		form.data.usSalesTaxEnabled = organization.taxes_us_sales_tax_enabled ?? false;
		form.data.usEin = organization.taxes_us_ein ?? '';
		form.data.usGeneralRate =
			organization.taxes_us_general_rate === null ? '' : Number(organization.taxes_us_general_rate);
		form.data.vatEnabled = organization.taxes_vat_enabled ?? false;
		form.data.vatRegistration = organization.taxes_vat_registration ?? '';
		form.data.vatRate =
			organization.taxes_vat_rate === null ? '' : Number(organization.taxes_vat_rate);
		form.data.gstEnabled = organization.taxes_gst_enabled ?? false;
		form.data.gstRegistration = organization.taxes_gst_registration ?? '';
		form.data.gstRate =
			organization.taxes_gst_rate === null ? '' : Number(organization.taxes_gst_rate);

		const { data } = await supabase
			.from('organization_sales_tax_rates')
			.select('*')
			.eq('organization_id', organization.id)
			.order('state_code', { ascending: true });
		rates = (data ?? []) as OrganizationSalesTaxRate[];
	}

	return { form, rates };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const denied = requireAdmin(locals);
		if (denied) return fail(denied.status, { message: denied.error });
		const orgId = locals.organization!.id;

		const form = await superValidate(request, zod4(organizationTaxesSchema));
		if (!form.valid) return fail(400, { form });

		try {
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

			const { error } = await supabaseAdmin.from('organizations').update(update).eq('id', orgId);

			if (error) return fail(500, { form, message: error.message });
			return message(form, { success: true });
		} catch (err) {
			console.error('[organization/taxes] save threw', err);
			const detail = err instanceof Error ? err.message : 'Save failed';
			return fail(500, { form, message: detail });
		}
	},

	upsertRate: async ({ request, locals }) => {
		const denied = requireAdmin(locals);
		if (denied) return fail(denied.status, { message: denied.error });
		const orgId = locals.organization!.id;

		const form = await superValidate(request, zod4(salesTaxRateSchema));
		if (!form.valid) return fail(400, { form });

		const payload = {
			organization_id: orgId,
			state_code: form.data.stateCode,
			rate: form.data.rate,
			tax_type: form.data.taxType,
			updated_at: new Date().toISOString()
		};

		if (form.data.id) {
			const { error } = await supabaseAdmin
				.from('organization_sales_tax_rates')
				.update(payload)
				.eq('id', form.data.id)
				.eq('organization_id', orgId);
			if (error) return fail(500, { form, message: error.message });
		} else {
			const { error } = await supabaseAdmin.from('organization_sales_tax_rates').insert(payload);
			if (error) {
				if (error.code === '23505') {
					return fail(400, {
						form,
						message: `A rate already exists for ${form.data.stateCode}. Edit it instead.`
					});
				}
				return fail(500, { form, message: error.message });
			}
		}

		return message(form, { success: true });
	},

	deleteRate: async ({ request, locals }) => {
		const denied = requireAdmin(locals);
		if (denied) return fail(denied.status, { message: denied.error });
		const orgId = locals.organization!.id;

		const formData = await request.formData();
		const id = formData.get('id');
		if (typeof id !== 'string' || !id) return fail(400, { message: 'Missing id' });

		const { error } = await supabaseAdmin
			.from('organization_sales_tax_rates')
			.delete()
			.eq('id', id)
			.eq('organization_id', orgId);

		if (error) return fail(500, { message: error.message });
		return { success: true };
	}
};
