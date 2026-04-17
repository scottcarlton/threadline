import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type ActivityItem = {
	type: 'order' | 'appointment' | 'email';
	id: string;
	title: string;
	subtitle: string | null;
	date: string;
	status?: string;
};

type OrderDateFields = {
	created_at: string;
	submitted_at: string | null;
	confirmed_at: string | null;
	shipped_at: string | null;
	delivered_at: string | null;
	cancelled_at: string | null;
};

type OrderRow = OrderDateFields & {
	id: string;
	order_number: string;
	status: string;
	total_amount: number | string;
	brands: { name?: string } | { name?: string }[] | null;
};

type AppointmentRow = {
	id: string;
	appointment_type: string;
	scheduled_date: string | null;
	status: string;
	created_at: string;
	show_dates:
		| { shows?: { name?: string } | { name?: string }[] | null }
		| { shows?: { name?: string } | { name?: string }[] | null }[]
		| null;
};

type EmailRow = {
	id: string;
	to_email: string;
	subject: string;
	created_at: string;
	profiles: { display_name?: string } | { display_name?: string }[] | null;
};

function latestOrderDate(o: OrderDateFields): string {
	return (
		o.cancelled_at ??
		o.delivered_at ??
		o.shipped_at ??
		o.confirmed_at ??
		o.submitted_at ??
		o.created_at
	);
}

function firstJoined<T>(v: T | T[] | null | undefined): T | null {
	if (!v) return null;
	return Array.isArray(v) ? (v[0] ?? null) : v;
}

function pushOrder(activity: ActivityItem[], o: OrderRow): void {
	const brand = firstJoined(o.brands);
	const brandName = brand?.name ?? '';
	const amount = Number(o.total_amount);
	activity.push({
		type: 'order',
		id: o.id,
		title: `Order ${o.order_number}`,
		subtitle: brandName
			? `${brandName} · $${amount.toLocaleString()}`
			: `$${amount.toLocaleString()}`,
		date: latestOrderDate(o),
		status: o.status
	});
}

function pushAppointment(activity: ActivityItem[], a: AppointmentRow): void {
	const sd = firstJoined(a.show_dates);
	const shows = firstJoined(sd?.shows ?? null);
	const showName = shows?.name ?? '';
	activity.push({
		type: 'appointment',
		id: a.id,
		title: `${a.appointment_type} appointment`,
		subtitle: showName || null,
		date: a.scheduled_date ?? a.created_at,
		status: a.status
	});
}

function pushEmail(activity: ActivityItem[], e: EmailRow): void {
	const profile = firstJoined(e.profiles);
	const senderName = profile?.display_name ?? '';
	activity.push({
		type: 'email',
		id: e.id,
		title: e.subject,
		subtitle: senderName ? `Sent by ${senderName}` : `To ${e.to_email}`,
		date: e.created_at
	});
}

const ORDER_TIMELINE_COLUMNS =
	'id, order_number, status, total_amount, created_at, submitted_at, confirmed_at, shipped_at, delivered_at, cancelled_at, brands(name)';

const APPOINTMENT_TIMELINE_COLUMNS =
	'id, appointment_type, scheduled_date, status, created_at, show_dates(shows(name))';

const EMAIL_TIMELINE_COLUMNS = 'id, to_email, subject, created_at, profiles:sent_by(display_name)';

async function loadAccountActivity(
	supabase: App.Locals['supabase'],
	accountId: string
): Promise<ActivityItem[]> {
	const [ordersRes, appointmentsRes, emailsRes] = await Promise.all([
		supabase
			.from('orders')
			.select(ORDER_TIMELINE_COLUMNS)
			.eq('account_id', accountId)
			.order('created_at', { ascending: false })
			.limit(20),
		supabase
			.from('appointments')
			.select(APPOINTMENT_TIMELINE_COLUMNS)
			.eq('account_id', accountId)
			.order('created_at', { ascending: false })
			.limit(20),
		supabase
			.from('email_logs')
			.select(EMAIL_TIMELINE_COLUMNS)
			.eq('related_type', 'account')
			.eq('related_id', accountId)
			.order('created_at', { ascending: false })
			.limit(20)
	]);

	const activity: ActivityItem[] = [];
	for (const o of (ordersRes.data ?? []) as OrderRow[]) pushOrder(activity, o);
	for (const a of (appointmentsRes.data ?? []) as AppointmentRow[]) pushAppointment(activity, a);
	for (const e of (emailsRes.data ?? []) as EmailRow[]) pushEmail(activity, e);
	return activity;
}

