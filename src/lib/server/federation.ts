import type { SupabaseClient } from '@supabase/supabase-js';

// Row shapes returned by the helpers. Kept loose to absorb Supabase join quirks.

export type ConnectedRep = {
	connection_id: string;
	rep_org_id: string;
	rep_org_name: string;
	rep_org_slug: string | null;
	rep_brand_id: string | null;
	status: 'pending' | 'active' | 'suspended' | 'disconnected';
	commission_rate: number | null;
	connected_at: string | null;
	disconnected_at: string | null;
	created_at: string;
	order_count: number;
	revenue: number;
	last_order_at: string | null;
	account_count: number;
};

type ConnectionRow = {
	id: string;
	rep_org_id: string;
	brand_org_id: string;
	rep_brand_id: string | null;
	status: 'pending' | 'active' | 'suspended' | 'disconnected';
	commission_rate: number | null;
	connected_at: string | null;
	disconnected_at: string | null;
	created_at: string;
	rep_org: { id: string; name: string; slug: string | null } | null;
};

type FederatedOrderLink = {
	order_id: string;
	connection_id: string;
	orders: {
		id: string;
		total_amount: number | null;
		created_at: string;
	} | null;
};

/**
 * List connected rep orgs for a brand with per-connection aggregates (order count, revenue, last
 * activity, account count). One row per connection; pending/suspended connections also returned.
 */
export async function listConnectedReps(
	supabase: SupabaseClient,
	brandOrgId: string
): Promise<ConnectedRep[]> {
	const { data: connections } = await supabase
		.from('org_connections')
		.select(
			'id, rep_org_id, brand_org_id, rep_brand_id, status, commission_rate, connected_at, disconnected_at, created_at, rep_org:rep_org_id(id, name, slug)'
		)
		.eq('brand_org_id', brandOrgId)
		.order('created_at', { ascending: false });

	const rows = (connections ?? []) as unknown as ConnectionRow[];
	if (rows.length === 0) return [];

	const ids = rows.map((r) => r.id);

	// Federated order aggregates per connection
	const { data: orderLinks } = await supabase
		.from('federated_order_links')
		.select('order_id, connection_id, orders(id, total_amount, created_at)')
		.in('connection_id', ids)
		.eq('status', 'active');

	const orderAgg = new Map<string, { count: number; revenue: number; last: string | null }>();
	for (const link of (orderLinks ?? []) as unknown as FederatedOrderLink[]) {
		const key = link.connection_id;
		const existing = orderAgg.get(key) ?? { count: 0, revenue: 0, last: null };
		existing.count += 1;
		existing.revenue += Number(link.orders?.total_amount ?? 0);
		const ts = link.orders?.created_at ?? null;
		if (ts && (!existing.last || ts > existing.last)) existing.last = ts;
		orderAgg.set(key, existing);
	}

	// Account counts per connection
	const { data: accountLinks } = await supabase
		.from('federated_account_links')
		.select('account_id, connection_id')
		.in('connection_id', ids);

	const accountAgg = new Map<string, number>();
	for (const link of (accountLinks ?? []) as Array<{ connection_id: string }>) {
		accountAgg.set(link.connection_id, (accountAgg.get(link.connection_id) ?? 0) + 1);
	}

	return rows.map((c) => {
		const orderStats = orderAgg.get(c.id) ?? { count: 0, revenue: 0, last: null };
		return {
			connection_id: c.id,
			rep_org_id: c.rep_org_id,
			rep_org_name: c.rep_org?.name ?? 'Unknown rep',
			rep_org_slug: c.rep_org?.slug ?? null,
			rep_brand_id: c.rep_brand_id,
			status: c.status,
			commission_rate: c.commission_rate,
			connected_at: c.connected_at,
			disconnected_at: c.disconnected_at,
			created_at: c.created_at,
			order_count: orderStats.count,
			revenue: orderStats.revenue,
			last_order_at: orderStats.last,
			account_count: accountAgg.get(c.id) ?? 0
		};
	});
}

