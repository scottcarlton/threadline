import type Anthropic from '@anthropic-ai/sdk';
import { MAIN_STATIC_PROMPT } from '../ai-prompts.js';

export type StitchSystemContext = {
	organizationName: string;
	orgType: string;
	userDisplayName: string;
	role: string;
	brandScoped: boolean;
	pageContext: string;
	entityInfo: string;
	setupInfo: string;
	agentPrompt: string | null;
	now: Date;
	/** Undefined uses the server's zone, as the route always has. The eval pins one. */
	timeZone?: string;
};

export function buildStitchSystem(ctx: StitchSystemContext): Anthropic.TextBlockParam[] {
	const orgTypeLabel = ctx.orgType === 'brand' ? 'Brand (manufacturer)' : 'Rep (sales agency)';
	const brandScopeInfo = ctx.brandScoped
		? `You are scoped to specific brands only. Only interact with data for your assigned brands.`
		: 'You have access to all brands in the organization.';
	const dateStr = ctx.now.toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: ctx.timeZone
	});
	const timeStr = ctx.now.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: ctx.timeZone
	});

	const dynamicSystem = `Current user context:
- Organization: ${ctx.organizationName}
- Org type: ${orgTypeLabel}
- User: ${ctx.userDisplayName}
- Role: ${ctx.role}
- Brand access: ${brandScopeInfo}
- Current date/time: ${dateStr} at ${timeStr}
- Currently viewing: ${ctx.pageContext}${ctx.entityInfo}
${ctx.orgType === 'brand' ? '\nThis is a BRAND organization. The user manages their own product catalog and sees orders from connected reps. Focus on products, rep performance, and order fulfillment. Orders they create are for their own brand. Omit brand_name when calling create_order and never ask them which brand an order is for.' : ''}${ctx.setupInfo}${ctx.role === 'guest' ? '\nIMPORTANT: This user has READ-ONLY access. Do NOT perform any create, update, or delete operations. Only use query_data, list_brands, list_accounts, get_dashboard_metrics, get_sales_report, get_sales_analytics, get_commission_report, and get_style_velocity.' : ''}`;

	const blocks: Anthropic.TextBlockParam[] = [
		{
			type: 'text',
			text: MAIN_STATIC_PROMPT,
			cache_control: { type: 'ephemeral' }
		} as Anthropic.TextBlockParam,
		{ type: 'text', text: dynamicSystem }
	];
	if (ctx.agentPrompt) {
		blocks.push({ type: 'text', text: `\n\nCUSTOM AGENT INSTRUCTIONS:\n${ctx.agentPrompt}` });
	}
	return blocks;
}
