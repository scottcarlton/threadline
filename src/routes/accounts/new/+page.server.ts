import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { createAccountSchema } from '$lib/schemas/account';
import { isPaymentMethodCode, isPaymentPreferenceCode } from '$lib/payment-methods';

type SuccessMessage = { type: 'success'; accountId: string; inviteFailed: boolean };

export const load: PageServerLoad = async ({ locals }) => {
	const form = await superValidate(zod4(createAccountSchema));
	const org = locals.organization;
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
	default: async ({ request, locals, fetch }) => {
		const form = await superValidate(request, zod4(createAccountSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		if (!locals.organization) {
			return fail(403, { form, message: 'No organization context.' });
		}

		const { business, contact, notes, paymentPreference } = form.data;
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

		const { data: newAccount, error: insertErr } = await locals.supabase
			.from('accounts')
			.insert({
				organization_id: orgId,
				business_name: business.name,
				website: nn(business.website),
				phone: nn(business.phone),
				address_line1: nn(business.address.line1),
				address_line2: nn(business.address.line2),
				city: nn(business.address.city),
				state: nn(business.address.state),
				zip: nn(business.address.zip),
				contact_first_name: contact.firstName,
				contact_last_name: contact.lastName,
				contact_email: nn(contact.email),
				contact_phone: nn(contact.phone),
				notes: nn(notes),
				payment_preference: paymentPrefValue
			})
			.select('id')
			.single();

		if (insertErr || !newAccount) {
			return fail(500, { form, message: insertErr?.message ?? 'Failed to create account.' });
		}

		const accountId = newAccount.id;

		// Primary location row mirrors the account's address + contact.
		const locationRows = [
			{
				account_id: accountId,
				organization_id: orgId,
				label: 'Primary',
				is_default: true,
				sort_order: 0,
				address_line1: nn(business.address.line1),
				address_line2: nn(business.address.line2),
				city: nn(business.address.city),
				state: nn(business.address.state),
				zip: nn(business.address.zip),
				phone: nn(business.phone),
				contact_first_name: contact.firstName,
				contact_last_name: contact.lastName,
				contact_email: nn(contact.email)
			},
			...business.additionalLocations.map((loc, i) => ({
				account_id: accountId,
				organization_id: orgId,
				label: loc.label,
				is_default: false,
				sort_order: i + 1,
				address_line1: nn(loc.address.line1),
				address_line2: nn(loc.address.line2),
				city: nn(loc.address.city),
				state: nn(loc.address.state),
				zip: nn(loc.address.zip),
				phone: nn(loc.phone),
				contact_first_name: nn(loc.contact?.firstName),
				contact_last_name: nn(loc.contact?.lastName),
				contact_email: nn(loc.contact?.email)
			}))
		];

		const { error: locErr } = await locals.supabase.from('account_locations').insert(locationRows);
		if (locErr) {
			return fail(500, {
				form,
				message: `Account created, but locations failed: ${locErr.message}`
			});
		}

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
