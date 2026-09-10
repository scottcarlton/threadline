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
};

/**
 * Every role except guest.
 *
 * `/api/ai` restricts guests to a read-only tool list and refuses WRITE_TOOLS
 * outright, so any entry that creates or changes a record carries this.
 */
export const WRITE_ROLES: UserRole[] = ['admin', 'owner', 'member', 'sales'];

const REPORT_ROUTES = ['/reports', '/dashboard', '/insight'];

export const AI_SUGGESTIONS: AiSuggestion[] = [
	// Reports
	{
		text: 'Sell-through by brand this season',
		routes: REPORT_ROUTES,
		orgTypes: ['rep'],
		unscopedOnly: true
	},
	{
		text: 'Top 10 styles by units this season',
		routes: REPORT_ROUTES
	},
	{
		text: 'Which accounts have not reordered since last season?',
		routes: REPORT_ROUTES
	},
	{
		text: 'Commission owed by brand this season',
		routes: REPORT_ROUTES,
		orgTypes: ['rep']
	},
	{
		text: 'Commission owed by rep this season',
		routes: REPORT_ROUTES,
		orgTypes: ['brand']
	},
	{
		text: 'Compare this season to last season by account',
		routes: REPORT_ROUTES
	},
	{
		text: 'Which styles are underperforming?',
		routes: REPORT_ROUTES
	},
	{
		text: 'Which accounts grew year over year?',
		routes: REPORT_ROUTES
	},
	{
		text: 'Export this to a Google Sheet',
		routes: REPORT_ROUTES,
		roles: WRITE_ROLES
	},

	// Orders
	{ text: 'Show me draft orders', routes: ['/orders'] },
	{ text: 'Which orders ship this month?', routes: ['/orders'] },
	{
		text: 'Total order value by account this season',
		routes: ['/orders']
	},
	{ text: 'Create an order', routes: ['/orders'], roles: WRITE_ROLES },
	{
		text: 'Add a line to this order',
		routes: ['/orders'],
		roles: WRITE_ROLES,
		entity: 'order'
	},
	{
		text: 'Mark this order confirmed',
		routes: ['/orders'],
		roles: WRITE_ROLES,
		entity: 'order'
	},

	// Accounts
	{
		text: 'Which accounts have not ordered this season?',
		routes: ['/accounts']
	},
	{
		text: 'Show me accounts by territory',
		routes: ['/accounts']
	},
	{
		text: 'Which accounts are at risk?',
		routes: ['/accounts']
	},
	{
		text: 'Create an account',
		routes: ['/accounts'],
		roles: WRITE_ROLES
	},
	{
		text: 'Assign this account to a territory',
		routes: ['/accounts'],
		roles: WRITE_ROLES,
		entity: 'account'
	},

	// Brands. A brand org does not manage a list of brands.
	{
		text: 'Which brands are growing this season?',
		routes: ['/brands'],
		orgTypes: ['rep'],
		unscopedOnly: true
	},
	{
		text: 'Show me orders for this brand',
		routes: ['/brands'],
		orgTypes: ['rep'],
		entity: 'brand'
	},
	{
		text: 'Create a brand',
		routes: ['/brands'],
		orgTypes: ['rep'],
		roles: WRITE_ROLES,
		unscopedOnly: true
	},

	// Products
	{
		text: 'Which styles sold best this season?',
		routes: ['/products']
	},
	{
		text: 'Show me products without images',
		routes: ['/products']
	},
	{ text: 'Add a product', routes: ['/products'], roles: WRITE_ROLES },
	{
		text: 'Update wholesale prices for this brand',
		routes: ['/products'],
		roles: WRITE_ROLES
	},

	// Appointments and shows
	{
		text: 'What appointments do I have this week?',
		routes: ['/appointments']
	},
	{
		text: 'Which shows are coming up?',
		routes: ['/shows', '/seasons']
	},
	{
		text: 'Book an appointment',
		routes: ['/appointments'],
		roles: WRITE_ROLES
	},
	{
		text: 'Create a season',
		routes: ['/seasons', '/shows'],
		roles: WRITE_ROLES
	},

	// Inbox
	{
		text: 'Draft a follow-up to this account',
		routes: ['/inbox'],
		roles: WRITE_ROLES,
		entity: 'account'
	},
	{
		text: 'Search emails from this account',
		routes: ['/inbox'],
		entity: 'account'
	},

	// Always available
	{ text: 'What should I focus on today?' },
	{ text: 'Show me this season at a glance' }
];
