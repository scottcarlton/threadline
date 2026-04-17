import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
	groupCart,
	buildOrders,
	validateCart,
	CartValidationError,
	type CartLine,
	type DeliveryChoice
} from '$lib/server/orders/cart.js';
import type { OrderType, OrderStatus } from '$lib/types/database.js';
import { sendOrderEmail } from '$lib/server/order-emails.js';
import { notifyBrandAdmins } from '$lib/server/notifications.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization, user } = locals;

	if (!organization) {
		return {
			accounts: [],
			locations: [],
			brands: [],
			seasons: [],
			deliveries: [],
			reps: [],
			currentUser: null,
			isBuyer: locals.isBuyer ?? false,
			isBrandOrg: false,
			selfBrandId: null as string | null
		};
	}

	const isBuyer = locals.isBuyer ?? false;
	const buyerAccountIds = isBuyer ? (locals.buyerAccounts?.map((a) => a.account_id) ?? []) : null;
	const buyerBrandIds = isBuyer ? (locals.buyerBrandIds ?? []) : null;

	const [accountsRes, locationsRes, brandsRes, seasonsRes, deliveriesRes, membersRes] =
		await Promise.all([
			(() => {
				let q = supabase
					.from('accounts')
					.select(
						'id, business_name, contact_email, address_line1, address_line2, city, state, zip'
					);
				if (buyerAccountIds)
					q = q.in('id', buyerAccountIds.length ? buyerAccountIds : ['__none__']);
				else
					q = q
						.eq('organization_id', organization.id)
						.eq('is_active', true)
						.is('archived_at', null);
				return q.order('business_name');
			})(),
			supabase
				.from('account_locations')
				.select(
					'id, account_id, label, contact_email, address_line1, address_line2, city, state, zip, is_default, sort_order'
				)
				.eq('organization_id', organization.id)
				.order('sort_order'),
			(() => {
				let q = supabase.from('brands').select('id, name, is_self_brand').eq('is_active', true);
				if (buyerBrandIds) q = q.in('id', buyerBrandIds.length ? buyerBrandIds : ['__none__']);
				// RLS handles federation visibility — no org_id filter needed for non-buyer
				return q.order('name');
			})(),
			supabase
				.from('seasons')
				.select('id, name, sort_order')
				.eq('organization_id', organization.id)
				.eq('is_active', true)
				.order('sort_order'),
			supabase
				.from('season_deliveries')
				.select('id, season_id, label, delivery_month, delivery_day, sort_order')
				.eq('organization_id', organization.id)
				.order('delivery_month')
				.order('delivery_day'),
			supabase
				.from('organization_members')
				.select('profile_id, profiles!organization_members_profile_id_fkey(display_name)')
				.eq('organization_id', organization.id)
		]);

	type RawMember = {
		profile_id: string;
		profiles: { display_name: string | null } | null;
	};
	const reps = ((membersRes.data ?? []) as unknown as RawMember[])
		.map((m) => ({
			user_id: m.profile_id,
			name: m.profiles?.display_name ?? 'Unknown'
		}))
		.sort((a, b) => a.name.localeCompare(b.name));

	const brands = brandsRes.data ?? [];
	const isBrandOrg = locals.orgType === 'brand';

	const selfBrandId = isBrandOrg
		? (brands.find((b) => (b as { is_self_brand?: boolean }).is_self_brand)?.id ?? null)
		: null;

	return {
		accounts: accountsRes.data ?? [],
		locations: locationsRes.data ?? [],
		brands,
		seasons: seasonsRes.data ?? [],
		deliveries: deliveriesRes.data ?? [],
		reps,
		currentUser: user ? { id: user.id } : null,
		isBuyer,
		isBrandOrg,
		selfBrandId
	};
};

type FreeformDetails = {
	business_name: string;
	contact_first_name: string;
	contact_last_name: string;
	contact_email: string;
	phone: string;
	address_line1: string;
	city: string;
	state: string;
	zip: string;
};

type SubmitPayload = {
	type: OrderType;
	account_id: string | null;
	freeform_name: string | null;
	freeformDetails?: FreeformDetails;
	order_year: number | null;
	submitStatus: OrderStatus; // 'draft' | 'submitted'
	lines: CartLine[];
	groups: Array<{
		brand_id: string;
		season_id: string | null;
		delivery: DeliveryChoice | null;
		location_id: string | null;
	}>;
};

