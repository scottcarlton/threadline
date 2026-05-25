import { supabaseAdmin } from './supabase.js';
import { sendEmail } from './email.js';
import templateIds from '../../../emails/template-ids.json';

export type OrderEmailEvent =
	| 'submitted'
	| 'created'
	| 'confirmed'
	| 'preparing'
	| 'shipped'
	| 'delivered';

type OrderContext = {
	id: string;
	order_number: string;
	total_amount: number;
	brand_id: string;
	account_id: string | null;
	created_by: string;
};

type Recipient = {
	email: string;
	profileId: string | null;
	orgId: string | null;
};

const fmt = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 0,
	maximumFractionDigits: 0
});

const EVENT_TEMPLATE_MAP: Partial<Record<OrderEmailEvent, number>> = {
	submitted: templateIds['order-submitted'],
	created: templateIds['order-created'],
	confirmed: templateIds['order-confirmed'],
	shipped: templateIds['order-shipped'],
	delivered: templateIds['order-delivered']
};

async function resolveAuthEmail(profileId: string): Promise<string | null> {
	const { data } = await supabaseAdmin.auth.admin.getUserById(profileId);
	return data?.user?.email ?? null;
}

async function checkEmailPreference(
	profileId: string | null,
	orgId: string | null,
	key: string
): Promise<boolean> {
	if (!profileId || !orgId) return true;
	const { data } = await supabaseAdmin
		.from('notification_preferences')
		.select(key)
		.eq('user_id', profileId)
		.eq('organization_id', orgId)
		.maybeSingle();
	if (!data) return true;
	return (data as unknown as Record<string, boolean>)[key] !== false;
}

async function resolveBrandAdminRecipients(brandId: string): Promise<Recipient[]> {
	const { data: brand } = await supabaseAdmin
		.from('brands')
		.select('organization_id')
		.eq('id', brandId)
		.single();
	if (!brand) return [];

	const { data: members } = await supabaseAdmin
		.from('organization_members')
		.select('profile_id')
		.eq('organization_id', brand.organization_id)
		.in('role', ['admin', 'owner']);

	const recipients: Recipient[] = [];
	for (const m of members ?? []) {
		const email = await resolveAuthEmail(m.profile_id);
		if (email) recipients.push({ email, profileId: m.profile_id, orgId: brand.organization_id });
	}
	return recipients;
}

async function resolveOrderContext(
	order: OrderContext
): Promise<{ accountName: string; brandName: string }> {
	const [{ data: account }, { data: brand }] = await Promise.all([
		order.account_id
			? supabaseAdmin
					.from('accounts')
					.select('business_name, contact_email')
					.eq('id', order.account_id)
					.single()
			: Promise.resolve({ data: null }),
		supabaseAdmin.from('brands').select('name').eq('id', order.brand_id).single()
	]);
	return {
		accountName: account?.business_name ?? 'Unknown account',
		brandName: brand?.name ?? 'Unknown brand'
	};
}

async function resolveBuyerRecipients(accountId: string | null): Promise<Recipient[]> {
	if (!accountId) return [];

	const [usersRes, accountRes] = await Promise.all([
		supabaseAdmin.from('account_users').select('profile_id').eq('account_id', accountId),
		supabaseAdmin
			.from('accounts')
			.select('contact_email, organization_id')
			.eq('id', accountId)
			.single()
	]);

	const seen = new Set<string>();
	const recipients: Recipient[] = [];
	const orgId = accountRes.data?.organization_id ?? null;

	for (const u of usersRes.data ?? []) {
		const email = await resolveAuthEmail(u.profile_id);
		if (!email) continue;
		const key = email.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		recipients.push({ email, profileId: u.profile_id, orgId });
	}

	const fallbackEmail = accountRes.data?.contact_email ?? null;
	if (fallbackEmail && !seen.has(fallbackEmail.toLowerCase())) {
		recipients.push({ email: fallbackEmail, profileId: null, orgId: null });
	}

	return recipients;
}

async function resolveCreatorOrgId(profileId: string): Promise<string | null> {
	const { data } = await supabaseAdmin
		.from('organization_members')
		.select('organization_id')
		.eq('profile_id', profileId)
		.limit(1)
		.maybeSingle();
	return data?.organization_id ?? null;
}

