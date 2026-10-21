import type { PageLoad } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { createAccountSchema } from '$lib/schemas/account';
import { isPaymentMethodCode } from '$lib/payment-methods';

/**
 * Universal load, no server round trip (SCO-207): the org's payment settings
 * come from the root layout data the app already holds, so this page opens
 * from client-side navigation with no connection. Saving goes through the
 * offline outbox to POST /api/sync/accounts.
 */
export const load: PageLoad = async ({ parent }) => {
	const { organization } = await parent();
	const form = await superValidate(zod4(createAccountSchema));
	// Seeded once per page load so a resubmit is a replay, not a second account.
	form.data.id = crypto.randomUUID();
	form.data.primaryLocationId = crypto.randomUUID();
	const defaultPaymentMethod = (organization?.default_payment_method ?? null) as string | null;
	if (defaultPaymentMethod && isPaymentMethodCode(defaultPaymentMethod)) {
		form.data.paymentPreference = defaultPaymentMethod;
	}
	return {
		form,
		organizationId: (organization?.id ?? null) as string | null,
		acceptedPaymentMethods: (organization?.accepted_payment_methods ?? []) as string[],
		defaultPaymentMethod
	};
};
