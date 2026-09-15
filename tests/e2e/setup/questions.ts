/**
 * The question matrix, transcribed from `basePhases` and `buildPhases` in
 * src/routes/onboarding/+page.svelte. This file is the specification the
 * suite checks the running flow against: if a question is reworded or a step
 * moves between org types, one of the three walks fails here.
 *
 * Copy is quoted verbatim, punctuation included.
 */
export const QUESTIONS: Record<string, string> = {
	name: "Hello. Let's get you set up — first, what should I call you?",
	orgType: 'What kind of organization are you setting up?',
	orgName: 'And what should we call your organization?',
	brands: "Which brands do you carry? Drop your list and I'll bring them in.",
	members: 'Who else is on your team? Drop a list or invite them by email.',
	accounts: "Add the accounts you sell to. Drop a file and I'll bring them in.",
	products: "Add your product catalog. Drop your line sheet and I'll read it.",
	orders: "Have existing orders? Drop them in and I'll match them up.",
	address: "Where's your business based?",
	'payment-terms': 'What payment terms do you offer by default?',
	'payment-methods': 'How do your buyers pay you?',
	inbox: 'Want to connect your email?',
	connect: 'Last thing — want to connect the tools you already use?'
};

/** Roadmap phase titles, in order, per org type. */
export const BRAND_PHASES = ['General Information', 'Import Files', 'Settings', 'Connections'];
/** A rep loses the whole Settings phase: every question in it belongs to the
 * brand, and buildPhases drops a phase once it has no sub-steps left. */
export const REP_PHASES = ['General Information', 'Import Files', 'Connections'];
/** A retailer keeps all four, but only ever reaches the first: create-retailer
 * completes the org and sends them to /dashboard. */
export const RETAILER_PHASES = ['General Information', 'Import Files', 'Settings', 'Connections'];

export const BRAND_STEPS = [
	'name',
	'orgType',
	'orgName',
	'members',
	'accounts',
	'products',
	'orders',
	'address',
	'payment-terms',
	'payment-methods',
	'inbox',
	'connect'
];

export const REP_STEPS = [
	'name',
	'orgType',
	'orgName',
	'brands',
	'members',
	'accounts',
	'products',
	'orders',
	'inbox'
];

/** Only the General Information steps are reachable for a retailer. */
export const RETAILER_REACHABLE_STEPS = ['name', 'orgType', 'orgName'];

/** The org-type cards, by the label rendered on each. */
export const ORG_TYPE_LABELS = {
	brand: 'Brand',
	rep: 'Independent Sales Rep',
	retailer: 'Retailer'
} as const;