async function loadBrandActivity(
	supabase: App.Locals['supabase'],
	brandId: string
): Promise<ActivityItem[]> {
	const [ordersRes, emailsRes] = await Promise.all([
		supabase
			.from('orders')
			.select(
				'id, order_number, status, total_amount, created_at, submitted_at, confirmed_at, shipped_at, delivered_at, cancelled_at, accounts(business_name)'
			)
			.eq('brand_id', brandId)
			.order('created_at', { ascending: false })
			.limit(20),
		supabase
			.from('email_logs')
			.select(EMAIL_TIMELINE_COLUMNS)
			.eq('related_type', 'brand')
			.eq('related_id', brandId)
			.order('created_at', { ascending: false })
			.limit(20)
	]);

	const activity: ActivityItem[] = [];
	for (const o of (ordersRes.data ?? []) as (Omit<OrderRow, 'brands'> & {
		accounts: { business_name?: string } | { business_name?: string }[] | null;
	})[]) {
		const account = firstJoined(o.accounts);
		const amount = Number(o.total_amount);
		activity.push({
			type: 'order',
			id: o.id,
			title: `Order ${o.order_number}`,
			subtitle: account?.business_name
				? `${account.business_name} · $${amount.toLocaleString()}`
				: `$${amount.toLocaleString()}`,
			date: latestOrderDate(o),
			status: o.status
		});
	}
	for (const e of (emailsRes.data ?? []) as EmailRow[]) pushEmail(activity, e);
	return activity;
}

async function loadDiscoveredEmailActivity(
	supabase: App.Locals['supabase'],
	email: string
): Promise<ActivityItem[]> {
	const { data } = await supabase
		.from('email_logs')
		.select(EMAIL_TIMELINE_COLUMNS)
		.ilike('to_email', email)
		.order('created_at', { ascending: false })
		.limit(20);

	const activity: ActivityItem[] = [];
	for (const e of (data ?? []) as EmailRow[]) pushEmail(activity, e);
	return activity;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase, organization } = locals;
	if (!organization) throw error(404, 'Organization not found');

	const id = params.id;
	const accountPrefix = 'account-';
	const brandPrefix = 'brand-';

	if (id.startsWith(accountPrefix)) {
		const accountId = id.slice(accountPrefix.length);
		const { data: account } = await supabase
			.from('accounts')
			.select(
				'id, business_name, contact_first_name, contact_last_name, contact_email, phone, city, state'
			)
			.eq('id', accountId)
			.single();

		if (!account) throw error(404, 'Contact not found');

		const activity = await loadAccountActivity(supabase, accountId);
		activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

		return {
			contact: {
				name:
					[account.contact_first_name, account.contact_last_name].filter(Boolean).join(' ') || null,
				email: account.contact_email,
				phone: account.phone,
				source: 'account' as const,
				sourceId: account.id,
				sourceName: account.business_name,
				location: [account.city, account.state].filter(Boolean).join(', ') || null
			},
			activity: activity.slice(0, 30),
			suggestedAccounts: [] as SuggestedAccount[],
			linkedAccount: null as LinkedAccount | null
		};
	}

	if (id.startsWith(brandPrefix)) {
		const brandId = id.slice(brandPrefix.length);
		const { data: brand } = await supabase
			.from('brands')
			.select(
				'id, name, contact_first_name, contact_last_name, contact_email, contact_phone, website'
			)
			.eq('id', brandId)
			.single();

		if (!brand) throw error(404, 'Contact not found');

		const activity = await loadBrandActivity(supabase, brandId);
		activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

		return {
			contact: {
				name: [brand.contact_first_name, brand.contact_last_name].filter(Boolean).join(' ') || null,
				email: brand.contact_email,
				phone: brand.contact_phone,
				source: 'brand' as const,
				sourceId: brand.id,
				sourceName: brand.name,
				website: brand.website,
				location: null
			},
			activity: activity.slice(0, 30),
			suggestedAccounts: [] as SuggestedAccount[],
			linkedAccount: null as LinkedAccount | null
		};
	}

	// Discovered contact (plain UUID)
	const { data: discovered } = await supabase
		.from('discovered_contacts')
		.select('*')
		.eq('id', id)
		.single();

	if (!discovered) throw error(404, 'Contact not found');

	let linkedAccount: LinkedAccount | null = null;
	if (discovered.linked_account_id) {
		const { data: linked } = await supabase
			.from('accounts')
			.select('id, business_name, contact_email, city, state')
			.eq('id', discovered.linked_account_id)
			.single();
		if (linked) {
			linkedAccount = {
				id: linked.id,
				business_name: linked.business_name,
				contact_email: linked.contact_email,
				location: [linked.city, linked.state].filter(Boolean).join(', ') || null
			};
		}
	}

	const activity = linkedAccount
		? await loadAccountActivity(supabase, linkedAccount.id)
		: await loadDiscoveredEmailActivity(supabase, discovered.email);
	activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	// Auto-link suggestions — only show if not already linked
	let suggestedAccounts: SuggestedAccount[] = [];
	if (!linkedAccount) {
		const domain = discovered.email.split('@')[1]?.toLowerCase();
		if (
			domain &&
			!['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com'].includes(
				domain
			)
		) {
			const { data: matches } = await supabase
				.from('accounts')
				.select('id, business_name, contact_email')
				.eq('organization_id', organization.id)
				.ilike('contact_email', `%@${domain}`)
				.limit(5);
			suggestedAccounts = matches ?? [];
		}

		const { data: exactMatches } = await supabase
			.from('accounts')
			.select('id, business_name, contact_email')
			.eq('organization_id', organization.id)
			.ilike('contact_email', discovered.email)
			.limit(3);

		if (exactMatches && exactMatches.length > 0) {
			const existingIds = new Set(suggestedAccounts.map((a) => a.id));
			for (const m of exactMatches) {
				if (!existingIds.has(m.id)) suggestedAccounts.unshift(m);
			}
		}
	}

	return {
		contact: {
			name: discovered.name,
			email: discovered.email,
			phone: null,
			source: 'discovered' as const,
			sourceId: discovered.id,
			sourceName: null,
			location: null,
			status: discovered.status,
			messageCount: discovered.message_count,
			firstSeenAt: discovered.first_seen_at,
			lastSeenAt: discovered.last_seen_at
		},
		activity: activity.slice(0, 30),
		suggestedAccounts,
		linkedAccount
	};
};

