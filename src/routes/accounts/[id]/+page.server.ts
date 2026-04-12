import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { computeAccountHealth } from '$lib/server/account-health.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (locals.isBuyer) throw redirect(303, '/dashboard');
	const { supabase, organization } = locals;

	const [accountRes, ordersRes, recentOrdersRes, appointmentsRes, emailLogsRes] = await Promise.all([
		supabase
			.from('accounts')
			.select('*')
			.eq('id', params.id)
			.single(),
		supabase
			.from('orders')
			.select('brand_id, total_amount, status, order_year, brands(id, name)')
			.eq('account_id', params.id),
		supabase
			.from('orders')
			.select('id, order_number, status, total_amount, created_at, submitted_at, confirmed_at, shipped_at, delivered_at, cancelled_at, brands(name)')
			.eq('account_id', params.id)
			.order('created_at', { ascending: false })
			.limit(20),
		supabase
			.from('appointments')
			.select('id, appointment_type, scheduled_date, scheduled_time, status, notes, created_at, show_dates(id, year, month, city, state, shows(name))')
			.eq('account_id', params.id)
			.order('created_at', { ascending: false })
			.limit(20),
		supabase
			.from('email_logs')
			.select('id, to_email, subject, created_at, sent_by, profiles:sent_by(display_name)')
			.eq('related_type', 'account')
			.eq('related_id', params.id)
			.order('created_at', { ascending: false })
			.limit(20)
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
	type ActivityItem = { type: string; id: string; title: string; subtitle: string | null; date: string; status?: string };
	const activity: ActivityItem[] = [];

	for (const o of recentOrdersRes.data ?? []) {
		const brandName = (o.brands as any)?.name ?? '';
		const latestDate = o.cancelled_at ?? o.delivered_at ?? o.shipped_at ?? o.confirmed_at ?? o.submitted_at ?? o.created_at;
		activity.push({
			type: 'order',
			id: o.id,
			title: `Order ${o.order_number}`,
			subtitle: brandName ? `${brandName} · $${Number(o.total_amount).toLocaleString()}` : `$${Number(o.total_amount).toLocaleString()}`,
			date: latestDate,
			status: o.status
		});
	}

	for (const a of appointmentsRes.data ?? []) {
		const showData = a.show_dates as any;
		const showName = showData?.shows?.name ?? '';
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
		const senderName = (e as any).profiles?.display_name ?? '';
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
		availableTags: availableTagsRes.data ?? []
	};
};
