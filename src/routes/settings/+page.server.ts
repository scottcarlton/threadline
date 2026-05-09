import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, user, organization } = locals;

	if (!user) {
		return {
			emailConnected: false,
			emailAddress: null,
			notificationPreferences: null,
			authEmail: null,
			authPendingEmail: null,
			authProviders: [] as string[]
		};
	}

	const { user: authUser } = await locals.safeGetSession();
	// `identities[].provider` is the canonical list of linked providers.
	// `app_metadata.provider` reflects the *current* session's provider.
	const authProviders = Array.from(
		new Set(
			[
				...(authUser?.identities?.map((i) => i.provider) ?? []),
				authUser?.app_metadata?.provider as string | undefined
			].filter((p): p is string => typeof p === 'string')
		)
	);

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
		isBuyer: locals.isBuyer === true,
		authEmail: authUser?.email ?? null,
		// Pending change confirmation: Supabase stores the requested-but-unconfirmed
		// new address on `new_email` until both old + new mailboxes confirm.
		authPendingEmail: (authUser as { new_email?: string } | null)?.new_email ?? null,
		authProviders
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
