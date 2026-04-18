import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { organization } = locals;

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

	// Collect own org + connected org IDs for federation-aware queries
	const { data: connections } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(`rep_org_id.eq.${orgId},brand_org_id.eq.${orgId}`);
	const visibleOrgIds = [orgId];
	for (const c of connections ?? []) {
		if (c.rep_org_id && c.rep_org_id !== orgId) visibleOrgIds.push(c.rep_org_id);
		if (c.brand_org_id && c.brand_org_id !== orgId) visibleOrgIds.push(c.brand_org_id);
	}

	const [showDatesRes, accountsRes] = await Promise.all([
		supabaseAdmin
			.from('show_dates')
			.select('id, show_id, year, month, city, state, shows(name)')
			.eq('organization_id', orgId)
			.order('year')
			.order('month'),
		supabaseAdmin
			.from('accounts')
			.select('id, business_name, contact_first_name, contact_last_name, city, state')
			.in('organization_id', visibleOrgIds)
			.eq('is_active', true)
			.order('business_name')
	]);

	// Load appointments, optionally filtered by show_date
	// Sales reps only see their own appointments
	const isSales = locals.membership?.role === 'sales';
	let apptQuery = supabaseAdmin
		.from('appointments')
		.select(
			'*, accounts(business_name, contact_first_name, contact_last_name, city, state), show_dates(show_id, year, month, city, state, shows(name)), profiles!appointments_created_by_fkey(display_name)'
		)
		.in('organization_id', visibleOrgIds)
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
