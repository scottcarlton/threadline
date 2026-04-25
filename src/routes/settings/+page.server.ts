import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, user, organization } = locals;

	if (!user) {
		return { emailConnected: false, emailAddress: null, notificationPreferences: null };
	}

	const [emailRes, prefsRes] = await Promise.all([
		supabase
			.from('email_connections')
			.select('email_address')
			.eq('profile_id', user.id)
			.maybeSingle(),
		organization
			? supabase
					.from('notification_preferences')
					.select('*')
					.eq('user_id', user.id)
					.eq('organization_id', organization.id)
					.maybeSingle()
			: Promise.resolve({ data: null })
	]);

	return {
		emailConnected: !!emailRes.data,
		emailAddress: emailRes.data?.email_address ?? null,
		notificationPreferences: prefsRes.data ?? null,
		isBuyer: locals.isBuyer === true
	};
};

export const actions: Actions = {
	updateNotificationPreferences: async ({ request, locals }) => {
		const { supabase, user, organization } = locals;
		if (!user || !organization) return fail(401, { message: 'Not authenticated' });

		const formData = await request.formData();
		const prefs = {
			order_updates: formData.get('order_updates') === 'on',
			comments: formData.get('comments') === 'on',
			buyer_activity: formData.get('buyer_activity') === 'on',
			team_activity: formData.get('team_activity') === 'on',
			email_digest: formData.get('email_digest') === 'on'
		};

		await supabase.from('notification_preferences').upsert(
			{
				user_id: user.id,
				organization_id: organization.id,
				...prefs,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,organization_id' }
		);

		return { success: true };
	}
};