export const actions: Actions = {
	submit: async ({ request, locals }) => {
		const { supabase, organization, user } = locals;
		if (!organization || !user) return fail(401, { message: 'Not authenticated' });

		const formData = await request.formData();
		const raw = formData.get('payload');
		if (typeof raw !== 'string') return fail(400, { message: 'Missing payload' });

		let payload: SubmitPayload;
		try {
			payload = JSON.parse(raw);
		} catch {
			return fail(400, { message: 'Invalid payload JSON' });
		}

		// Re-group server-side from the submitted lines (don't trust the client's group breakdown
		// for membership; only trust group-level metadata).
		const groups = groupCart(payload.lines);

		// Apply group metadata (delivery + location) by (brand_id, season_id) key.
		for (const g of groups) {
			const meta = payload.groups.find(
				(m) => m.brand_id === g.brand_id && m.season_id === g.season_id
			);
			if (meta) {
				g.delivery = meta.delivery;
				g.location_id = meta.location_id;
			}
		}

		// If freeform details were provided, create the account first so the
		// orders can be linked and submitted (not stuck as drafts).
		let resolvedAccountId = payload.account_id;
		let resolvedFreeformName = payload.freeform_name;
		if (!resolvedAccountId && payload.freeformDetails?.business_name?.trim()) {
			const details = payload.freeformDetails;
			const { data: newAccount, error: acctErr } = await supabase
				.from('accounts')
				.insert({
					organization_id: organization.id,
					business_name: details.business_name.trim(),
					contact_first_name: details.contact_first_name?.trim() || null,
					contact_last_name: details.contact_last_name?.trim() || null,
					contact_email: details.contact_email?.trim() || null,
					phone: details.phone?.trim() || null,
					address_line1: details.address_line1?.trim() || null,
					city: details.city?.trim() || null,
					state: details.state?.trim() || null,
					zip: details.zip?.trim() || null
				})
				.select('id')
				.single();
			if (acctErr || !newAccount) {
				return fail(500, { message: acctErr?.message ?? 'Failed to create account' });
			}
			resolvedAccountId = newAccount.id;
			resolvedFreeformName = null;
		}

		try {
			validateCart(
				groups,
				{
					type: payload.type,
					account_id: resolvedAccountId,
					freeform_name: resolvedFreeformName,
					order_year: payload.order_year
				},
				payload.submitStatus
			);
		} catch (e) {
			if (e instanceof CartValidationError) return fail(400, { message: e.message });
			throw e;
		}

		const newOrders = buildOrders(
			groups,
			{
				type: payload.type,
				account_id: resolvedAccountId,
				freeform_name: resolvedFreeformName,
				order_year: payload.order_year
			},
			payload.submitStatus
		);

		const createdIds: string[] = [];

		for (const o of newOrders) {
			const { data: orderRow, error: orderErr } = await supabase
				.from('orders')
				.insert({
					organization_id: organization.id,
					order_type: o.order_type,
					account_id: o.account_id,
					freeform_name: o.freeform_name,
					location_id: o.location_id,
					brand_id: o.brand_id,
					season_id: o.season_id,
					order_year: o.order_year,
					delivery_id: o.delivery_id,
					expected_ship_date: o.expected_ship_date,
					start_ship_date: o.start_ship_date,
					status: o.status,
					total_amount: o.total_amount,
					created_by: user.id,
					submitted_at: o.status === 'submitted' ? new Date().toISOString() : null
				})
				.select('id, order_number')
				.single();

			if (orderErr || !orderRow) {
				return fail(500, { message: orderErr?.message ?? 'Failed to create order' });
			}

			if (o.lines.length > 0) {
				const linesInsert = o.lines.map((l, i) => ({
					order_id: orderRow.id,
					product_id: l.product_id,
					style_number: l.style_number,
					description: l.description,
					color: l.color,
					size: l.size,
					qty: l.qty,
					unit_price: l.unit_price,
					sort_order: i
				}));
				const { error: lineErr } = await supabase.from('order_lines').insert(linesInsert);
				if (lineErr) return fail(500, { message: lineErr.message });
			}

			if (o.status === 'submitted') {
				const origin = request.headers.get('origin') ?? '';
				sendOrderEmail(
					'submitted',
					{
						id: orderRow.id,
						order_number: orderRow.order_number,
						total_amount: o.total_amount,
						brand_id: o.brand_id,
						account_id: o.account_id,
						created_by: user.id
					},
					origin
				);
				notifyBrandAdmins(o.brand_id, user.id, {
					type: 'order_submitted',
					title: 'New order submitted',
					body: `Order ${orderRow.order_number} has been submitted`,
					link: `/orders/${orderRow.id}`
				});
			}

			createdIds.push(orderRow.id);
		}

		throw redirect(303, `/orders`);
	}
};
