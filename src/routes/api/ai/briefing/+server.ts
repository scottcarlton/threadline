import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { computeAccountHealth } from '$lib/server/account-health.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export const POST: RequestHandler = async ({ locals }) => {
	const { supabase, organization, membership, user } = locals;

	if (!organization || !membership || !user) {
		return json({ briefing: null });
	}

	const orgId = organization.id;

	// Gather context data in parallel
	const [pipelineRes, recentOrdersRes, upcomingShowsRes, brandsRes, accountsRes, staleOrdersRes, appointmentsRes, healthMap] =
		await Promise.all([
			supabase.rpc('get_order_pipeline', { org_id: orgId }),
			supabase
				.from('orders')
				.select('order_number, status, total_amount, created_at, brands(name), accounts(business_name)')
				.eq('organization_id', orgId)
				.order('created_at', { ascending: false })
				.limit(10),
			supabase
				.from('shows')
				.select('name, start_date, end_date, city, state, seasons(name), year')
				.eq('organization_id', orgId)
				.gte('start_date', new Date().toISOString().split('T')[0])
				.order('start_date')
				.limit(5),
			supabase
				.from('brands')
				.select('name')
				.eq('organization_id', orgId)
				.eq('is_active', true),
			supabase
				.from('accounts')
				.select('id, business_name')
				.eq('organization_id', orgId)
				.eq('is_active', true),
			// Stale draft orders (14+ days old)
			supabase
				.from('orders')
				.select('order_number, total_amount, created_at, accounts(business_name)')
				.eq('organization_id', orgId)
				.eq('status', 'draft')
				.lte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
			// Upcoming appointments (next 7 days)
			supabase
				.from('appointments')
				.select('scheduled_date, scheduled_time, accounts(business_name), location_type')
				.eq('organization_id', orgId)
				.eq('status', 'scheduled')
				.gte('scheduled_date', new Date().toISOString().split('T')[0])
				.lte('scheduled_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
				.order('scheduled_date'),
			computeAccountHealth(supabase, orgId)
		]);

	const pipeline = pipelineRes.data ?? [];
	const recentOrders = recentOrdersRes.data ?? [];
	const upcomingShows = upcomingShowsRes.data ?? [];
	const brands = brandsRes.data ?? [];
	const accounts = accountsRes.data ?? [];
	const staleOrders = staleOrdersRes.data ?? [];
	const appointments = appointmentsRes.data ?? [];

	// Account health summary
	const healthAccounts = Array.from(healthMap.values());
	const atRiskAccounts = healthAccounts.filter(a => a.label === 'at_risk');
	const atRiskNames: string[] = [];
	const acctNameMap = new Map(accounts.map(a => [a.id, a.business_name]));
	for (const a of atRiskAccounts.slice(0, 5)) {
		const name = acctNameMap.get(a.accountId);
		if (name) atRiskNames.push(name);
	}
	const staleDraftTotal = staleOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

	const contextData = `
## Current Business State for ${organization.name}

### Order Pipeline
${pipeline.length > 0 ? pipeline.map((p: { status: string; count: number; total_amount: number }) => `- ${p.status}: ${p.count} orders ($${Number(p.total_amount).toLocaleString()})`).join('\n') : 'No orders yet.'}

### Recent Orders (last 10)
${recentOrders.length > 0 ? recentOrders.map((o: any) => `- ${o.order_number} | ${o.brands?.name ?? 'Unknown'} for ${o.accounts?.business_name ?? 'Unknown'} | ${o.status} | $${Number(o.total_amount).toLocaleString()} | ${new Date(o.created_at).toLocaleDateString()}`).join('\n') : 'No orders yet.'}

### Stale Draft Orders (14+ days)
${staleOrders.length > 0 ? `${staleOrders.length} stale drafts worth $${staleDraftTotal.toLocaleString()} total:\n${staleOrders.map((o: any) => `- ${o.order_number} for ${o.accounts?.business_name ?? 'Unknown'} — $${Number(o.total_amount).toLocaleString()} (created ${new Date(o.created_at).toLocaleDateString()})`).join('\n')}` : 'No stale drafts.'}

### Account Health
- At Risk: ${atRiskAccounts.length} accounts${atRiskNames.length > 0 ? ` (${atRiskNames.join(', ')})` : ''}
- New: ${healthAccounts.filter(a => a.label === 'new').length} accounts
- Inactive: ${healthAccounts.filter(a => a.label === 'inactive').length} accounts

### Upcoming Appointments (next 7 days)
${appointments.length > 0 ? appointments.map((a: any) => `- ${a.accounts?.business_name ?? 'Unknown'} | ${a.scheduled_date} ${a.scheduled_time ?? ''} | ${a.location_type}`).join('\n') : 'No upcoming appointments.'}

### Upcoming Shows (next 5)
${upcomingShows.length > 0 ? upcomingShows.map((s: any) => `- ${s.name}${s.seasons?.name ? ` (${s.seasons.name} ${s.year ?? ''})` : ''} | ${[s.city, s.state].filter(Boolean).join(', ')} | ${s.start_date} to ${s.end_date}`).join('\n') : 'No upcoming shows.'}

### Active Brands: ${brands.length} (${brands.map((b: any) => b.name).join(', ') || 'none'})
### Active Accounts: ${accounts.length}
### User: ${user.display_name} (${membership.role})
### Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
`;

	try {
		const response = await anthropic.messages.create({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 600,
			system: `You are a concise business assistant for a wholesale fashion company. Generate a brief morning briefing based on the data provided.

Rules:
- Write 4-6 short bullet points, each starting with a bold category label
- PRIORITIZE in this order: (1) at-risk accounts and stale orders, (2) upcoming appointments, (3) pipeline status, (4) shows, (5) opportunities
- If accounts are at risk (ordered before but not recently), name them and suggest action
- If there are stale draft orders (14+ days), flag the dollar amount at risk
- If appointments are coming up this week, mention them
- If there's no data for something, skip it — don't mention empty categories
- Be direct and actionable, not generic. Use specific numbers and names.
- Keep the total response under 200 words
- Do NOT use markdown headers. Use bullet points with **bold labels** only.`,
			messages: [
				{
					role: 'user',
					content: `Generate a briefing based on this data:\n${contextData}`
				}
			]
		});

		const briefing =
			response.content[0].type === 'text' ? response.content[0].text : '';

		return json({ briefing });
	} catch {
		return json({ briefing: null, error: 'Failed to generate briefing' });
	}
};
