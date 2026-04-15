import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { computeAccountHealth } from '$lib/server/account-health.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, '/dashboard');
	const { supabase, organization } = locals;

	const [accountRes, ordersRes, recentOrdersRes, appointmentsRes, emailLogsRes, locationsRes] =
		await Promise.all([
			supabase.from('accounts').select('*').eq('id', params.id).single(),
			supabase
				.from('orders')
				.select('brand_id, total_amount, status, order_year, brands(id, name)')
				.eq('account_id', params.id),
			supabase
				.from('orders')
				.select(
					'id, order_number, status, total_amount, created_at, submitted_at, confirmed_at, shipped_at, delivered_at, cancelled_at, brands(name)'
				)
				.eq('account_id', params.id)
				.order('created_at', { ascending: false })
				.limit(20),
			supabase
				.from('appointments')
				.select(
					'id, appointment_type, scheduled_date, scheduled_time, status, notes, created_at, show_dates(id, year, month, city, state, shows(name))'
				)
				.eq('account_id', params.id)
				.order('created_at', { ascending: false })
				.limit(20),
			supabase
				.from('email_logs')
				.select('id, to_email, subject, created_at, sent_by, profiles:sent_by(display_name)')
				.eq('related_type', 'account')
				.eq('related_id', params.id)
				.order('created_at', { ascending: false })
				.limit(20),
			supabase
				.from('account_locations')
				.select(
					'id, account_id, label, contact_first_name, contact_last_name, contact_email, phone, address_line1, address_line2, city, state, zip, country, notes, is_default, sort_order'
				)
				.eq('account_id', params.id)
				.order('is_default', { ascending: false })
				.order('sort_order', { ascending: true })
		]);

	if (accountRes.error || !accountRes.data) {
		throw error(404, 'Account not found');
	}

	// Aggregate brand stats from orders
	type BrandSummary = { id: string; name: string; orderCount: number; totalSales: number };
	const brandMap = new Map<string, BrandSummary>();

	for (const order of ordersRes.data ?? []) {
		const brand = order.brands as unknown as { id: string; name: string } | null;
		if (!brand) continue;

		const existing = brandMap.get(brand.id);
		if (existing) {
			existing.orderCount++;
			existing.totalSales += Number(order.total_amount);
		} else {
			brandMap.set(brand.id, {
				id: brand.id,
				name: brand.name,
				orderCount: 1,
				totalSales: Number(order.total_amount)
			});
		}
	}

	const brandSummaries = Array.from(brandMap.values()).sort((a, b) => b.totalSales - a.totalSales);

	// Get health score for this account
	let health = null;
	if (organization) {
		const healthMap = await computeAccountHealth(supabase, organization.id);
		health = healthMap.get(params.id) ?? null;
	}

	// Load tags for this account and available tags
	const [tagAssignmentsRes, availableTagsRes] = await Promise.all([
		supabase
			.from('account_tag_assignments')
			.select('*, account_tags(*)')
			.eq('account_id', params.id),
		organization
			? supabase
					.from('account_tags')
					.select('*')
					.eq('organization_id', organization.id)
					.order('sort_order')
			: Promise.resolve({ data: [] })
	]);

	// Load buyer users for this account
	const { data: buyerUsers } = await supabase
		.from('account_users')
		.select('*, profiles(display_name)')
		.eq('account_id', params.id);

	// Load buyer brand access
	const { data: buyerBrandAccess } = await supabase
		.from('account_brand_access')
		.select('*, brands(name)')
		.eq('account_id', params.id);

	// Load pending buyer invitations
	const { data: buyerInvitations } = await supabase
		.from('buyer_invitations')
		.select('*')
		.eq('account_id', params.id)
		.is('accepted_at', null);

	// Load all brands for the invite dialog
	const { data: allBrands } = organization
		? await supabase
				.from('brands')
				.select('id, name')
				.eq('organization_id', organization.id)
				.eq('is_active', true)
				.order('name')
		: { data: [] };

	// Build activity timeline
	type ActivityItem = {
		type: string;
		id: string;
		title: string;
		subtitle: string | null;
		date: string;
		status?: string;
	};
	const activity: ActivityItem[] = [];

	for (const o of recentOrdersRes.data ?? []) {
		const brandsJoin = o.brands as { name?: string } | { name?: string }[] | null;
		const brandName = (Array.isArray(brandsJoin) ? brandsJoin[0]?.name : brandsJoin?.name) ?? '';
		const latestDate =
			o.cancelled_at ??
			o.delivered_at ??
			o.shipped_at ??
			o.confirmed_at ??
			o.submitted_at ??
			o.created_at;
		activity.push({
			type: 'order',
			id: o.id,
			title: `Order ${o.order_number}`,
			subtitle: brandName
				? `${brandName} · $${Number(o.total_amount).toLocaleString()}`
				: `$${Number(o.total_amount).toLocaleString()}`,
			date: latestDate,
			status: o.status
		});
	}

	for (const a of appointmentsRes.data ?? []) {
		const showData = a.show_dates as
			| { shows?: { name?: string } | { name?: string }[] | null }
			| { shows?: { name?: string } | { name?: string }[] | null }[]
			| null;
		const sd = Array.isArray(showData) ? showData[0] : showData;
		const showsJoin = sd?.shows;
		const showName = (Array.isArray(showsJoin) ? showsJoin[0]?.name : showsJoin?.name) ?? '';
		activity.push({
			type: 'appointment',
			id: a.id,
			title: `${a.appointment_type} appointment`,
			subtitle: showName || null,
			date: a.scheduled_date ?? a.created_at,
			status: a.status
		});
	}

	for (const e of emailLogsRes.data ?? []) {
		const profilesJoin = (
			e as { profiles?: { display_name?: string } | { display_name?: string }[] | null }
		).profiles;
		const senderName =
			(Array.isArray(profilesJoin) ? profilesJoin[0]?.display_name : profilesJoin?.display_name) ??
			'';
		activity.push({
			type: 'email',
			id: e.id,
			title: e.subject,
			subtitle: senderName ? `Sent by ${senderName}` : `To ${e.to_email}`,
			date: e.created_at
		});
	}

	activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	return {
		account: accountRes.data,
		brandSummaries,
		accountHealth: health,
		buyerUsers: buyerUsers ?? [],
		buyerBrandAccess: buyerBrandAccess ?? [],
		buyerInvitations: buyerInvitations ?? [],
		allBrands: allBrands ?? [],
		activity: activity.slice(0, 30),
		tagAssignments: tagAssignmentsRes.data ?? [],
		availableTags: availableTagsRes.data ?? [],
		locations: locationsRes.data ?? []
	};
};

