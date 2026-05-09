import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase.js';
import {
	formatLocation,
	formatPayment,
	formatShipWindow,
	seasonLabel
} from '$lib/server/orders/format';

const MAX_IDS = 10;

type RawOrderRow = {
	id: string;
	order_number: string;
	order_type: 'order' | 'note';
	status: string;
	total_amount: number | string | null;
	submitted_at: string | null;
	created_at: string | null;
	start_ship_date: string | null;
	expected_ship_date: string | null;
	order_year: number | null;
	payment_preference: string | null;
	payment_terms: string | null;
	accounts: { business_name: string | null; contact_email: string | null } | null;
	brands: { name: string | null } | null;
	seasons: { name: string | null } | null;
	account_locations: {
		label: string | null;
		city: string | null;
		state: string | null;
	} | null;
	order_lines: Array<{ qty: number | null }> | null;
};

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.organization) throw redirect(303, '/orders');
	const orgId = locals.organization.id;
	const idsParam = url.searchParams.get('ids');
	if (!idsParam) throw redirect(303, '/orders');

	const rawNumbers = idsParam
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

	if (rawNumbers.length === 0) throw redirect(303, '/orders');

	// Dedupe + cap, so a pathological URL can't make us query unbounded rows.
	const order_numbers = Array.from(new Set(rawNumbers)).slice(0, MAX_IDS);

	const { data, error: queryError } = await supabaseAdmin
		.from('orders')
		.select(
			`id, order_number, order_type, status, total_amount, submitted_at, created_at, start_ship_date, expected_ship_date, order_year, payment_preference, payment_terms,
				 accounts(business_name, contact_email),
				 brands(name),
				 seasons(name),
				 account_locations!location_id(label, city, state),
				 order_lines(qty)`
		)
		.eq('organization_id', orgId)
		.in('order_number', order_numbers);

	if (queryError) throw error(500, queryError.message);

	const rows = (data ?? []) as unknown as RawOrderRow[];
	if (rows.length === 0) throw error(404, 'Not found');

	// RLS filtered a row out → don't render partial results. The user either
	// sees all the orders they just created or nothing.
	if (rows.length !== order_numbers.length) throw error(404, 'Not found');

	// Defensive: a single Finalize submit commits one order_type, so a mixed
	// set means the URL was tampered with or hand-assembled. 404 rather than
	// render an incoherent page.
	const typeSet = new Set(rows.map((r) => r.order_type));
	if (typeSet.size > 1) throw error(404, 'Not found');

	// Preserve the order the caller passed in (matches the wizard's created
	// order) instead of whatever Postgres returned.
	const byNumber = new Map(rows.map((r) => [r.order_number, r]));
	const ordered = order_numbers
		.map((n) => byNumber.get(n))
		.filter((r): r is RawOrderRow => Boolean(r));

	const order_type = ordered[0].order_type;
	const total = ordered.reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0);
	const unitCount = ordered.reduce(
		(sum, r) => sum + (r.order_lines ?? []).reduce((n, l) => n + (l.qty ?? 0), 0),
		0
	);
	const brands = new Set(ordered.map((r) => r.brands?.name).filter((x): x is string => Boolean(x)));

	const createdAt = ordered[0].submitted_at ?? ordered[0].created_at;

	return {
		order_type,
		count: ordered.length,
		total,
		unitCount,
		brandCount: brands.size,
		buyerEmail: ordered[0].accounts?.contact_email ?? null,
		accountName: ordered[0].accounts?.business_name ?? null,
		createdAt,
		rows: ordered.map((r) => ({
			order_number: r.order_number,
			status: r.status,
			brand_name: r.brands?.name ?? '—',
			season_label: seasonLabel(r.seasons?.name, r.order_year),
			units: (r.order_lines ?? []).reduce((n, l) => n + (l.qty ?? 0), 0),
			total: Number(r.total_amount ?? 0),
			ship_window: formatShipWindow(r.start_ship_date, r.expected_ship_date),
			location_summary: formatLocation(r.account_locations),
			payment_summary: formatPayment(r.payment_preference, r.payment_terms)
		}))
	};
};
