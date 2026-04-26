import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { organizationOrdersSchema } from '$lib/schemas/organization-orders.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { organization } = locals;

	const form = await superValidate(zod4(organizationOrdersSchema));
	if (organization) {
		form.data.orderNumberPrefix = organization.order_number_prefix ?? '';
		form.data.nextOrderNumber = organization.next_order_number ?? 1;
		form.data.orderMinimumEnabled = organization.order_minimum_enabled ?? false;
		form.data.orderMinimumAmount = Number(organization.order_minimum_amount ?? 0);
		form.data.defaultCommissionRate = Number(organization.default_commission_rate ?? 10);
		form.data.handlingFeeAmount = Number(organization.handling_fee_amount ?? 0);
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

		const form = await superValidate(request, zod4(organizationOrdersSchema));
		if (!form.valid) return fail(400, { form });

		const update = {
			order_number_prefix: form.data.orderNumberPrefix,
			next_order_number: form.data.nextOrderNumber,
			order_minimum_enabled: form.data.orderMinimumEnabled,
			order_minimum_amount: form.data.orderMinimumEnabled ? form.data.orderMinimumAmount : null,
			default_commission_rate: form.data.defaultCommissionRate,
			handling_fee_amount: form.data.handlingFeeAmount,
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
