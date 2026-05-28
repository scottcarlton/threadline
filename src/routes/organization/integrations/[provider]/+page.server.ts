import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const VALID_PROVIDERS = ['google_sheets', 'slack', 'notion', 'microsoft', 'google_calendar'];

export const load: PageServerLoad = async ({ params, locals }) => {
	const provider = params.provider;

	if (!VALID_PROVIDERS.includes(provider)) {
		throw error(404, 'Integration not found');
	}

	const orgId = locals.organization!.id;

	const { data: connection } = await locals.supabase
		.from('integration_connections')
		.select('*')
		.eq('organization_id', orgId)
		.eq('provider', provider)
		.single();

	if (!connection || connection.status !== 'active') {
		throw redirect(303, '/organization/integrations');
	}

	const { data: syncLogs } = await locals.supabase
		.from('integration_sync_log')
		.select('*')
		.eq('connection_id', connection.id)
		.order('created_at', { ascending: false })
		.limit(20);

	let appointments: unknown[] = [];
	let showDates: unknown[] = [];

	if (provider === 'google_calendar') {
		const orgId = locals.organization!.id;

		const [apptRes, sdRes] = await Promise.all([
			locals.supabase
				.from('appointments')
				.select(
					'id, scheduled_date, scheduled_time, duration_minutes, notes, status, accounts(business_name), show_dates(shows(name), city, state)'
				)
				.eq('organization_id', orgId)
				.eq('status', 'scheduled')
				.order('scheduled_date', { ascending: true })
				.limit(50),
			locals.supabase
				.from('show_dates')
				.select('id, start_date, end_date, city, state, venue, shows(name)')
				.eq('organization_id', orgId)
				.gte('end_date', new Date().toISOString().split('T')[0])
				.order('start_date', { ascending: true })
				.limit(20)
		]);

		appointments = apptRes.data ?? [];
		showDates = sdRes.data ?? [];
	}

	return {
		connection,
		syncLogs: syncLogs ?? [],
		provider,
		appointments,
		showDates
	};
};
