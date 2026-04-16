import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { createBrandSchema } from '$lib/schemas/brand';

type SuccessMessage = { type: 'success'; brandId: string; inviteFailed: boolean };

export const load: PageServerLoad = async () => {
	const form = await superValidate(zod4(createBrandSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals, fetch }) => {
		const form = await superValidate(request, zod4(createBrandSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		if (!locals.organization) {
			return fail(403, { form, message: 'No organization context.' });
		}

		const nn = (v: string | undefined) => (v && v.length ? v : null);
		const d = form.data;

		const { data: newBrand, error: insertErr } = await locals.supabase
			.from('brands')
			.insert({
				organization_id: locals.organization.id,
				name: d.name,
				contact_first_name: nn(d.contactFirstName),
				contact_last_name: nn(d.contactLastName),
				contact_email: nn(d.contactEmail),
				contact_phone: nn(d.contactPhone),
				website: nn(d.website),
				commission_rate: d.commissionRate,
				notes: nn(d.notes)
			})
			.select('id')
			.single();

		if (insertErr || !newBrand) {
			return fail(500, { form, message: insertErr?.message ?? 'Failed to create brand.' });
		}

		const brandId = newBrand.id;

		let inviteFailed = false;
		if (d.inviteContact && d.contactEmail) {
			try {
				const inviteRes = await fetch('/api/invite/send', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						email: d.contactEmail,
						role: 'member',
						brandIds: [brandId]
					})
				});
				if (!inviteRes.ok) {
					inviteFailed = true;
					console.error(`invite/send returned ${inviteRes.status} for brand ${brandId}`);
				}
			} catch (err) {
				inviteFailed = true;
				console.error(`invite/send threw for brand ${brandId}:`, err);
			}
		}

		const success: SuccessMessage = { type: 'success', brandId, inviteFailed };
		return message(form, success);
	}
};
