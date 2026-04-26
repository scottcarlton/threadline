import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { organizationPaymentsSchema } from '$lib/schemas/organization-payments.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { organization } = locals;

	const form = await superValidate(zod4(organizationPaymentsSchema));
	let stripeAccountId: string | null = null;
	let depositAccountLast4: string | null = null;

	if (organization) {
		form.data.processor = organization.payments_processor ?? 'manual';
		form.data.stripeLinkEnabled = organization.payments_stripe_link_enabled ?? false;
		form.data.acceptedMethods = (organization.accepted_payment_methods ?? []) as string[];
		form.data.defaultMethod = organization.default_payment_method ?? '';
		form.data.defaultTerm =
			(organization as { default_payment_terms?: string | null }).default_payment_terms ?? '';
		form.data.requiredDepositEnabled = organization.payments_required_deposit_enabled ?? false;
		form.data.requiredDepositPercent = Number(organization.payments_required_deposit_percent ?? 0);
		form.data.depositAccountName = organization.payments_deposit_account_name ?? '';
		form.data.surchargePassToBuyer = organization.payments_surcharge_pass_to_buyer ?? false;

		stripeAccountId = organization.payments_stripe_account_id ?? null;
		depositAccountLast4 = organization.payments_deposit_account_last4 ?? null;
	}

	return { form, stripeAccountId, depositAccountLast4 };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { organization, user, membership } = locals;
		if (!organization || !user) return fail(401, { message: 'Not authenticated' });
		if (!membership || !['admin', 'owner'].includes(membership.role)) {
			return fail(403, { message: 'Admin or owner required' });
		}

		const form = await superValidate(request, zod4(organizationPaymentsSchema));
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

		const { error } = await supabaseAdmin
			.from('organizations')
			.update(update)
			.eq('id', organization.id);

		if (error) return fail(500, { form, message: error.message });
		return { form, success: true };
	}
};
