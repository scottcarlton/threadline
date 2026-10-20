import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { createAccountSchema } from '$lib/schemas/account';
import { isPaymentMethodCode, isPaymentPreferenceCode } from '$lib/payment-methods';
import { emitIntegrationEvent } from '$lib/server/integrations/events.js';
import { buildCreateAccountArgs } from '$lib/server/accounts/create-account.js';

type SuccessMessage = { type: 'success'; accountId: string; inviteFailed: boolean };

export const load: PageServerLoad = async ({ locals }) => {
	const form = await superValidate(zod4(createAccountSchema));
	const org = locals.organization;
	// Seeded once per page load so resubmitting this form is a replay (SCO-204).
	form.data.id = crypto.randomUUID();
	form.data.primaryLocationId = crypto.randomUUID();
	if (org?.default_payment_method && isPaymentMethodCode(org.default_payment_method)) {
		form.data.paymentPreference = org.default_payment_method;
	}
	return {
		form,
		acceptedPaymentMethods: (org?.accepted_payment_methods ?? []) as string[],
		defaultPaymentMethod: (org?.default_payment_method ?? null) as string | null
	};
};

export const actions: Actions = {
	default: async ({ request, locals, fetch, url }) => {
		const form = await superValidate(request, zod4(createAccountSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		if (!locals.organization) {
			return fail(403, { form, message: 'No organization context.' });
		}

		const { business, contact, paymentPreference } = form.data;
		const orgId = locals.organization.id;

		const nn = (v: string | undefined) => (v && v.length ? v : null);

		const accepted = (locals.organization.accepted_payment_methods ?? []) as string[];
		const orgDefault = locals.organization.default_payment_method ?? null;
		const picked = paymentPreference?.trim() ?? '';
		// Form still submits the merged payment-preference list until the
		// Finalize redesign splits methods from terms in the UI.
		const validPick =
			picked && isPaymentPreferenceCode(picked) && accepted.includes(picked) ? picked : null;
		const paymentPrefValue = validPick ?? (accepted.includes(orgDefault ?? '') ? orgDefault : null);

		// One transaction for the account and its locations, keyed by the id the
		// page seeded on load. A retry after a dropped response replays instead
		// of creating a second account, and skips the side effects below.
		const args = buildCreateAccountArgs(form.data, orgId, paymentPrefValue);
		const { data: created, error: createErr } = await locals.supabase
			.rpc('create_account_with_locations', args)
			.single<{ account_id: string; inserted: boolean }>();

		if (createErr || !created) {
			console.error('[accounts/new] create failed', {
				org_id: orgId,
				account_id: args.p_account_id,
				error: createErr
			});
			return fail(500, { form, message: 'Could not create the account. Try again.' });
		}

		const accountId = created.account_id;

		if (!created.inserted) {
			const replay: SuccessMessage = { type: 'success', accountId, inviteFailed: false };
			return message(form, replay);
		}

		locals.audit.record('account.created', {
			organizationId: orgId,
			subjectId: accountId,
			subjectLabel: business.name,
			metadata: { city: nn(business.address.city), state: nn(business.address.state) }
		});

		emitIntegrationEvent(orgId, 'new_account', {
			accountName: business.name,
			city: business.address.city || undefined,
			state: business.address.state || undefined,
			url: `${url.origin}/accounts/${accountId}`
		});

		let inviteFailed = false;
		if (contact.email) {
			try {
				const inviteRes = await fetch('/api/buyer-invite/send', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: contact.email, accountId, brandIds: [] })
				});
				if (!inviteRes.ok) {
					inviteFailed = true;
					console.error(`buyer-invite/send returned ${inviteRes.status} for account ${accountId}`);
				}
			} catch (err) {
				inviteFailed = true;
				console.error(`buyer-invite/send threw for account ${accountId}:`, err);
			}
		}

		const success: SuccessMessage = { type: 'success', accountId, inviteFailed };
		return message(form, success);
	}
};
