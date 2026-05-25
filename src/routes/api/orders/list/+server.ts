import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { listFederatedOrders } from '$lib/server/federation.js';
import { resolveOrderSearch, applyOrderSearch } from '$lib/server/orders/search.js';
import { incrementDate } from '$lib/utils/date-presets.js';
import { classifyOrder, parseSpotlightParam } from '$lib/utils/order-spotlight.js';

const PAGE_SIZE = 50;

const ORDER_SELECT =
	'*, brands(name), accounts(business_name), seasons(name), show_dates(id, show_id, year, month, city, state, shows(name)), profiles!orders_created_by_fkey(display_name), source_types(name), season_deliveries!delivery_id(label, delivery_month, delivery_day)';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { organization, orgType } = locals;
	if (!locals.session || !organization) return json({ orders: [], hasMore: false });

	const offset = parseInt(url.searchParams.get('offset') ?? '0');
	const limit = parseInt(url.searchParams.get('limit') ?? String(PAGE_SIZE));
	const search = url.searchParams.get('search')?.trim() ?? '';
	const status = url.searchParams.get('status');
	const seasonFilter = url.searchParams.get('season');
	const brandFilter = url.searchParams.get('brand');
	const showDateId = url.searchParams.get('show');
	const repOrgId = url.searchParams.get('rep');
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	const toExclusive = to ? incrementDate(to) : null;
	const spotlight = parseSpotlightParam(url.searchParams.get('spotlight'));

	function applySpotlight<T extends Parameters<typeof classifyOrder>[0]>(rows: T[]): T[] {
		if (!spotlight) return rows;
		return rows.filter((r) => {
			const buckets = classifyOrder(r);
			if (buckets.length === 0) return false;
			if (spotlight === 'all') return true;
			return buckets.includes(spotlight);
		});
	}

	// ── Brand org: merge direct + federated, slice ────────────────────────
	if (orgType === 'brand') {
		const brandIsSales = locals.membership?.role === 'sales';
		const brandUserId = locals.user?.id;

		// Resolve name-based filters
		let seasonIds: string[] | null = null;
		if (seasonFilter) {
			const { data } = await supabaseAdmin.from('seasons').select('id').ilike('name', seasonFilter);
			seasonIds = data?.map((s) => s.id) ?? [];
		}
		let brandIds: string[] | null = null;
		if (brandFilter) {
			const { data } = await supabaseAdmin.from('brands').select('id').ilike('name', brandFilter);
			brandIds = data?.map((b) => b.id) ?? [];
		}

		// Direct orders
		let directQuery = supabaseAdmin
			.from('orders')
			.select(ORDER_SELECT)
			.eq('organization_id', organization.id)
			.order('created_at', { ascending: false });
		if (brandIsSales && brandUserId) directQuery = directQuery.eq('created_by', brandUserId);
		if (status) directQuery = directQuery.eq('status', status);
		if (seasonIds && seasonIds.length > 0) directQuery = directQuery.in('season_id', seasonIds);
		if (brandIds && brandIds.length > 0) directQuery = directQuery.in('brand_id', brandIds);
		if (showDateId) directQuery = directQuery.eq('show_date_id', showDateId);
		if (from) directQuery = directQuery.gte('created_at', from);
		if (toExclusive) directQuery = directQuery.lt('created_at', toExclusive);

		// Search on direct orders
		if (search) {
			const resolved = await resolveOrderSearch(supabaseAdmin, search);
			directQuery = applyOrderSearch(directQuery, search, resolved.accountIds, resolved.brandIds);
		}

		const directRes = await directQuery;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const directOrders = ((directRes.data ?? []) as any[]).map((o) => ({
			...o,
			source_org: null as { id: string; name: string } | null
		}));

		// Federated orders
		let federatedOrders = brandIsSales
			? []
			: await listFederatedOrders(supabaseAdmin, organization.id);
		if (status) federatedOrders = federatedOrders.filter((o) => o.status === status);
		if (repOrgId) federatedOrders = federatedOrders.filter((o) => o.rep_org_id === repOrgId);
		if (seasonIds)
			federatedOrders = federatedOrders.filter(
				(o) => o.season_id && seasonIds!.includes(o.season_id)
			);
		if (brandIds) federatedOrders = federatedOrders.filter((o) => brandIds!.includes(o.brand_id));
		if (from) federatedOrders = federatedOrders.filter((o) => o.created_at >= from);
		if (toExclusive) federatedOrders = federatedOrders.filter((o) => o.created_at < toExclusive);
		if (search) {
			const q = search.toLowerCase();
			federatedOrders = federatedOrders.filter(
				(o) =>
					o.order_number?.toLowerCase().includes(q) ||
					o.account_name?.toLowerCase().includes(q) ||
					o.brand_name?.toLowerCase().includes(q)
			);
		}

		const federatedReshaped = federatedOrders.map((o) => ({
			id: o.id,
			order_number: o.order_number,
			order_type: o.order_type,
			status: o.status,
			total_amount: o.total_amount,
			created_at: o.created_at,
			expected_ship_date: o.expected_ship_date,
			start_ship_date: o.start_ship_date,
			season_id: o.season_id,
			brand_id: o.brand_id,
			account_id: o.account_id,
			freeform_name: o.freeform_name,
			connection_id: o.connection_id,
			brands: o.brand_name ? { name: o.brand_name } : null,
			accounts: o.account_name ? { business_name: o.account_name } : null,
			seasons: o.season_name ? { name: o.season_name } : null,
			profiles: o.created_by_name ? { display_name: o.created_by_name } : null,
			source_org: { id: o.rep_org_id, name: o.rep_org_name }
		}));

		// Merge and dedupe
		const orderMap = new Map<string, (typeof directOrders)[number]>();
		for (const o of federatedReshaped) orderMap.set(o.id as string, o);
		for (const o of directOrders) orderMap.set(o.id as string, o);
		const allRaw = [...orderMap.values()].sort((a, b) =>
			String(b.created_at).localeCompare(String(a.created_at))
		);
		const all = applySpotlight(allRaw);

		const page = all.slice(offset, offset + limit);
		return json({ orders: page, hasMore: offset + limit < all.length });
	}

	// ── Rep org ───────────────────────────────────────────────────────────
	const isSales = locals.membership?.role === 'sales';

	// Resolve name-based filters
	const { data: connections } = await supabaseAdmin
		.from('org_connections')
		.select('rep_org_id, brand_org_id')
		.eq('status', 'active')
		.or(`rep_org_id.eq.${organization.id},brand_org_id.eq.${organization.id}`);
	const visibleOrgIdSet = new Set<string>([organization.id]);
	for (const c of connections ?? []) {
		if (c.rep_org_id && c.rep_org_id !== organization.id) visibleOrgIdSet.add(c.rep_org_id);
		if (c.brand_org_id && c.brand_org_id !== organization.id) visibleOrgIdSet.add(c.brand_org_id);
	}
	const visibleOrgIds = Array.from(visibleOrgIdSet);

	let seasonIds: string[] | null = null;
	if (seasonFilter) {
		const { data: allSeasons } = await supabaseAdmin
			.from('seasons')
			.select('id, name')
			.in('organization_id', visibleOrgIds)
			.eq('is_active', true);
		const key = seasonFilter.trim().toLowerCase();
		seasonIds =
			(allSeasons ?? []).filter((s) => s.name.trim().toLowerCase() === key).map((s) => s.id) ?? [];
	}
	let brandIds: string[] | null = null;
	if (brandFilter) {
		const { data: allBrands } = await supabaseAdmin
			.from('brands')
			.select('id, name')
			.in('organization_id', visibleOrgIds)
			.eq('is_active', true);
		const key = brandFilter.trim().toLowerCase();
		brandIds =
			(allBrands ?? []).filter((b) => b.name.trim().toLowerCase() === key).map((b) => b.id) ?? [];
	}

	let query = supabaseAdmin
		.from('orders')
		.select(ORDER_SELECT, { count: 'exact' })
		.eq('organization_id', organization.id)
		.order('created_at', { ascending: false });

	if (!spotlight) query = query.range(offset, offset + limit - 1);
	if (isSales) query = query.eq('created_by', locals.user?.id);
	if (status) query = query.eq('status', status);
	if (seasonIds && seasonIds.length > 0) query = query.in('season_id', seasonIds);
	if (brandIds && brandIds.length > 0) query = query.in('brand_id', brandIds);
	if (showDateId) query = query.eq('show_date_id', showDateId);
	if (from) query = query.gte('created_at', from);
	if (toExclusive) query = query.lt('created_at', toExclusive);

	if (search) {
		const resolved = await resolveOrderSearch(supabaseAdmin, search);
		query = applyOrderSearch(query, search, resolved.accountIds, resolved.brandIds);
	}

	const { data, count } = await query;
	const rawOrders = data ?? [];

	if (spotlight) {
		const filtered = applySpotlight(rawOrders);
		const page = filtered.slice(offset, offset + limit);
		return json({ orders: page, hasMore: offset + limit < filtered.length });
	}

	const totalCount = count ?? rawOrders.length;
	return json({ orders: rawOrders, hasMore: offset + limit < totalCount });
};