export type ConnectionActivityItem =
	| {
			kind: 'order';
			id: string;
			when: string;
			order_number: string | null;
			account_name: string | null;
			total: number;
			status: string;
	  }
	| {
			kind: 'account';
			id: string;
			when: string;
			business_name: string | null;
			city: string | null;
			state: string | null;
	  };

/**
 * Recent activity (orders + new accounts) for a single connection.
 */
export async function connectionActivityFeed(
	supabase: SupabaseClient,
	connectionId: string,
	limit = 10
): Promise<ConnectionActivityItem[]> {
	const [ordersRes, accountsRes] = await Promise.all([
		supabase
			.from('federated_order_links')
			.select(
				'order_id, created_at, orders(id, order_number, status, total_amount, accounts(business_name))'
			)
			.eq('connection_id', connectionId)
			.eq('status', 'active')
			.order('created_at', { ascending: false })
			.limit(limit),
		supabase
			.from('federated_account_links')
			.select('account_id, created_at, accounts(id, business_name, city, state)')
			.eq('connection_id', connectionId)
			.order('created_at', { ascending: false })
			.limit(limit)
	]);

	type OrderLink = {
		order_id: string;
		created_at: string;
		orders: {
			id: string;
			order_number: string | null;
			status: string;
			total_amount: number | null;
			accounts: { business_name: string | null } | null;
		} | null;
	};
	type AccountLink = {
		account_id: string;
		created_at: string;
		accounts: {
			id: string;
			business_name: string | null;
			city: string | null;
			state: string | null;
		} | null;
	};

	const items: ConnectionActivityItem[] = [];
	for (const link of (ordersRes.data ?? []) as unknown as OrderLink[]) {
		if (!link.orders) continue;
		items.push({
			kind: 'order',
			id: link.orders.id,
			when: link.created_at,
			order_number: link.orders.order_number,
			account_name: link.orders.accounts?.business_name ?? null,
			total: Number(link.orders.total_amount ?? 0),
			status: link.orders.status
		});
	}
	for (const link of (accountsRes.data ?? []) as unknown as AccountLink[]) {
		if (!link.accounts) continue;
		items.push({
			kind: 'account',
			id: link.accounts.id,
			when: link.created_at,
			business_name: link.accounts.business_name,
			city: link.accounts.city,
			state: link.accounts.state
		});
	}

	items.sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0));
	return items.slice(0, limit);
}

export type FederatedOrderRow = {
	id: string;
	order_number: string | null;
	order_type: string;
	status: string;
	total_amount: number;
	created_at: string;
	expected_ship_date: string | null;
	start_ship_date: string | null;
	season_id: string | null;
	order_year: number | null;
	brand_id: string;
	account_id: string | null;
	freeform_name: string | null;
	connection_id: string | null;
	rep_org_id: string;
	rep_org_name: string;
	account_name: string | null;
	brand_name: string | null;
	season_name: string | null;
	source_type_name: string | null;
	show_date: {
		id: string;
		year: number | null;
		month: number | null;
		city: string | null;
		state: string | null;
		show_name: string | null;
	} | null;
	created_by: string | null;
	created_by_name: string | null;
};

/**
 * List orders federated to a brand org, flattened with rep-org + account + brand + season names.
 */
