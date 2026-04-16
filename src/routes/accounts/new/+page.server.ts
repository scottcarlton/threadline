import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { createAccountSchema } from '$lib/schemas/account';

type SuccessMessage = { type: 'success'; accountId: string; inviteFailed: boolean };

export const load: PageServerLoad = async () => {
	const form = await superValidate(zod4(createAccountSchema));
	return { form };
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

		const { business, contact, notes } = form.data;
		const orgId = locals.organization.id;

		const { data: newAccount, error: insertErr } = await locals.supabase
			.from('accounts')
			.insert({
				organization_id: orgId,
				business_name: business.name,
				website: business.website ?? null,
				phone: business.phone ?? null,
				address_line1: business.address.line1 ?? null,
				address_line2: business.address.line2 ?? null,
				city: business.address.city ?? null,
				state: business.address.state ?? null,
				zip: business.address.zip ?? null,
				contact_first_name: contact.firstName,
				contact_last_name: contact.lastName,
				contact_email: contact.email ?? null,
				contact_phone: contact.phone ?? null,
				notes: notes ?? null
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
				address_line1: business.address.line1 ?? null,
				address_line2: business.address.line2 ?? null,
				city: business.address.city ?? null,
				state: business.address.state ?? null,
				zip: business.address.zip ?? null,
				phone: business.phone ?? null,
				contact_first_name: contact.firstName,
				contact_last_name: contact.lastName,
				contact_email: contact.email ?? null
			},
			...business.additionalLocations.map((loc, i) => ({
				account_id: accountId,
				organization_id: orgId,
				label: loc.label,
				is_default: false,
				sort_order: i + 1,
				address_line1: loc.address.line1 ?? null,
				address_line2: loc.address.line2 ?? null,
				city: loc.address.city ?? null,
				state: loc.address.state ?? null,
				zip: loc.address.zip ?? null,
				phone: loc.phone ?? null,
				contact_first_name: loc.contact?.firstName ?? null,
				contact_last_name: loc.contact?.lastName ?? null,
				contact_email: loc.contact?.email ?? null
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
