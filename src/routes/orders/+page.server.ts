import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { listFederatedOrders } from '$lib/server/federation.js';
import { resolveOrderSearch, applyOrderSearch } from '$lib/server/orders/search.js';
import { loadManagerScope } from '$lib/server/scoping.js';
import { incrementDate } from '$lib/utils/date-presets.js';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	// Hook for the AI conversation store's invalidate('data:orders') after
	// create_order / update_order / add_order_lines etc. — keeps the list
	// view in sync with Stitch's tool calls without a manual refresh.
	depends('data:orders');
	depends('data:dashboard');

	const { supabase, organization, orgType } = locals;

	const status = url.searchParams.get('status');
	const seasonFilter = url.searchParams.get('season');
	const year = url.searchParams.get('year');
	const brandFilter = url.searchParams.get('brand');
	const showDateId = url.searchParams.get('show');
	const repOrgId = url.searchParams.get('rep');
	const search = url.searchParams.get('search')?.trim() ?? '';
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	// Default the totals / pagination to orders-only; notes tab flips this.
	const activeType = url.searchParams.get('type') ?? 'order';
	// Exclusive upper bound so the `to` day is fully included in the window.
	const toExclusive = to ? incrementDate(to) : null;

	// Buyer-scoped orders
	if (locals.isBuyer) {
		const accountIds = locals.buyerAccounts?.map((a) => a.account_id) ?? [];
		const buyerBrandIds = locals.buyerBrandIds ?? [];

		let query = supabase
			.from('orders')
			.select('*, brands(name), accounts(business_name), seasons(name)')
			.in('account_id', accountIds)
			.order('created_at', { ascending: false });

		if (status) query = query.eq('status', status);
		if (brandFilter) query = query.eq('brand_id', brandFilter);
		if (seasonFilter) query = query.eq('season_id', seasonFilter);
		if (from) query = query.gte('created_at', from);
		if (toExclusive) query = query.lt('created_at', toExclusive);
		if (activeType !== 'all') query = query.eq('order_type', activeType);

		const [ordersRes, brandsRes] = await Promise.all([
			query,
			supabase
				.from('brands')
				.select('id, name')
				.in('id', buyerBrandIds.length > 0 ? buyerBrandIds : ['__none__'])
				.eq('is_active', true)
				.order('name')
		]);

		const orders = ordersRes.data ?? [];
		return {
			orders,
			hasMore: false,
			totalCount: orders.length,
			seasons: [],
			brands: brandsRes.data ?? [],
			showDates: [],
			reps: [] as Array<{ id: string; name: string }>,
			isBrandOrg: false,
			metrics: {
				pipelineValue: orders
					.filter((o) => ['draft', 'submitted', 'confirmed'].includes(o.status))
					.reduce((s, o) => s + Number(o.total_amount), 0),
				pipelineCount: orders.filter((o) => ['draft', 'submitted', 'confirmed'].includes(o.status))
					.length,
				deliveredRevenue: orders
					.filter((o) => o.status === 'delivered')
					.reduce((s, o) => s + Number(o.total_amount), 0),
				shippedCount: orders.filter((o) => o.status === 'shipped' || o.status === 'delivered')
					.length,
				avgOrderValue:
					orders.length > 0
						? orders.reduce((s, o) => s + Number(o.total_amount), 0) / orders.length
						: 0,
				needsAttention: { staleDrafts: 0, overdueShipments: 0, total: 0 },
				conversion: { submitted: 0, converted: 0, rate: 0 }
			}
		};
	}

	if (!organization)
		return {
			orders: [],
			hasMore: false,
			totalCount: 0,
			seasons: [],
			brands: [],
			showDates: [],
			reps: [] as Array<{ id: string; name: string }>,
			isBrandOrg: false,
			metrics: {
				pipelineValue: 0,
				pipelineCount: 0,
				deliveredRevenue: 0,
				shippedCount: 0,
				avgOrderValue: 0,
				needsAttention: { staleDrafts: 0, overdueShipments: 0, total: 0 },
				conversion: { submitted: 0, converted: 0, rate: 0 }
			}
		};

	// ── Brand org: federated orders PLUS the brand's own direct orders ────
	if (orgType === 'brand') {
		const brandIsSales = locals.membership?.role === 'sales';
		const brandUserId = locals.user?.id;
		const brandSalesScope =
			brandIsSales && brandUserId
				? await loadManagerScope(supabaseAdmin, brandUserId, locals.membership?.id ?? null)
				: null;

		// Resolve name-based season/brand filters to matching IDs
		let seasonIds: string[] | null = null;
		if (seasonFilter) {
			const { data: matchSeasons } = await supabaseAdmin
				.from('seasons')
				.select('id, name')
				.ilike('name', seasonFilter);
			seasonIds = matchSeasons?.map((s) => s.id) ?? [];
		}
		let brandIds: string[] | null = null;
		if (brandFilter) {
			const { data: matchBrands } = await supabaseAdmin
				.from('brands')
				.select('id, name')
				.ilike('name', brandFilter);
			brandIds = matchBrands?.map((b) => b.id) ?? [];
		}

		// 1. Direct orders owned by the brand org.
		//    Sales reps only see their own. Admin/owner/member see all.
		let directQuery = supabase
			.from('orders')
			.select(
				'*, brands(name), accounts(business_name), seasons(name), show_dates(id, show_id, year, month, city, state, shows(name)), profiles!orders_created_by_fkey(display_name), source_types(name), season_deliveries!delivery_id(label, delivery_month, delivery_day)'
			)
			.eq('organization_id', organization.id)
			.order('created_at', { ascending: false });
		// Sales visibility: widen from "own created_by" to include orders on accounts
		// the viewer (or their managed reports) cover via territory. Untagged
		// accounts remain visible so an org that hasn't backfilled territories
		// isn't stranded.
		if (brandSalesScope) {
			const createdByClause = brandSalesScope.createdByScope.join(',');
			if (brandSalesScope.hasTerritoryScope) {
				const territoryIds = brandSalesScope.visibleTerritoryIds.join(',');
				const { data: salesAccountRows } = await supabaseAdmin
					.from('accounts')
					.select('id')
					.eq('organization_id', organization.id)
					.or(`territory_id.in.(${territoryIds}),territory_id.is.null`);
				const salesAccountIds = (salesAccountRows ?? []).map((a: { id: string }) => a.id);
				if (salesAccountIds.length > 0) {
					directQuery = directQuery.or(
						`created_by.in.(${createdByClause}),account_id.in.(${salesAccountIds.join(',')})`
					);
				} else {
					directQuery = directQuery.in('created_by', brandSalesScope.createdByScope);
				}
			} else {
				directQuery = directQuery.in('created_by', brandSalesScope.createdByScope);
			}
		}
		if (status) directQuery = directQuery.eq('status', status);
		if (seasonIds && seasonIds.length > 0) directQuery = directQuery.in('season_id', seasonIds);
		if (year) directQuery = directQuery.eq('order_year', parseInt(year));
		if (brandIds && brandIds.length > 0) directQuery = directQuery.in('brand_id', brandIds);
		if (showDateId) directQuery = directQuery.eq('show_date_id', showDateId);
		if (from) directQuery = directQuery.gte('created_at', from);
		if (toExclusive) directQuery = directQuery.lt('created_at', toExclusive);
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

		// 2. Federated orders from connected rep orgs.
		//    Brand sales reps don't see incoming federated orders (only their own work).
		//    Admins and members see all federated orders.
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

		// Reshape federated to match the direct row structure.
		const federatedReshaped = federatedOrders.map((o) => ({
			id: o.id,
			order_number: o.order_number,
			order_type: o.order_type,
			status: o.status,
			total_amount: o.total_amount,
			shipped_amount: o.shipped_amount,
			shipped_at: o.shipped_at,
			created_at: o.created_at,
			expected_ship_date: o.expected_ship_date,
			start_ship_date: o.start_ship_date,
			season_id: o.season_id,
			order_year: o.order_year,
			brand_id: o.brand_id,
			account_id: o.account_id,
			freeform_name: o.freeform_name,
			connection_id: o.connection_id,
			brands: o.brand_name ? { name: o.brand_name } : null,
			accounts: o.account_name ? { business_name: o.account_name } : null,
			seasons: o.season_name ? { name: o.season_name } : null,
			source_types: o.source_type_name ? { name: o.source_type_name } : null,
			show_dates: o.show_date
				? {
						id: o.show_date.id,
						year: o.show_date.year,
						month: o.show_date.month,
						city: o.show_date.city,
						state: o.show_date.state,
						shows: o.show_date.show_name ? { name: o.show_date.show_name } : null
					}
				: null,
			profiles: o.created_by_name ? { display_name: o.created_by_name } : null,
			source_org: { id: o.rep_org_id, name: o.rep_org_name }
		}));

		// Combine, dedupe by id (a federated order already owned by this org would duplicate),
		// and re-sort newest first.
		const orderMap = new Map<
			string,
			(typeof directOrders)[number] | (typeof federatedReshaped)[number]
		>();
		for (const o of federatedReshaped) orderMap.set(o.id as string, o);
		for (const o of directOrders) orderMap.set(o.id as string, o); // direct wins if dup
		const allOrdersUnfiltered = [...orderMap.values()].sort((a, b) =>
			String(b.created_at).localeCompare(String(a.created_at))
		);
		const allOrders =
			activeType === 'all'
				? allOrdersUnfiltered
				: allOrdersUnfiltered.filter((o) => o.order_type === activeType);
		const orders = allOrders.slice(0, PAGE_SIZE);

		// Per-row commission rate lookup. Direct orders → BOA's organization_member
		// for the rep, with optional per-brand override from member_brand_commissions.
		// Federated orders → connection_id → org_connections.commission_rate (the
		// rate the BOA agreed when generating the partner link).
		const directRepIds = new Set<string>();
		const federatedConnectionIds = new Set<string>();
		for (const o of orders) {
			const isFederated = !!(o as { source_org?: unknown }).source_org;
			if (isFederated) {
				const cid = (o as { connection_id?: string | null }).connection_id;
				if (cid) federatedConnectionIds.add(cid);
			} else {
				const cb = (o as { created_by?: string | null }).created_by;
				if (cb) directRepIds.add(cb);
			}
		}
		const repDefaultRate = new Map<string, number>();
		const repMemberId = new Map<string, string>();
		const memberBrandRate = new Map<string, number>();
		const connRate = new Map<string, number>();
		if (directRepIds.size > 0) {
			const { data: members } = await supabaseAdmin
				.from('organization_members')
				.select('id, profile_id, commission_rate')
				.eq('organization_id', organization.id)
				.in('profile_id', [...directRepIds]);
			for (const m of (members ?? []) as Array<{
				id: string;
				profile_id: string;
				commission_rate: number | null;
			}>) {
				repMemberId.set(m.profile_id, m.id);
				if (m.commission_rate != null) repDefaultRate.set(m.profile_id, Number(m.commission_rate));
			}
			const memberIds = [...repMemberId.values()];
			if (memberIds.length > 0) {
				const { data: overrides } = await supabaseAdmin
					.from('member_brand_commissions')
					.select('member_id, brand_id, rate')
					.in('member_id', memberIds);
				for (const ov of (overrides ?? []) as Array<{
					member_id: string;
					brand_id: string;
					rate: number;
				}>) {
					memberBrandRate.set(`${ov.member_id}:${ov.brand_id}`, Number(ov.rate));
				}
			}
		}
		if (federatedConnectionIds.size > 0) {
			const { data: conns } = await supabaseAdmin
				.from('org_connections')
				.select('id, commission_rate')
				.in('id', [...federatedConnectionIds]);
			for (const c of (conns ?? []) as Array<{ id: string; commission_rate: number | null }>) {
				if (c.commission_rate != null) connRate.set(c.id, Number(c.commission_rate));
			}
		}
		function rateFor(o: (typeof orders)[number]): number | null {
			const isFederated = !!(o as { source_org?: unknown }).source_org;
			if (isFederated) {
				const cid = (o as { connection_id?: string | null }).connection_id;
				return cid ? (connRate.get(cid) ?? null) : null;
			}
			const cb = (o as { created_by?: string | null }).created_by;
			const memberId = cb ? repMemberId.get(cb) : undefined;
			const brandId = (o as { brand_id?: string | null }).brand_id;
			const overrideRate =
				memberId && brandId ? memberBrandRate.get(`${memberId}:${brandId}`) : undefined;
			return overrideRate ?? (cb ? (repDefaultRate.get(cb) ?? null) : null);
		}
		const ordersWithCommission = orders.map((o) => ({ ...o, rep_commission_rate: rateFor(o) }));

		// Filter chip sources — union of direct + federated, deduped by name.
		const brandMap = new Map<string, { id: string; name: string }>();
		const seasonMap = new Map<string, { id: string; name: string }>();
		const repMap = new Map<string, { id: string; name: string }>();
		for (const o of federatedOrders) {
			if (o.brand_id && o.brand_name) {
				const key = o.brand_name.trim().toLowerCase();
				if (!brandMap.has(key)) brandMap.set(key, { id: o.brand_id, name: o.brand_name });
			}
			if (o.season_id && o.season_name) {
				const key = o.season_name.trim().toLowerCase();
				if (!seasonMap.has(key)) seasonMap.set(key, { id: o.season_id, name: o.season_name });
			}
			// Display the rep's person name in the filter chip (falls back to org
			// name only if the rep's profile isn't resolvable). The filter value
			// is still rep_org_id, so multiple reps from one rep-org collapse to
			// whichever name wins first.
			if (!repMap.has(o.rep_org_id)) {
				repMap.set(o.rep_org_id, {
					id: o.rep_org_id,
					name: o.created_by_name ?? o.rep_org_name
				});
			}
		}
		for (const o of directOrders) {
			const b = (o.brands as { name?: string } | null)?.name;
			if (b) {
				const key = b.trim().toLowerCase();
				if (!brandMap.has(key)) brandMap.set(key, { id: o.brand_id as string, name: b });
			}
			const s = (o.seasons as { name?: string } | null)?.name;
			if (s) {
				const key = s.trim().toLowerCase();
				if (!seasonMap.has(key)) seasonMap.set(key, { id: o.season_id as string, name: s });
			}
		}

		// Metrics computed from ALL matching orders, not just first page
		const now = new Date();
		const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		const todayStr = now.toISOString().split('T')[0];
		const pipelineStatuses = new Set(['draft', 'submitted', 'confirmed']);
		const convertedStatuses = new Set(['confirmed', 'shipped', 'delivered']);
		let pipelineValue = 0,
			pipelineCount = 0,
			deliveredRevenue = 0,
			deliveredCount = 0,
			shippedCount = 0,
			staleDrafts = 0,
			overdueShipments = 0,
			submittedCount = 0,
			convertedCount = 0;
		for (const o of allOrders) {
			const amount = Number(o.total_amount) || 0;
			if (pipelineStatuses.has(o.status)) {
				pipelineValue += amount;
				pipelineCount++;
			}
			if (o.status === 'delivered') {
				deliveredRevenue += amount;
				deliveredCount++;
			}
			if (o.status === 'shipped' || o.status === 'delivered') shippedCount++;
			if (o.status === 'draft' && new Date(o.created_at) < sevenDaysAgo) staleDrafts++;
			if (
				(o.status === 'submitted' || o.status === 'confirmed') &&
				o.expected_ship_date &&
				o.expected_ship_date < todayStr
			)
				overdueShipments++;
			if (o.status !== 'draft') submittedCount++;
			if (convertedStatuses.has(o.status)) convertedCount++;
		}

		return {
			orders: ordersWithCommission,
			hasMore: allOrders.length > PAGE_SIZE,
			totalCount: allOrders.length,
			seasons: [...seasonMap.values()],
			brands: [...brandMap.values()],
			reps: [...repMap.values()],
			showDates: [],
			isBrandOrg: true,
			metrics: {
				pipelineValue,
				pipelineCount,
				deliveredRevenue,
				shippedCount,
				avgOrderValue:
					deliveredCount > 0
						? deliveredRevenue / deliveredCount
						: allOrders.length > 0
							? allOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0) / allOrders.length
							: 0,
				needsAttention: {
					staleDrafts,
					overdueShipments,
					total: staleDrafts + overdueShipments
				},
				conversion: {
					submitted: submittedCount,
					converted: convertedCount,
					rate: submittedCount > 0 ? convertedCount / submittedCount : 0
				}
			}
		};
	}

	const isSales = locals.membership?.role === 'sales';
	const salesScope =
		isSales && locals.user?.id
			? await loadManagerScope(supabaseAdmin, locals.user.id, locals.membership?.id ?? null)
			: null;

	// Federation: collect own org + connected org IDs so filter dropdowns surface
	// connected brands, seasons, and shows.
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

	// Filter dropdowns widen to include connected orgs' brands/seasons/shows.
	// Fetch these first so we can resolve name-based filters to IDs.
	const [seasonsResult, brandsResult, showDatesResult] = await Promise.all([
		supabaseAdmin
			.from('seasons')
			.select('*')
			.in('organization_id', visibleOrgIds)
			.eq('is_active', true)
			.order('sort_order'),
		supabaseAdmin
			.from('brands')
			.select('id, name')
			.eq('is_active', true)
			.in('organization_id', visibleOrgIds)
			.order('name'),
		supabaseAdmin
			.from('show_dates')
			.select('id, show_id, year, month, city, state, shows(name)')
			.in('organization_id', visibleOrgIds)
			.order('year')
			.order('month')
	]);

	const allSeasons = seasonsResult.data ?? [];
	const allBrands = (brandsResult.data ?? []) as Array<{ id: string; name: string }>;

	// Resolve name-based filters to matching IDs across all visible orgs
	let seasonIds: string[] | null = null;
	if (seasonFilter) {
		const key = seasonFilter.trim().toLowerCase();
		seasonIds = allSeasons.filter((s) => s.name.trim().toLowerCase() === key).map((s) => s.id);
	}
	let brandIds: string[] | null = null;
	if (brandFilter) {
		const key = brandFilter.trim().toLowerCase();
		brandIds = allBrands.filter((b) => b.name.trim().toLowerCase() === key).map((b) => b.id);
	}

	// Resolve search to matching account/brand IDs
	let searchAccountIds: string[] = [];
	let searchBrandIds: string[] = [];
	if (search) {
		const resolved = await resolveOrderSearch(supabaseAdmin, search);
		searchAccountIds = resolved.accountIds;
		searchBrandIds = resolved.brandIds;
	}

	// Precompute the set of accounts this sales user can see via territory.
	// Untagged accounts (territory_id IS NULL) stay visible so orgs that haven't
	// backfilled territories aren't stranded.
	let salesAccountIds: string[] | null = null;
	if (isSales && salesScope && salesScope.hasTerritoryScope) {
		const territoryIds = salesScope.visibleTerritoryIds.join(',');
		const { data: rows } = await supabaseAdmin
			.from('accounts')
			.select('id')
			.eq('organization_id', organization.id)
			.or(`territory_id.in.(${territoryIds}),territory_id.is.null`);
		salesAccountIds = (rows ?? []).map((a: { id: string }) => a.id);
	}

	// Helper to apply shared filters to an orders query
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function applyFilters(q: any) {
		if (isSales && salesScope) {
			if (salesAccountIds && salesAccountIds.length > 0) {
				const createdByClause = salesScope.createdByScope.join(',');
				q = q.or(`created_by.in.(${createdByClause}),account_id.in.(${salesAccountIds.join(',')})`);
			} else {
				q = q.in('created_by', salesScope.createdByScope);
			}
		}
		if (status) q = q.eq('status', status);
		if (seasonIds && seasonIds.length > 0) q = q.in('season_id', seasonIds);
		if (year) q = q.eq('order_year', parseInt(year));
		if (brandIds && brandIds.length > 0) q = q.in('brand_id', brandIds);
		if (showDateId) q = q.eq('show_date_id', showDateId);
		if (from) q = q.gte('created_at', from);
		if (toExclusive) q = q.lt('created_at', toExclusive);
		if (search) q = applyOrderSearch(q, search, searchAccountIds, searchBrandIds);
		if (activeType !== 'all') q = q.eq('order_type', activeType);
		return q;
	}

	// 1. Paginated display query (first page)
	let displayQuery = supabaseAdmin
		.from('orders')
		.select(
			'*, brands(name), accounts(business_name), seasons(name), show_dates(id, show_id, year, month, city, state, shows(name)), profiles!orders_created_by_fkey(display_name), source_types(name), season_deliveries!delivery_id(label, delivery_month, delivery_day)',
			{ count: 'exact' }
		)
		.eq('organization_id', organization.id)
		.order('created_at', { ascending: false })
		.range(0, PAGE_SIZE - 1);
	displayQuery = applyFilters(displayQuery);

	// 2. Lightweight metrics query (all matching, minimal columns)
	let metricsQuery = supabaseAdmin
		.from('orders')
		.select('id, status, total_amount, created_at, expected_ship_date')
		.eq('organization_id', organization.id);
	metricsQuery = applyFilters(metricsQuery);

	const [displayResult, metricsResult] = await Promise.all([displayQuery, metricsQuery]);

	const orders = displayResult.data ?? [];
	const totalCount = displayResult.count ?? orders.length;
	const metricsRows = metricsResult.data ?? [];

	// Compute analytics metrics from ALL matching orders
	const now = new Date();
	const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	const todayStr = now.toISOString().split('T')[0];

	const pipelineStatuses = new Set(['draft', 'submitted', 'confirmed']);
	const convertedStatuses = new Set(['confirmed', 'shipped', 'delivered']);

	let pipelineValue = 0;
	let pipelineCount = 0;
	let deliveredRevenue = 0;
	let deliveredCount = 0;
	let shippedCount = 0;
	let staleDrafts = 0;
	let overdueShipments = 0;
	let submittedCount = 0;
	let convertedCount = 0;

	for (const o of metricsRows) {
		const amount = Number(o.total_amount) || 0;

		if (pipelineStatuses.has(o.status)) {
			pipelineValue += amount;
			pipelineCount++;
		}
		if (o.status === 'delivered') {
			deliveredRevenue += amount;
			deliveredCount++;
		}
		if (o.status === 'shipped' || o.status === 'delivered') {
			shippedCount++;
		}
		if (o.status === 'draft' && new Date(o.created_at) < sevenDaysAgo) {
			staleDrafts++;
		}
		if (
			(o.status === 'submitted' || o.status === 'confirmed') &&
			o.expected_ship_date &&
			o.expected_ship_date < todayStr
		) {
			overdueShipments++;
		}
		if (o.status !== 'draft') {
			submittedCount++;
		}
		if (convertedStatuses.has(o.status)) {
			convertedCount++;
		}
	}

	const metrics = {
		pipelineValue,
		pipelineCount,
		deliveredRevenue,
		shippedCount,
		avgOrderValue:
			deliveredCount > 0
				? deliveredRevenue / deliveredCount
				: metricsRows.length > 0
					? metricsRows.reduce((s, o) => s + (Number(o.total_amount) || 0), 0) / metricsRows.length
					: 0,
		needsAttention: {
			staleDrafts,
			overdueShipments,
			total: staleDrafts + overdueShipments
		},
		conversion: {
			submitted: submittedCount,
			converted: convertedCount,
			rate: submittedCount > 0 ? convertedCount / submittedCount : 0
		}
	};

	// Deduplicate seasons and brands by name for filter dropdowns
	const seenSeasonNames = new Set<string>();
	const dedupedSeasons = allSeasons.filter((s) => {
		const key = s.name.trim().toLowerCase();
		if (seenSeasonNames.has(key)) return false;
		seenSeasonNames.add(key);
		return true;
	});
	const seenBrandNames = new Set<string>();
	const dedupedBrands = allBrands.filter((b) => {
		const key = b.name.trim().toLowerCase();
		if (seenBrandNames.has(key)) return false;
		seenBrandNames.add(key);
		return true;
	});

	return {
		orders,
		hasMore: totalCount > PAGE_SIZE,
		totalCount,
		seasons: dedupedSeasons,
		brands: dedupedBrands,
		showDates: showDatesResult.data ?? [],
		reps: [] as Array<{ id: string; name: string }>,
		isBrandOrg: false,
		metrics
	};
};
