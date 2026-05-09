import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { logSupabaseError } from '$lib/server/log-supabase-error.js';
import { isPaymentPreferenceCode } from '$lib/payment-methods';
import { aggregateOrderActivity, type RawAudit } from '$lib/server/orders/activity.js';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	// Hook for invalidate('data:orders') after AI tool calls that touch orders
	// or order lines — keeps the detail page in sync without a manual refresh.
	depends('data:orders');

	const { supabase, organization, orgType } = locals;

	// Accept either a UUID (legacy list/dashboard links) or a human-readable
	// order_number (e.g. DEN-000002 from the confirmation page). UUIDs have the
	// 8-4-4-4-12 hex-with-dashes shape; anything else is treated as order_number.
	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	const isUuid = UUID_RE.test(params.id);

	const baseOrderQuery = supabase
		.from('orders')
		.select(
			'*, brands(name, commission_rate), accounts(business_name, contact_first_name, contact_last_name, contact_email, contact_phone, phone, address_line1, address_line2, city, state, zip), seasons(name), shows(name), profiles!orders_created_by_fkey(display_name), source_types(name), season_deliveries!delivery_id(label, delivery_month, delivery_day), show_dates(id, year, month, city, state, shows(name)), account_locations!location_id(label, address_line1, address_line2, city, state, zip), bill_to_location:account_locations!bill_to_location_id(label, address_line1, address_line2, city, state, zip), brand_terms!terms_id(id, title, body, version), terms_agreed_profile:profiles!terms_agreed_by(display_name)'
		);

	const orderResult = await (isUuid
		? baseOrderQuery.eq('id', params.id).single()
		: baseOrderQuery.eq('order_number', params.id).single());

	if (orderResult.error || !orderResult.data) {
		throw error(404, 'Order not found');
	}

	const resolvedOrderId = (orderResult.data as { id: string }).id;
	const linesResult = await supabase
		.from('order_lines')
		.select('*')
		.eq('order_id', resolvedOrderId)
		.order('sort_order');

	// Load product metadata for any order_lines that reference a product. The
	// Line Items table needs image, variants (sizes/colors), and season label
	// per row so the redesigned (product, color)-granular view can render
	// without extra round-trips.
	const productIds = Array.from(
		new Set(
			(linesResult.data ?? [])
				.map((l) => (l as { product_id?: string | null }).product_id)
				.filter((id): id is string => !!id)
		)
	);
	const productsById: Record<
		string,
		{
			primary_image_id: string | null;
			colors: string[];
			sizes: string[];
			season_name: string | null;
			season_year: number | null;
		}
	> = {};
	if (productIds.length > 0) {
		const { data: productsData } = await supabase
			.from('products')
			.select(
				'id, product_year, seasons(name), product_variants(color, size), product_images(id, is_primary, sort_order, role, variant_id)'
			)
			.in('id', productIds);
		for (const p of productsData ?? []) {
			const row = p as unknown as {
				id: string;
				product_year: number | null;
				seasons: { name?: string | null } | { name?: string | null }[] | null;
				product_variants: Array<{ color: string | null; size: string | null }> | null;
				product_images: Array<{
					id: string;
					is_primary: boolean | null;
					sort_order: number | null;
				}> | null;
			};
			const images = [...(row.product_images ?? [])].sort((a, b) => {
				if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
				return (a.sort_order ?? 0) - (b.sort_order ?? 0);
			});
			const season = Array.isArray(row.seasons) ? (row.seasons[0] ?? null) : row.seasons;
			productsById[row.id] = {
				primary_image_id: images[0]?.id ?? null,
				colors: [
					...new Set(
						(row.product_variants ?? []).map((v) => v.color).filter((c): c is string => !!c)
					)
				],
				sizes: [
					...new Set(
						(row.product_variants ?? []).map((v) => v.size).filter((s): s is string => !!s)
					)
				],
				season_name: season?.name ?? null,
				season_year: row.product_year
			};
		}
	}

	// Mark this order as viewed by the current user. Drives the Orders nav badge
	// ('unviewed' drops once the user opens the detail page). Best-effort — don't
	// fail the page load if the upsert errors.
	if (locals.user?.id) {
		await supabaseAdmin.from('order_views').upsert(
			{
				order_id: resolvedOrderId,
				profile_id: locals.user.id,
				viewed_at: new Date().toISOString()
			},
			{ onConflict: 'order_id,profile_id' }
		);
	}

	// Load brand assets, commission override, rep info, comments, and audits in parallel
	const [brandAssetsRes, overrideRes, repRes, commentsRes, auditsRes] = await Promise.all([
		supabase
			.from('brand_assets')
			.select('*')
			.eq('brand_id', orderResult.data.brand_id)
			.order('created_at', { ascending: false }),
		supabase
			.from('commission_overrides')
			.select('rate')
			.eq('brand_id', orderResult.data.brand_id)
			.eq('account_id', orderResult.data.account_id)
			.single(),
		supabase
			.from('organization_members')
			.select(
				'id, commission_rate, profiles!organization_members_profile_id_fkey(display_name, email)'
			)
			.eq('profile_id', orderResult.data.created_by)
			.single(),
		// Use supabaseAdmin for comments + audits — order visibility is already
		// enforced by the orders SELECT above (404 if the user can't see it).
		// author_id / actor_id FK to auth.users, not public.profiles, so we
		// can't embed profiles here — display names are merged in below.
		supabaseAdmin
			.from('order_comments')
			.select('*, source_org:source_org_id(id, name)')
			.eq('order_id', resolvedOrderId)
			.order('created_at', { ascending: true }),
		supabaseAdmin
			.from('order_audits')
			.select('*')
			.eq('order_id', resolvedOrderId)
			.order('created_at', { ascending: false })
	]);

	logSupabaseError('orders/[id] load: order_comments', commentsRes.error);
	logSupabaseError('orders/[id] load: order_audits', auditsRes.error);

	// Resolve author/actor display names separately (see note above).
	const commentRows = (commentsRes.data ?? []) as Array<{
		author_id: string | null;
		[key: string]: unknown;
	}>;
	const auditRows = (auditsRes.data ?? []) as Array<{
		actor_id: string | null;
		[key: string]: unknown;
	}>;
	const profileIds = Array.from(
		new Set(
			[...commentRows.map((c) => c.author_id), ...auditRows.map((a) => a.actor_id)].filter(
				(id): id is string => !!id
			)
		)
	);
	const profileNameById = new Map<string, string | null>();
	if (profileIds.length > 0) {
		const profilesRes = await supabaseAdmin
			.from('profiles')
			.select('id, display_name')
			.in('id', profileIds);
		logSupabaseError('orders/[id] load: profiles lookup', profilesRes.error);
		for (const p of (profilesRes.data ?? []) as Array<{
			id: string;
			display_name: string | null;
		}>) {
			profileNameById.set(p.id, p.display_name);
		}
	}
	const comments = commentRows.map((c) => ({
		...c,
		profiles: c.author_id ? { display_name: profileNameById.get(c.author_id) ?? null } : null
	}));
	const audits = auditRows.map((a) => ({
		...a,
		actor: a.actor_id ? { display_name: profileNameById.get(a.actor_id) ?? null } : null
	}));

	// Shape audits into humanized, aggregated timeline entries for the
	// redesigned Activity panel. Consecutive line_added events from the same
	// actor collapse into a single "N lines added" entry. Pass order_type so
	// the "Order created" / "Note created" title matches.
	const activity = aggregateOrderActivity(auditRows as RawAudit[], profileNameById, {
		orderType: (orderResult.data as { order_type?: 'order' | 'note' | null }).order_type ?? null
	});

	// Look up per-brand commission for the rep, fall back to their default rate
	let repCommissionRate = repRes.data?.commission_rate ?? 0;
	if (repRes.data?.id) {
		const { data: brandCommission } = await supabase
			.from('member_brand_commissions')
			.select('rate')
			.eq('member_id', repRes.data.id)
			.eq('brand_id', orderResult.data.brand_id)
			.single();
		if (brandCommission) {
			repCommissionRate = brandCommission.rate;
		}
	}

	// Federation context: is this a federated order viewed from the brand side?
	let federation: {
		isFederatedView: boolean;
		sourceOrg: { id: string; name: string } | null;
		repDisplayName: string | null;
	} = { isFederatedView: false, sourceOrg: null, repDisplayName: null };

	if (orgType === 'brand' && organization && orderResult.data.organization_id !== organization.id) {
		// Admin client so we can read the rep org + rep user across org boundaries.
		const { data: link } = await supabaseAdmin
			.from('federated_order_links')
			.select('source_org_id, source_org:source_org_id(id, name)')
			.eq('order_id', resolvedOrderId)
			.eq('target_org_id', organization.id)
			.eq('status', 'active')
			.maybeSingle();
		if (link) {
			// Supabase sometimes types foreign-key joins as an array; normalize.
			const rawSourceOrg = (link as unknown as { source_org: unknown }).source_org;
			const sourceOrg = Array.isArray(rawSourceOrg)
				? ((rawSourceOrg[0] ?? null) as { id: string; name: string } | null)
				: ((rawSourceOrg ?? null) as { id: string; name: string } | null);
			// Fetch the rep's profile via admin — the order SELECT's joined
			// profiles row is gated by profiles RLS which the brand-side viewer
			// typically can't satisfy (rep user is in a different org).
			let repDisplayName: string | null =
				(orderResult.data as { profiles?: { display_name?: string | null } | null }).profiles
					?.display_name ?? null;
			if (!repDisplayName && orderResult.data.created_by) {
				const { data: repProfile } = await supabaseAdmin
					.from('profiles')
					.select('display_name')
					.eq('id', orderResult.data.created_by)
					.maybeSingle();
				repDisplayName = repProfile?.display_name ?? null;
			}
			federation = { isFederatedView: true, sourceOrg, repDisplayName };
		}
	}

	const canEditOrder = !!organization && orderResult.data.organization_id === organization.id;

	// For notes, preload everything the Convert-to-Order modal needs: all
	// account locations (ship-to / bill-to pickers) and the current brand_terms
	// (terms gate). Orders don't need either — saves a round-trip.
	type AccountLocation = {
		id: string;
		label: string | null;
		is_default: boolean | null;
		address_line1: string | null;
		address_line2: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
	};
	type CurrentBrandTerms = { id: string; title: string; body: string; version: number };
	let accountLocations: AccountLocation[] = [];
	let currentBrandTerms: CurrentBrandTerms | null = null;
	// Load Convert-to-Order modal data whenever the viewer is looking at a note,
	// regardless of org — federated viewers (e.g. BOA on a rep's note) still
	// need to see ship-to / bill-to options and the terms gate. Authz on the
	// actual convert write stays on the ?/convert action.
	if (orderResult.data.order_type === 'note') {
		const [locRes, termsRes] = await Promise.all([
			orderResult.data.account_id
				? supabaseAdmin
						.from('account_locations')
						.select('id, label, is_default, address_line1, address_line2, city, state, zip')
						.eq('account_id', orderResult.data.account_id)
						.order('is_default', { ascending: false })
				: Promise.resolve({ data: [] as AccountLocation[], error: null }),
			supabaseAdmin
				.from('brand_terms')
				.select('id, title, body, version')
				.eq('brand_id', orderResult.data.brand_id)
				.eq('is_current', true)
				.maybeSingle()
		]);
		accountLocations = (locRes.data ?? []) as AccountLocation[];
		currentBrandTerms = (termsRes.data as CurrentBrandTerms | null) ?? null;
	}

	return {
		order: orderResult.data,
		lines: linesResult.data ?? [],
		productsById,
		brandAssets: brandAssetsRes.data ?? [],
		commissionOverride: overrideRes.data?.rate ?? null,
		repCommissionRate,
		repName: (() => {
			const profilesJoin = repRes.data?.profiles as
				| { display_name?: string; email?: string }
				| { display_name?: string; email?: string }[]
				| null
				| undefined;
			if (!profilesJoin) return null;
			return (
				(Array.isArray(profilesJoin) ? profilesJoin[0]?.display_name : profilesJoin.display_name) ??
				null
			);
		})(),
		repEmail: (() => {
			const profilesJoin = repRes.data?.profiles as
				| { email?: string }
				| { email?: string }[]
				| null
				| undefined;
			if (!profilesJoin) return null;
			return (Array.isArray(profilesJoin) ? profilesJoin[0]?.email : profilesJoin.email) ?? null;
		})(),
		comments,
		audits,
		activity,
		federation,
		canEditOrder,
		acceptedPaymentMethods: canEditOrder
			? ((organization.accepted_payment_methods ?? []) as string[])
			: ([] as string[]),
		accountLocations,
		currentBrandTerms
	};
};

