// Curated prompts offered as typeahead under the AI dock input.
//
// Every entry maps to a tool that exists in `src/routes/api/ai/+server.ts`.
// Suggesting something the assistant cannot do, or that the caller's role and
// org type will refuse, is worse than suggesting nothing: the user spends a
// round trip to learn they were misled.
//
// Copy follows docs/brand/guidelines.md section 1.5: specific over vague,
// declarative, industry language, no superlatives.

import type { OrgType, UserRole } from '$lib/types/database.js';
import type { EntityContext } from '$lib/stores/entityContext.js';

export type SuggestionEntity = NonNullable<EntityContext['type']>;

export type AiSuggestion = {
	/** The prompt as the user sees it, and as it is sent verbatim. */
	text: string;
	/** Route prefixes that break ties in this entry's favour. Not a filter. */
	routes?: string[];
	/** Org types that may see this. Omit for all. */
	orgTypes?: OrgType[];
	/** Roles that may see this. Omit for all. */
	roles?: UserRole[];
	/** Requires unrestricted brand access (`brandScope === null`). */
	unscopedOnly?: boolean;
	/** Requires this record type to be on screen. */
	entity?: SuggestionEntity;
	/** Extra match terms that do not appear in `text`. */
	keywords?: string[];
};

/**
 * Every role except guest.
 *
 * `/api/ai` restricts guests to a read-only tool list and refuses WRITE_TOOLS
 * outright, so any entry that creates or changes a record carries this.
 */
export const WRITE_ROLES: UserRole[] = ['admin', 'owner', 'member', 'sales'];

const REPORT_ROUTES = ['/reports', '/dashboard', '/insight'];
const REPORT_KEYWORDS = [
	'sell-through',
	'sellthrough',
	'revenue',
	'report',
	'analytics',
	'velocity',
	'performance'
];

