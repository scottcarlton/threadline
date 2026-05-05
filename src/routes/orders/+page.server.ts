import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { listFederatedOrders } from '$lib/server/federation.js';
import { resolveOrderSearch, applyOrderSearch } from '$lib/server/orders/search.js';
import { loadManagerScope } from '$lib/server/scoping.js';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';
import {
	classifyOrder,
	parseSpotlightParam,
	type SpotlightBucket
} from '$lib/utils/order-spotlight.js';

const PAGE_SIZE = 50;

// The /orders date filter sends from/to as YYYY-MM-DD computed from the
// caller's LOCAL clock, but `created_at` is a UTC timestamp. Without a TZ
// hint we'd compare against the UTC midnight, which drops orders the user
// stamped on their local "today" but stored under tomorrow UTC. Widen the
// window to the most-extreme TZ offsets (UTC+14 / UTC-12) so the filter
// is inclusive across every caller TZ.
function fromBoundary(yyyymmdd: string): string {
	return `${yyyymmdd}T00:00:00+14:00`;
}
function toBoundary(yyyymmdd: string): string {
	return `${yyyymmdd}T23:59:59.999-12:00`;
}

type SpotlightCounts = Record<SpotlightBucket, number> & { total: number };
function emptySpotlight(): SpotlightCounts {
	return {
		total: 0,
		overdue: 0,
		approaching_start: 0,
		in_window: 0,
		approaching_complete: 0,
		stale_draft: 0
	};
}
function tallySpotlight<T extends Parameters<typeof classifyOrder>[0]>(
	rows: readonly T[]
): SpotlightCounts {
	const counts = emptySpotlight();
	for (const r of rows) {
		const buckets = classifyOrder(r);
		if (buckets.length > 0) counts.total++;
		for (const b of buckets) counts[b]++;
	}
	return counts;
}

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	// Hook for the AI conversation store's invalidate('data:orders') after
	// create_order / update_order / add_order_lines etc. — keeps the list
	// view in sync with Stitch's tool calls without a manual refresh.
	depends('data:orders');
	depends('data:dashboard');

	const { supabase, organization, orgType, allMemberships } = locals;
	// Nx-BLSR: sales-role member of 2+ brand-orgs. Their orders union spans every
	// brand-org they belong to. ownOrgIds = brand-org union when Nx-BLSR, else
	// just the active organization id (existing behavior preserved).
	const brandOrgIdsForNx = getNxBlsrBrandOrgIds(allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIdsForNx);
	const ownOrgIds = organization ? (nxBlsr ? brandOrgIdsForNx : [organization.id]) : [];

	const statusParam = url.searchParams.get('status');
	const statuses = statusParam ? statusParam.split(',').filter(Boolean) : [];
	const seasonParam = url.searchParams.get('season');
	const seasonFilters = seasonParam ? seasonParam.split(',').filter(Boolean) : [];
	const year = url.searchParams.get('year');
	const brandParam = url.searchParams.get('brand');
	const brandFilters = brandParam ? brandParam.split(',').filter(Boolean) : [];
	// Source filter unifies "shows" (show_dates) and "source types". Value
	// is prefixed: `show:<show_date_id>` or `srctype:<source_type_id>`.
	// Falls back to the legacy `?show=<id>` param for old links.
	const sourceParam = url.searchParams.get('source');
	const legacyShow = url.searchParams.get('show');
	const sourceKind = sourceParam?.startsWith('show:')
		? 'show'
		: sourceParam?.startsWith('srctype:')
			? 'srctype'
			: legacyShow
				? 'show'
				: null;
	const sourceId = sourceParam
		? sourceParam.split(':').slice(1).join(':') || null
		: (legacyShow ?? null);
	const showDateId = sourceKind === 'show' ? sourceId : null;
	// Source-type filter is name-based (matches the season/brand pattern).
	// Resolved to the set of matching source_type ids per branch below.
	const sourceTypeName = sourceKind === 'srctype' ? sourceId : null;
	const repOrgId = url.searchParams.get('rep');
	const search = url.searchParams.get('search')?.trim() ?? '';
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	// Default the totals / pagination to orders-only; notes tab flips this.
	const activeType = url.searchParams.get('type') ?? 'order';
	const spotlight = parseSpotlightParam(url.searchParams.get('spotlight'));
	const fromTs = from ? fromBoundary(from) : null;
	const toTs = to ? toBoundary(to) : null;
	const toTsMs = toTs ? new Date(toTs).getTime() : null;
	const fromTsMs = fromTs ? new Date(fromTs).getTime() : null;

	// Buyer-scoped orders
	if (locals.isBuyer) {
		const accountIds = locals.buyerAccounts?.map((a) => a.account_id) ?? [];
		const buyerBrandIds = locals.buyerBrandIds ?? [];

		let query = supabase
			.from('orders')
			.select('*, brands(name), accounts(business_name), seasons(name)')
			.in('account_id', accountIds)
			.order('created_at', { ascending: false });

		if (statuses.length > 0) query = query.in('status', statuses);
		if (brandFilters.length > 0) query = query.in('brand_id', brandFilters);
		if (seasonFilters.length > 0) query = query.in('season_id', seasonFilters);
		if (fromTs) query = query.gte('created_at', fromTs);
		if (toTs) query = query.lte('created_at', toTs);
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
			sourceTypes: [] as Array<{ id: string; name: string }>,
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
				spotlight: emptySpotlight(),
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
			sourceTypes: [] as Array<{ id: string; name: string }>,
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

		// Visible orgs for the BOA: own org(s) + every connected rep org. Used to
		// populate filter dropdowns with the full union of seasons/brands so
		// they don't shrink when the user picks one as a filter. For Nx-BLSR
		// `ownOrgIds` is the union of their brand-org memberships, so federation
		// expands to include every rep org connected to any of their brand-orgs.
		const { data: brandConnections } = await supabaseAdmin
			.from('org_connections')
			.select('rep_org_id')
			.in('brand_org_id', ownOrgIds)
			.eq('status', 'active');
		const boaVisibleOrgIds = Array.from(
			new Set<string>([
				...ownOrgIds,
				...((brandConnections ?? []).map((c) => c.rep_org_id) as string[])
			])
		);

		// Pre-load all seasons, brands, show_dates, and source_types across
		// visible orgs so filter chip sources stay complete regardless of
		// which filter is currently active.
		const [allSeasonsRes, allBrandsRes, allShowDatesRes, allSourceTypesRes] = await Promise.all([
			supabaseAdmin
				.from('seasons')
				.select('id, name')
				.in('organization_id', boaVisibleOrgIds)
				.eq('is_active', true)
				.order('sort_order'),
			supabaseAdmin
				.from('brands')
				.select('id, name')
				.in('organization_id', boaVisibleOrgIds)
				.eq('is_active', true)
				.order('name'),
			supabaseAdmin
				.from('show_dates')
				.select('id, show_id, year, month, city, state, shows(name)')
				.in('organization_id', boaVisibleOrgIds)
				.order('year')
				.order('month'),
			supabaseAdmin
				.from('source_types')
				.select('id, name')
				.in('organization_id', boaVisibleOrgIds)
				.eq('is_active', true)
				.order('name')
		]);
		const allBoaSeasons = (allSeasonsRes.data ?? []) as Array<{ id: string; name: string }>;
		const allBoaBrands = (allBrandsRes.data ?? []) as Array<{ id: string; name: string }>;
		const allBoaShowDates = allShowDatesRes.data ?? [];
		const allBoaSourceTypes = (allSourceTypesRes.data ?? []) as Array<{ id: string; name: string }>;

		// Resolve name-based season/brand/source-type filters to matching IDs
		// (scoped to visible orgs only so a user can't filter by something
		// outside their reach).
		let seasonIds: string[] | null = null;
		if (seasonFilters.length > 0) {
			const keys = seasonFilters.map((s) => s.trim().toLowerCase());
			seasonIds = allBoaSeasons
				.filter((s) => keys.includes(s.name.trim().toLowerCase()))
				.map((s) => s.id);
		}
		let brandIds: string[] | null = null;
		if (brandFilters.length > 0) {
			const keys = brandFilters.map((b) => b.trim().toLowerCase());
			brandIds = allBoaBrands
				.filter((b) => keys.includes(b.name.trim().toLowerCase()))
				.map((b) => b.id);
		}
		let sourceTypeIds: string[] | null = null;
		if (sourceTypeName) {
			const key = sourceTypeName.trim().toLowerCase();
			sourceTypeIds = allBoaSourceTypes
				.filter((s) => s.name.trim().toLowerCase() === key)
				.map((s) => s.id);
		}

		// 1. Direct orders owned by the brand org(s).
		//    Sales reps only see their own. Admin/owner/member see all.
		//    Nx-BLSR: union across all brand-org memberships (ownOrgIds).
		// Use service role so embedded source_types/profiles resolve even when
		// they belong to a sibling brand-org (Nx-BLSR can pick a source_type
		// from one of their other brand-orgs while creating an order against
		// this brand-org's brand). The `.in('organization_id', ownOrgIds)`
		// filter is the row-level gate; matches the rep-org branch below.
		let directQuery = supabaseAdmin
			.from('orders')
			.select(
				'*, brands(name), accounts(business_name), seasons(name), show_dates(id, show_id, year, month, city, state, shows(name)), profiles!orders_created_by_fkey(display_name), rep_profile:profiles!orders_rep_user_id_fkey(display_name), source_types(name), season_deliveries!delivery_id(label, delivery_month, delivery_day)'
			)
			.in('organization_id', ownOrgIds)
			.order('created_at', { ascending: false });
		// Sales visibility: widen from "own created_by" to include
		//   • orders where the viewer is the rep_user_id (admin-on-behalf flow:
		//     a BOA admin can create an order and stamp the rep, and the rep
		//     should see it in their list), AND
		//   • orders on accounts the viewer (or their managed reports) cover
		//     via territory. Untagged accounts remain visible so an org that
		//     hasn't backfilled territories isn't stranded.
		if (brandSalesScope) {
			const createdByClause = brandSalesScope.createdByScope.join(',');
			const repUserIdClause = brandSalesScope.createdByScope.join(',');
			if (brandSalesScope.hasTerritoryScope) {
				const territoryIds = brandSalesScope.visibleTerritoryIds.join(',');
				const { data: salesAccountRows } = await supabaseAdmin
					.from('accounts')
					.select('id')
					.in('organization_id', ownOrgIds)
					.or(`territory_id.in.(${territoryIds}),territory_id.is.null`);
				const salesAccountIds = (salesAccountRows ?? []).map((a: { id: string }) => a.id);
				if (salesAccountIds.length > 0) {
					directQuery = directQuery.or(
						`created_by.in.(${createdByClause}),rep_user_id.in.(${repUserIdClause}),account_id.in.(${salesAccountIds.join(',')})`
					);
				} else {
					directQuery = directQuery.or(
						`created_by.in.(${createdByClause}),rep_user_id.in.(${repUserIdClause})`
					);
				}
			} else {
				directQuery = directQuery.or(
					`created_by.in.(${createdByClause}),rep_user_id.in.(${repUserIdClause})`
				);
			}
		}
		if (statuses.length > 0) directQuery = directQuery.in('status', statuses);
		if (seasonIds && seasonIds.length > 0) directQuery = directQuery.in('season_id', seasonIds);
		if (year) directQuery = directQuery.eq('order_year', parseInt(year));
		if (brandIds && brandIds.length > 0) directQuery = directQuery.in('brand_id', brandIds);
		if (showDateId) directQuery = directQuery.eq('show_date_id', showDateId);
		if (sourceTypeIds && sourceTypeIds.length > 0)
			directQuery = directQuery.in('source_type_id', sourceTypeIds);
		if (fromTs) directQuery = directQuery.gte('created_at', fromTs);
		if (toTs) directQuery = directQuery.lte('created_at', toTs);
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
		// Keep the pre-filter list so the rep filter dropdown stays populated
		// with every connected rep regardless of which one is currently selected.
		// Nx-BLSR: union per brand-org membership (each may have its own connections).
		const federatedBatches = brandIsSales
			? []
			: await Promise.all(ownOrgIds.map((id) => listFederatedOrders(supabaseAdmin, id)));
		const allFederatedOrders = brandIsSales ? [] : federatedBatches.flat();
		let federatedOrders = allFederatedOrders;
		if (statuses.length > 0)
			federatedOrders = federatedOrders.filter((o) => statuses.includes(o.status));
		if (repOrgId) federatedOrders = federatedOrders.filter((o) => o.rep_org_id === repOrgId);
		if (seasonIds)
			federatedOrders = federatedOrders.filter(
				(o) => o.season_id && seasonIds!.includes(o.season_id)
			);
		if (brandIds) federatedOrders = federatedOrders.filter((o) => brandIds!.includes(o.brand_id));
		if (showDateId) {
			federatedOrders = federatedOrders.filter((o) => o.show_date?.id === showDateId);
		}
		if (sourceTypeIds && sourceTypeIds.length > 0) {
			const allowed = new Set(sourceTypeIds);
			federatedOrders = federatedOrders.filter(
				(o) => o.source_type_id != null && allowed.has(o.source_type_id)
			);
		}
		if (fromTsMs != null) {
			federatedOrders = federatedOrders.filter((o) => new Date(o.created_at).getTime() >= fromTsMs);
		}
		if (toTsMs != null) {
			federatedOrders = federatedOrders.filter((o) => new Date(o.created_at).getTime() <= toTsMs);
		}
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
		const allOrdersTyped =
			activeType === 'all'
				? allOrdersUnfiltered
				: allOrdersUnfiltered.filter((o) => o.order_type === activeType);
		const spotlightCounts = tallySpotlight(allOrdersTyped);
		const allOrders = spotlight
			? allOrdersTyped.filter((o) => {
					const buckets = classifyOrder(o);
					if (buckets.length === 0) return false;
					if (spotlight === 'all') return true;
					return buckets.includes(spotlight);
				})
			: allOrdersTyped;
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
				.select('id, profile_id, commission_rate, organization_id')
				.in('organization_id', ownOrgIds)
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

		// Filter chip sources. Brand/season come from the pre-loaded
		// allBoaSeasons/allBoaBrands so they don't shrink when the user picks
		// one as a filter; reps come from the unfiltered federated list for
		// the same reason.
		const brandMap = new Map<string, { id: string; name: string }>();
		const seasonMap = new Map<string, { id: string; name: string }>();
		const repMap = new Map<string, { id: string; name: string }>();
		for (const b of allBoaBrands) {
			const key = b.name.trim().toLowerCase();
			if (!brandMap.has(key)) brandMap.set(key, b);
		}
		for (const s of allBoaSeasons) {
			const key = s.name.trim().toLowerCase();
			if (!seasonMap.has(key)) seasonMap.set(key, s);
		}
		for (const o of allFederatedOrders) {
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
		for (const o of allOrdersTyped) {
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
			showDates: allBoaShowDates,
			sourceTypes: allBoaSourceTypes,
			isBrandOrg: true,
			metrics: {
				pipelineValue,
				pipelineCount,
				deliveredRevenue,
				shippedCount,
				avgOrderValue:
					deliveredCount > 0
						? deliveredRevenue / deliveredCount
						: allOrdersTyped.length > 0
							? allOrdersTyped.reduce((s, o) => s + (Number(o.total_amount) || 0), 0) /
								allOrdersTyped.length
							: 0,
				needsAttention: {
					staleDrafts,
					overdueShipments,
					total: staleDrafts + overdueShipments
				},
				spotlight: spotlightCounts,
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

	// Filter dropdowns widen to include connected orgs' brands/seasons/shows/sources.
	// Fetch these first so we can resolve name-based filters to IDs (mirrors
	// the season/brand resolution pattern).
	const [seasonsResult, brandsResult, showDatesResult, sourceTypesResult] = await Promise.all([
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
			.order('month'),
		supabaseAdmin
			.from('source_types')
			.select('id, name')
			.in('organization_id', visibleOrgIds)
			.eq('is_active', true)
			.order('name')
	]);

	const allSeasons = seasonsResult.data ?? [];
	const allBrands = (brandsResult.data ?? []) as Array<{ id: string; name: string }>;
	const allSourceTypes = (sourceTypesResult.data ?? []) as Array<{ id: string; name: string }>;

	// Resolve name-based filters to matching IDs across all visible orgs
	let seasonIds: string[] | null = null;
	if (seasonFilters.length > 0) {
		const keys = seasonFilters.map((s) => s.trim().toLowerCase());
		seasonIds = allSeasons
			.filter((s) => keys.includes(s.name.trim().toLowerCase()))
			.map((s) => s.id);
	}
	let brandIds: string[] | null = null;
	if (brandFilters.length > 0) {
		const keys = brandFilters.map((b) => b.trim().toLowerCase());
		brandIds = allBrands.filter((b) => keys.includes(b.name.trim().toLowerCase())).map((b) => b.id);
	}
	let sourceTypeIds: string[] | null = null;
	if (sourceTypeName) {
		const key = sourceTypeName.trim().toLowerCase();
		sourceTypeIds = allSourceTypes
			.filter((s) => s.name.trim().toLowerCase() === key)
			.map((s) => s.id);
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
			const createdByClause = salesScope.createdByScope.join(',');
			const repUserIdClause = salesScope.createdByScope.join(',');
			if (salesAccountIds && salesAccountIds.length > 0) {
				q = q.or(
					`created_by.in.(${createdByClause}),rep_user_id.in.(${repUserIdClause}),account_id.in.(${salesAccountIds.join(',')})`
				);
			} else {
				q = q.or(`created_by.in.(${createdByClause}),rep_user_id.in.(${repUserIdClause})`);
			}
		}
		if (statuses.length > 0) q = q.in('status', statuses);
		if (seasonIds && seasonIds.length > 0) q = q.in('season_id', seasonIds);
		if (year) q = q.eq('order_year', parseInt(year));
		if (brandIds && brandIds.length > 0) q = q.in('brand_id', brandIds);
		if (showDateId) q = q.eq('show_date_id', showDateId);
		if (sourceTypeIds && sourceTypeIds.length > 0) q = q.in('source_type_id', sourceTypeIds);
		if (fromTs) q = q.gte('created_at', fromTs);
		if (toTs) q = q.lte('created_at', toTs);
		if (search) q = applyOrderSearch(q, search, searchAccountIds, searchBrandIds);
		if (activeType !== 'all') q = q.eq('order_type', activeType);
		return q;
	}

	// 1. Paginated display query (first page)
	let displayQuery = supabaseAdmin
		.from('orders')
		.select(
			'*, brands(name), accounts(business_name), seasons(name), show_dates(id, show_id, year, month, city, state, shows(name)), profiles!orders_created_by_fkey(display_name), rep_profile:profiles!orders_rep_user_id_fkey(display_name), source_types(name), season_deliveries!delivery_id(label, delivery_month, delivery_day)',
			{ count: 'exact' }
		)
		.eq('organization_id', organization.id)
		.order('created_at', { ascending: false })
		.range(0, PAGE_SIZE - 1);
	displayQuery = applyFilters(displayQuery);

	// 2. Lightweight metrics query (all matching, minimal columns)
	let metricsQuery = supabaseAdmin
		.from('orders')
		.select(
			'id, status, total_amount, created_at, expected_ship_date, start_ship_date, shipped_at, updated_at'
		)
		.eq('organization_id', organization.id);
	metricsQuery = applyFilters(metricsQuery);
	const metricsResult = await metricsQuery;
	const metricsRows = (metricsResult.data ?? []) as Array<{
		id: string;
		status: string;
		total_amount: number | string;
		created_at: string;
		expected_ship_date: string | null;
		start_ship_date: string | null;
		shipped_at: string | null;
		updated_at: string | null;
	}>;
	const spotlightCounts = tallySpotlight(metricsRows);

	// When spotlight is active, restrict the display query to matching IDs
	if (spotlight) {
		const matchingIds = metricsRows
			.filter((r) => {
				const buckets = classifyOrder(r);
				if (buckets.length === 0) return false;
				if (spotlight === 'all') return true;
				return buckets.includes(spotlight);
			})
			.map((r) => r.id);
		if (matchingIds.length === 0) {
			displayQuery = displayQuery.eq('id', '__none__');
		} else {
			displayQuery = displayQuery.in('id', matchingIds);
		}
	}

	const displayResult = await displayQuery;

	const orders = displayResult.data ?? [];
	const totalCount = displayResult.count ?? orders.length;

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
		spotlight: spotlightCounts,
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
		sourceTypes: (sourceTypesResult.data ?? []) as Array<{ id: string; name: string }>,
		reps: [] as Array<{ id: string; name: string }>,
		isBrandOrg: false,
		metrics
	};
};