export async function sendOrderEmail(
	event: OrderEmailEvent,
	order: OrderContext,
	origin: string
): Promise<void> {
	try {
		const { accountName, brandName } = await resolveOrderContext(order);
		const orderUrl = `${origin}/orders/${order.id}`;
		const total = fmt.format(order.total_amount);

		const baseParams: Record<string, string | number> = {
			ORDER_NUMBER: order.order_number,
			ACCOUNT_NAME: accountName,
			BRAND_NAME: brandName,
			TOTAL: total,
			ORDER_URL: orderUrl
		};

		// For shipped emails, fetch tracking info
		if (event === 'shipped') {
			const { data: freshOrder } = await supabaseAdmin
				.from('orders')
				.select('tracking_number, carrier')
				.eq('id', order.id)
				.single();
			if (freshOrder?.tracking_number) {
				baseParams.TRACKING_NUMBER = freshOrder.tracking_number;
				const { trackingUrl } = await import('$lib/utils/carriers.js');
				const url = trackingUrl(freshOrder.carrier, freshOrder.tracking_number);
				if (url) baseParams.TRACKING_URL = url;
			}
		}

		const templateId = EVENT_TEMPLATE_MAP[event];

		// 'preparing' has no Brevo template — use inline HTML fallback
		if (!templateId) {
			let prepInfo = '';
			if (event === 'preparing') {
				const { data: freshOrder } = await supabaseAdmin
					.from('orders')
					.select('start_ship_date')
					.eq('id', order.id)
					.single();
				if (freshOrder?.start_ship_date) {
					const d = new Date(freshOrder.start_ship_date + 'T00:00:00Z');
					const formatted = d.toLocaleDateString('en-US', {
						month: 'long',
						day: 'numeric',
						year: 'numeric',
						timeZone: 'UTC'
					});
					prepInfo = `<br>Expected ship date: ${formatted}`;
				}
			}

			const recipients = await resolveRecipients(event, order);
			for (const r of recipients) {
				const allowed = await checkEmailPreference(r.profileId, r.orgId, 'order_updates');
				if (!allowed) continue;

				await sendEmail({
					to: r.email,
					subject: `Order preparing to ship: ${order.order_number}`,
					html: `<p>Order <strong>${order.order_number}</strong> for <strong>${accountName}</strong> (${brandName}) is being prepared for shipment.${prepInfo}<br>Total: ${total}</p>`,
					text: `Order ${order.order_number} for ${accountName} (${brandName}) is being prepared. Total: ${total}`,
					template: `order_${event}`,
					relatedType: 'order',
					relatedId: order.id
				});
			}
			return;
		}

		const recipients = await resolveRecipients(event, order);
		if (recipients.length === 0) return;

		for (const r of recipients) {
			const allowed = await checkEmailPreference(r.profileId, r.orgId, 'order_updates');
			if (!allowed) continue;

			await sendEmail({
				to: r.email,
				subject: `Order ${event}: ${order.order_number}`,
				html: '',
				templateId,
				params: baseParams,
				template: `order_${event}`,
				relatedType: 'order',
				relatedId: order.id
			});
		}
	} catch (err) {
		console.error(`[order-emails] Failed to send ${event} email for ${order.order_number}:`, err);
	}
}

async function resolveRecipients(
	event: OrderEmailEvent,
	order: OrderContext
): Promise<Recipient[]> {
	switch (event) {
		case 'submitted': {
			const [admins, buyers] = await Promise.all([
				resolveBrandAdminRecipients(order.brand_id),
				resolveBuyerRecipients(order.account_id)
			]);
			return [...admins, ...buyers];
		}
		case 'created': {
			const email = await resolveAuthEmail(order.created_by);
			const orgId = await resolveCreatorOrgId(order.created_by);
			return email ? [{ email, profileId: order.created_by, orgId }] : [];
		}
		case 'confirmed':
		case 'preparing':
		case 'delivered': {
			const r: Recipient[] = await resolveBuyerRecipients(order.account_id);
			const repEmail = await resolveAuthEmail(order.created_by);
			const repOrgId = await resolveCreatorOrgId(order.created_by);
			if (repEmail) r.push({ email: repEmail, profileId: order.created_by, orgId: repOrgId });
			return r;
		}
		case 'shipped':
			return resolveBuyerRecipients(order.account_id);
	}
}
