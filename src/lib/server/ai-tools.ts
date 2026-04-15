import type { SupabaseClient } from '@supabase/supabase-js';
import { getGmailClient, parseMessage, buildRawEmail } from './gmail.js';
import { supabaseAdmin } from './supabase.js';
import { computeAccountHealth } from './account-health.js';
import { sendSlackMessage } from './integrations/slack.js';
import { sendDiscordMessage } from './integrations/discord.js';
import {
	exportToSheet,
	EXPORT_SCHEMAS,
	type ExportDataType
} from './integrations/google-sheets.js';
import {
	listDatabases,
	syncToNotion,
	pullFromNotion,
	mapToNotionProperties,
	type SyncDataType
} from './integrations/notion.js';

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
		case 'get_style_velocity':
			return getStyleVelocity(toolInput, ctx);
		case 'get_commission_report':
			return getCommissionReport(toolInput, ctx);
		case 'get_account_health':
			return getAccountHealth(toolInput, ctx);
		case 'add_product':
			return addProduct(toolInput, ctx);
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
	const { data, error } = await ctx.supabase
		.from('accounts')
		.insert({
			organization_id: ctx.organizationId,
			business_name: input.business_name as string,
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

async function createOrder(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
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

	// Auto-set expected ship date from season delivery
	let expectedShipDate: string | null = null;
	if (seasonId && input.order_year) {
		const { data: deliveries } = await ctx.supabase
			.from('season_deliveries')
			.select('delivery_month, delivery_day')
			.eq('season_id', seasonId)
			.order('sort_order')
			.limit(1);
		if (deliveries?.[0]) {
			const month = String(deliveries[0].delivery_month).padStart(2, '0');
			const day = String(deliveries[0].delivery_day).padStart(2, '0');
			expectedShipDate = `${input.order_year}-${month}-${day}`;
		}
	}

	const { data, error } = await ctx.supabase
		.from('orders')
		.insert({
			organization_id: ctx.organizationId,
			account_id: accounts[0].id,
			brand_id: brands[0].id,
			season_id: seasonId,
			order_year: (input.order_year as number) ?? null,
			expected_ship_date: expectedShipDate,
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
	await ctx.supabase
		.rpc('increment_order_total', {
			p_order_id: orderId,
			p_amount: total
		})
		.then(({ error: rpcError }) => {
			// Fallback: if RPC doesn't exist, update directly
			if (rpcError) {
				return ctx.supabase.from('orders').update({ total_amount: total }).eq('id', orderId);
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

	// order_lines doesn't have organization_id — filter by order_id from filters
	if (entity === 'order_lines') {
		if (!filters.order_id)
			return { success: false, error: 'order_id filter required for order_lines' };
	} else if (entity === 'contacts') {
		query = query.eq('organization_id', ctx.organizationId).in('status', ['new', 'saved']);
	} else {
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

	// Try account contact
	const { data: account } = await ctx.supabase
		.from('accounts')
		.select('contact_email')
		.eq('organization_id', ctx.organizationId)
		.ilike('business_name', `%${nameOrEmail}%`)
		.not('contact_email', 'is', null)
		.limit(1)
		.single();
	if (account?.contact_email) return account.contact_email;

	// Try brand contact
	const { data: brand } = await ctx.supabase
		.from('brands')
		.select('contact_email')
		.eq('organization_id', ctx.organizationId)
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
	const match = data.find((m: any) =>
		m.profiles?.display_name?.toLowerCase().includes(name.toLowerCase())
	);
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
			assigned_to: assignedTo,
			notes: (input.notes as string) ?? null
		})
		.select()
		.single();

	if (error) return { success: false, error: error.message };
	return { success: true, data };
}

async function updateTerritory(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (input.name) updates.name = input.name;
	if (input.notes !== undefined) updates.notes = input.notes || null;
	if (input.assigned_to_name !== undefined) {
		if (input.assigned_to_name) {
			const memberId = await resolveMember(input.assigned_to_name as string, ctx);
			if (!memberId)
				return {
					success: false,
					error: `Team member not found matching "${input.assigned_to_name}"`
				};
			updates.assigned_to = memberId;
		} else {
			updates.assigned_to = null;
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
	// Fuzzy match account
	const { data: accounts } = await ctx.supabase
		.from('accounts')
		.select('id, business_name')
		.eq('organization_id', ctx.organizationId)
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
		const match = showDates?.find((sd: any) => {
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
	if ((line as any).orders?.organization_id !== ctx.organizationId) {
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
	if ((line as any).orders?.organization_id !== ctx.organizationId) {
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

		if (groupBy === 'brand') {
			key = order.brand_id;
			name = (order.brands as any)?.name ?? 'Unknown';
		} else if (groupBy === 'account') {
			key = order.account_id;
			name = (order.accounts as any)?.business_name ?? 'Unknown';
		} else if (groupBy === 'territory') {
			const territory = (order.accounts as any)?.territories;
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
		for (const m of members ?? []) {
			nameMap.set(m.profile_id, (m.profiles as any)?.display_name ?? 'Unknown');
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

	let results = (data ?? []) as any[];

	if (input.brand_name) {
		const brandFilter = (input.brand_name as string).toLowerCase();
		results = results.filter((r: any) => r.brand_name?.toLowerCase().includes(brandFilter));
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
		const { data: brands } = await ctx.supabase
			.from('brands')
			.select('id')
			.eq('organization_id', ctx.organizationId)
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
	for (const m of members ?? []) {
		profileToMember.set(m.profile_id, m.id);
		memberToName.set(m.id, (m.profiles as any)?.display_name ?? 'Unknown');
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

	for (const order of orders ?? []) {
		const brandName = (order.brands as any)?.name ?? 'Unknown';
		const brandRate = (order.brands as any)?.commission_rate ?? 0;
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

	// Join with account names
	const { data: acctNames } = await ctx.supabase
		.from('accounts')
		.select('id, business_name')
		.eq('organization_id', ctx.organizationId);

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
		rows: rows.map(schema.mapRow)
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

	const notionRows = (rows as Array<Record<string, any>>).map((row) => ({
		externalId: row.id,
		properties: mapToNotionProperties(dataType, row)
	}));

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