type SuggestedAccount = { id: string; business_name: string; contact_email: string | null };

type LinkedAccount = {
	id: string;
	business_name: string;
	contact_email: string | null;
	location: string | null;
};

export const actions: Actions = {
	linkToAccount: async ({ request, locals, params }) => {
		const { supabase, organization } = locals;
		if (!organization) return fail(401, { message: 'Not authenticated' });

		const fd = await request.formData();
		const accountId = (fd.get('account_id') ?? '').toString().trim();
		if (!accountId) return fail(400, { message: 'Missing account_id' });

		// Verify the account belongs to the caller's org — prevents cross-org linking.
		const { data: account, error: acctErr } = await supabase
			.from('accounts')
			.select('id')
			.eq('id', accountId)
			.eq('organization_id', organization.id)
			.maybeSingle();
		if (acctErr) return fail(500, { message: acctErr.message });
		if (!account) return fail(404, { message: 'Account not found' });

		const { error: updErr } = await supabase
			.from('discovered_contacts')
			.update({
				linked_account_id: accountId,
				status: 'linked',
				updated_at: new Date().toISOString()
			})
			.eq('id', params.id)
			.eq('organization_id', organization.id);
		if (updErr) return fail(500, { message: updErr.message });

		return { ok: true };
	},

	unlink: async ({ locals, params }) => {
		const { supabase, organization } = locals;
		if (!organization) return fail(401, { message: 'Not authenticated' });

		const { error: updErr } = await supabase
			.from('discovered_contacts')
			.update({
				linked_account_id: null,
				status: 'saved',
				updated_at: new Date().toISOString()
			})
			.eq('id', params.id)
			.eq('organization_id', organization.id);
		if (updErr) return fail(500, { message: updErr.message });

		return { ok: true };
	}
};
