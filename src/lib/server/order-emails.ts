import { supabaseAdmin } from './supabase.js';
import { sendEmail } from './email.js';
import { notification } from './email-templates.js';

export type OrderEmailEvent = 'submitted' | 'created' | 'confirmed' | 'shipped';

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

async function resolveBuyerEmail(accountId: string | null): Promise<string | null> {
	if (!accountId) return null;
	const { data } = await supabaseAdmin
		.from('accounts')
		.select('contact_email')
		.eq('id', accountId)
		.single();
	return data?.contact_email ?? null;
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

		const emailConfigs: Record<
			OrderEmailEvent,
			{ recipients: () => Promise<Recipient[]>; subject: string; body: string }
		> = {
			submitted: {
				recipients: () => resolveBrandAdminRecipients(order.brand_id),
				subject: `New order submitted: ${order.order_number}`,
				body: `A new order has been submitted for <strong>${accountName}</strong> (${brandName}).<br>Total: ${total}`
			},
			created: {
				recipients: async () => {
					const email = await resolveAuthEmail(order.created_by);
					const orgId = await resolveCreatorOrgId(order.created_by);
					return email ? [{ email, profileId: order.created_by, orgId }] : [];
				},
				subject: `Order created: ${order.order_number}`,
				body: `An order has been created for <strong>${accountName}</strong> (${brandName}).<br>Total: ${total}`
			},
			confirmed: {
				recipients: async () => {
					const r: Recipient[] = [];
					const buyerEmail = await resolveBuyerEmail(order.account_id);
					if (buyerEmail) r.push({ email: buyerEmail, profileId: null, orgId: null });
					const repEmail = await resolveAuthEmail(order.created_by);
					const repOrgId = await resolveCreatorOrgId(order.created_by);
					if (repEmail) r.push({ email: repEmail, profileId: order.created_by, orgId: repOrgId });
					return r;
				},
				subject: `Order confirmed: ${order.order_number}`,
				body: `Order <strong>${order.order_number}</strong> for ${accountName} (${brandName}) has been confirmed.<br>Total: ${total}`
			},
			shipped: {
				recipients: async () => {
					const r: Recipient[] = [];
					const buyerEmail = await resolveBuyerEmail(order.account_id);
					if (buyerEmail) r.push({ email: buyerEmail, profileId: null, orgId: null });
					const repEmail = await resolveAuthEmail(order.created_by);
					const repOrgId = await resolveCreatorOrgId(order.created_by);
					if (repEmail) r.push({ email: repEmail, profileId: order.created_by, orgId: repOrgId });
					return r;
				},
				subject: `Order shipped: ${order.order_number}`,
				body: `Order <strong>${order.order_number}</strong> for ${accountName} (${brandName}) has shipped.<br>Total: ${total}`
			}
		};

		const config = emailConfigs[event];
		const recipients = await config.recipients();
		if (recipients.length === 0) return;

		const tpl = notification({
			title: config.subject,
			body: config.body,
			actionUrl: orderUrl,
			actionLabel: 'View Order'
		});

		for (const r of recipients) {
			const allowed = await checkEmailPreference(r.profileId, r.orgId, 'order_updates');
			if (!allowed) continue;

			await sendEmail({
				to: r.email,
				...tpl,
				template: `order_${event}`,
				relatedType: 'order',
				relatedId: order.id
			});
		}
	} catch (err) {
		console.error(`[order-emails] Failed to send ${event} email for ${order.order_number}:`, err);
	}
}