type LocationPatch = {
	label: string;
	contact_first_name: string | null;
	contact_last_name: string | null;
	contact_email: string | null;
	phone: string | null;
	address_line1: string | null;
	address_line2: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	country: string;
	notes: string | null;
};

function pickLocationFields(fd: FormData): LocationPatch | { error: string } {
	const label = (fd.get('label') ?? '').toString().trim();
	if (!label) return { error: 'Label is required' };
	const s = (k: string) => {
		const v = (fd.get(k) ?? '').toString().trim();
		return v.length > 0 ? v : null;
	};
	return {
		label,
		contact_first_name: s('contact_first_name'),
		contact_last_name: s('contact_last_name'),
		contact_email: s('contact_email'),
		phone: s('phone'),
		address_line1: s('address_line1'),
		address_line2: s('address_line2'),
		city: s('city'),
		state: s('state'),
		zip: s('zip'),
		country: s('country') ?? 'US',
		notes: s('notes')
	};
}

export const actions: Actions = {
	addLocation: async ({ request, locals, params }) => {
		const { supabase, organization } = locals;
		if (!organization) return fail(401, { message: 'Not authenticated' });
		const fd = await request.formData();
		const patch = pickLocationFields(fd);
		if ('error' in patch) return fail(400, { message: patch.error });

		// First location becomes default automatically.
		const { count } = await supabase
			.from('account_locations')
			.select('id', { count: 'exact', head: true })
			.eq('account_id', params.id);
		const is_default = (count ?? 0) === 0;

		// Next sort_order = max + 1
		const { data: maxRow } = await supabase
			.from('account_locations')
			.select('sort_order')
			.eq('account_id', params.id)
			.order('sort_order', { ascending: false })
			.limit(1)
			.maybeSingle();
		const sort_order = ((maxRow?.sort_order as number | null) ?? -1) + 1;

		const { error: insertErr } = await supabase.from('account_locations').insert({
			...patch,
			account_id: params.id,
			organization_id: organization.id,
			is_default,
			sort_order
		});
		if (insertErr) return fail(500, { message: insertErr.message });
		return { ok: true };
	},

	updateLocation: async ({ request, locals, params }) => {
		const { supabase } = locals;
		const fd = await request.formData();
		const id = (fd.get('id') ?? '').toString();
		if (!id) return fail(400, { message: 'Missing id' });
		const patch = pickLocationFields(fd);
		if ('error' in patch) return fail(400, { message: patch.error });
		const { error: updErr } = await supabase
			.from('account_locations')
			.update({ ...patch, updated_at: new Date().toISOString() })
			.eq('id', id)
			.eq('account_id', params.id);
		if (updErr) return fail(500, { message: updErr.message });
		return { ok: true };
	},

	deleteLocation: async ({ request, locals, params }) => {
		const { supabase } = locals;
		const fd = await request.formData();
		const id = (fd.get('id') ?? '').toString();
		if (!id) return fail(400, { message: 'Missing id' });

		// Look up whether this was the default.
		const { data: target } = await supabase
			.from('account_locations')
			.select('is_default')
			.eq('id', id)
			.eq('account_id', params.id)
			.maybeSingle();
		const wasDefault = target?.is_default === true;

		const { error: delErr } = await supabase
			.from('account_locations')
			.delete()
			.eq('id', id)
			.eq('account_id', params.id);
		if (delErr) return fail(500, { message: delErr.message });

		if (wasDefault) {
			// Promote the next location (by sort_order) to default, if any.
			const { data: next } = await supabase
				.from('account_locations')
				.select('id')
				.eq('account_id', params.id)
				.order('sort_order', { ascending: true })
				.limit(1)
				.maybeSingle();
			if (next?.id) {
				await supabase.from('account_locations').update({ is_default: true }).eq('id', next.id);
			}
		}
		return { ok: true };
	},

	setDefault: async ({ request, locals, params }) => {
		const { supabase } = locals;
		const fd = await request.formData();
		const id = (fd.get('id') ?? '').toString();
		if (!id) return fail(400, { message: 'Missing id' });

		// Atomicity: unset existing default first, then set the new one. The
		// unique partial index prevents two defaults, so order matters.
		const { error: unsetErr } = await supabase
			.from('account_locations')
			.update({ is_default: false })
			.eq('account_id', params.id)
			.eq('is_default', true);
		if (unsetErr) return fail(500, { message: unsetErr.message });

		const { error: setErr } = await supabase
			.from('account_locations')
			.update({ is_default: true })
			.eq('id', id)
			.eq('account_id', params.id);
		if (setErr) return fail(500, { message: setErr.message });
		return { ok: true };
	}
};