export const actions: Actions = {
	updatePaymentPreference: async ({ request, locals, params }) => {
		const { organization, membership } = locals;
		if (!organization) return fail(401, { message: 'Not authenticated' });
		const role = membership?.role;
		if (!['admin', 'owner', 'member', 'sales'].includes(role ?? '')) {
			return fail(403, { message: 'You do not have permission to edit payment preference.' });
		}

		const fd = await request.formData();
		const raw = (fd.get('code') ?? '').toString().trim();
		const accepted = (organization.accepted_payment_methods ?? []) as string[];

		let next: string | null = null;
		if (raw) {
			if (!isPaymentPreferenceCode(raw) || !accepted.includes(raw)) {
				return fail(400, { message: 'That payment method is not accepted by your organization.' });
			}
			next = raw;
		}

		// Accept UUID or order_number in the URL.
		const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		const baseUpdate = supabaseAdmin
			.from('orders')
			.update({ payment_preference: next, updated_at: new Date().toISOString() })
			.eq('organization_id', organization.id);
		const { error: updErr } = await (UUID_RE.test(params.id)
			? baseUpdate.eq('id', params.id)
			: baseUpdate.eq('order_number', params.id));
		if (updErr) return fail(500, { message: updErr.message });
		return { ok: true };
	},

	// Convert a note to a submitted order. Collects the Finalize fields
	// (ship window, ship-to / bill-to, payment, terms, PO) in one atomic
	// update — flips order_type note → order, status → submitted, and
	// records the terms agreement when the brand has current terms.
	convert: async ({ request, locals, params }) => {
		const { organization, membership, session, user } = locals;
		if (!session || !organization || !user) {
			return fail(401, { message: 'Not authenticated' });
		}
		const role = membership?.role ?? '';
		if (!['admin', 'owner', 'member', 'sales'].includes(role)) {
			return fail(403, { message: 'You do not have permission to convert this note.' });
		}

		const fd = await request.formData();
		const get = (k: string) => {
			const v = fd.get(k);
			return v === null ? '' : String(v).trim();
		};
		const startShip = get('start_ship_date');
		const expectedShip = get('expected_ship_date');
		const locationId = get('location_id') || null;
		const billToLocationId = get('bill_to_location_id') || null;
		const paymentPreference = get('payment_preference') || null;
		const paymentTerms = get('payment_terms') || null;
		const shippingMethod = get('shipping_method') || null;
		const poNumber = get('po_number') || null;
		const agreedTermsId = get('agreed_terms_id') || null;

		if (!startShip || !expectedShip) {
			return fail(400, { message: 'Start and complete ship dates are required.' });
		}
		if (paymentPreference && !isPaymentPreferenceCode(paymentPreference)) {
			return fail(400, { message: 'Invalid payment preference.' });
		}

		// Resolve order by UUID or order_number.
		const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		const baseOrder = supabaseAdmin
			.from('orders')
			.select('id, organization_id, order_type, brand_id, account_id');
		const orderRes = await (UUID_RE.test(params.id)
			? baseOrder.eq('id', params.id).single()
			: baseOrder.eq('order_number', params.id).single());
		if (orderRes.error || !orderRes.data) return fail(404, { message: 'Note not found.' });
		const row = orderRes.data as {
			id: string;
			organization_id: string;
			order_type: string;
			brand_id: string;
			account_id: string | null;
		};
		if (row.organization_id !== organization.id) {
			// Cross-org: allow when there's an active federated_order_links row
			// pointing at the caller's org. Mirrors the PATCH /lines endpoint —
			// BOA acting on a federated rep-owned note can still convert it.
			const { data: link } = await supabaseAdmin
				.from('federated_order_links')
				.select('id')
				.eq('order_id', row.id)
				.eq('target_org_id', organization.id)
				.eq('status', 'active')
				.maybeSingle();
			if (!link) return fail(403, { message: 'Not your note.' });
		}
		if (row.order_type !== 'note') {
			return fail(409, { message: 'This is already an order.' });
		}

		// Terms gate: the buyer always agrees to SOMETHING — a brand-specific
		// row when the brand has one, or a generic wholesale fallback.
		if (!agreedTermsId) {
			return fail(400, { message: 'Buyer terms must be agreed to before converting.' });
		}
		const { data: brandTerms } = await supabaseAdmin
			.from('brand_terms')
			.select('id')
			.eq('brand_id', row.brand_id)
			.eq('is_current', true)
			.maybeSingle();
		if (brandTerms && agreedTermsId !== brandTerms.id && agreedTermsId !== 'generic') {
			return fail(400, {
				message: 'Buyer terms must be agreed to the current version.'
			});
		}

		const now = new Date().toISOString();
		const update: Record<string, unknown> = {
			order_type: 'order',
			status: 'submitted',
			start_ship_date: startShip,
			expected_ship_date: expectedShip,
			location_id: locationId,
			bill_to_location_id: billToLocationId,
			payment_preference: paymentPreference,
			payment_terms: paymentTerms,
			shipping_method: shippingMethod,
			po_number: poNumber,
			submitted_at: now,
			updated_at: now,
			terms_agreed_by: user.id,
			terms_agreed_at: now
		};
		// Only set terms_id when the buyer agreed to the brand's specific row.
		// Generic fallback leaves terms_id null; the audit trail still lives on
		// terms_agreed_by / terms_agreed_at.
		if (brandTerms && agreedTermsId === brandTerms.id) {
			update.terms_id = brandTerms.id;
		}

		const { error: updErr } = await supabaseAdmin.from('orders').update(update).eq('id', row.id);
		if (updErr) return fail(500, { message: updErr.message });

		return { ok: true };
	}
};
