import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { computeAccountHealth } from '$lib/server/account-health.js';
import { BRIEFING_PROMPT } from '$lib/server/ai-prompts.js';
import { logUsage } from '$lib/server/ai-usage.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

type CachedBriefing = { text: string; timestamp: number };
const briefingCache = new Map<string, CachedBriefing>();
const CACHE_TTL = 15 * 60 * 1000;

export const POST: RequestHandler = async ({ locals }) => {
	const { supabase, organization, membership, user, brandScope } = locals;

	if (!organization || !membership || !user) {
		return json({ briefing: null });
	}

	const orgId = organization.id;

	const cacheKey = `${orgId}:${membership.id}`;
	const cached = briefingCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return json({ briefing: cached.text, cached: true });
	}

	// Territory scope: accounts the user is responsible for.
	// If no territories are assigned, fall through to the org-wide view.
	const { data: memberTerritoryRows } = await supabase
		.from('member_territories')
		.select('territory_id, territories!inner(organization_id)')
		.eq('organization_member_id', membership.id)
		.eq('territories.organization_id', orgId);
	const territoryIds = (memberTerritoryRows ?? []).map(
		(r: { territory_id: string }) => r.territory_id
	);
	const hasTerritoryScope = territoryIds.length > 0;

	const todayIso = new Date().toISOString().split('T')[0];
	const in7DaysIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
	const staleCutoffIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
	const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const twoWeeksAgoIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

	const pipelineQuery = supabase.rpc('get_order_pipeline', { org_id: orgId });

	let recentOrdersQuery = supabase
		.from('orders')
		.select('order_number, status, total_amount, created_at, brands(name), accounts(business_name)')
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false })
		.limit(10);
	if (brandScope) recentOrdersQuery = recentOrdersQuery.in('brand_id', brandScope);

	const upcomingShowsQuery = supabase
		.from('shows')
		.select('name, start_date, end_date, city, state, seasons(name), year')
		.eq('organization_id', orgId)
		.gte('start_date', todayIso)
		.order('start_date')
		.limit(5);

	let brandsQuery = supabase
		.from('brands')
		.select('id, name')
		.eq('organization_id', orgId)
		.eq('is_active', true);
	if (brandScope) brandsQuery = brandsQuery.in('id', brandScope);

	let accountsQuery = supabase
		.from('accounts')
		.select('id, business_name, territory_id')
		.eq('organization_id', orgId)
		.eq('is_active', true);
	if (hasTerritoryScope) accountsQuery = accountsQuery.in('territory_id', territoryIds);

	let staleOrdersQuery = supabase
		.from('orders')
		.select('order_number, total_amount, created_at, accounts(business_name)')
		.eq('organization_id', orgId)
		.eq('status', 'draft')
		.lte('created_at', staleCutoffIso);
	if (brandScope) staleOrdersQuery = staleOrdersQuery.in('brand_id', brandScope);

	const appointmentsQuery = supabase
		.from('appointments')
		.select('scheduled_date, scheduled_time, accounts(business_name), location_type')
		.eq('organization_id', orgId)
		.eq('status', 'scheduled')
		.gte('scheduled_date', todayIso)
		.lte('scheduled_date', in7DaysIso)
		.order('scheduled_date');

	let thisWeekOrdersQuery = supabase
		.from('orders')
		.select('total_amount')
		.eq('organization_id', orgId)
		.gte('created_at', weekAgoIso);
	if (brandScope) thisWeekOrdersQuery = thisWeekOrdersQuery.in('brand_id', brandScope);

	let lastWeekOrdersQuery = supabase
		.from('orders')
		.select('total_amount')
		.eq('organization_id', orgId)
		.gte('created_at', twoWeeksAgoIso)
		.lt('created_at', weekAgoIso);
	if (brandScope) lastWeekOrdersQuery = lastWeekOrdersQuery.in('brand_id', brandScope);

	const [
		pipelineRes,
		recentOrdersRes,
		upcomingShowsRes,
		brandsRes,
		accountsRes,
		staleOrdersRes,
		appointmentsRes,
		thisWeekRes,
		lastWeekRes,
		healthMap
	] = await Promise.all([
		pipelineQuery,
		recentOrdersQuery,
		upcomingShowsQuery,
		brandsQuery,
		accountsQuery,
		staleOrdersQuery,
		appointmentsQuery,
		thisWeekOrdersQuery,
		lastWeekOrdersQuery,
		computeAccountHealth(supabase, orgId)
	]);

	const pipeline = pipelineRes.data ?? [];
	const recentOrders = recentOrdersRes.data ?? [];
	const upcomingShows = upcomingShowsRes.data ?? [];
	const brands = brandsRes.data ?? [];
	const accounts = accountsRes.data ?? [];
	const staleOrders = staleOrdersRes.data ?? [];
	const appointments = appointmentsRes.data ?? [];

	const sumOrderAmounts = (rows: unknown): number =>
		((rows ?? []) as Array<{ total_amount?: number | string | null }>).reduce(
			(sum, o) => sum + Number(o.total_amount ?? 0),
			0
		);
	const thisWeekCount = (thisWeekRes.data ?? []).length;
	const thisWeekTotal = sumOrderAmounts(thisWeekRes.data);
	const lastWeekCount = (lastWeekRes.data ?? []).length;
	const lastWeekTotal = sumOrderAmounts(lastWeekRes.data);

	const pctDelta = (current: number, previous: number): string => {
		if (previous === 0) return current === 0 ? 'flat' : 'new activity';
		const delta = ((current - previous) / previous) * 100;
		if (Math.abs(delta) < 1) return 'flat';
		return `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`;
	};

	const scopedAccountIds = new Set(accounts.map((a) => a.id));
	const healthAccounts = Array.from(healthMap.values()).filter(
		(a) => !hasTerritoryScope || scopedAccountIds.has(a.accountId)
	);
	const atRiskAccounts = healthAccounts.filter((a) => a.label === 'at_risk');
	const acctNameMap = new Map(accounts.map((a) => [a.id, a.business_name]));
	const atRiskNames: string[] = [];
	for (const a of atRiskAccounts.slice(0, 5)) {
		const name = acctNameMap.get(a.accountId);
		if (name) atRiskNames.push(name);
	}
	const staleDraftTotal = staleOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

	const scopeNote = [
		brandScope
			? `brand-scoped (${brandScope.length} brand${brandScope.length === 1 ? '' : 's'})`
			: null,
		hasTerritoryScope
			? `territory-scoped (${territoryIds.length} territor${territoryIds.length === 1 ? 'y' : 'ies'})`
			: null
	]
		.filter(Boolean)
		.join(', ');

	const contextData = `
## Current Business State for ${organization.name}${scopeNote ? ` — ${scopeNote}` : ''}

### Order Pipeline
${pipeline.length > 0 ? pipeline.map((p: { status: string; count: number; total_amount: number }) => `- ${p.status}: ${p.count} orders ($${Number(p.total_amount).toLocaleString()})`).join('\n') : 'No orders yet.'}

### Week-over-Week Orders
- This week: ${thisWeekCount} orders ($${thisWeekTotal.toLocaleString()})
- Last week: ${lastWeekCount} orders ($${lastWeekTotal.toLocaleString()})
- Trend: count ${pctDelta(thisWeekCount, lastWeekCount)}, revenue ${pctDelta(thisWeekTotal, lastWeekTotal)}

### Recent Orders (last 10)
${
	recentOrders.length > 0
		? (
				recentOrders as Array<{
					order_number: string;
					status: string;
					total_amount: number;
					created_at: string;
					brands?: { name?: string } | { name?: string }[] | null;
					accounts?: { business_name?: string } | { business_name?: string }[] | null;
				}>
			)
				.map((o) => {
					const brand = Array.isArray(o.brands) ? o.brands[0] : o.brands;
					const account = Array.isArray(o.accounts) ? o.accounts[0] : o.accounts;
					return `- ${o.order_number} | ${brand?.name ?? 'Unknown'} for ${account?.business_name ?? 'Unknown'} | ${o.status} | $${Number(o.total_amount).toLocaleString()} | ${new Date(o.created_at).toLocaleDateString()}`;
				})
				.join('\n')
		: 'No orders yet.'
}

### Stale Draft Orders (14+ days)
${
	staleOrders.length > 0
		? `${staleOrders.length} stale drafts worth $${staleDraftTotal.toLocaleString()} total:\n${(
				staleOrders as Array<{
					order_number: string;
					total_amount: number;
					created_at: string;
					accounts?: { business_name?: string } | { business_name?: string }[] | null;
				}>
			)
				.map((o) => {
					const account = Array.isArray(o.accounts) ? o.accounts[0] : o.accounts;
					return `- ${o.order_number} for ${account?.business_name ?? 'Unknown'} — $${Number(o.total_amount).toLocaleString()} (created ${new Date(o.created_at).toLocaleDateString()})`;
				})
				.join('\n')}`
		: 'No stale drafts.'
}

### Account Health
- At Risk: ${atRiskAccounts.length} accounts${atRiskNames.length > 0 ? ` (${atRiskNames.join(', ')})` : ''}
- New: ${healthAccounts.filter((a) => a.label === 'new').length} accounts
- Inactive: ${healthAccounts.filter((a) => a.label === 'inactive').length} accounts

### Upcoming Appointments (next 7 days)
${
	appointments.length > 0
		? (
				appointments as Array<{
					scheduled_date: string;
					scheduled_time?: string | null;
					location_type?: string;
					accounts?: { business_name?: string } | { business_name?: string }[] | null;
				}>
			)
				.map((a) => {
					const account = Array.isArray(a.accounts) ? a.accounts[0] : a.accounts;
					return `- ${account?.business_name ?? 'Unknown'} | ${a.scheduled_date} ${a.scheduled_time ?? ''} | ${a.location_type}`;
				})
				.join('\n')
		: 'No upcoming appointments.'
}

### Upcoming Shows (next 5)
${
	upcomingShows.length > 0
		? (
				upcomingShows as Array<{
					name: string;
					start_date: string;
					end_date: string;
					city?: string | null;
					state?: string | null;
					year?: number | null;
					seasons?: { name?: string } | { name?: string }[] | null;
				}>
			)
				.map((s) => {
					const season = Array.isArray(s.seasons) ? s.seasons[0] : s.seasons;
					return `- ${s.name}${season?.name ? ` (${season.name} ${s.year ?? ''})` : ''} | ${[s.city, s.state].filter(Boolean).join(', ')} | ${s.start_date} to ${s.end_date}`;
				})
				.join('\n')
		: 'No upcoming shows.'
}

### Active Brands: ${brands.length} (${(brands as Array<{ name: string }>).map((b) => b.name).join(', ') || 'none'})
### Active Accounts: ${accounts.length}
### User: ${user.display_name} (${membership.role})
### Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
`;

	try {
		const response = await anthropic.messages.create({
			model: 'claude-haiku-4-5',
			max_tokens: 600,
			system: BRIEFING_PROMPT,
			messages: [
				{
					role: 'user',
					content: `Generate a briefing based on this data:\n${contextData}`
				}
			]
		});
		logUsage({
			endpoint: 'briefing',
			purpose: 'briefing',
			model: 'claude-haiku-4-5',
			organizationId: orgId,
			userId: user.id,
			response
		});

		const briefing = response.content[0].type === 'text' ? response.content[0].text : '';

		if (briefing) {
			briefingCache.set(cacheKey, { text: briefing, timestamp: Date.now() });
		}

		return json({ briefing });
	} catch {
		return json({ briefing: null, error: 'Failed to generate briefing' });
	}
};
