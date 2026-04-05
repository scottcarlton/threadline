import type { SupabaseClient } from '@supabase/supabase-js';

type ToolContext = {
	supabase: SupabaseClient;
	organizationId: string;
	userId: string;
	brandScope: string[] | null;
};

type ToolResult = {
	success: boolean;
	data?: unknown;
	error?: string;
};

export async function executeToolCall(
	toolName: string,
	toolInput: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	switch (toolName) {
		case 'create_brand':
			return createBrand(toolInput, ctx);
		case 'update_brand':
			return updateBrand(toolInput, ctx);
		case 'create_account':
			return createAccount(toolInput, ctx);
		case 'update_account':
			return updateAccount(toolInput, ctx);
		case 'create_order':
			return createOrder(toolInput, ctx);
		case 'add_order_lines':
			return addOrderLines(toolInput, ctx);
		case 'update_order_status':
			return updateOrderStatus(toolInput, ctx);
		case 'create_season':
			return createSeason(toolInput, ctx);
		case 'create_show':
			return createShow(toolInput, ctx);
		case 'query_data':
			return queryData(toolInput, ctx);
		case 'get_dashboard_metrics':
			return getDashboardMetrics(toolInput, ctx);
		default:
			return { success: false, error: `Unknown tool: ${toolName}` };
	}
}

