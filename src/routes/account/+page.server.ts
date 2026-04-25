import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { buyerProfileSchema } from '$lib/schemas/buyer-profile.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.isBuyer) throw redirect(303, '/insight');

	const accountId = locals.buyerAccounts?.[0]?.account_id;
	if (!accountId) throw redirect(303, '/dashboard');

	const [accountRes, profileRes] = await Promise.all([
		supabaseAdmin
			.from('accounts')
			.select(
				'id, business_name, contact_first_name, contact_last_name, contact_email, phone, address_line1, address_line2, city, state, zip, country'
			)
			.eq('id', accountId)
			.single(),
		locals.user
			? supabaseAdmin
					.from('profiles')
					.select('display_name, phone')
					.eq('id', locals.user.id)
					.single()
			: Promise.resolve({ data: null })
	]);

	const form = await superValidate(
		{
			displayName: profileRes.data?.display_name ?? '',
			phone: profileRes.data?.phone ?? ''
		},
		zod4(buyerProfileSchema)
	);

	return { account: accountRes.data ?? null, form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(buyerProfileSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		if (!locals.user) {
			return fail(401, { form, message: 'Not signed in.' });
		}

		const { error } = await supabaseAdmin
			.from('profiles')
			.update({
				display_name: form.data.displayName,
				phone: form.data.phone || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', locals.user.id);

		if (error) {
			return fail(500, { form, message: error.message });
		}

		return message(form, { type: 'success', text: 'Profile updated.' });
	}
};