export const AI_SUGGESTIONS: AiSuggestion[] = [
	// Reports
	{
		text: 'Sell-through by brand this season',
		routes: REPORT_ROUTES,
		orgTypes: ['rep'],
		unscopedOnly: true,
		keywords: REPORT_KEYWORDS
	},
	{
		text: 'Top 10 styles by units this season',
		routes: REPORT_ROUTES,
		keywords: [...REPORT_KEYWORDS, 'best', 'bestsellers']
	},
	{
		text: 'Which accounts have not reordered since last season?',
		routes: REPORT_ROUTES,
		keywords: [...REPORT_KEYWORDS, 'reorder', 'lapsed', 'gap']
	},
	{
		text: 'Commission owed by brand this season',
		routes: REPORT_ROUTES,
		orgTypes: ['rep'],
		keywords: [...REPORT_KEYWORDS, 'commission', 'owed', 'payout']
	},
	{
		text: 'Commission owed by rep this season',
		routes: REPORT_ROUTES,
		orgTypes: ['brand'],
		keywords: [...REPORT_KEYWORDS, 'commission', 'owed', 'payout']
	},
	{
		text: 'Compare this season to last season by account',
		routes: REPORT_ROUTES,
		keywords: [...REPORT_KEYWORDS, 'compare', 'growth', 'year over year']
	},
	{
		text: 'Which styles are underperforming?',
		routes: REPORT_ROUTES,
		keywords: [...REPORT_KEYWORDS, 'slow', 'worst']
	},
	{
		text: 'Which accounts grew year over year?',
		routes: REPORT_ROUTES,
		keywords: [...REPORT_KEYWORDS, 'growth', 'yoy']
	},
	{
		text: 'Export this to a Google Sheet',
		routes: REPORT_ROUTES,
		roles: WRITE_ROLES,
		keywords: ['export', 'sheet', 'spreadsheet', 'download']
	},

	// Orders
	{ text: 'Show me draft orders', routes: ['/orders'], keywords: ['draft', 'pending'] },
	{ text: 'Which orders ship this month?', routes: ['/orders'], keywords: ['ship', 'delivery'] },
	{
		text: 'Total order value by account this season',
		routes: ['/orders'],
		keywords: ['total', 'value', 'bookings']
	},
	{ text: 'Create an order', routes: ['/orders'], roles: WRITE_ROLES, keywords: ['new', 'add'] },
	{
		text: 'Add a line to this order',
		routes: ['/orders'],
		roles: WRITE_ROLES,
		entity: 'order',
		keywords: ['line', 'style', 'add']
	},
	{
		text: 'Mark this order confirmed',
		routes: ['/orders'],
		roles: WRITE_ROLES,
		entity: 'order',
		keywords: ['status', 'confirm']
	},

	// Accounts
	{
		text: 'Which accounts have not ordered this season?',
		routes: ['/accounts'],
		keywords: ['lapsed', 'quiet', 'inactive']
	},
	{
		text: 'Show me accounts by territory',
		routes: ['/accounts'],
		keywords: ['territory', 'region']
	},
	{
		text: 'Which accounts are at risk?',
		routes: ['/accounts'],
		keywords: ['health', 'churn', 'risk']
	},
	{
		text: 'Create an account',
		routes: ['/accounts'],
		roles: WRITE_ROLES,
		keywords: ['new', 'add']
	},
	{
		text: 'Assign this account to a territory',
		routes: ['/accounts'],
		roles: WRITE_ROLES,
		entity: 'account',
		keywords: ['territory', 'assign']
	},

	// Brands. A brand org does not manage a list of brands.
	{
		text: 'Which brands are growing this season?',
		routes: ['/brands'],
		orgTypes: ['rep'],
		unscopedOnly: true,
		keywords: ['growth', 'performance']
	},
	{
		text: 'Show me orders for this brand',
		routes: ['/brands'],
		orgTypes: ['rep'],
		entity: 'brand',
		keywords: ['orders']
	},
	{
		text: 'Create a brand',
		routes: ['/brands'],
		orgTypes: ['rep'],
		roles: WRITE_ROLES,
		unscopedOnly: true,
		keywords: ['new', 'add']
	},

	// Products
	{
		text: 'Which styles sold best this season?',
		routes: ['/products'],
		keywords: ['best', 'top', 'velocity']
	},
	{
		text: 'Show me products without images',
		routes: ['/products'],
		keywords: ['image', 'photo', 'missing']
	},
	{ text: 'Add a product', routes: ['/products'], roles: WRITE_ROLES, keywords: ['new', 'create'] },
	{
		text: 'Update wholesale prices for this brand',
		routes: ['/products'],
		roles: WRITE_ROLES,
		keywords: ['price', 'wholesale', 'update']
	},

	// Appointments and shows
	{
		text: 'What appointments do I have this week?',
		routes: ['/appointments'],
		keywords: ['calendar', 'meeting', 'schedule']
	},
	{
		text: 'Which shows are coming up?',
		routes: ['/shows', '/seasons'],
		keywords: ['market', 'tradeshow']
	},
	{
		text: 'Book an appointment',
		routes: ['/appointments'],
		roles: WRITE_ROLES,
		keywords: ['new', 'schedule', 'meeting']
	},
	{
		text: 'Create a season',
		routes: ['/seasons', '/shows'],
		roles: WRITE_ROLES,
		keywords: ['new', 'add']
	},

	// Inbox
	{
		text: 'Draft a follow-up to this account',
		routes: ['/inbox'],
		roles: WRITE_ROLES,
		entity: 'account',
		keywords: ['email', 'draft', 'follow up']
	},
	{
		text: 'Search emails from this account',
		routes: ['/inbox'],
		entity: 'account',
		keywords: ['email', 'search']
	},

	// Always available
	{ text: 'What should I focus on today?', keywords: ['today', 'priority', 'focus'] },
	{ text: 'Show me this season at a glance', keywords: ['summary', 'overview', 'season'] }
];
