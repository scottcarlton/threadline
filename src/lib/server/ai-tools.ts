import type { SupabaseClient } from '@supabase/supabase-js';
import { getGmailClient, parseMessage, buildRawEmail } from './gmail.js';
import { supabaseAdmin } from './supabase.js';
import { computeAccountHealth } from './account-health.js';
import { sendSlackMessage } from './integrations/slack.js';
import { sendDiscordMessage } from './integrations/discord.js';
import {
	exportToSheet,
	EXPORT_SCHEMAS,
	type ExportDataType,
	type ExportRow
} from './integrations/google-sheets.js';
import {
	listDatabases,
	syncToNotion,
	pullFromNotion,
	mapToNotionProperties,
	type SyncDataType
} from './integrations/notion.js';

// Submit-side effects (email + notifications) are loaded lazily so that the
// ai-tools module stays importable in unit tests where $env/dynamic/private
// isn't wired. See notifyOrderSubmitted below.

type ToolContext = {
	supabase: SupabaseClient;
	organizationId: string;
	userId: string;
	brandScope: string[] | null;
	orgType: 'rep' | 'brand';
	origin: string;
};

type ToolResult = {
	success: boolean;
	data?: unknown;
	error?: string;
};

// Strip or keep a subset of fields from a Supabase row so we don't send
// organization_id, timestamps, and other noise back to Claude in every result.
function formatToolResult(
	data: Record<string, unknown>,
	opts: { keep?: string[]; omit?: string[] }
): Record<string, unknown> {
	if (opts.keep) {
		const result: Record<string, unknown> = {};
		for (const key of opts.keep) {
			if (data[key] !== undefined && data[key] !== null) result[key] = data[key];
		}
		return result;
	}
	const result: Record<string, unknown> = { ...data };
	for (const key of opts.omit ?? []) delete result[key];
	return result;
}

const QUERY_OMIT_FIELDS = ['organization_id', 'updated_at'];

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
		case 'list_brands':
			return listBrands(ctx);
		case 'list_accounts':
			return listAccounts(ctx);
		case 'get_dashboard_metrics':
			return getDashboardMetrics(toolInput, ctx);
		case 'draft_email':
			return draftEmail(toolInput, ctx);
		case 'send_email':
			return sendEmail(toolInput, ctx);
		case 'search_emails':
			return searchEmails(toolInput, ctx);
		case 'create_territory':
			return createTerritory(toolInput, ctx);
		case 'update_territory':
			return updateTerritory(toolInput, ctx);
		case 'assign_account_territory':
			return assignAccountTerritory(toolInput, ctx);
		case 'create_appointment':
			return createAppointment(toolInput, ctx);
		case 'update_appointment':
			return updateAppointment(toolInput, ctx);
		case 'delete_appointment':
			return deleteAppointment(toolInput, ctx);
		case 'update_order_line':
			return updateOrderLine(toolInput, ctx);
		case 'remove_order_line':
			return removeOrderLine(toolInput, ctx);
		case 'update_order':
			return updateOrder(toolInput, ctx);
		case 'archive_entity':
			return archiveEntity(toolInput, ctx);
		case 'get_sales_report':
			return getSalesReport(toolInput, ctx);
		case 'get_sales_analytics':
			return getSalesAnalytics(toolInput, ctx);
		case 'get_style_velocity':
			return getStyleVelocity(toolInput, ctx);
		case 'get_commission_report':
			return getCommissionReport(toolInput, ctx);
		case 'get_account_health':
			return getAccountHealth(toolInput, ctx);
		case 'add_product':
			return addProduct(toolInput, ctx);
		case 'update_products':
			return updateProducts(toolInput, ctx);
		case 'send_slack_message':
			return sendSlack(toolInput, ctx);
		case 'send_discord_message':
			return sendDiscord(toolInput, ctx);
		case 'export_to_google_sheet':
			return exportGoogleSheet(toolInput, ctx);
		case 'list_notion_databases':
			return listNotionDbs(ctx);
		case 'sync_to_notion':
			return syncNotion(toolInput, ctx);
		case 'pull_from_notion':
			return pullNotion(toolInput, ctx);
		default:
			return { success: false, error: `Unknown tool: ${toolName}` };
	}
}

