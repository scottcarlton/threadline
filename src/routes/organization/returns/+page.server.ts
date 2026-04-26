import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { organizationReturnsSchema } from '$lib/schemas/organization-returns.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { organization } = locals;

	const form = await superValidate(zod4(organizationReturnsSchema));
	if (organization) {
		form.data.windowDays = organization.returns_window_days ?? 0;
		form.data.policyText = organization.returns_policy_text ?? '';
		form.data.useShipFromAddress = organization.returns_use_ship_from_address ?? true;
		form.data.returnsAddressLine1 = organization.returns_address_line1 ?? '';
		form.data.returnsAddressLine2 = organization.returns_address_line2 ?? '';
		form.data.returnsAddressCity = organization.returns_address_city ?? '';
		form.data.returnsAddressState = organization.returns_address_state ?? '';
		form.data.returnsAddressZip = organization.returns_address_zip ?? '';
		form.data.returnsAddressCountry = organization.returns_address_country ?? '';
		form.data.restockingFeeType = organization.returns_restocking_fee_type ?? 'percent';
		form.data.restockingFeeValue = Number(organization.returns_restocking_fee_value ?? 0);
		form.data.buyerPaysShipping = organization.returns_buyer_pays_shipping ?? false;
	}

	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { organization, user, membership } = locals;
		if (!organization || !user) return fail(401, { message: 'Not authenticated' });
		if (!membership || !['admin', 'owner'].includes(membership.role)) {
			return fail(403, { message: 'Admin or owner required' });
		}

		const form = await superValidate(request, zod4(organizationReturnsSchema));
		if (!form.valid) return fail(400, { form });

		const update = {
			returns_window_days: form.data.windowDays,
			returns_policy_text: form.data.policyText || null,
			returns_use_ship_from_address: form.data.useShipFromAddress,
			returns_address_line1: form.data.useShipFromAddress
				? null
				: form.data.returnsAddressLine1 || null,
			returns_address_line2: form.data.useShipFromAddress
				? null
				: form.data.returnsAddressLine2 || null,
			returns_address_city: form.data.useShipFromAddress
				? null
				: form.data.returnsAddressCity || null,
			returns_address_state: form.data.useShipFromAddress
				? null
				: form.data.returnsAddressState || null,
			returns_address_zip: form.data.useShipFromAddress
				? null
				: form.data.returnsAddressZip || null,
			returns_address_country: form.data.useShipFromAddress
				? null
				: form.data.returnsAddressCountry || null,
			returns_restocking_fee_type: form.data.restockingFeeType,
			returns_restocking_fee_value: form.data.restockingFeeValue,
			returns_buyer_pays_shipping: form.data.buyerPaysShipping,
			updated_at: new Date().toISOString()
		};

		const { error } = await supabaseAdmin
			.from('organizations')
			.update(update)
			.eq('id', organization.id);

		if (error) return fail(500, { form, message: error.message });
		return { form, success: true };
	}
};