export async function listFederatedOrders(
	supabase: SupabaseClient,
	brandOrgId: string
): Promise<FederatedOrderRow[]> {
	const { data } = await supabase
		.from('federated_order_links')
		.select(
			[
				'order_id',
				'source_org_id',
				'connection_id',
				'source_org:source_org_id(id, name)',
				'orders(id, order_number, order_type, status, total_amount, created_at, expected_ship_date, start_ship_date, season_id, order_year, brand_id, account_id, freeform_name, connection_id, created_by, accounts(business_name), brands(name), seasons(name), source_types(name), show_dates(id, year, month, city, state, shows(name)), profiles!orders_created_by_fkey(display_name))'
			].join(', ')
		)
		.eq('target_org_id', brandOrgId)
		.eq('status', 'active')
		.order('created_at', { ascending: false });

	type Link = {
		order_id: string;
		source_org_id: string;
		connection_id: string;
		source_org: { id: string; name: string } | null;
		orders: {
			id: string;
			order_number: string | null;
			order_type: string;
			status: string;
			total_amount: number | null;
			created_at: string;
			expected_ship_date: string | null;
			start_ship_date: string | null;
			season_id: string | null;
			order_year: number | null;
			brand_id: string;
			account_id: string | null;
			freeform_name: string | null;
			connection_id: string | null;
			created_by: string | null;
			accounts: { business_name: string | null } | null;
			brands: { name: string | null } | null;
			seasons: { name: string | null } | null;
			source_types: { name: string | null } | null;
			show_dates: {
				id: string;
				year: number | null;
				month: number | null;
				city: string | null;
				state: string | null;
				shows: { name: string | null } | null;
			} | null;
			profiles: { display_name: string | null } | null;
		} | null;
	};

	const rows = (data ?? []) as unknown as Link[];
	const liveRows = rows.filter(
		(r): r is Link & { orders: NonNullable<Link['orders']> } => r.orders !== null
	);

	// Supabase's nested profiles join is fragile (sometimes typed as an array
	// of one, sometimes empty under specific RLS paths). Look up rep display
	// names in one admin shot keyed by created_by so we never lose the name.
	const createdByIds = Array.from(
		new Set(liveRows.map((r) => r.orders.created_by).filter((id): id is string => !!id))
	);
	const nameById = new Map<string, string>();
	if (createdByIds.length > 0) {
		const { data: profiles } = await supabase
			.from('profiles')
			.select('id, display_name')
			.in('id', createdByIds);
		for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
			if (p.display_name) nameById.set(p.id, p.display_name);
		}
	}

	return liveRows.map((r) => {
		const joinedProfile = (r.orders as unknown as { profiles?: unknown }).profiles;
		const joinedName = Array.isArray(joinedProfile)
			? ((joinedProfile[0] as { display_name?: string | null } | undefined)?.display_name ?? null)
			: ((joinedProfile as { display_name?: string | null } | null)?.display_name ?? null);
		const createdById = r.orders.created_by ?? null;
		return {
			id: r.orders.id,
			order_number: r.orders.order_number,
			order_type: r.orders.order_type,
			status: r.orders.status,
			total_amount: Number(r.orders.total_amount ?? 0),
			created_at: r.orders.created_at,
			expected_ship_date: r.orders.expected_ship_date,
			start_ship_date: r.orders.start_ship_date,
			season_id: r.orders.season_id,
			order_year: r.orders.order_year,
			brand_id: r.orders.brand_id,
			account_id: r.orders.account_id,
			freeform_name: r.orders.freeform_name,
			connection_id: r.orders.connection_id,
			rep_org_id: r.source_org?.id ?? r.source_org_id,
			rep_org_name: r.source_org?.name ?? 'Rep',
			account_name: r.orders.accounts?.business_name ?? null,
			brand_name: r.orders.brands?.name ?? null,
			season_name: r.orders.seasons?.name ?? null,
			source_type_name: r.orders.source_types?.name ?? null,
			show_date: r.orders.show_dates
				? {
						id: r.orders.show_dates.id,
						year: r.orders.show_dates.year,
						month: r.orders.show_dates.month,
						city: r.orders.show_dates.city,
						state: r.orders.show_dates.state,
						show_name: r.orders.show_dates.shows?.name ?? null
					}
				: null,
			created_by: createdById,
			created_by_name: joinedName ?? (createdById ? (nameById.get(createdById) ?? null) : null)
		};
	});
}
