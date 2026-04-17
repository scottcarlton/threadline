import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { supabase, organization } = locals;

	if (!organization) {
		return {
			showDates: [],
			selectedShowDateId: null,
			appointments: [],
			accounts: []
		};
	}

	const orgId = organization.id;
	const selectedShowDateId = url.searchParams.get('show_date') ?? null;

	const [showDatesRes, accountsRes] = await Promise.all([
		supabase
			.from('show_dates')
			.select('id, show_id, year, month, city, state, shows(name)')
			.eq('organization_id', orgId)
			.order('year')
			.order('month'),
		supabase
			.from('accounts')
			.select('id, business_name, contact_first_name, contact_last_name, city, state')
			.eq('is_active', true)
			.order('business_name')
	]);

	// Load appointments, optionally filtered by show_date
	// Sales reps only see their own appointments
	const isSales = locals.membership?.role === 'sales';
	let apptQuery = supabase
		.from('appointments')
		.select(
			'*, accounts(business_name, contact_first_name, contact_last_name, city, state), show_dates(show_id, year, month, city, state, shows(name)), profiles!appointments_created_by_fkey(display_name)'
		)
		.eq('organization_id', orgId)
		.order('scheduled_date', { ascending: true })
		.order('scheduled_time', { ascending: true });

	if (isSales) {
		apptQuery = apptQuery.eq('created_by', locals.user?.id);
	}

	if (selectedShowDateId) {
		apptQuery = apptQuery.eq('show_date_id', selectedShowDateId);
	}

	const { data: appointments } = await apptQuery;

	return {
		showDates: showDatesRes.data ?? [],
		selectedShowDateId,
		appointments: appointments ?? [],
		accounts: accountsRes.data ?? []
	};
};