async function createBrand(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	const { data, error } = await ctx.supabase
		.from('brands')
		.insert({
			organization_id: ctx.organizationId,
			name: input.name as string,
			contact_first_name: (input.contact_first_name as string) ?? null,
			contact_last_name: (input.contact_last_name as string) ?? null,
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

async function updateBrand(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
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
	const businessName = (input.business_name as string)?.trim();
	if (!businessName) {
		return { success: false, error: 'business_name is required' };
	}

	// Dedupe: case-insensitive exact match against any visible active account
	// (own-org OR federated). Prevents recreating a BOA-owned account the rep
	// already sees through a connection. RLS handles the federation scoping.
	const { data: existing } = await ctx.supabase
		.from('accounts')
		.select('id, business_name, city, state, organization_id')
		.eq('is_active', true)
		.ilike('business_name', businessName)
		.limit(1)
		.maybeSingle();

	if (existing) {
		const connected = existing.organization_id !== ctx.organizationId;
		return {
			success: true,
			data: {
				id: existing.id,
				business_name: existing.business_name,
				city: existing.city,
				state: existing.state,
				already_exists: true,
				connected
			}
		};
	}

	const { data, error } = await ctx.supabase
		.from('accounts')
		.insert({
			organization_id: ctx.organizationId,
			business_name: businessName,
			contact_first_name: (input.contact_first_name as string) ?? null,
			contact_last_name: (input.contact_last_name as string) ?? null,
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

	// Auto-invite contact to buyer portal if email provided
	const contactEmail = input.contact_email as string | undefined;
	if (contactEmail && data?.id) {
		await supabaseAdmin.from('buyer_invitations').insert({
			account_id: data.id,
			organization_id: ctx.organizationId,
			email: contactEmail,
			invited_by: ctx.userId
		});
	}

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

type OrderLineInput = {
	style_number?: string;
	description?: string;
	color?: string;
	size?: string;
	qty: number;
	unit_price?: number;
};

async function createOrder(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	// Mirror the manual /orders/new flow (src/lib/server/orders/cart.ts):
	//   - one order per (brand, season)
	//   - season is DERIVED from the products in the cart, not passed in
	//   - ship window is "custom" mode: start_ship_date + expected_ship_date,
	//     delivery_id stays null
	//   - created_by = the sales rep's profile (defaults to the caller)

	const accountName = (input.account_name as string)?.trim() ?? '';
	const brandName = (input.brand_name as string)?.trim() ?? '';
	const startShip = input.start_ship_date as string | undefined;
	const completeShip = input.complete_ship_date as string | undefined;
	const rawLines = input.lines as OrderLineInput[] | undefined;

	if (!accountName) return { success: false, error: 'account_name is required' };
	if (!brandName) return { success: false, error: 'brand_name is required' };
	if (!startShip || !completeShip) {
		return {
			success: false,
			error:
				'Both start_ship_date and complete_ship_date are required (YYYY-MM-DD). Ask the user for the ship window before creating the order.'
		};
	}
	if (!rawLines?.length) {
		return { success: false, error: 'lines is required (at least one item with size/qty)' };
	}

	// --- Account (federation-aware via RLS) ---
	const account = await findByName<{ id: string; business_name: string }>(
		() => ctx.supabase.from('accounts').select('id, business_name').eq('is_active', true),
		'business_name',
		accountName
	);
	if (!account) return { success: false, error: `Account not found matching "${accountName}"` };

	// --- Brand (federation-aware via RLS; honors Sales brandScope) ---
	const brand = await findByName<{ id: string; name: string }>(
		() => {
			let q = ctx.supabase.from('brands').select('id, name').eq('is_active', true);
			if (ctx.brandScope) q = q.in('id', ctx.brandScope);
			return q;
		},
		'name',
		brandName
	);
	if (!brand) return { success: false, error: `Brand not found matching "${brandName}"` };

	// --- Sales rep → created_by (defaults to the authenticated user) ---
	let createdBy = ctx.userId;
	const repName = (input.rep_name as string | undefined)?.trim();
	if (repName) {
		const { data: memberRow } = await ctx.supabase
			.from('organization_members')
			.select('profile_id, profiles!organization_members_profile_id_fkey(display_name)')
			.eq('organization_id', ctx.organizationId)
			.limit(50);
		type MemberRow = {
			profile_id: string;
			profiles: { display_name: string | null } | { display_name: string | null }[] | null;
		};
		const rows = (memberRow ?? []) as MemberRow[];
		const needle = repName.toLowerCase();
		const match = rows.find((m) => {
			const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
			return (p?.display_name ?? '').toLowerCase().includes(needle);
		});
		if (!match) {
			return { success: false, error: `Sales rep not found matching "${repName}"` };
		}
		createdBy = match.profile_id;
	}

	// --- Resolve each line to a product (for season + default unit_price) ---
	type ResolvedLine = OrderLineInput & { seasonId: string | null; resolvedPrice: number };
	const resolved: ResolvedLine[] = [];
	for (const line of rawLines) {
		if (!line.qty || line.qty < 1) {
			return { success: false, error: 'Every line needs qty >= 1' };
		}

		let seasonId: string | null = null;
		let price = line.unit_price;

		// Product lookup: try style_number first, fall back to name match on
		// the description. The product row gives us season_id and a default
		// wholesale_price so the agent doesn't have to know either.
		const lookupBase = () =>
			ctx.supabase
				.from('products')
				.select('id, style_number, name, brand_id, season_id, wholesale_price')
				.eq('is_active', true)
				.eq('brand_id', brand.id);
		let product: {
			id: string;
			style_number: string | null;
			season_id: string | null;
			wholesale_price: number | null;
		} | null = null;
		if (line.style_number) {
			const { data } = await lookupBase().ilike('style_number', line.style_number).limit(1);
			product = data?.[0] ?? null;
		}
		if (!product && line.description) {
			const { data } = await lookupBase().ilike('name', `%${line.description}%`).limit(1);
			product = data?.[0] ?? null;
			if (product?.style_number && !line.style_number) {
				line.style_number = product.style_number;
			}
		}
		if (product) {
			seasonId = product.season_id ?? null;
			if (price == null) price = Number(product.wholesale_price ?? 0);
		}

		if (price == null) {
			const label = line.style_number ?? line.description ?? 'line';
			const nameHint = line.description ?? line.style_number ?? '';
			return {
				success: false,
				error: `Could not resolve product for "${label}" in ${brand.name}'s catalog. Before asking the user for a wholesale price, call query_data with entity="products" and filters={name:"${nameHint}", brand_id:"${brand.id}"} to confirm whether it's really off-catalog. If it IS in the catalog, retry create_order with description set to the exact product name; only ask the user for unit_price if query_data returns zero matches.`
			};
		}

		resolved.push({ ...line, seasonId, resolvedPrice: price });
	}

	// All lines must share a single season (null is fine). Multi-season carts
	// would split into multiple orders in the manual flow — keep the AI tool
	// single-shot and make the agent call again for a second season.
	const seasonIds = new Set(resolved.map((l) => l.seasonId).filter((s): s is string => Boolean(s)));
	if (seasonIds.size > 1) {
		return {
			success: false,
			error:
				'Lines span multiple seasons; create one order per season. Split the items by season and call create_order again.'
		};
	}
	const seasonId: string | null = [...seasonIds][0] ?? null;

	const orderYear = Number(startShip.slice(0, 4)) || null;

	// Status defaults to 'submitted' when everything validates cleanly. The
	// caller can force a draft by passing status='draft' in the tool input
	// (e.g. the user said "save as a draft"). We insert as 'draft' first so
	// that if line insertion fails the order isn't left submitted-with-no-lines,
	// then flip to 'submitted' once the lines are in.
	const requestedStatus = input.status as 'draft' | 'submitted' | undefined;
	const finalStatus: 'draft' | 'submitted' = requestedStatus === 'draft' ? 'draft' : 'submitted';
	const requestedType = input.order_type as 'order' | 'note' | undefined;
	const orderType: 'order' | 'note' = requestedType === 'note' ? 'note' : 'order';

	// --- Insert the order (custom delivery mode — explicit start+expected) ---
	const { data: orderRow, error: orderErr } = await ctx.supabase
		.from('orders')
		.insert({
			organization_id: ctx.organizationId,
			account_id: account.id,
			brand_id: brand.id,
			season_id: seasonId,
			order_year: orderYear,
			start_ship_date: startShip,
			expected_ship_date: completeShip,
			delivery_id: null,
			status: 'draft',
			order_type: orderType,
			notes: (input.notes as string) ?? null,
			created_by: createdBy
		})
		.select('id, order_number')
		.single();

	if (orderErr || !orderRow) {
		return { success: false, error: orderErr?.message ?? 'Failed to create order' };
	}

	// --- Insert lines (line_total is GENERATED ALWAYS; do NOT include) ---
	const lineRows = resolved.map((line, idx) => ({
		order_id: orderRow.id,
		style_number: line.style_number ?? null,
		description: line.description ?? null,
		color: line.color ?? null,
		size: line.size ?? null,
		qty: line.qty,
		unit_price: line.resolvedPrice,
		sort_order: idx
	}));

	const { error: linesErr } = await ctx.supabase.from('order_lines').insert(lineRows);
	if (linesErr) {
		return {
			success: false,
			error: `Order ${orderRow.order_number} created but adding lines failed: ${linesErr.message}`
		};
	}

	// --- Promote to submitted (unless the caller asked for draft) ---
	if (finalStatus === 'submitted') {
		const { error: statusErr } = await ctx.supabase
			.from('orders')
			.update({ status: 'submitted', submitted_at: new Date().toISOString() })
			.eq('id', orderRow.id);
		if (statusErr) {
			return {
				success: false,
				error: `Order ${orderRow.order_number} created with lines but failed to submit: ${statusErr.message}. It's saved as a draft — tell the user to review and submit from the order detail page.`
			};
		}

		const totalForNotify = lineRows.reduce((sum, r) => sum + r.qty * r.unit_price, 0);
		await notifyOrderSubmitted(
			{
				id: orderRow.id,
				order_number: orderRow.order_number,
				total_amount: totalForNotify,
				brand_id: brand.id,
				account_id: account.id,
				created_by: createdBy
			},
			ctx.origin
		);
	}

	// --- Return the final shape (total_amount now populated by the trigger) ---
	const { data: finalRow } = await ctx.supabase
		.from('orders')
		.select(
			'id, order_number, status, total_amount, order_year, start_ship_date, expected_ship_date, brands(name), accounts(business_name), seasons(name)'
		)
		.eq('id', orderRow.id)
		.single();

	const trimmed = formatToolResult((finalRow ?? {}) as Record<string, unknown>, {
		keep: [
			'id',
			'order_number',
			'status',
			'total_amount',
			'order_year',
			'start_ship_date',
			'expected_ship_date',
			'brands',
			'accounts',
			'seasons'
		]
	});
	return { success: true, data: { ...trimmed, lines_added: lineRows.length } };
}

// Fire the same email + in-app notifications that /orders/new does on submit.
// Best-effort, dynamically imported to keep this module test-safe (the email
// module pulls $env/dynamic/private which isn't available in vitest). Mirrors
// src/routes/orders/new/+page.server.ts.
async function notifyOrderSubmitted(
	order: {
		id: string;
		order_number: string;
		total_amount: number;
		brand_id: string;
		account_id: string | null;
		created_by: string;
	},
	origin: string
): Promise<void> {
	try {
		const [emailMod, notifMod] = await Promise.all([
			import('./order-emails.js'),
			import('./notifications.js')
		]);
		await Promise.allSettled([
			emailMod.sendOrderEmail('submitted', order, origin),
			notifMod.notifyBrandAdmins(order.brand_id, order.created_by, {
				type: 'order_submitted',
				title: 'New order submitted',
				body: `Order ${order.order_number} has been submitted`,
				link: `/orders/${order.id}`
			})
		]);
	} catch (err) {
		console.error('[ai-tools] notifyOrderSubmitted failed', err);
	}
}

// Helper: exact-ilike match first, fuzzy %…% fallback. Caller passes a factory
// so each attempt gets a fresh query builder (Supabase builders are stateful
// and ilike-then-ilike would stack both filters).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findByName<T>(factory: () => any, column: string, value: string): Promise<T | null> {
	const exact = await factory().ilike(column, value).limit(1);
	if (exact.data?.length) return exact.data[0] as T;
	const fuzzy = await factory().ilike(column, `%${value}%`).limit(1);
	return (fuzzy.data?.[0] as T) ?? null;
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

	// line_total is GENERATED ALWAYS AS (qty * unit_price) STORED — do NOT
	// include it in the insert or Postgres will reject the row. The
	// recalc_order_total trigger on order_lines updates orders.total_amount
	// automatically, so we don't touch the order row here either.
	const rows = lines.map((line, idx) => ({
		order_id: orderId,
		style_number: line.style_number ?? null,
		description: line.description ?? null,
		color: line.color ?? null,
		size: line.size ?? null,
		qty: line.qty,
		unit_price: line.unit_price,
		sort_order: idx
	}));

	const { data, error } = await ctx.supabase
		.from('order_lines')
		.insert(rows)
		.select('id, qty, unit_price, line_total');

	if (error) return { success: false, error: error.message };

	const rowsOut = (data ?? []) as Array<{ line_total: number }>;
	const totalAdded = rowsOut.reduce((sum, r) => sum + Number(r.line_total ?? 0), 0);

	return {
		success: true,
		data: { lines_added: rowsOut.length || rows.length, total_added: totalAdded }
	};
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
		.select('id, order_number, status, total_amount, brand_id, account_id, created_by')
		.single();

	if (error) return { success: false, error: error.message };

	// If we just transitioned to 'submitted', fire the same notifications the
	// manual /orders/new flow fires. Best-effort. Mirrors that handler.
	if (status === 'submitted' && data) {
		const row = data as {
			id: string;
			order_number: string;
			total_amount: number | null;
			brand_id: string;
			account_id: string | null;
			created_by: string;
		};
		await notifyOrderSubmitted(
			{
				id: row.id,
				order_number: row.order_number,
				total_amount: Number(row.total_amount ?? 0),
				brand_id: row.brand_id,
				account_id: row.account_id,
				created_by: row.created_by
			},
			ctx.origin
		);
	}

	return {
		success: true,
		data: { id: data?.id, order_number: data?.order_number, status: data?.status }
	};
}

async function createSeason(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
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

async function createShow(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
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

async function queryData(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	const entity = input.entity as string;
	const filters = (input.filters as Record<string, unknown>) ?? {};

	const tableMap: Record<string, string> = {
		brands: 'brands',
		accounts: 'accounts',
		orders: 'orders',
		shows: 'shows',
		seasons: 'seasons',
		territories: 'territories',
		appointments: 'appointments',
		order_lines: 'order_lines',
		products: 'products',
		contacts: 'discovered_contacts',
		show_dates: 'show_dates'
	};

	const table = tableMap[entity];
	if (!table) return { success: false, error: `Unknown entity: ${entity}` };

	let selectStr = '*';
	if (entity === 'orders') {
		selectStr = '*, brands(name), accounts(business_name), seasons(name)';
	} else if (entity === 'shows') {
		selectStr = '*, seasons(name)';
	} else if (entity === 'territories') {
		selectStr =
			'*, organization_members(profiles!organization_members_profile_id_fkey(display_name))';
	} else if (entity === 'appointments') {
		selectStr = '*, accounts(business_name), show_dates(shows(name))';
	} else if (entity === 'show_dates') {
		selectStr = '*, shows(name)';
	} else if (entity === 'products') {
		selectStr = '*, brands(name), product_variants(color, size, sku)';
	}

	let query = ctx.supabase.from(table).select(selectStr);

	// Federation-aware tables: rely on RLS so federated rows (connected brand's brands/products,
	// brand's view of rep orders/accounts) come through. Own-org-only tables keep the explicit
	// organization_id filter.
	const FEDERATION_AWARE = new Set(['brands', 'accounts', 'products', 'orders']);

	if (entity === 'order_lines') {
		if (!filters.order_id)
			return { success: false, error: 'order_id filter required for order_lines' };
	} else if (entity === 'contacts') {
		query = query.eq('organization_id', ctx.organizationId).in('status', ['new', 'saved']);
	} else if (!FEDERATION_AWARE.has(entity)) {
		query = query.eq('organization_id', ctx.organizationId);
	}

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
	const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
	const stripped = rows.map((row) => formatToolResult(row, { omit: QUERY_OMIT_FIELDS }));
	return { success: true, data: stripped };
}

async function listBrands(ctx: ToolContext): Promise<ToolResult> {
	// No organization_id filter — RLS returns own-org brands plus federated brands
	// from connected brand orgs (MBISR→BOA).
	let query = ctx.supabase.from('brands').select('id, name, organization_id').eq('is_active', true);
	if (ctx.brandScope) query = query.in('id', ctx.brandScope);
	const { data, error } = await query.order('name');
	if (error) return { success: false, error: error.message };
	const rows = (data ?? []) as Array<{ id: string; name: string; organization_id: string }>;
	const shaped = rows.map((b) => ({
		id: b.id,
		name: b.name,
		connected: b.organization_id !== ctx.organizationId
	}));
	return { success: true, data: shaped };
}

async function listAccounts(ctx: ToolContext): Promise<ToolResult> {
	// No organization_id filter — RLS returns own-org accounts plus any federated
	// accounts visible via get_connected_org_ids() or federated_account_links.
	const { data, error } = await ctx.supabase
		.from('accounts')
		.select('id, business_name, city, state, organization_id')
		.eq('is_active', true)
		.order('business_name');
	if (error) return { success: false, error: error.message };
	const rows = (data ?? []) as Array<{
		id: string;
		business_name: string;
		city: string | null;
		state: string | null;
		organization_id: string;
	}>;
	const shaped = rows.map((a) => ({
		id: a.id,
		business_name: a.business_name,
		city: a.city,
		state: a.state,
		connected: a.organization_id !== ctx.organizationId
	}));
	return { success: true, data: shaped };
}

async function getDashboardMetrics(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	try {
		// Total orders with optional filters
		let ordersQuery = ctx.supabase
			.from('orders')
			.select('id, status, total_amount, created_at, brand_id, season_id, order_year', {
				count: 'exact'
			})
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

async function resolveEmail(nameOrEmail: string, ctx: ToolContext): Promise<string | null> {
	if (nameOrEmail.includes('@')) return nameOrEmail;

	// Accounts + brands are federation-aware; RLS gates own-org + connected orgs.
	const { data: account } = await ctx.supabase
		.from('accounts')
		.select('contact_email')
		.ilike('business_name', `%${nameOrEmail}%`)
		.not('contact_email', 'is', null)
		.limit(1)
		.single();
	if (account?.contact_email) return account.contact_email;

	const { data: brand } = await ctx.supabase
		.from('brands')
		.select('contact_email')
		.ilike('name', `%${nameOrEmail}%`)
		.not('contact_email', 'is', null)
		.limit(1)
		.single();
	if (brand?.contact_email) return brand.contact_email;

	return null;
}

async function draftEmail(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	const to = input.to as string;
	const subject = input.subject as string;
	const body = input.body as string;

	const email = await resolveEmail(to, ctx);
	if (!email) {
		return {
			success: false,
			error: `Could not find email address for "${to}". Please provide a valid email address.`
		};
	}

	return {
		success: true,
		data: {
			draft: true,
			to: email,
			subject,
			body,
			message: `Here's the draft email to ${email}:\n\nSubject: ${subject}\n\n${body}\n\nSay "send it" to send, or let me know if you'd like changes.`
		}
	};
}

async function sendEmail(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	const to = input.to as string;
	const subject = input.subject as string;
	const body = input.body as string;
	const relatedType = input.related_type as string | undefined;
	const relatedId = input.related_id as string | undefined;

	const email = await resolveEmail(to, ctx);
	if (!email) {
		return { success: false, error: `Could not find email address for "${to}".` };
	}

	try {
		const gmail = await getGmailClient(ctx.userId);
		if (!gmail) {
			return {
				success: false,
				error: 'Gmail is not connected. Please connect Gmail in Settings first.'
			};
		}

		// Get sender email
		const { data: connection } = await supabaseAdmin
			.from('email_connections')
			.select('email_address')
			.eq('profile_id', ctx.userId)
			.single();

		if (!connection) {
			return { success: false, error: 'Gmail connection not found.' };
		}

		const raw = buildRawEmail(connection.email_address, email, subject, body);
		const result = await gmail.users.messages.send({
			userId: 'me',
			requestBody: { raw }
		});

		// Log the email
		await supabaseAdmin.from('email_log').insert({
			organization_id: ctx.organizationId,
			sent_by: ctx.userId,
			to_email: email,
			subject,
			body,
			gmail_message_id: result.data.id,
			gmail_thread_id: result.data.threadId,
			related_type: relatedType ?? null,
			related_id: relatedId ?? null
		});

		return { success: true, data: { sent: true, to: email, messageId: result.data.id } };
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : 'Failed to send email' };
	}
}

async function searchEmails(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	try {
		const gmail = await getGmailClient(ctx.userId);
		if (!gmail) {
			return {
				success: false,
				error: 'Gmail is not connected. Please connect Gmail in Settings first.'
			};
		}

		const parts: string[] = [];
		if (input.query) parts.push(String(input.query));
		if (input.from) parts.push(`from:${input.from}`);
		if (input.to) parts.push(`to:${input.to}`);
		const q = parts.join(' ') || 'in:inbox';

		const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: 10 });
		const messageIds = listRes.data.messages ?? [];

		const messages = [];
		for (const m of messageIds.slice(0, 5)) {
			const msgRes = await gmail.users.messages.get({
				userId: 'me',
				id: m.id!,
				format: 'metadata',
				metadataHeaders: ['From', 'To', 'Subject', 'Date']
			});
			messages.push(parseMessage(msgRes.data));
		}

		return {
			success: true,
			data: {
				count: messageIds.length,
				messages: messages.map((m) => ({
					from: m.from,
					to: m.to,
					subject: m.subject,
					date: m.date,
					snippet: m.snippet
				}))
			}
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to search emails'
		};
	}
}

// --- Helper: resolve member by name ---
async function resolveMember(name: string, ctx: ToolContext): Promise<string | null> {
	const { data } = await ctx.supabase
		.from('organization_members')
		.select('id, profiles!organization_members_profile_id_fkey(display_name)')
		.eq('organization_id', ctx.organizationId);
	if (!data) return null;
	type MemberRow = {
		id: string;
		profiles?: { display_name?: string } | { display_name?: string }[] | null;
	};
	const rows = data as MemberRow[];
	const match = rows.find((m) => {
		const profiles = m.profiles;
		const name0 = Array.isArray(profiles) ? profiles[0]?.display_name : profiles?.display_name;
		return name0?.toLowerCase().includes(name.toLowerCase());
	});
	return match?.id ?? null;
}

// --- Territory tools ---
async function createTerritory(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	let assignedTo: string | null = null;
	if (input.assigned_to_name) {
		assignedTo = await resolveMember(input.assigned_to_name as string, ctx);
		if (!assignedTo)
			return {
				success: false,
				error: `Team member not found matching "${input.assigned_to_name}"`
			};
	}

	const { data, error } = await ctx.supabase
		.from('territories')
		.insert({
			organization_id: ctx.organizationId,
			name: input.name as string,
			notes: (input.notes as string) ?? null
		})
		.select()
		.single();

	if (error) return { success: false, error: error.message };

	if (assignedTo && data?.id) {
		const { error: assignErr } = await ctx.supabase
			.from('member_territories')
			.insert({ organization_member_id: assignedTo, territory_id: data.id });
		if (assignErr) return { success: false, error: assignErr.message };
	}

	return { success: true, data };
}

async function updateTerritory(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (input.name) updates.name = input.name;
	if (input.notes !== undefined) updates.notes = input.notes || null;

	// assigned_to_name keeps the AI tool's single-assignee contract. Under the
	// new multi-assign model, setting it replaces the territory's assignee set.
	let reassignTo: string | null | undefined;
	if (input.assigned_to_name !== undefined) {
		if (input.assigned_to_name) {
			const memberId = await resolveMember(input.assigned_to_name as string, ctx);
			if (!memberId)
				return {
					success: false,
					error: `Team member not found matching "${input.assigned_to_name}"`
				};
			reassignTo = memberId;
		} else {
			reassignTo = null;
		}
	}

	const { data, error } = await ctx.supabase
		.from('territories')
		.update(updates)
		.eq('id', input.territory_id as string)
		.eq('organization_id', ctx.organizationId)
		.select()
		.single();

	if (error) return { success: false, error: error.message };

	if (reassignTo !== undefined && data?.id) {
		await ctx.supabase.from('member_territories').delete().eq('territory_id', data.id);
		if (reassignTo) {
			const { error: assignErr } = await ctx.supabase
				.from('member_territories')
				.insert({ organization_member_id: reassignTo, territory_id: data.id });
			if (assignErr) return { success: false, error: assignErr.message };
		}
	}

	return { success: true, data };
}

async function assignAccountTerritory(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	// Fuzzy match account
	const { data: accounts } = await ctx.supabase
		.from('accounts')
		.select('id, business_name')
		.eq('organization_id', ctx.organizationId)
		.ilike('business_name', `%${input.account_name as string}%`)
		.limit(1);

	if (!accounts?.length)
		return { success: false, error: `Account not found matching "${input.account_name}"` };

	let territoryId: string | null = null;
	if (input.territory_name) {
		const { data: territories } = await ctx.supabase
			.from('territories')
			.select('id, name')
			.eq('organization_id', ctx.organizationId)
			.ilike('name', `%${input.territory_name as string}%`)
			.limit(1);
		if (!territories?.length)
			return { success: false, error: `Territory not found matching "${input.territory_name}"` };
		territoryId = territories[0].id;
	}

	const { error } = await ctx.supabase
		.from('accounts')
		.update({ territory_id: territoryId, updated_at: new Date().toISOString() })
		.eq('id', accounts[0].id);

	if (error) return { success: false, error: error.message };
	return {
		success: true,
		data: { account: accounts[0].business_name, territory: input.territory_name ?? 'removed' }
	};
}

// --- Appointment tools ---
async function createAppointment(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	// Accounts are federation-aware: RLS returns own + federated so reps can
	// schedule appointments against a connected brand's accounts.
	const { data: accounts } = await ctx.supabase
		.from('accounts')
		.select('id, business_name')
		.ilike('business_name', `%${input.account_name as string}%`)
		.limit(1);

	if (!accounts?.length)
		return { success: false, error: `Account not found matching "${input.account_name}"` };

	let showDateId: string | null = null;
	if (input.show_name && input.location_type === 'show') {
		const { data: showDates } = await ctx.supabase
			.from('show_dates')
			.select('id, shows(name)')
			.eq('organization_id', ctx.organizationId)
			.order('year', { ascending: false })
			.limit(20);
		type ShowDateRow = {
			id: string;
			shows?: { name?: string } | { name?: string }[] | null;
		};
		const match = (showDates as ShowDateRow[] | null)?.find((sd) => {
			const name = Array.isArray(sd.shows) ? sd.shows[0]?.name : sd.shows?.name;
			return name?.toLowerCase().includes((input.show_name as string).toLowerCase());
		});
		showDateId = match?.id ?? null;
	}

	const { data, error } = await ctx.supabase
		.from('appointments')
		.insert({
			organization_id: ctx.organizationId,
			account_id: accounts[0].id,
			show_date_id: showDateId,
			appointment_type: 'scheduled',
			location_type: input.location_type as string,
			location_detail: (input.location_detail as string) ?? null,
			scheduled_date: (input.scheduled_date as string) ?? null,
			scheduled_time: (input.scheduled_time as string) ?? null,
			duration_minutes: (input.duration_minutes as number) ?? 30,
			notes: (input.notes as string) ?? null,
			status: 'scheduled',
			created_by: ctx.userId
		})
		.select('*, accounts(business_name)')
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function updateAppointment(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (input.status) updates.status = input.status;
	if (input.scheduled_date) updates.scheduled_date = input.scheduled_date;
	if (input.scheduled_time) updates.scheduled_time = input.scheduled_time;
	if (input.duration_minutes) updates.duration_minutes = input.duration_minutes;
	if (input.notes !== undefined) updates.notes = input.notes || null;

	const { data, error } = await ctx.supabase
		.from('appointments')
		.update(updates)
		.eq('id', input.appointment_id as string)
		.eq('organization_id', ctx.organizationId)
		.select('*, accounts(business_name)')
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function deleteAppointment(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const { error } = await ctx.supabase
		.from('appointments')
		.delete()
		.eq('id', input.appointment_id as string)
		.eq('organization_id', ctx.organizationId);

	if (error) return { success: false, error: error.message };
	return { success: true, data: { deleted: true } };
}

// --- Order editing tools ---
async function updateOrderLine(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const lineId = input.line_id as string;
	const newQty = input.qty as number;
	if (newQty < 1) return { success: false, error: 'Quantity must be at least 1' };

	// Get current line and verify org ownership
	const { data: line } = await ctx.supabase
		.from('order_lines')
		.select('*, orders!inner(organization_id)')
		.eq('id', lineId)
		.single();

	if (!line) return { success: false, error: 'Order line not found' };
	const lineOrders = (
		line as { orders?: { organization_id?: string } | { organization_id?: string }[] | null }
	).orders;
	const lineOrgId = Array.isArray(lineOrders)
		? lineOrders[0]?.organization_id
		: lineOrders?.organization_id;
	if (lineOrgId !== ctx.organizationId) {
		return { success: false, error: 'Access denied' };
	}

	const updateData: Record<string, unknown> = { qty: newQty };
	if (!line.original_qty) updateData.original_qty = line.qty;

	const { data, error } = await ctx.supabase
		.from('order_lines')
		.update(updateData)
		.eq('id', lineId)
		.select()
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function removeOrderLine(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const lineId = input.line_id as string;
	const reason = input.reason as string;

	// Verify org ownership
	const { data: line } = await ctx.supabase
		.from('order_lines')
		.select('*, orders!inner(organization_id)')
		.eq('id', lineId)
		.single();

	if (!line) return { success: false, error: 'Order line not found' };
	const lineOrders = (
		line as { orders?: { organization_id?: string } | { organization_id?: string }[] | null }
	).orders;
	const lineOrgId = Array.isArray(lineOrders)
		? lineOrders[0]?.organization_id
		: lineOrders?.organization_id;
	if (lineOrgId !== ctx.organizationId) {
		return { success: false, error: 'Access denied' };
	}

	const { data, error } = await ctx.supabase
		.from('order_lines')
		.update({ removed_at: new Date().toISOString(), removed_reason: reason })
		.eq('id', lineId)
		.select()
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function updateOrder(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (input.notes !== undefined) updates.notes = input.notes || null;
	if (input.expected_ship_date) updates.expected_ship_date = input.expected_ship_date;
	if (input.cancelled_reason) updates.cancelled_reason = input.cancelled_reason;

	const { data, error } = await ctx.supabase
		.from('orders')
		.update(updates)
		.eq('id', input.order_id as string)
		.eq('organization_id', ctx.organizationId)
		.select('id, order_number, notes, expected_ship_date')
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

// --- Archive tool ---
async function archiveEntity(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const entityType = input.entity_type as string;
	const entityId = input.entity_id as string;
	const action = input.action as string;
	const isArchive = action === 'archive';

	const table = entityType === 'brand' ? 'brands' : 'accounts';

	const { data, error } = await ctx.supabase
		.from(table)
		.update({
			archived_at: isArchive ? new Date().toISOString() : null,
			is_active: !isArchive,
			updated_at: new Date().toISOString()
		})
		.eq('id', entityId)
		.eq('organization_id', ctx.organizationId)
		.select('id, ' + (entityType === 'brand' ? 'name' : 'business_name'))
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data: { entity: data, action } };
}

// --- Analytics tools ---
async function getSalesReport(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const groupBy = input.group_by as string;

	let query = ctx.supabase
		.from('orders')
		.select(
			'id, total_amount, brand_id, account_id, order_year, created_by, brands(name), accounts(business_name, territory_id, territories(name))'
		)
		.eq('organization_id', ctx.organizationId)
		.neq('status', 'cancelled');

	if (ctx.brandScope) query = query.in('brand_id', ctx.brandScope);
	if (input.order_year) query = query.eq('order_year', input.order_year as number);
	if (input.season_name) {
		const { data: seasons } = await ctx.supabase
			.from('seasons')
			.select('id')
			.eq('organization_id', ctx.organizationId)
			.ilike('name', `%${input.season_name as string}%`)
			.limit(1);
		if (seasons?.[0]) query = query.eq('season_id', seasons[0].id);
	}

	const { data: orders, error } = await query;
	if (error) return { success: false, error: error.message };

	const groups = new Map<string, { name: string; orderCount: number; totalRevenue: number }>();

	for (const order of orders ?? []) {
		let key = '';
		let name = '';

		type OrderJoin = {
			brands?: { name?: string } | { name?: string }[] | null;
			accounts?:
				| { business_name?: string; territories?: { name?: string } | null }
				| { business_name?: string; territories?: { name?: string } | null }[]
				| null;
		};
		const oj = order as OrderJoin;
		const brands = oj.brands;
		const accounts = oj.accounts;
		if (groupBy === 'brand') {
			key = order.brand_id;
			name = (Array.isArray(brands) ? brands[0]?.name : brands?.name) ?? 'Unknown';
		} else if (groupBy === 'account') {
			key = order.account_id;
			name =
				(Array.isArray(accounts) ? accounts[0]?.business_name : accounts?.business_name) ??
				'Unknown';
		} else if (groupBy === 'territory') {
			const account = Array.isArray(accounts) ? accounts[0] : accounts;
			const territory = account?.territories;
			key = territory?.name ?? 'Unassigned';
			name = key;
		} else if (groupBy === 'rep') {
			key = order.created_by;
			name = key; // Will resolve below
		}

		const existing = groups.get(key);
		if (existing) {
			existing.orderCount++;
			existing.totalRevenue += Number(order.total_amount);
		} else {
			groups.set(key, { name, orderCount: 1, totalRevenue: Number(order.total_amount) });
		}
	}

	// Resolve rep names if grouping by rep
	if (groupBy === 'rep') {
		const { data: members } = await ctx.supabase
			.from('organization_members')
			.select('profile_id, profiles!organization_members_profile_id_fkey(display_name)')
			.eq('organization_id', ctx.organizationId);
		const nameMap = new Map<string, string>();
		type MemberProfileRow = {
			profile_id: string;
			profiles?: { display_name?: string } | { display_name?: string }[] | null;
		};
		for (const m of (members ?? []) as MemberProfileRow[]) {
			const p = m.profiles;
			const displayName = Array.isArray(p) ? p[0]?.display_name : p?.display_name;
			nameMap.set(m.profile_id, displayName ?? 'Unknown');
		}
		for (const [key, group] of groups) {
			group.name = nameMap.get(key) ?? 'Unknown';
		}
	}

	const report = Array.from(groups.values())
		.sort((a, b) => b.totalRevenue - a.totalRevenue)
		.map((g) => ({
			...g,
			avgOrderValue: g.orderCount > 0 ? Math.round(g.totalRevenue / g.orderCount) : 0
		}));

	return { success: true, data: { group_by: groupBy, report } };
}

async function getSalesAnalytics(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	try {
		let seasonId: string | null = null;
		let brandId: string | null = null;
		let accountId: string | null = null;
		let repUserId: string | null = null;

		if (input.season_name) {
			const { data: seasons } = await ctx.supabase
				.from('seasons')
				.select('id')
				.eq('organization_id', ctx.organizationId)
				.ilike('name', `%${input.season_name as string}%`)
				.limit(1);
			if (seasons?.[0]) seasonId = seasons[0].id;
			else return { success: false, error: `Season "${input.season_name}" not found.` };
		}

		if (input.brand_name) {
			let brandQuery = ctx.supabase
				.from('brands')
				.select('id')
				.ilike('name', `%${input.brand_name as string}%`)
				.limit(1);
			if (ctx.brandScope) brandQuery = brandQuery.in('id', ctx.brandScope);
			const { data: brands } = await brandQuery;
			if (brands?.[0]) brandId = brands[0].id;
			else return { success: false, error: `Brand "${input.brand_name}" not found.` };
		}

		if (input.account_name) {
			const { data: accounts } = await ctx.supabase
				.from('accounts')
				.select('id')
				.eq('organization_id', ctx.organizationId)
				.ilike('business_name', `%${input.account_name as string}%`)
				.limit(1);
			if (accounts?.[0]) accountId = accounts[0].id;
			else return { success: false, error: `Account "${input.account_name}" not found.` };
		}

		if (input.rep_name) {
			const { data: members } = await ctx.supabase
				.from('organization_members')
				.select('profile_id, profiles!organization_members_profile_id_fkey(display_name)')
				.eq('organization_id', ctx.organizationId);
			type MemberRow = {
				profile_id: string;
				profiles?: { display_name?: string } | { display_name?: string }[] | null;
			};
			const match = (members as MemberRow[] | null)?.find((m) => {
				const p = m.profiles;
				const name = Array.isArray(p) ? p[0]?.display_name : p?.display_name;
				return name?.toLowerCase().includes((input.rep_name as string).toLowerCase());
			});
			if (match) repUserId = match.profile_id;
			else return { success: false, error: `Rep "${input.rep_name}" not found.` };
		}

		const { data, error } = await ctx.supabase.rpc('get_sales_analytics', {
			p_org_id: ctx.organizationId,
			p_org_type: ctx.orgType,
			p_date_from: (input.date_from as string) ?? null,
			p_date_to: (input.date_to as string) ?? null,
			p_season_id: seasonId,
			p_brand_id: brandId,
			p_account_id: accountId,
			p_rep_user_id: repUserId,
			p_group_by: (input.group_by as string) ?? 'total'
		});

		if (error) return { success: false, error: error.message };

		return {
			success: true,
			data: {
				filters: {
					date_from: input.date_from ?? null,
					date_to: input.date_to ?? null,
					season: input.season_name ?? null,
					brand: input.brand_name ?? null,
					account: input.account_name ?? null,
					rep: input.rep_name ?? null
				},
				group_by: input.group_by ?? 'total',
				results: data
			}
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to get sales analytics'
		};
	}
}

async function getStyleVelocity(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const days = (input.days as number) ?? 14;
	const minAccounts = (input.min_accounts as number) ?? 2;

	const { data, error } = await ctx.supabase.rpc('get_style_velocity', {
		org_id: ctx.organizationId,
		days_back: days,
		min_accounts: minAccounts
	});

	if (error) return { success: false, error: error.message };

	type VelocityRow = { brand_name?: string; [k: string]: unknown };
	let results = (data ?? []) as VelocityRow[];

	if (input.brand_name) {
		const brandFilter = (input.brand_name as string).toLowerCase();
		results = results.filter((r) => r.brand_name?.toLowerCase().includes(brandFilter));
	}

	const limit = (input.limit as number) ?? 20;
	results = results.slice(0, limit);

	return {
		success: true,
		data: { days_window: days, min_accounts: minAccounts, trending_styles: results }
	};
}

async function getCommissionReport(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	let query = ctx.supabase
		.from('orders')
		.select(
			'id, total_amount, shipped_amount, brand_id, created_by, brands(name, commission_rate), accounts(business_name)'
		)
		.eq('organization_id', ctx.organizationId)
		.neq('status', 'cancelled');

	if (ctx.brandScope) query = query.in('brand_id', ctx.brandScope);
	if (input.order_year) query = query.eq('order_year', input.order_year as number);

	if (input.brand_name) {
		// Brands are federation-aware — a rep may filter by a connected brand.
		const { data: brands } = await ctx.supabase
			.from('brands')
			.select('id')
			.ilike('name', `%${input.brand_name as string}%`)
			.limit(1);
		if (brands?.[0]) query = query.eq('brand_id', brands[0].id);
	}

	const { data: orders, error } = await query;
	if (error) return { success: false, error: error.message };

	// Load member brand commissions
	const { data: memberCommissions } = await ctx.supabase
		.from('member_brand_commissions')
		.select(
			'member_id, brand_id, rate, organization_members(profiles!organization_members_profile_id_fkey(display_name))'
		)
		.eq('organization_id', ctx.organizationId);

	// Load members for name resolution
	const { data: members } = await ctx.supabase
		.from('organization_members')
		.select('id, profile_id, profiles!organization_members_profile_id_fkey(display_name)')
		.eq('organization_id', ctx.organizationId);

	const profileToMember = new Map<string, string>();
	const memberToName = new Map<string, string>();
	type MemberJoin = {
		id: string;
		profile_id: string;
		profiles?: { display_name?: string } | { display_name?: string }[] | null;
	};
	for (const m of (members ?? []) as MemberJoin[]) {
		profileToMember.set(m.profile_id, m.id);
		const p = m.profiles;
		const displayName = Array.isArray(p) ? p[0]?.display_name : p?.display_name;
		memberToName.set(m.id, displayName ?? 'Unknown');
	}

	const commissionMap = new Map<string, number>(); // member_id-brand_id -> rate
	for (const mc of memberCommissions ?? []) {
		commissionMap.set(`${mc.member_id}-${mc.brand_id}`, mc.rate);
	}

	// Brand commission summary
	const brandSummary = new Map<
		string,
		{ name: string; rate: number; totalSales: number; commission: number }
	>();
	// Rep commission summary
	const repSummary = new Map<
		string,
		{ name: string; brand: string; rate: number; totalSales: number; commission: number }
	>();

	type OrderBrandJoin = {
		brands?:
			| { name?: string; commission_rate?: number }
			| { name?: string; commission_rate?: number }[]
			| null;
	};
	for (const order of orders ?? []) {
		const b = (order as OrderBrandJoin).brands;
		const brandObj = Array.isArray(b) ? b[0] : b;
		const brandName = brandObj?.name ?? 'Unknown';
		const brandRate = brandObj?.commission_rate ?? 0;
		const amount = Number(order.shipped_amount ?? order.total_amount);

		// Brand commission
		const bKey = order.brand_id;
		const existing = brandSummary.get(bKey);
		if (existing) {
			existing.totalSales += amount;
			existing.commission += (amount * brandRate) / 100;
		} else {
			brandSummary.set(bKey, {
				name: brandName,
				rate: brandRate,
				totalSales: amount,
				commission: (amount * brandRate) / 100
			});
		}

		// Rep commission
		const memberId = profileToMember.get(order.created_by);
		if (memberId) {
			const repRate = commissionMap.get(`${memberId}-${order.brand_id}`) ?? 0;
			if (repRate > 0) {
				const rKey = `${memberId}-${order.brand_id}`;
				const repName = memberToName.get(memberId) ?? 'Unknown';
				const existingRep = repSummary.get(rKey);
				if (existingRep) {
					existingRep.totalSales += amount;
					existingRep.commission += (amount * repRate) / 100;
				} else {
					repSummary.set(rKey, {
						name: repName,
						brand: brandName,
						rate: repRate,
						totalSales: amount,
						commission: (amount * repRate) / 100
					});
				}
			}
		}
	}

	return {
		success: true,
		data: {
			brand_commissions: Array.from(brandSummary.values()).sort(
				(a, b) => b.totalSales - a.totalSales
			),
			rep_commissions: Array.from(repSummary.values()).sort((a, b) => b.commission - a.commission)
		}
	};
}

// --- Account Health tool ---
async function getAccountHealth(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const healthMap = await computeAccountHealth(ctx.supabase, ctx.organizationId);

	const filter = input.filter as string | undefined; // 'at_risk', 'new', 'excellent', etc.
	const limit = (input.limit as number) ?? 20;

	let accounts = Array.from(healthMap.values());

	if (filter) {
		accounts = accounts.filter((a) => a.label === filter);
	}

	// Sort: at_risk first, then by score ascending (worst first)
	accounts.sort((a, b) => a.score - b.score);

	// Join with account names — RLS returns own-org + federated so health rows
	// for federated accounts render with a real business_name instead of 'Unknown'.
	const { data: acctNames } = await ctx.supabase.from('accounts').select('id, business_name');

	const nameMap = new Map((acctNames ?? []).map((a) => [a.id, a.business_name]));

	const result = accounts.slice(0, limit).map((a) => ({
		account: nameMap.get(a.accountId) ?? 'Unknown',
		score: a.score,
		label: a.label,
		signals: a.signals,
		ytdOrders: a.ytdOrders,
		ytdRevenue: a.ytdRevenue,
		daysSinceLastOrder: a.daysSinceLastOrder,
		yoyGrowth: a.yoyGrowth !== null ? Math.round(a.yoyGrowth) : null
	}));

	const summary = {
		total: healthMap.size,
		excellent: accounts.filter((a) => a.label === 'excellent').length,
		good: accounts.filter((a) => a.label === 'good').length,
		fair: accounts.filter((a) => a.label === 'fair').length,
		at_risk: accounts.filter((a) => a.label === 'at_risk').length,
		inactive: accounts.filter((a) => a.label === 'inactive').length,
		new_accounts: accounts.filter((a) => a.label === 'new').length
	};

	return { success: true, data: { summary, accounts: result } };
}

// --- Product tool ---
async function addProduct(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	// Fuzzy match brand
	const { data: brands } = await ctx.supabase
		.from('brands')
		.select('id, name')
		.eq('organization_id', ctx.organizationId)
		.ilike('name', `%${input.brand_name as string}%`)
		.limit(1);

	if (!brands?.length)
		return { success: false, error: `Brand not found matching "${input.brand_name}"` };

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
		.from('products')
		.insert({
			organization_id: ctx.organizationId,
			brand_id: brands[0].id,
			style_number: input.style_number as string,
			name: input.name as string,
			wholesale_price: (input.wholesale_price as number) ?? 0,
			retail_price: (input.retail_price as number) ?? null,
			category: (input.category as string) ?? null,
			description: (input.description as string) ?? null,
			season_id: seasonId
		})
		.select('*, brands(name)')
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

export const PRODUCT_UPDATE_FIELDS = [
	'ats',
	'category',
	'wholesale_price',
	'retail_price',
	'product_year',
	'is_active'
] as const;

/** Pure: trims `updates` down to the allowed-field whitelist for `update_products`. */
export function buildProductPatch(updates: Record<string, unknown>): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	for (const key of PRODUCT_UPDATE_FIELDS) {
		if (key in updates) patch[key] = updates[key];
	}
	return patch;
}

async function updateProducts(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const productIds = input.product_ids;
	if (!Array.isArray(productIds) || productIds.length === 0) {
		return { success: false, error: 'product_ids must be a non-empty array' };
	}

	const updates = (input.updates ?? {}) as Record<string, unknown>;
	const patch = buildProductPatch(updates);

	if ('season_name' in updates && typeof updates.season_name === 'string') {
		const { data: seasons } = await ctx.supabase
			.from('seasons')
			.select('id')
			.eq('organization_id', ctx.organizationId)
			.ilike('name', `%${updates.season_name}%`)
			.limit(1);
		if (seasons?.[0]) patch.season_id = seasons[0].id;
	}

	if (Object.keys(patch).length === 0) {
		return { success: false, error: 'No allowed fields in updates' };
	}

	patch.updated_at = new Date().toISOString();

	const { data, error } = await ctx.supabase
		.from('products')
		.update(patch)
		.in('id', productIds as string[])
		.eq('organization_id', ctx.organizationId)
		.select('id, name, style_number, ats');

	if (error) return { success: false, error: error.message };
	return { success: true, data: { updated: data?.length ?? 0, products: data ?? [] } };
}

// --- Integration tools ---
async function sendSlack(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	const sent = await sendSlackMessage(ctx.organizationId, {
		title: input.title as string,
		text: input.text as string,
		url: input.url as string | undefined,
		color: input.color as string | undefined
	});
	if (!sent)
		return {
			success: false,
			error: 'Slack is not connected. Ask the user to connect Slack in Organization > Integrations.'
		};
	return { success: true, data: { sent: true } };
}

async function sendDiscord(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	const sent = await sendDiscordMessage(ctx.organizationId, {
		title: input.title as string,
		text: input.text as string,
		url: input.url as string | undefined,
		color: input.color as string | undefined
	});
	if (!sent)
		return {
			success: false,
			error:
				'Discord is not connected. Ask the user to connect Discord in Organization > Integrations.'
		};
	return { success: true, data: { sent: true } };
}

async function exportGoogleSheet(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const dataType = input.data_type as ExportDataType;
	const schema = EXPORT_SCHEMAS[dataType];
	if (!schema)
		return {
			success: false,
			error: `Invalid data type: ${dataType}. Use orders, accounts, or brands.`
		};

	let query = ctx.supabase
		.from(schema.query)
		.select(schema.select)
		.eq('organization_id', ctx.organizationId);

	if (ctx.brandScope) {
		if (dataType === 'orders') query = query.in('brand_id', ctx.brandScope);
		else if (dataType === 'brands') query = query.in('id', ctx.brandScope);
	}

	const { data: rows, error } = await query;
	if (error) return { success: false, error: error.message };
	if (!rows?.length) return { success: false, error: `No ${dataType} data found to export.` };

	const title = (input.title as string) || `${dataType} ${new Date().toLocaleDateString()}`;
	const result = await exportToSheet(ctx.organizationId, ctx.origin, {
		spreadsheetId: input.spreadsheet_id as string | undefined,
		title,
		headers: schema.headers,
		rows: (rows as unknown as ExportRow[]).map(schema.mapRow)
	});

	if (!result)
		return {
			success: false,
			error:
				'Google Sheets is not connected. Ask the user to connect Google Sheets in Organization > Integrations.'
		};
	return {
		success: true,
		data: {
			spreadsheetUrl: result.spreadsheetUrl,
			spreadsheetId: result.spreadsheetId,
			rowCount: result.rowCount
		}
	};
}

async function listNotionDbs(ctx: ToolContext): Promise<ToolResult> {
	const databases = await listDatabases(ctx.organizationId);
	if (!databases.length)
		return {
			success: false,
			error:
				'No Notion databases found. Either Notion is not connected or no databases have been shared with the integration.'
		};
	return { success: true, data: { databases } };
}

async function syncNotion(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	const dataType = input.data_type as SyncDataType;
	const databaseId = input.database_id as string;
	const schema = EXPORT_SCHEMAS[dataType];
	if (!schema)
		return {
			success: false,
			error: `Invalid data type: ${dataType}. Use orders, accounts, or brands.`
		};

	let query = ctx.supabase
		.from(schema.query)
		.select(schema.select)
		.eq('organization_id', ctx.organizationId);

	if (ctx.brandScope) {
		if (dataType === 'orders') query = query.in('brand_id', ctx.brandScope);
		else if (dataType === 'brands') query = query.in('id', ctx.brandScope);
	}

	const { data: rows, error } = await query;
	if (error) return { success: false, error: error.message };
	if (!rows?.length) return { success: false, error: `No ${dataType} data found to sync.` };

	const notionRows = (rows as unknown as Array<Record<string, unknown> & { id: string }>).map(
		(row) => ({
			externalId: row.id,
			properties: mapToNotionProperties(dataType, row)
		})
	);

	const result = await syncToNotion(ctx.organizationId, databaseId, notionRows);
	if (result.created === 0 && result.updated === 0)
		return {
			success: false,
			error: 'Notion sync failed. Notion may not be connected or the database ID may be invalid.'
		};
	return { success: true, data: result };
}

async function pullNotion(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
	const pages = await pullFromNotion(
		ctx.organizationId,
		input.database_id as string,
		input.page_size as number | undefined
	);
	if (!pages.length)
		return {
			success: false,
			error:
				'No pages found. Either Notion is not connected, the database ID is invalid, or the database is empty.'
		};
	return { success: true, data: { pages, count: pages.length } };
}
