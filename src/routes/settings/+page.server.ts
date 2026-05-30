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
	const authProviders = Array.from(
		new Set(
			[
				...(authUser?.identities?.map((i) => i.provider) ?? []),
				authUser?.app_metadata?.provider as string | undefined
			].filter((p): p is string => typeof p === 'string')
		)
	);

	const [connectionsRes, prefsRes] = await Promise.all([
		supabase
			.from('email_connections')
			.select('provider, email_address, scheduling_url')
			.eq('profile_id', user.id)
			.in('provider', ['gmail', 'google_calendar', 'outlook', 'microsoft_calendar', 'calendly']),
		organization
			? supabase
					.from('notification_preferences')
					.select('*')
					.eq('user_id', user.id)
					.eq('organization_id', organization.id)
					.maybeSingle()
			: Promise.resolve({ data: null })
	]);

	type ConnectionRow = { provider: string; email_address: string | null; scheduling_url?: string };
	const connections = (connectionsRes.data ?? []) as ConnectionRow[];
	const connByProvider = new Map(connections.map((c) => [c.provider, c]));

	return {
		emailConnected: connByProvider.has('gmail'),
		emailAddress: connByProvider.get('gmail')?.email_address ?? null,
		calendarConnected: connByProvider.has('google_calendar'),
		calendarEmail: connByProvider.get('google_calendar')?.email_address ?? null,
		outlookConnected: connByProvider.has('outlook'),
		outlookEmail: connByProvider.get('outlook')?.email_address ?? null,
		msCalendarConnected: connByProvider.has('microsoft_calendar'),
		msCalendarEmail: connByProvider.get('microsoft_calendar')?.email_address ?? null,
		calendlyConnected: connByProvider.has('calendly'),
		calendlyEmail: connByProvider.get('calendly')?.email_address ?? null,
		calendlySchedulingUrl: connByProvider.get('calendly')?.scheduling_url ?? null,
		notificationPreferences: prefsRes.data ?? null,
		isBuyer: locals.isBuyer === true,
		authEmail: authUser?.email ?? null,
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