async function createBrand(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const { data, error } = await ctx.supabase
		.from('brands')
		.insert({
			organization_id: ctx.organizationId,
			name: input.name as string,
			contact_name: (input.contact_name as string) ?? null,
			contact_email: (input.contact_email as string) ?? null,
			contact_phone: (input.contact_phone as string) ?? null,
			website: (input.website as string) ?? null,
			notes: (input.notes as string) ?? null
		})
		.select()
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function updateBrand(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const { brand_id, ...updates } = input;
	const { data, error } = await ctx.supabase
		.from('brands')
		.update(updates)
		.eq('id', brand_id as string)
		.eq('organization_id', ctx.organizationId)
		.select()
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function createAccount(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const { data, error } = await ctx.supabase
		.from('accounts')
		.insert({
			organization_id: ctx.organizationId,
			business_name: input.business_name as string,
			contact_name: (input.contact_name as string) ?? null,
			contact_email: (input.contact_email as string) ?? null,
			phone: (input.phone as string) ?? null,
			address_line1: (input.address_line1 as string) ?? null,
			city: (input.city as string) ?? null,
			state: (input.state as string) ?? null,
			zip: (input.zip as string) ?? null,
			notes: (input.notes as string) ?? null
		})
		.select()
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function updateAccount(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const { account_id, ...updates } = input;
	const { data, error } = await ctx.supabase
		.from('accounts')
		.update(updates)
		.eq('id', account_id as string)
		.eq('organization_id', ctx.organizationId)
		.select()
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function createOrder(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	// Fuzzy match account by business_name
	const { data: accounts, error: accError } = await ctx.supabase
		.from('accounts')
		.select('id, business_name')
		.eq('organization_id', ctx.organizationId)
		.ilike('business_name', `%${input.account_name as string}%`)
		.limit(1);

	if (accError || !accounts?.length) {
		return {
			success: false,
			error: `Account not found matching "${input.account_name}". ${accError?.message ?? ''}`
		};
	}

	// Fuzzy match brand by name
	let brandQuery = ctx.supabase
		.from('brands')
		.select('id, name')
		.eq('organization_id', ctx.organizationId)
		.ilike('name', `%${input.brand_name as string}%`);

	if (ctx.brandScope) {
		brandQuery = brandQuery.in('id', ctx.brandScope);
	}

	const { data: brands, error: brandError } = await brandQuery.limit(1);

	if (brandError || !brands?.length) {
		return {
			success: false,
			error: `Brand not found matching "${input.brand_name}". ${brandError?.message ?? ''}`
		};
	}

	// Resolve season if provided
	let seasonId: string | null = null;
	if (input.season_name) {
		const { data: seasons } = await ctx.supabase
			.from('seasons')
			.select('id')
			.eq('organization_id', ctx.organizationId)
			.ilike('name', `%${input.season_name as string}%`)
			.limit(1);
		seasonId = seasons?.[0]?.id ?? null;
	}

	// Resolve show if provided
	let showId: string | null = null;
	if (input.show_name) {
		const { data: shows } = await ctx.supabase
			.from('shows')
			.select('id')
			.eq('organization_id', ctx.organizationId)
			.ilike('name', `%${input.show_name as string}%`)
			.limit(1);
		showId = shows?.[0]?.id ?? null;
	}

	const { data, error } = await ctx.supabase
		.from('orders')
		.insert({
			organization_id: ctx.organizationId,
			account_id: accounts[0].id,
			brand_id: brands[0].id,
			season_id: seasonId,
			order_year: (input.order_year as number) ?? null,
			show_id: showId,
			status: 'draft',
			notes: (input.notes as string) ?? null,
			created_by: ctx.userId
		})
		.select('*, brands(name), accounts(business_name), seasons(name)')
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function addOrderLines(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const lines = input.lines as Array<{
		style_number?: string;
		description?: string;
		color?: string;
		size?: string;
		qty: number;
		unit_price: number;
	}>;

	const orderId = input.order_id as string;

	// Verify order belongs to org
	const { data: order, error: orderError } = await ctx.supabase
		.from('orders')
		.select('id')
		.eq('id', orderId)
		.eq('organization_id', ctx.organizationId)
		.single();

	if (orderError || !order) {
		return { success: false, error: 'Order not found or access denied.' };
	}

	const rows = lines.map((line, idx) => ({
		order_id: orderId,
		style_number: line.style_number ?? null,
		description: line.description ?? null,
		color: line.color ?? null,
		size: line.size ?? null,
		qty: line.qty,
		unit_price: line.unit_price,
		line_total: line.qty * line.unit_price,
		sort_order: idx
	}));

	const { data, error } = await ctx.supabase.from('order_lines').insert(rows).select();

	if (error) return { success: false, error: error.message };

	// Update order total
	const total = rows.reduce((sum, r) => sum + r.line_total, 0);
	await ctx.supabase.rpc('increment_order_total', {
		p_order_id: orderId,
		p_amount: total
	}).then(({ error: rpcError }) => {
		// Fallback: if RPC doesn't exist, update directly
		if (rpcError) {
			return ctx.supabase
				.from('orders')
				.update({ total_amount: total })
				.eq('id', orderId);
		}
	});

	return { success: true, data: { lines_added: data?.length ?? rows.length, total_added: total } };
}

async function updateOrderStatus(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const status = input.status as string;
	const timestampField: Record<string, string> = {
		submitted: 'submitted_at',
		confirmed: 'confirmed_at',
		shipped: 'shipped_at',
		delivered: 'delivered_at',
		cancelled: 'cancelled_at'
	};

	const updatePayload: Record<string, unknown> = { status };
	if (timestampField[status]) {
		updatePayload[timestampField[status]] = new Date().toISOString();
	}

	const { data, error } = await ctx.supabase
		.from('orders')
		.update(updatePayload)
		.eq('id', input.order_id as string)
		.eq('organization_id', ctx.organizationId)
		.select('id, order_number, status')
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function createSeason(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const { data, error } = await ctx.supabase
		.from('seasons')
		.insert({
			organization_id: ctx.organizationId,
			name: input.name as string,
			sort_order: (input.sort_order as number) ?? 0
		})
		.select()
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function createShow(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	let seasonId: string | null = null;
	if (input.season_name) {
		const { data: seasons } = await ctx.supabase
			.from('seasons')
			.select('id')
			.eq('organization_id', ctx.organizationId)
			.ilike('name', `%${input.season_name as string}%`)
			.limit(1);
		seasonId = seasons?.[0]?.id ?? null;
	}

	const { data, error } = await ctx.supabase
		.from('shows')
		.insert({
			organization_id: ctx.organizationId,
			name: input.name as string,
			venue: (input.venue as string) ?? null,
			city: (input.city as string) ?? null,
			state: (input.state as string) ?? null,
			start_date: (input.start_date as string) ?? null,
			end_date: (input.end_date as string) ?? null,
			season_id: seasonId,
			year: (input.year as number) ?? null
		})
		.select()
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function queryData(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const entity = input.entity as string;
	const filters = (input.filters as Record<string, unknown>) ?? {};

	const tableMap: Record<string, string> = {
		brands: 'brands',
		accounts: 'accounts',
		orders: 'orders',
		shows: 'shows',
		seasons: 'seasons'
	};

	const table = tableMap[entity];
	if (!table) return { success: false, error: `Unknown entity: ${entity}` };

	let selectStr = '*';
	if (entity === 'orders') {
		selectStr = '*, brands(name), accounts(business_name), seasons(name)';
	}
	if (entity === 'shows') {
		selectStr = '*, seasons(name)';
	}

	let query = ctx.supabase.from(table).select(selectStr).eq('organization_id', ctx.organizationId);

	// Apply brand scope for restricted entities
	if (ctx.brandScope && entity === 'brands') {
		query = query.in('id', ctx.brandScope);
	}
	if (ctx.brandScope && entity === 'orders') {
		query = query.in('brand_id', ctx.brandScope);
	}

	// Apply filters
	for (const [key, value] of Object.entries(filters)) {
		if (typeof value === 'string') {
			query = query.ilike(key, `%${value}%`);
		} else {
			query = query.eq(key, value as string | number | boolean);
		}
	}

	const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function getDashboardMetrics(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	try {
		// Total orders with optional filters
		let ordersQuery = ctx.supabase
			.from('orders')
			.select('id, status, total_amount, created_at, brand_id, season_id, order_year', { count: 'exact' })
			.eq('organization_id', ctx.organizationId);

		if (ctx.brandScope) {
			ordersQuery = ordersQuery.in('brand_id', ctx.brandScope);
		}
		if (input.brand_id) {
			ordersQuery = ordersQuery.eq('brand_id', input.brand_id as string);
		}
		if (input.order_year) {
			ordersQuery = ordersQuery.eq('order_year', input.order_year as number);
		}
		if (input.season_name) {
			// Resolve season first
			const { data: seasons } = await ctx.supabase
				.from('seasons')
				.select('id')
				.eq('organization_id', ctx.organizationId)
				.ilike('name', `%${input.season_name as string}%`)
				.limit(1);
			if (seasons?.[0]) {
				ordersQuery = ordersQuery.eq('season_id', seasons[0].id);
			}
		}

		const { data: orders, count: orderCount } = await ordersQuery;

		// Aggregate metrics
		const totalRevenue = orders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) ?? 0;
		const statusCounts: Record<string, number> = {};
		orders?.forEach((o) => {
			statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
		});

		// Brand count
		let brandsQuery = ctx.supabase
			.from('brands')
			.select('id', { count: 'exact' })
			.eq('organization_id', ctx.organizationId)
			.eq('is_active', true);
		if (ctx.brandScope) {
			brandsQuery = brandsQuery.in('id', ctx.brandScope);
		}
		const { count: brandCount } = await brandsQuery;

		// Account count
		const { count: accountCount } = await ctx.supabase
			.from('accounts')
			.select('id', { count: 'exact' })
			.eq('organization_id', ctx.organizationId)
			.eq('is_active', true);

		return {
			success: true,
			data: {
				total_orders: orderCount ?? 0,
				total_revenue: totalRevenue,
				order_status_breakdown: statusCounts,
				active_brands: brandCount ?? 0,
				active_accounts: accountCount ?? 0
			}
		};
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : 'Failed to get metrics' };
	}
}
