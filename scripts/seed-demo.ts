#!/usr/bin/env bun
/**
 * Threadline demo seed — executable source of truth for the dataset
 * documented under `supabase/seed-fixtures/`.
 *
 * Usage (from the worktree root):
 *   bun run seed                   # seed against current (presumably empty) local DB
 *   bun run seed:reset             # reset + seed
 *   bun run dev:fresh              # reset + seed + dev server
 *
 * Only runs against a local Supabase instance (127.0.0.1). Refuses otherwise.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
	process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(SUPABASE_URL)) {
	console.error(`Refusing: seed only runs against local Supabase, got ${SUPABASE_URL}`);
	process.exit(1);
}

const DEV_PASSWORD = 'threadline-demo-pw!';

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});

// ─── Data ───────────────────────────────────────────────────────────────────

const USERS = [
	{
		email: 'hello@elisevarga.com',
		displayName: 'Elise Varga',
		phone: '(212) 555-0140'
	},
	{
		email: 'sofia@sofiahernandez.co',
		displayName: 'Sofia Hernandez',
		phone: '(917) 555-0117'
	},
	{
		email: 'lauren@laurenmackey.co',
		displayName: 'Lauren Mackey',
		phone: '(214) 555-0162'
	},
	// Second member on SH Showroom — exercises manager hierarchy,
	// member_territories scoping, and connection_members.
	{
		email: 'maya@sofiahernandez.co',
		displayName: 'Maya Park',
		phone: '(917) 555-0184'
	},
	// Second member on Elise Varga — exercises BO multi-user flows.
	{
		email: 'noor@elisevarga.com',
		displayName: 'Noor Ramirez',
		phone: '(212) 555-0173'
	}
] as const;

// Address data is split by country: brand orgs span US, FR, CA so we can
// exercise US sales tax + VAT + GST simultaneously. Rep orgs use US since
// the rep flows are US-anchored today.
const ORGS = [
	{
		name: 'Elise Varga',
		slug: 'elise-varga',
		orgType: 'brand',
		ownerEmail: 'hello@elisevarga.com',
		legalBusinessName: 'Elise Varga Studio LLC',
		tagline: 'Quietly modern womenswear, made in NYC.',
		timeZone: 'America/New_York',
		currencyCode: 'USD',
		address: {
			line1: '247 W 38th St, Suite 410',
			city: 'New York',
			state: 'NY',
			zip: '10018',
			country: 'US'
		},
		website: 'https://elisevarga.com',
		contactEmail: 'hello@elisevarga.com',
		contactPhone: '(212) 555-0184'
	},
	{
		name: 'SH Showroom',
		slug: 'sh-showroom',
		orgType: 'rep',
		ownerEmail: 'sofia@sofiahernandez.co',
		legalBusinessName: 'SH Showroom Inc.',
		tagline: 'Independent womenswear sales, NYC + the road.',
		timeZone: 'America/New_York',
		currencyCode: 'USD',
		address: {
			line1: '231 W 39th St, 8th Fl',
			city: 'New York',
			state: 'NY',
			zip: '10018',
			country: 'US'
		},
		website: 'https://shshowroom.co',
		contactEmail: 'sofia@sofiahernandez.co',
		contactPhone: '(917) 555-0117'
	},
	{
		name: 'Lauren Mackey',
		slug: 'lauren-mackey',
		orgType: 'rep',
		ownerEmail: 'lauren@laurenmackey.co',
		legalBusinessName: 'Lauren Mackey Sales LLC',
		tagline: 'Boutique womenswear sales across the South & Mountain.',
		timeZone: 'America/Chicago',
		currencyCode: 'USD',
		address: {
			line1: '1209 Slocum St',
			city: 'Dallas',
			state: 'TX',
			zip: '75207',
			country: 'US'
		},
		website: 'https://laurenmackey.co',
		contactEmail: 'lauren@laurenmackey.co',
		contactPhone: '(214) 555-0162'
	}
] as const;

const CONNECTIONS = [
	{ repOrg: 'SH Showroom', brandOrg: 'Elise Varga', commissionRate: 12 },
	{ repOrg: 'Lauren Mackey', brandOrg: 'Elise Varga', commissionRate: 10 }
] as const;

const SHOWS = [
	{
		orgName: 'SH Showroom',
		showName: 'Brand Assembly',
		year: 2026,
		month: 1,
		city: 'New York',
		state: 'NY',
		venue: 'Convention Center'
	},
	{
		orgName: 'SH Showroom',
		showName: 'FIG',
		year: 2026,
		month: 3,
		city: 'Dallas',
		state: 'TX',
		venue: null
	},
	{
		orgName: 'Lauren Mackey',
		showName: 'CALA',
		year: 2026,
		month: 3,
		city: 'Dallas',
		state: 'TX',
		venue: null
	}
] as const;

// [business_name, first, last, city, state] — listed in display order
// (newest-first). Row 1 stamps created_at ≈ now; each subsequent row adds
// 11 hours of age.
const ACCOUNTS: ReadonlyArray<readonly [string, string, string, string, string]> = [
	['Tidepool 42', 'Katie', 'Donovan', 'Beaufort', 'SC'],
	['Fernwick Dry Goods', 'Ashley', 'Pierce', 'Burlington', 'VT'],
	['Quillwren', 'Samantha', 'Ruiz', 'Madison', 'WI'],
	['The Fog Index', 'Priya', 'Sharma', 'Portland', 'ME'],
	['Ninebark Mercantile', 'Megan', 'Caldwell', 'Asheville', 'NC'],
	['Maison Lumen', 'Ava', 'Whitcomb', 'Brooklyn', 'NY'],
	['Ember & Oak Boutique', 'Priya', 'Khatri', 'Austin', 'TX'],
	['Marigold Threadworks', 'Juno', 'Bellamy', 'Portland', 'OR'],
	['Fjord Atelier', 'Soren', 'Nilsson', 'Minneapolis', 'MN'],
	['Quill & Vine', 'Hazel', 'Odesanya', 'Charleston', 'SC'],
	['Saltwind Supply Co', 'Milo', 'Franchetti', 'Santa Cruz', 'CA'],
	['North Harbor Dry Goods', 'Imani', 'Rooks', 'Portsmouth', 'NH'],
	['Velour Common', 'Elena', 'Castellanos', 'Miami', 'FL'],
	['Dovetail Mercantile', 'Theo', 'Marchetti', 'Savannah', 'GA'],
	['The Linen Room', 'Nora', 'Ingleby', 'Nashville', 'TN'],
	['Halcyon House', 'Cyrus', 'Okafor', 'Providence', 'RI'],
	['Sable & Stone', 'Cleo', 'Vandermeer', 'Boulder', 'CO'],
	['Aurelia Studios', 'Mira', 'Solano', 'Los Angeles', 'CA'],
	['Birch Row', 'Jude', 'Ashbury', 'Burlington', 'VT'],
	['The Tailoring Co.', 'Otis', 'Kleinman', 'Chicago', 'IL'],
	['Runway West', 'Sana', 'Al-Mahdi', 'Scottsdale', 'AZ'],
	['Atelier Rive', 'Camille', 'Boucher', 'New Orleans', 'LA'],
	['Briar & Bloom', 'Poppy', 'Hollingshead', 'Asheville', 'NC'],
	['Indigo Lane', 'Rhea', 'Chatterjee', 'Brooklyn', 'NY'],
	['Wildrose Boutique', 'Greta', 'Lindvall', 'Madison', 'WI'],
	['Kestrel & Co', 'Felix', 'Moreau', 'Bozeman', 'MT'],
	['Linea Forma', 'Dario', 'Pellegrino', 'Houston', 'TX'],
	['Moss & Marrow', 'Wren', 'Oakleigh', 'Bend', 'OR'],
	['Petal Press', 'Lior', 'Ben-Hur', 'Berkeley', 'CA'],
	['The Ivory Collective', 'Sasha', 'Petrovsky', 'Denver', 'CO'],
	['Driftwood Outfitters', 'Ansel', 'Rourke', 'Rockport', 'ME'],
	['Plumeria Shop', 'Kalea', 'Mahoe', 'Honolulu', 'HI'],
	['Rue & Rose', 'Marguerite', 'Beaumont', 'Charleston', 'SC'],
	['Modern Mercantile', 'Dex', 'Yamamoto', 'Seattle', 'WA'],
	['Laurel Park', 'Simone', 'Okonkwo', 'Atlanta', 'GA'],
	['Pivot Showroom', 'Reid', 'Ferencz', 'Brooklyn', 'NY'],
	['Crescent Textiles', 'Noor', 'Haddad', 'Detroit', 'MI'],
	['Harvester Lane', 'Cal', 'Donohue', 'Lexington', 'KY'],
	['The Drift Shop', 'Beatrix', 'Thornhill', 'Ojai', 'CA'],
	['Polaris Boutique', 'Magnus', 'Eklund', 'Anchorage', 'AK'],
	['Glasshouse Studio', 'Irie', 'Makanaka', 'Oakland', 'CA'],
	['Clover & Cane', 'Edith', 'Pruitt', 'Knoxville', 'TN'],
	['Thistle Shop', 'Fiona', 'MacAllister', 'Portland', 'ME'],
	['Terra Cotta Goods', 'Yara', 'Benavides', 'Santa Fe', 'NM'],
	['The Cedar Closet', 'Bram', 'Vollmer', 'Grand Rapids', 'MI'],
	['Moxie & Main', 'Vera', 'Tsoukalas', 'Tampa', 'FL'],
	['Sunday Supply', 'Tadhg', 'Connolly', 'Boston', 'MA'],
	['Wayfarer Dry Goods', 'Aris', 'Papadakis', 'Salt Lake City', 'UT'],
	['Gildhouse', 'Octavia', 'Radcliffe', 'Philadelphia', 'PA'],
	['Little Oak Studio', 'Rosalind', 'Kinsella', 'Richmond', 'VA']
];

type Product = {
	style: string;
	name: string;
	desc: string;
	wholesale: number;
	retail: number;
	subcat: string;
	season: 'Spring' | 'Summer' | 'Fall';
};

const PRODUCTS: readonly Product[] = [
	// Spring 2026
	{
		style: 'SP26-101',
		name: 'The Odette Blouse',
		desc: 'Silk crêpe de chine with a soft tie neck and fluted cuff.',
		wholesale: 148,
		retail: 375,
		subcat: 'Blouse',
		season: 'Spring'
	},
	{
		style: 'SP26-102',
		name: 'The Colette Puff Top',
		desc: 'Cotton poplin with smocked yoke and puff short sleeve.',
		wholesale: 112,
		retail: 285,
		subcat: 'Blouse',
		season: 'Spring'
	},
	{
		style: 'SP26-103',
		name: 'The Margaux Bow Blouse',
		desc: 'Ivory silk charmeuse with oversized pussybow.',
		wholesale: 168,
		retail: 425,
		subcat: 'Blouse',
		season: 'Spring'
	},
	{
		style: 'SP26-104',
		name: 'The Juliette Eyelet Top',
		desc: 'Broderie anglaise with scalloped hem and keyhole back.',
		wholesale: 124,
		retail: 315,
		subcat: 'Top',
		season: 'Spring'
	},
	{
		style: 'SP26-105',
		name: 'The Seraphine Floral Blouse',
		desc: 'Pastel meadow print on silk twill, bishop sleeve.',
		wholesale: 158,
		retail: 395,
		subcat: 'Blouse',
		season: 'Spring'
	},
	{
		style: 'SP26-106',
		name: 'The Amélie Ruffle Top',
		desc: 'Featherweight cotton voile with tiered ruffle neckline.',
		wholesale: 98,
		retail: 245,
		subcat: 'Blouse',
		season: 'Spring'
	},
	{
		style: 'SP26-107',
		name: 'The Sylvie Scarf Blouse',
		desc: 'Blush silk with attached skinny scarf collar.',
		wholesale: 162,
		retail: 395,
		subcat: 'Blouse',
		season: 'Spring'
	},
	{
		style: 'SP26-108',
		name: 'The Maeve Pintuck Top',
		desc: 'White cotton with pintuck bib front and mother-of-pearl buttons.',
		wholesale: 118,
		retail: 295,
		subcat: 'Blouse',
		season: 'Spring'
	},
	{
		style: 'SP26-109',
		name: 'The Romy Peasant Blouse',
		desc: 'Sage voile with square neckline and smocked waistline.',
		wholesale: 108,
		retail: 275,
		subcat: 'Blouse',
		season: 'Spring'
	},
	{
		style: 'SP26-110',
		name: 'The Clemence Shirt',
		desc: 'Pinstripe poplin menswear-inspired button down with covered placket.',
		wholesale: 132,
		retail: 325,
		subcat: 'Shirt',
		season: 'Spring'
	},
	// Summer 2026
	{
		style: 'SU26-201',
		name: 'The Pia Camp Shirt',
		desc: 'European linen camp collar shirt in washed ivory.',
		wholesale: 124,
		retail: 315,
		subcat: 'Shirt',
		season: 'Summer'
	},
	{
		style: 'SU26-202',
		name: 'The Liv Cutaway Tank',
		desc: 'Silk satin cowl back tank with bias hem.',
		wholesale: 138,
		retail: 345,
		subcat: 'Tank',
		season: 'Summer'
	},
	{
		style: 'SU26-203',
		name: 'The Giselle Halter',
		desc: 'Sunflower print on silk, skinny tie halter, open back.',
		wholesale: 146,
		retail: 365,
		subcat: 'Top',
		season: 'Summer'
	},
	{
		style: 'SU26-204',
		name: 'The Marina Linen Blouse',
		desc: 'Sea-wash linen with notched collar and rolled short sleeve.',
		wholesale: 116,
		retail: 295,
		subcat: 'Blouse',
		season: 'Summer'
	},
	{
		style: 'SU26-205',
		name: 'The Cosima Sheer Top',
		desc: 'Silk organza balloon sleeve blouse with ribbon ties.',
		wholesale: 158,
		retail: 395,
		subcat: 'Blouse',
		season: 'Summer'
	},
	{
		style: 'SU26-206',
		name: 'The Delphine Wrap Top',
		desc: 'Jersey wrap top with tie waist in seafoam.',
		wholesale: 108,
		retail: 265,
		subcat: 'Top',
		season: 'Summer'
	},
	{
		style: 'SU26-207',
		name: 'The Ines Crochet Tank',
		desc: 'Hand-crocheted cotton shell with scalloped straps.',
		wholesale: 128,
		retail: 325,
		subcat: 'Tank',
		season: 'Summer'
	},
	{
		style: 'SU26-208',
		name: 'The Bianca Poplin Shirt',
		desc: 'Sky-blue poplin oversized shirt with convertible collar.',
		wholesale: 128,
		retail: 315,
		subcat: 'Shirt',
		season: 'Summer'
	},
	{
		style: 'SU26-209',
		name: 'The Thea Bustier',
		desc: 'Structured cotton bustier top with covered buttons down back.',
		wholesale: 148,
		retail: 365,
		subcat: 'Top',
		season: 'Summer'
	},
	{
		style: 'SU26-210',
		name: 'The Yara Off-Shoulder',
		desc: 'Coral silk with elasticated off-shoulder neckline.',
		wholesale: 134,
		retail: 335,
		subcat: 'Top',
		season: 'Summer'
	},
	{
		style: 'SU26-211',
		name: 'The Paloma Lace Blouse',
		desc: 'Cotton Battenburg lace blouse with tall collar.',
		wholesale: 164,
		retail: 415,
		subcat: 'Blouse',
		season: 'Summer'
	},
	{
		style: 'SU26-212',
		name: 'The Elsa Knot Top',
		desc: 'Silk bandeau-style knot front top in buttercream.',
		wholesale: 118,
		retail: 295,
		subcat: 'Top',
		season: 'Summer'
	},
	{
		style: 'SU26-213',
		name: 'The Noémie Sailor Top',
		desc: 'Navy-and-white striped linen with boat neck.',
		wholesale: 112,
		retail: 285,
		subcat: 'Top',
		season: 'Summer'
	},
	{
		style: 'SU26-214',
		name: 'The Iris Chiffon Blouse',
		desc: 'Lavender silk chiffon with tiered flutter sleeve.',
		wholesale: 142,
		retail: 355,
		subcat: 'Blouse',
		season: 'Summer'
	},
	{
		style: 'SU26-215',
		name: 'The Simone Tunic',
		desc: 'Gauze cotton tunic with embroidered placket and tassel ties.',
		wholesale: 138,
		retail: 345,
		subcat: 'Blouse',
		season: 'Summer'
	},
	// Fall 2026
	{
		style: 'FA26-301',
		name: 'The Vivienne Silk Blouse',
		desc: 'Burgundy silk crêpe with tie neck and covered buttons.',
		wholesale: 162,
		retail: 405,
		subcat: 'Blouse',
		season: 'Fall'
	},
	{
		style: 'FA26-302',
		name: 'The Beatrice Velvet Top',
		desc: 'Emerald silk velvet long sleeve with keyhole neckline.',
		wholesale: 188,
		retail: 475,
		subcat: 'Blouse',
		season: 'Fall'
	},
	{
		style: 'FA26-303',
		name: 'The Cosette Bow Blouse',
		desc: 'Black silk charmeuse with oversized pussybow and bishop sleeve.',
		wholesale: 172,
		retail: 435,
		subcat: 'Blouse',
		season: 'Fall'
	},
	{
		style: 'FA26-304',
		name: 'The Margot Equestrian',
		desc: 'Foulard print silk with jabot collar and French cuff.',
		wholesale: 178,
		retail: 445,
		subcat: 'Blouse',
		season: 'Fall'
	},
	{
		style: 'FA26-305',
		name: 'The Lenore Plisse Top',
		desc: 'Chocolate plissé with mock neck and fitted cuff.',
		wholesale: 154,
		retail: 385,
		subcat: 'Top',
		season: 'Fall'
	},
	{
		style: 'FA26-306',
		name: 'The Ottilie Lace Blouse',
		desc: 'Ecru Chantilly lace with Victorian collar.',
		wholesale: 198,
		retail: 495,
		subcat: 'Blouse',
		season: 'Fall'
	},
	{
		style: 'FA26-307',
		name: 'The Henriette Tuxedo Shirt',
		desc: 'White cotton tuxedo shirt with pintuck bib and studs.',
		wholesale: 148,
		retail: 375,
		subcat: 'Shirt',
		season: 'Fall'
	},
	{
		style: 'FA26-308',
		name: 'The Ines Cashmere Shell',
		desc: 'Fine-gauge cashmere sleeveless shell in camel.',
		wholesale: 158,
		retail: 395,
		subcat: 'Top',
		season: 'Fall'
	},
	{
		style: 'FA26-309',
		name: 'The Celine Cowl Blouse',
		desc: 'Draped silk cowl neck blouse in oxblood.',
		wholesale: 168,
		retail: 425,
		subcat: 'Blouse',
		season: 'Fall'
	},
	{
		style: 'FA26-310',
		name: 'The Philippa Toile Blouse',
		desc: 'Toile de Jouy print on silk twill, with ruffle placket.',
		wholesale: 172,
		retail: 435,
		subcat: 'Blouse',
		season: 'Fall'
	},
	{
		style: 'FA26-311',
		name: 'The Reine Leopard Blouse',
		desc: 'Painterly leopard print silk with notched lapel collar.',
		wholesale: 178,
		retail: 445,
		subcat: 'Blouse',
		season: 'Fall'
	},
	{
		style: 'FA26-312',
		name: 'The Sibylle Prairie Top',
		desc: 'Plum floral on crepe with ruffle yoke and high collar.',
		wholesale: 168,
		retail: 425,
		subcat: 'Blouse',
		season: 'Fall'
	},
	{
		style: 'FA26-313',
		name: 'The Agathe Lace Trim',
		desc: 'Ivory silk with Chantilly lace trim at cuff and collar.',
		wholesale: 182,
		retail: 455,
		subcat: 'Blouse',
		season: 'Fall'
	},
	{
		style: 'FA26-314',
		name: 'The Theodora Silk Shirt',
		desc: 'Slate silk shirt with mother-of-pearl buttons and French cuffs.',
		wholesale: 158,
		retail: 395,
		subcat: 'Shirt',
		season: 'Fall'
	},
	{
		style: 'FA26-315',
		name: 'The Colombe Polka Dot',
		desc: 'Black silk with ivory polka dots, bishop sleeve, neck tie.',
		wholesale: 168,
		retail: 425,
		subcat: 'Blouse',
		season: 'Fall'
	}
];

const SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;

type OrderStatus = 'submitted' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
type SourceSpec =
	| { kind: 'source'; name: 'Road' | 'JOOR' }
	| { kind: 'show'; showName: 'Brand Assembly' | 'FIG' | 'CALA' };

type Line = { style: string; size: string; qty: number };

type OrderSpec = {
	repOrgName: 'SH Showroom' | 'Lauren Mackey';
	repEmail: string;
	accountBiz: string;
	season: 'Spring' | 'Summer' | 'Fall';
	status: OrderStatus;
	source: SourceSpec;
	startOffset: number; // days from today for start_ship_date
	expectedOffset: number; // days from today for expected_ship_date
	submittedOffset: number; // days from now (always <= 0)
	confirmedOffset: number | null;
	shippedOffset: number | null;
	deliveredOffset: number | null;
	cancelledOffset?: number | null;
	cancelledReason?: string;
	notes?: string;
	poNumber?: string;
	paymentTerms?: string; // 'net_15' | 'net_30' | 'net_60' | 'cod' | 'prepaid' …
	shippingMethod?: string; // free-form snapshot
	lines: Line[];
};

const ORDERS: readonly OrderSpec[] = [
	// Sofia (SH Showroom) — 13 orders
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Clover & Cane',
		season: 'Summer',
		status: 'submitted',
		source: { kind: 'source', name: 'Road' },
		startOffset: 38,
		expectedOffset: 67,
		submittedOffset: 0,
		confirmedOffset: null,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'SU26-202', size: 'XS', qty: 1 },
			{ style: 'SU26-202', size: 'S', qty: 1 },
			{ style: 'SU26-202', size: 'M', qty: 3 },
			{ style: 'SU26-202', size: 'L', qty: 1 },
			{ style: 'SU26-202', size: 'XL', qty: 1 },
			{ style: 'SU26-207', size: 'M', qty: 3 },
			{ style: 'SU26-207', size: 'L', qty: 2 },
			{ style: 'SU26-207', size: 'XL', qty: 2 },
			{ style: 'SU26-210', size: 'S', qty: 3 },
			{ style: 'SU26-210', size: 'M', qty: 3 },
			{ style: 'SU26-210', size: 'L', qty: 3 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Quill & Vine',
		season: 'Spring',
		status: 'submitted',
		source: { kind: 'source', name: 'Road' },
		startOffset: -58,
		expectedOffset: -28,
		submittedOffset: -32,
		confirmedOffset: null,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'SP26-102', size: 'M', qty: 5 },
			{ style: 'SP26-104', size: 'XL', qty: 3 },
			{ style: 'SP26-109', size: 'S', qty: 4 },
			{ style: 'SP26-109', size: 'XS', qty: 1 },
			{ style: 'SP26-110', size: 'L', qty: 4 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Moxie & Main',
		season: 'Spring',
		status: 'delivered',
		source: { kind: 'show', showName: 'Brand Assembly' },
		startOffset: -65,
		expectedOffset: -35,
		submittedOffset: -34,
		confirmedOffset: -32,
		shippedOffset: -38,
		deliveredOffset: -31,
		lines: [
			{ style: 'SP26-101', size: 'XS', qty: 3 },
			{ style: 'SP26-104', size: 'XL', qty: 1 },
			{ style: 'SP26-105', size: 'XL', qty: 3 },
			{ style: 'SP26-109', size: 'XS', qty: 2 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Laurel Park',
		season: 'Spring',
		status: 'delivered',
		source: { kind: 'show', showName: 'Brand Assembly' },
		startOffset: -63,
		expectedOffset: -33,
		submittedOffset: -53,
		confirmedOffset: -51,
		shippedOffset: -36,
		deliveredOffset: -29,
		lines: [
			{ style: 'SP26-101', size: 'XS', qty: 5 },
			{ style: 'SP26-104', size: 'L', qty: 3 },
			{ style: 'SP26-106', size: 'M', qty: 4 },
			{ style: 'SP26-109', size: 'M', qty: 2 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Driftwood Outfitters',
		season: 'Summer',
		status: 'confirmed',
		source: { kind: 'source', name: 'Road' },
		startOffset: 20,
		expectedOffset: 50,
		submittedOffset: -38,
		confirmedOffset: -36,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'SU26-201', size: 'XS', qty: 4 },
			{ style: 'SU26-204', size: 'XS', qty: 2 },
			{ style: 'SU26-207', size: 'M', qty: 2 },
			{ style: 'SU26-208', size: 'L', qty: 3 },
			{ style: 'SU26-209', size: 'L', qty: 2 },
			{ style: 'SU26-212', size: 'XL', qty: 3 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Birch Row',
		season: 'Summer',
		status: 'shipped',
		source: { kind: 'show', showName: 'FIG' },
		startOffset: 23,
		expectedOffset: 53,
		submittedOffset: -25,
		confirmedOffset: -23,
		shippedOffset: -17,
		deliveredOffset: null,
		lines: [
			{ style: 'SU26-201', size: 'XL', qty: 4 },
			{ style: 'SU26-202', size: 'XS', qty: 3 },
			{ style: 'SU26-206', size: 'XL', qty: 4 },
			{ style: 'SU26-213', size: 'XL', qty: 2 },
			{ style: 'SU26-214', size: 'M', qty: 4 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Quillwren',
		season: 'Summer',
		status: 'confirmed',
		source: { kind: 'show', showName: 'FIG' },
		startOffset: 17,
		expectedOffset: 47,
		submittedOffset: -49,
		confirmedOffset: -46,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'SU26-205', size: 'L', qty: 2 },
			{ style: 'SU26-206', size: 'S', qty: 6 },
			{ style: 'SU26-206', size: 'XL', qty: 4 },
			{ style: 'SU26-207', size: 'M', qty: 2 },
			{ style: 'SU26-208', size: 'XS', qty: 4 },
			{ style: 'SU26-211', size: 'L', qty: 4 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Dovetail Mercantile',
		season: 'Summer',
		status: 'submitted',
		source: { kind: 'source', name: 'Road' },
		startOffset: 24,
		expectedOffset: 54,
		submittedOffset: -49,
		confirmedOffset: null,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'SU26-205', size: 'M', qty: 3 },
			{ style: 'SU26-206', size: 'L', qty: 2 },
			{ style: 'SU26-209', size: 'M', qty: 1 },
			{ style: 'SU26-211', size: 'S', qty: 4 },
			{ style: 'SU26-213', size: 'L', qty: 4 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Driftwood Outfitters',
		season: 'Fall',
		status: 'confirmed',
		source: { kind: 'show', showName: 'Brand Assembly' },
		startOffset: 126,
		expectedOffset: 156,
		submittedOffset: -53,
		confirmedOffset: -52,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'FA26-301', size: 'M', qty: 5 },
			{ style: 'FA26-302', size: 'L', qty: 2 },
			{ style: 'FA26-302', size: 'XL', qty: 4 },
			{ style: 'FA26-308', size: 'XL', qty: 4 },
			{ style: 'FA26-310', size: 'S', qty: 3 },
			{ style: 'FA26-312', size: 'M', qty: 2 },
			{ style: 'FA26-314', size: 'S', qty: 4 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Kestrel & Co',
		season: 'Fall',
		status: 'shipped',
		source: { kind: 'show', showName: 'FIG' },
		startOffset: 108,
		expectedOffset: 138,
		submittedOffset: -21,
		confirmedOffset: -18,
		shippedOffset: -11,
		deliveredOffset: null,
		lines: [
			{ style: 'FA26-301', size: 'L', qty: 2 },
			{ style: 'FA26-303', size: 'XL', qty: 4 },
			{ style: 'FA26-309', size: 'M', qty: 4 },
			{ style: 'FA26-314', size: 'M', qty: 5 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Fjord Atelier',
		season: 'Fall',
		status: 'confirmed',
		source: { kind: 'show', showName: 'Brand Assembly' },
		startOffset: 121,
		expectedOffset: 151,
		submittedOffset: -50,
		confirmedOffset: -48,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'FA26-303', size: 'L', qty: 4 },
			{ style: 'FA26-304', size: 'L', qty: 5 },
			{ style: 'FA26-305', size: 'M', qty: 4 },
			{ style: 'FA26-305', size: 'XS', qty: 1 },
			{ style: 'FA26-306', size: 'L', qty: 4 },
			{ style: 'FA26-306', size: 'XL', qty: 6 },
			{ style: 'FA26-313', size: 'XL', qty: 4 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Terra Cotta Goods',
		season: 'Fall',
		status: 'shipped',
		source: { kind: 'source', name: 'Road' },
		startOffset: 116,
		expectedOffset: 146,
		submittedOffset: -34,
		confirmedOffset: -32,
		shippedOffset: -25,
		deliveredOffset: null,
		lines: [
			{ style: 'FA26-303', size: 'L', qty: 5 },
			{ style: 'FA26-307', size: 'XL', qty: 3 },
			{ style: 'FA26-309', size: 'L', qty: 5 },
			{ style: 'FA26-309', size: 'XS', qty: 1 },
			{ style: 'FA26-312', size: 'L', qty: 6 },
			{ style: 'FA26-313', size: 'S', qty: 2 },
			{ style: 'FA26-315', size: 'XL', qty: 6 }
		]
	},
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Harvester Lane',
		season: 'Fall',
		status: 'confirmed',
		source: { kind: 'source', name: 'Road' },
		startOffset: 119,
		expectedOffset: 149,
		submittedOffset: -39,
		confirmedOffset: -38,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'FA26-303', size: 'S', qty: 1 },
			{ style: 'FA26-305', size: 'S', qty: 2 },
			{ style: 'FA26-311', size: 'M', qty: 5 },
			{ style: 'FA26-313', size: 'XL', qty: 4 },
			{ style: 'FA26-315', size: 'M', qty: 2 }
		]
	},
	// Lauren (Lauren Mackey) — 9 orders
	{
		repOrgName: 'Lauren Mackey',
		repEmail: 'lauren@laurenmackey.co',
		accountBiz: 'Birch Row',
		season: 'Fall',
		status: 'submitted',
		source: { kind: 'source', name: 'Road' },
		startOffset: 130,
		expectedOffset: 159,
		submittedOffset: 0,
		confirmedOffset: null,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'FA26-303', size: 'XS', qty: 1 },
			{ style: 'FA26-303', size: 'S', qty: 2 },
			{ style: 'FA26-303', size: 'M', qty: 3 },
			{ style: 'FA26-303', size: 'L', qty: 1 },
			{ style: 'FA26-303', size: 'XL', qty: 1 },
			{ style: 'FA26-305', size: 'S', qty: 1 },
			{ style: 'FA26-305', size: 'M', qty: 2 },
			{ style: 'FA26-305', size: 'L', qty: 1 },
			{ style: 'FA26-301', size: 'XS', qty: 1 },
			{ style: 'FA26-301', size: 'S', qty: 1 },
			{ style: 'FA26-301', size: 'M', qty: 2 },
			{ style: 'FA26-301', size: 'L', qty: 2 },
			{ style: 'FA26-301', size: 'XL', qty: 1 }
		]
	},
	{
		repOrgName: 'Lauren Mackey',
		repEmail: 'lauren@laurenmackey.co',
		accountBiz: 'Sunday Supply',
		season: 'Spring',
		status: 'delivered',
		source: { kind: 'source', name: 'Road' },
		startOffset: -71,
		expectedOffset: -41,
		submittedOffset: -45,
		confirmedOffset: -41,
		shippedOffset: -44,
		deliveredOffset: -37,
		lines: [
			{ style: 'SP26-102', size: 'M', qty: 1 },
			{ style: 'SP26-104', size: 'XL', qty: 5 },
			{ style: 'SP26-105', size: 'XL', qty: 3 },
			{ style: 'SP26-106', size: 'M', qty: 3 },
			{ style: 'SP26-106', size: 'XL', qty: 3 }
		]
	},
	{
		repOrgName: 'Lauren Mackey',
		repEmail: 'lauren@laurenmackey.co',
		accountBiz: 'Marigold Threadworks',
		season: 'Spring',
		status: 'delivered',
		source: { kind: 'show', showName: 'CALA' },
		startOffset: -81,
		expectedOffset: -51,
		submittedOffset: -42,
		confirmedOffset: -40,
		shippedOffset: -54,
		deliveredOffset: -47,
		lines: [
			{ style: 'SP26-101', size: 'XL', qty: 6 },
			{ style: 'SP26-102', size: 'XL', qty: 4 },
			{ style: 'SP26-102', size: 'XS', qty: 6 },
			{ style: 'SP26-103', size: 'S', qty: 5 },
			{ style: 'SP26-108', size: 'L', qty: 1 },
			{ style: 'SP26-110', size: 'L', qty: 3 }
		]
	},
	{
		repOrgName: 'Lauren Mackey',
		repEmail: 'lauren@laurenmackey.co',
		accountBiz: 'The Ivory Collective',
		season: 'Summer',
		status: 'confirmed',
		source: { kind: 'show', showName: 'CALA' },
		startOffset: 26,
		expectedOffset: 56,
		submittedOffset: -45,
		confirmedOffset: -43,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'SU26-203', size: 'L', qty: 2 },
			{ style: 'SU26-205', size: 'S', qty: 3 },
			{ style: 'SU26-208', size: 'S', qty: 3 },
			{ style: 'SU26-210', size: 'L', qty: 4 },
			{ style: 'SU26-213', size: 'L', qty: 1 },
			{ style: 'SU26-214', size: 'XL', qty: 3 }
		]
	},
	{
		repOrgName: 'Lauren Mackey',
		repEmail: 'lauren@laurenmackey.co',
		accountBiz: 'Ninebark Mercantile',
		season: 'Summer',
		status: 'shipped',
		source: { kind: 'source', name: 'Road' },
		startOffset: 8,
		expectedOffset: 38,
		submittedOffset: -41,
		confirmedOffset: -38,
		shippedOffset: -34,
		deliveredOffset: null,
		lines: [
			{ style: 'SU26-202', size: 'M', qty: 5 },
			{ style: 'SU26-205', size: 'XL', qty: 3 },
			{ style: 'SU26-208', size: 'S', qty: 6 },
			{ style: 'SU26-211', size: 'M', qty: 2 }
		]
	},
	{
		repOrgName: 'Lauren Mackey',
		repEmail: 'lauren@laurenmackey.co',
		accountBiz: 'Briar & Bloom',
		season: 'Summer',
		status: 'submitted',
		source: { kind: 'show', showName: 'CALA' },
		startOffset: 12,
		expectedOffset: 42,
		submittedOffset: -43,
		confirmedOffset: null,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'SU26-206', size: 'S', qty: 4 },
			{ style: 'SU26-208', size: 'L', qty: 5 },
			{ style: 'SU26-210', size: 'L', qty: 6 },
			{ style: 'SU26-212', size: 'S', qty: 3 },
			{ style: 'SU26-213', size: 'XL', qty: 5 },
			{ style: 'SU26-213', size: 'XS', qty: 5 }
		]
	},
	{
		repOrgName: 'Lauren Mackey',
		repEmail: 'lauren@laurenmackey.co',
		accountBiz: 'Terra Cotta Goods',
		season: 'Fall',
		status: 'confirmed',
		source: { kind: 'source', name: 'Road' },
		startOffset: 117,
		expectedOffset: 147,
		submittedOffset: -44,
		confirmedOffset: -43,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'FA26-304', size: 'XL', qty: 4 },
			{ style: 'FA26-306', size: 'XS', qty: 2 },
			{ style: 'FA26-309', size: 'XL', qty: 2 },
			{ style: 'FA26-313', size: 'XL', qty: 6 }
		]
	},
	{
		repOrgName: 'Lauren Mackey',
		repEmail: 'lauren@laurenmackey.co',
		accountBiz: 'Quill & Vine',
		season: 'Fall',
		status: 'shipped',
		source: { kind: 'show', showName: 'CALA' },
		startOffset: 108,
		expectedOffset: 138,
		submittedOffset: -34,
		confirmedOffset: -31,
		shippedOffset: -26,
		deliveredOffset: null,
		lines: [
			{ style: 'FA26-301', size: 'L', qty: 4 },
			{ style: 'FA26-302', size: 'M', qty: 5 },
			{ style: 'FA26-303', size: 'L', qty: 3 },
			{ style: 'FA26-310', size: 'S', qty: 5 },
			{ style: 'FA26-312', size: 'S', qty: 4 },
			{ style: 'FA26-312', size: 'XL', qty: 2 }
		]
	},
	{
		repOrgName: 'Lauren Mackey',
		repEmail: 'lauren@laurenmackey.co',
		accountBiz: 'Linea Forma',
		season: 'Fall',
		status: 'confirmed',
		source: { kind: 'source', name: 'Road' },
		startOffset: 118,
		expectedOffset: 148,
		submittedOffset: -57,
		confirmedOffset: -54,
		shippedOffset: null,
		deliveredOffset: null,
		lines: [
			{ style: 'FA26-302', size: 'S', qty: 6 },
			{ style: 'FA26-304', size: 'XS', qty: 6 },
			{ style: 'FA26-310', size: 'XL', qty: 3 }
		]
	},
	// Cancelled order — buyer cancelled before confirmation. Demonstrates the
	// cancelled badge in /orders, populates cancelled_at + cancelled_reason.
	{
		repOrgName: 'SH Showroom',
		repEmail: 'sofia@sofiahernandez.co',
		accountBiz: 'Plumeria Shop',
		season: 'Fall',
		status: 'cancelled',
		source: { kind: 'source', name: 'Road' },
		startOffset: 102,
		expectedOffset: 132,
		submittedOffset: -19,
		confirmedOffset: null,
		shippedOffset: null,
		deliveredOffset: null,
		cancelledOffset: -16,
		cancelledReason: 'Buyer scaled back the Fall budget; will revisit next season.',
		notes: 'Hold for next year — buyer interested in FA26-302 + FA26-310 if available.',
		paymentTerms: 'net_30',
		shippingMethod: 'Ground',
		lines: [
			{ style: 'FA26-302', size: 'M', qty: 3 },
			{ style: 'FA26-310', size: 'L', qty: 3 }
		]
	}
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitize(s: string) {
	return s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function hashString(s: string): number {
	// Simple deterministic hash; we don't need Postgres `hashtext` parity, only
	// stable values in the 20-99 stock range.
	let h = 0;
	for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
	return Math.abs(h);
}

function iso(offsetMs: number): string {
	return new Date(Date.now() + offsetMs).toISOString();
}
function isoDate(offsetDays: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + offsetDays);
	return d.toISOString().slice(0, 10);
}
function isoTime(offsetDays: number): string {
	return iso(offsetDays * 24 * 60 * 60 * 1000);
}

function log(msg: string) {
	console.log(`  ${msg}`);
}

async function mustInsert<T>(tag: string, result: { data: T | null; error: unknown }): Promise<T> {
	if (result.error) {
		console.error(`✖ ${tag} failed:`, result.error);
		process.exit(1);
	}
	return result.data as T;
}

// ─── Phase 1: prerequisites ─────────────────────────────────────────────────

async function seedUsers(): Promise<Map<string, string>> {
	const byEmail = new Map<string, string>();
	for (const u of USERS) {
		const { data, error } = await supa.auth.admin.createUser({
			email: u.email,
			password: DEV_PASSWORD,
			email_confirm: true,
			user_metadata: { display_name: u.displayName }
		});
		if (error || !data.user) {
			console.error(`✖ createUser ${u.email} failed:`, error);
			process.exit(1);
		}
		byEmail.set(u.email, data.user.id);
		// The on_auth_user_created trigger created the profile row using email
		// as the fallback display_name; update it to the canonical name.
		await supa
			.from('profiles')
			.update({ display_name: u.displayName, phone: u.phone })
			.eq('id', data.user.id);
		log(`user ${u.email} → ${data.user.id}`);
	}
	return byEmail;
}

async function seedOrgs(): Promise<Map<string, string>> {
	const byName = new Map<string, string>();
	for (const o of ORGS) {
		const { data, error } = await supa
			.from('organizations')
			.insert({
				name: o.name,
				slug: o.slug,
				org_type: o.orgType,
				legal_business_name: o.legalBusinessName,
				tagline: o.tagline,
				time_zone: o.timeZone,
				currency_code: o.currencyCode,
				address_line1: o.address.line1,
				city: o.address.city,
				state: o.address.state,
				zip: o.address.zip,
				country: o.address.country,
				// Mark onboarding completed so reseeded orgs don't get bounced into
				// /onboarding. Step lands at the highest step we currently render.
				onboarding_step: 6,
				onboarding_completed_at: new Date().toISOString()
			})
			.select('id')
			.single();
		await mustInsert(`org ${o.name}`, { data, error });
		byName.set(o.name, data!.id);
		log(`org ${o.name} → ${data!.id}`);
	}
	return byName;
}

// Returns: map of (orgName::email) → organization_members.id, used by
// downstream functions that need the member-row PK (territories, manager
// assignments).
async function seedMemberships(
	userIds: Map<string, string>,
	orgIds: Map<string, string>
): Promise<Map<string, string>> {
	const memberIds = new Map<string, string>();
	// 1. One admin per org (the org owner). Bumped to manages_others=true
	// so they can have direct reports later.
	for (const o of ORGS) {
		const { data, error } = await supa
			.from('organization_members')
			.insert({
				organization_id: orgIds.get(o.name)!,
				profile_id: userIds.get(o.ownerEmail)!,
				role: 'admin',
				manages_others: true,
				accepted_at: new Date().toISOString()
			})
			.select('id')
			.single();
		if (error || !data) {
			console.error(`✖ membership ${o.ownerEmail} → ${o.name}:`, error);
			process.exit(1);
		}
		memberIds.set(`${o.name}::${o.ownerEmail}`, data.id);
		log(`member ${o.ownerEmail} is admin of ${o.name}`);
	}

	// 2. Extra team members. Manager hierarchy is set via manager_id pointing
	// at the org owner's member row (Maya reports to Sofia).
	const extras = [
		{
			orgName: 'SH Showroom',
			email: 'maya@sofiahernandez.co',
			role: 'sales' as const,
			managerEmail: 'sofia@sofiahernandez.co'
		},
		{
			orgName: 'Elise Varga',
			email: 'noor@elisevarga.com',
			role: 'admin' as const,
			managerEmail: null as string | null
		}
	];
	for (const m of extras) {
		const managerId =
			m.managerEmail != null ? memberIds.get(`${m.orgName}::${m.managerEmail}`)! : null;
		const { data, error } = await supa
			.from('organization_members')
			.insert({
				organization_id: orgIds.get(m.orgName)!,
				profile_id: userIds.get(m.email)!,
				role: m.role,
				manager_id: managerId,
				accepted_at: new Date().toISOString()
			})
			.select('id')
			.single();
		if (error || !data) {
			console.error(`✖ extra membership ${m.email} → ${m.orgName}:`, error);
			process.exit(1);
		}
		memberIds.set(`${m.orgName}::${m.email}`, data.id);
		log(`member ${m.email} is ${m.role} of ${m.orgName}`);
	}

	return memberIds;
}

// Per-org commerce defaults: taxes, shipping_from, returns, payments,
// order numbering, plus the legacy `default_payment_terms`/`default_shipping_method`
// text columns that the order resolver still reads. Each org gets a distinct
// realistic profile so the /organization/* pages render with content.
type OrgCommerceProfile = {
	orgName: string;
	orderNumberPrefix: string;
	orderNumberPadWidth: number;
	nextOrderNumber: number;
	orderMinimumEnabled: boolean;
	orderMinimumAmount: number | null;
	handlingFeeAmount: number;
	defaultPaymentTerms: string;
	defaultPaymentMethod: string | null;
	acceptedPaymentMethods: string[];
	taxes: {
		pricingDisplay: 'exclusive' | 'inclusive';
		usSalesTaxEnabled: boolean;
		usEin: string | null;
		usGeneralRate: number | null;
		vatEnabled: boolean;
		vatRegistration: string | null;
		vatRate: number | null;
		gstEnabled: boolean;
		gstRegistration: string | null;
		gstRate: number | null;
	};
	shipping: {
		useBusinessAddress: boolean;
		from: {
			line1: string;
			line2: string | null;
			city: string;
			state: string;
			zip: string;
			country: string;
		} | null;
		freeThresholdEnabled: boolean;
		freeThresholdAmount: number | null;
	};
	returns: {
		windowDays: number;
		policyText: string;
		useShipFromAddress: boolean;
		address: {
			line1: string;
			line2: string | null;
			city: string;
			state: string;
			zip: string;
			country: string;
		} | null;
		restockingFeeType: 'percent' | 'flat';
		restockingFeeValue: number;
		buyerPaysShipping: boolean;
	};
	payments: {
		processor: 'stripe' | 'manual';
		stripeLinkEnabled: boolean;
		requiredDepositEnabled: boolean;
		requiredDepositPercent: number | null;
		depositAccountName: string | null;
		depositAccountLast4: string | null;
		surchargePassToBuyer: boolean;
	};
};

const ORG_COMMERCE: readonly OrgCommerceProfile[] = [
	{
		orgName: 'Elise Varga',
		orderNumberPrefix: 'EV-',
		orderNumberPadWidth: 6,
		nextOrderNumber: 1024,
		orderMinimumEnabled: true,
		orderMinimumAmount: 750,
		handlingFeeAmount: 0,
		defaultPaymentTerms: 'net_30',
		defaultPaymentMethod: 'credit_card',
		acceptedPaymentMethods: ['credit_card', 'ach', 'check', 'wire'],
		taxes: {
			pricingDisplay: 'exclusive',
			usSalesTaxEnabled: true,
			usEin: '47-1832094',
			usGeneralRate: 0,
			vatEnabled: false,
			vatRegistration: null,
			vatRate: null,
			gstEnabled: false,
			gstRegistration: null,
			gstRate: null
		},
		shipping: {
			useBusinessAddress: false,
			from: {
				line1: '88 Bridgewater Way',
				line2: 'Bay 4',
				city: 'Secaucus',
				state: 'NJ',
				zip: '07094',
				country: 'US'
			},
			freeThresholdEnabled: true,
			freeThresholdAmount: 2500
		},
		returns: {
			windowDays: 14,
			policyText:
				'Damaged or short-shipped items must be reported within 7 days of delivery. Stocked items may be returned within 14 days for a 15% restocking fee. Made-to-order styles are final sale.',
			useShipFromAddress: true,
			address: null,
			restockingFeeType: 'percent',
			restockingFeeValue: 15,
			buyerPaysShipping: true
		},
		payments: {
			processor: 'manual',
			stripeLinkEnabled: false,
			requiredDepositEnabled: true,
			requiredDepositPercent: 25,
			depositAccountName: 'Elise Varga Studio LLC — Operating',
			depositAccountLast4: '4421',
			surchargePassToBuyer: false
		}
	},
	{
		orgName: 'SH Showroom',
		orderNumberPrefix: 'SHS-',
		orderNumberPadWidth: 5,
		nextOrderNumber: 312,
		orderMinimumEnabled: false,
		orderMinimumAmount: null,
		handlingFeeAmount: 0,
		defaultPaymentTerms: 'net_30',
		defaultPaymentMethod: 'credit_card',
		acceptedPaymentMethods: ['credit_card', 'ach', 'check'],
		taxes: {
			pricingDisplay: 'exclusive',
			usSalesTaxEnabled: false,
			usEin: null,
			usGeneralRate: null,
			vatEnabled: false,
			vatRegistration: null,
			vatRate: null,
			gstEnabled: false,
			gstRegistration: null,
			gstRate: null
		},
		shipping: {
			useBusinessAddress: true,
			from: null,
			freeThresholdEnabled: false,
			freeThresholdAmount: null
		},
		returns: {
			windowDays: 0,
			policyText: '',
			useShipFromAddress: true,
			address: null,
			restockingFeeType: 'percent',
			restockingFeeValue: 0,
			buyerPaysShipping: false
		},
		payments: {
			processor: 'manual',
			stripeLinkEnabled: false,
			requiredDepositEnabled: false,
			requiredDepositPercent: null,
			depositAccountName: null,
			depositAccountLast4: null,
			surchargePassToBuyer: false
		}
	},
	{
		orgName: 'Lauren Mackey',
		orderNumberPrefix: 'LM-',
		orderNumberPadWidth: 5,
		nextOrderNumber: 188,
		orderMinimumEnabled: false,
		orderMinimumAmount: null,
		handlingFeeAmount: 0,
		defaultPaymentTerms: 'net_30',
		defaultPaymentMethod: 'credit_card',
		acceptedPaymentMethods: ['credit_card', 'ach'],
		taxes: {
			pricingDisplay: 'exclusive',
			usSalesTaxEnabled: false,
			usEin: null,
			usGeneralRate: null,
			vatEnabled: false,
			vatRegistration: null,
			vatRate: null,
			gstEnabled: false,
			gstRegistration: null,
			gstRate: null
		},
		shipping: {
			useBusinessAddress: true,
			from: null,
			freeThresholdEnabled: false,
			freeThresholdAmount: null
		},
		returns: {
			windowDays: 0,
			policyText: '',
			useShipFromAddress: true,
			address: null,
			restockingFeeType: 'percent',
			restockingFeeValue: 0,
			buyerPaysShipping: false
		},
		payments: {
			processor: 'manual',
			stripeLinkEnabled: false,
			requiredDepositEnabled: false,
			requiredDepositPercent: null,
			depositAccountName: null,
			depositAccountLast4: null,
			surchargePassToBuyer: false
		}
	}
];

async function seedOrgCommerceDefaults(orgIds: Map<string, string>): Promise<void> {
	for (const c of ORG_COMMERCE) {
		const orgId = orgIds.get(c.orgName)!;
		const { error } = await supa
			.from('organizations')
			.update({
				order_number_prefix: c.orderNumberPrefix,
				order_number_pad_width: c.orderNumberPadWidth,
				next_order_number: c.nextOrderNumber,
				order_minimum_enabled: c.orderMinimumEnabled,
				order_minimum_amount: c.orderMinimumAmount,
				handling_fee_amount: c.handlingFeeAmount,
				default_payment_terms: c.defaultPaymentTerms,
				default_payment_method: c.defaultPaymentMethod,
				accepted_payment_methods: c.acceptedPaymentMethods,
				// Taxes
				taxes_pricing_display: c.taxes.pricingDisplay,
				taxes_us_sales_tax_enabled: c.taxes.usSalesTaxEnabled,
				taxes_us_ein: c.taxes.usEin,
				taxes_us_general_rate: c.taxes.usGeneralRate,
				taxes_vat_enabled: c.taxes.vatEnabled,
				taxes_vat_registration: c.taxes.vatRegistration,
				taxes_vat_rate: c.taxes.vatRate,
				taxes_gst_enabled: c.taxes.gstEnabled,
				taxes_gst_registration: c.taxes.gstRegistration,
				taxes_gst_rate: c.taxes.gstRate,
				// Shipping
				shipping_use_business_address: c.shipping.useBusinessAddress,
				shipping_from_line1: c.shipping.from?.line1 ?? null,
				shipping_from_line2: c.shipping.from?.line2 ?? null,
				shipping_from_city: c.shipping.from?.city ?? null,
				shipping_from_state: c.shipping.from?.state ?? null,
				shipping_from_zip: c.shipping.from?.zip ?? null,
				shipping_from_country: c.shipping.from?.country ?? null,
				shipping_free_threshold_enabled: c.shipping.freeThresholdEnabled,
				shipping_free_threshold_amount: c.shipping.freeThresholdAmount,
				// Returns
				returns_window_days: c.returns.windowDays,
				returns_policy_text: c.returns.policyText,
				returns_use_ship_from_address: c.returns.useShipFromAddress,
				returns_address_line1: c.returns.address?.line1 ?? null,
				returns_address_line2: c.returns.address?.line2 ?? null,
				returns_address_city: c.returns.address?.city ?? null,
				returns_address_state: c.returns.address?.state ?? null,
				returns_address_zip: c.returns.address?.zip ?? null,
				returns_address_country: c.returns.address?.country ?? null,
				returns_restocking_fee_type: c.returns.restockingFeeType,
				returns_restocking_fee_value: c.returns.restockingFeeValue,
				returns_buyer_pays_shipping: c.returns.buyerPaysShipping,
				// Payments
				payments_processor: c.payments.processor,
				payments_stripe_link_enabled: c.payments.stripeLinkEnabled,
				payments_required_deposit_enabled: c.payments.requiredDepositEnabled,
				payments_required_deposit_percent: c.payments.requiredDepositPercent,
				payments_deposit_account_name: c.payments.depositAccountName,
				payments_deposit_account_last4: c.payments.depositAccountLast4,
				payments_surcharge_pass_to_buyer: c.payments.surchargePassToBuyer
			})
			.eq('id', orgId);
		if (error) {
			console.error(`✖ org commerce defaults ${c.orgName}:`, error);
			process.exit(1);
		}
		log(`commerce defaults set on ${c.orgName}`);
	}
}

// A "manual brand" is a brand row owned by a rep org (org_type='rep') for an
// outside brand the rep sells but who isn't on Threadline as a Brand Org.
// Commerce settings live on the brand row itself; the order resolver branches
// on the owning org_type. Seeded so /brands/[id] shows a fully-configured
// manual brand even though no orders are placed against it in this pass.
const MANUAL_BRAND = {
	ownerOrgName: 'SH Showroom',
	name: 'Lago Sun',
	contactEmail: 'wholesale@lagosun.com',
	contactPhone: '(305) 555-0192',
	website: 'https://lagosun.com',
	commission: {
		defaultRate: 12,
		orderNumberPrefix: 'LGS-',
		orderNumberPadWidth: 5,
		nextOrderNumber: 87,
		orderMinimumEnabled: true,
		orderMinimumAmount: 500,
		handlingFeeAmount: 0
	},
	taxes: {
		pricingDisplay: 'exclusive' as const,
		usSalesTaxEnabled: true,
		usEin: '83-2741055',
		usGeneralRate: 7.0,
		vatEnabled: false,
		gstEnabled: false
	},
	shipping: {
		useBusinessAddress: false,
		from: {
			line1: '4140 NW 7th St',
			line2: null as string | null,
			city: 'Miami',
			state: 'FL',
			zip: '33126',
			country: 'US'
		},
		freeThresholdEnabled: true,
		freeThresholdAmount: 1500
	},
	returns: {
		windowDays: 10,
		policyText:
			'Returns accepted within 10 days for stocked styles, 20% restocking fee. Made-to-order is final sale. Buyer pays return shipping.',
		useShipFromAddress: true,
		restockingFeeType: 'percent' as const,
		restockingFeeValue: 20,
		buyerPaysShipping: true
	},
	payments: {
		processor: 'manual' as const,
		stripeLinkEnabled: false,
		requiredDepositEnabled: true,
		requiredDepositPercent: 30,
		depositAccountName: 'Lago Sun LLC — Operating',
		depositAccountLast4: '7710',
		surchargePassToBuyer: false,
		acceptedPaymentMethods: ['credit_card', 'ach', 'wire'],
		defaultPaymentMethod: 'credit_card',
		defaultPaymentTerms: 'net_30'
	},
	taxRates: [
		{ state: 'FL', rate: 7.0, type: 'destination' as const },
		{ state: 'GA', rate: 7.5, type: 'destination' as const },
		{ state: 'TX', rate: 8.25, type: 'destination' as const }
	],
	shippingMethods: [
		{
			name: 'Ground',
			costType: 'flat' as const,
			costAmount: 14,
			deliveryWindow: '5–7 business days',
			isDefault: true
		},
		{
			name: 'Express',
			costType: 'flat' as const,
			costAmount: 36,
			deliveryWindow: '2 business days'
		}
	],
	products: [
		{
			style: 'LGS-001',
			name: 'The Sandbar Caftan',
			desc: 'Cotton voile resort caftan with hand-finished neckline.',
			wholesale: 96,
			retail: 245,
			subcat: 'Dress'
		},
		{
			style: 'LGS-002',
			name: 'The Tide Pool Wrap',
			desc: 'Linen wrap dress with side ties; one size cut.',
			wholesale: 118,
			retail: 295,
			subcat: 'Dress'
		},
		{
			style: 'LGS-003',
			name: 'The Beach Day Set',
			desc: 'Two-piece terry set; cropped tee + relaxed short.',
			wholesale: 84,
			retail: 215,
			subcat: 'Set'
		}
	]
} as const;

async function seedManualBrand(orgIds: Map<string, string>): Promise<{
	brandId: string;
	productMap: Map<string, { productId: string; variants: Map<string, string> }>;
}> {
	const ownerOrgId = orgIds.get(MANUAL_BRAND.ownerOrgName)!;

	// 1. Insert the brand row with a partial set of commerce columns; the
	// shipping default is patched after brand_shipping_methods exists.
	const { data: brand, error: bErr } = await supa
		.from('brands')
		.insert({
			organization_id: ownerOrgId,
			name: MANUAL_BRAND.name,
			contact_email: MANUAL_BRAND.contactEmail,
			contact_phone: MANUAL_BRAND.contactPhone,
			website: MANUAL_BRAND.website,
			is_self_brand: false,
			is_active: true,
			commission_rate: MANUAL_BRAND.commission.defaultRate,
			// Orders
			order_number_prefix: MANUAL_BRAND.commission.orderNumberPrefix,
			order_number_pad_width: MANUAL_BRAND.commission.orderNumberPadWidth,
			next_order_number: MANUAL_BRAND.commission.nextOrderNumber,
			order_minimum_enabled: MANUAL_BRAND.commission.orderMinimumEnabled,
			order_minimum_amount: MANUAL_BRAND.commission.orderMinimumAmount,
			handling_fee_amount: MANUAL_BRAND.commission.handlingFeeAmount,
			default_commission_rate: MANUAL_BRAND.commission.defaultRate,
			// Taxes
			taxes_pricing_display: MANUAL_BRAND.taxes.pricingDisplay,
			taxes_us_sales_tax_enabled: MANUAL_BRAND.taxes.usSalesTaxEnabled,
			taxes_us_ein: MANUAL_BRAND.taxes.usEin,
			taxes_us_general_rate: MANUAL_BRAND.taxes.usGeneralRate,
			taxes_vat_enabled: MANUAL_BRAND.taxes.vatEnabled,
			taxes_gst_enabled: MANUAL_BRAND.taxes.gstEnabled,
			// Shipping
			shipping_use_business_address: MANUAL_BRAND.shipping.useBusinessAddress,
			shipping_from_line1: MANUAL_BRAND.shipping.from.line1,
			shipping_from_line2: MANUAL_BRAND.shipping.from.line2,
			shipping_from_city: MANUAL_BRAND.shipping.from.city,
			shipping_from_state: MANUAL_BRAND.shipping.from.state,
			shipping_from_zip: MANUAL_BRAND.shipping.from.zip,
			shipping_from_country: MANUAL_BRAND.shipping.from.country,
			shipping_free_threshold_enabled: MANUAL_BRAND.shipping.freeThresholdEnabled,
			shipping_free_threshold_amount: MANUAL_BRAND.shipping.freeThresholdAmount,
			// Returns
			returns_window_days: MANUAL_BRAND.returns.windowDays,
			returns_policy_text: MANUAL_BRAND.returns.policyText,
			returns_use_ship_from_address: MANUAL_BRAND.returns.useShipFromAddress,
			returns_restocking_fee_type: MANUAL_BRAND.returns.restockingFeeType,
			returns_restocking_fee_value: MANUAL_BRAND.returns.restockingFeeValue,
			returns_buyer_pays_shipping: MANUAL_BRAND.returns.buyerPaysShipping,
			// Payments
			payments_processor: MANUAL_BRAND.payments.processor,
			payments_stripe_link_enabled: MANUAL_BRAND.payments.stripeLinkEnabled,
			payments_required_deposit_enabled: MANUAL_BRAND.payments.requiredDepositEnabled,
			payments_required_deposit_percent: MANUAL_BRAND.payments.requiredDepositPercent,
			payments_deposit_account_name: MANUAL_BRAND.payments.depositAccountName,
			payments_deposit_account_last4: MANUAL_BRAND.payments.depositAccountLast4,
			payments_surcharge_pass_to_buyer: MANUAL_BRAND.payments.surchargePassToBuyer,
			accepted_payment_methods: MANUAL_BRAND.payments.acceptedPaymentMethods,
			default_payment_method: MANUAL_BRAND.payments.defaultPaymentMethod,
			default_payment_terms: MANUAL_BRAND.payments.defaultPaymentTerms
		})
		.select('id')
		.single();
	if (bErr || !brand) {
		console.error('✖ manual brand insert:', bErr);
		process.exit(1);
	}

	// 2. brand_sales_tax_rates
	const taxRows = MANUAL_BRAND.taxRates.map((r) => ({
		brand_id: brand.id,
		state_code: r.state,
		rate: r.rate,
		tax_type: r.type
	}));
	if (taxRows.length > 0) {
		const { error } = await supa.from('brand_sales_tax_rates').insert(taxRows);
		if (error) {
			console.error('✖ brand_sales_tax_rates insert:', error);
			process.exit(1);
		}
	}

	// 3. brand_shipping_methods + default link
	let defaultShippingId: string | null = null;
	for (const m of MANUAL_BRAND.shippingMethods) {
		const { data: row, error } = await supa
			.from('brand_shipping_methods')
			.insert({
				brand_id: brand.id,
				name: m.name,
				cost_type: m.costType,
				cost_amount: m.costAmount,
				delivery_window: m.deliveryWindow
			})
			.select('id')
			.single();
		if (error || !row) {
			console.error(`✖ brand shipping method ${m.name}:`, error);
			process.exit(1);
		}
		const isDefault = (m as { isDefault?: boolean }).isDefault === true;
		if (isDefault) defaultShippingId = row.id;
	}
	if (defaultShippingId) {
		const { error } = await supa
			.from('brands')
			.update({ default_shipping_method_id: defaultShippingId })
			.eq('id', brand.id);
		if (error) {
			console.error('✖ brand default_shipping_method_id:', error);
			process.exit(1);
		}
	}

	// 4. Products + variants under the manual brand. Reuse the rep org's
	// auto-created Resort season so styles land somewhere obvious.
	const { data: seasons } = await supa
		.from('seasons')
		.select('id, name')
		.eq('organization_id', ownerOrgId);
	const resortSeason = (seasons ?? []).find((s) => s.name === 'Resort');
	if (!resortSeason) {
		console.error('✖ manual brand: Resort season not found on owner org');
		process.exit(1);
	}

	const productRows = MANUAL_BRAND.products.map((p) => ({
		organization_id: ownerOrgId,
		brand_id: brand.id,
		season_id: resortSeason.id,
		product_year: 2026,
		style_number: p.style,
		name: p.name,
		description: p.desc,
		wholesale_price: p.wholesale,
		retail_price: p.retail,
		category: 'Resort',
		subcategory: p.subcat,
		is_active: true,
		ats: true
	}));
	const { data: prodInserted, error: pErr } = await supa
		.from('products')
		.insert(productRows)
		.select('id, style_number');
	if (pErr || !prodInserted) {
		console.error('✖ manual brand products:', pErr);
		process.exit(1);
	}

	const variantRows: Array<{
		product_id: string;
		size: string;
		sku: string;
		stock_qty: number;
		stock_threshold: number;
		is_active: boolean;
	}> = [];
	for (const row of prodInserted) {
		for (const size of SIZES) {
			variantRows.push({
				product_id: row.id,
				size,
				sku: `${row.style_number}-${size}`,
				stock_qty: 25 + (hashString(row.style_number + size) % 60),
				stock_threshold: 5,
				is_active: true
			});
		}
	}
	const { data: vInserted, error: vErr } = await supa
		.from('product_variants')
		.insert(variantRows)
		.select('id, product_id, size');
	if (vErr || !vInserted) {
		console.error('✖ manual brand variants:', vErr);
		process.exit(1);
	}

	const productMap = new Map<string, { productId: string; variants: Map<string, string> }>();
	const productIdToStyle = new Map(prodInserted.map((r) => [r.id, r.style_number]));
	for (const p of prodInserted) {
		productMap.set(p.style_number, { productId: p.id, variants: new Map() });
	}
	for (const v of vInserted) {
		const style = productIdToStyle.get(v.product_id)!;
		productMap.get(style)!.variants.set(v.size, v.id);
	}

	log(
		`manual brand "${MANUAL_BRAND.name}" on ${MANUAL_BRAND.ownerOrgName} (${prodInserted.length} products, ${vInserted.length} variants)`
	);
	return { brandId: brand.id, productMap };
}

// Per-state US sales-tax rates for orgs that have US sales tax enabled.
// Origin-based rates are simpler to demo; destination-based rates would
// require a much fuller table to be useful.
const ORG_SALES_TAX_RATES: ReadonlyArray<{
	orgName: string;
	rates: ReadonlyArray<{ state: string; rate: number; type: 'origin' | 'destination' }>;
}> = [
	{
		orgName: 'Elise Varga',
		rates: [
			{ state: 'NY', rate: 8.875, type: 'destination' },
			{ state: 'CA', rate: 9.5, type: 'destination' },
			{ state: 'TX', rate: 8.25, type: 'destination' },
			{ state: 'IL', rate: 10.25, type: 'destination' },
			{ state: 'MA', rate: 6.25, type: 'destination' },
			{ state: 'CO', rate: 8.81, type: 'destination' }
		]
	}
];

async function seedOrgSalesTaxRates(orgIds: Map<string, string>): Promise<void> {
	const rows: Array<{
		organization_id: string;
		state_code: string;
		rate: number;
		tax_type: 'origin' | 'destination';
	}> = [];
	for (const o of ORG_SALES_TAX_RATES) {
		const orgId = orgIds.get(o.orgName)!;
		for (const r of o.rates) {
			rows.push({
				organization_id: orgId,
				state_code: r.state,
				rate: r.rate,
				tax_type: r.type
			});
		}
	}
	if (rows.length === 0) return;
	const { error } = await supa.from('organization_sales_tax_rates').insert(rows);
	if (error) {
		console.error('✖ organization_sales_tax_rates insert:', error);
		process.exit(1);
	}
	log(`${rows.length} org sales-tax rates inserted`);
}

// Three methods per org so the picker has variety. Ground is the default
// (linked back via organizations.default_shipping_method_id).
const ORG_SHIPPING_METHODS: ReadonlyArray<{
	orgName: string;
	methods: ReadonlyArray<{
		name: string;
		costType: 'flat' | 'calculated' | 'free';
		costAmount: number | null;
		deliveryWindow: string | null;
		isDefault?: boolean;
	}>;
}> = [
	{
		orgName: 'Elise Varga',
		methods: [
			{
				name: 'Ground',
				costType: 'flat',
				costAmount: 18,
				deliveryWindow: '5–7 business days',
				isDefault: true
			},
			{ name: 'Express', costType: 'flat', costAmount: 42, deliveryWindow: '2 business days' },
			{
				name: 'Free over $2,500',
				costType: 'free',
				costAmount: null,
				deliveryWindow: '5–7 business days'
			}
		]
	},
	{
		orgName: 'SH Showroom',
		methods: [
			{
				name: 'Ground',
				costType: 'flat',
				costAmount: 15,
				deliveryWindow: '5–7 business days',
				isDefault: true
			},
			{ name: 'Express', costType: 'flat', costAmount: 38, deliveryWindow: '2 business days' }
		]
	},
	{
		orgName: 'Lauren Mackey',
		methods: [
			{
				name: 'Ground',
				costType: 'flat',
				costAmount: 16,
				deliveryWindow: '5–7 business days',
				isDefault: true
			},
			{ name: 'Local pickup', costType: 'free', costAmount: null, deliveryWindow: 'Same day' }
		]
	}
];

async function seedOrgShippingMethods(
	orgIds: Map<string, string>
): Promise<Map<string, Map<string, string>>> {
	const byOrgAndName = new Map<string, Map<string, string>>();
	for (const o of ORG_SHIPPING_METHODS) {
		const orgId = orgIds.get(o.orgName)!;
		const methodMap = new Map<string, string>();
		let defaultId: string | null = null;
		for (const m of o.methods) {
			const { data, error } = await supa
				.from('organization_shipping_methods')
				.insert({
					organization_id: orgId,
					name: m.name,
					cost_type: m.costType,
					cost_amount: m.costAmount,
					delivery_window: m.deliveryWindow
				})
				.select('id')
				.single();
			if (error || !data) {
				console.error(`✖ shipping method ${o.orgName}/${m.name}:`, error);
				process.exit(1);
			}
			methodMap.set(m.name, data.id);
			if (m.isDefault) defaultId = data.id;
		}
		byOrgAndName.set(o.orgName, methodMap);
		if (defaultId) {
			const { error: updErr } = await supa
				.from('organizations')
				.update({ default_shipping_method_id: defaultId })
				.eq('id', orgId);
			if (updErr) {
				console.error(`✖ default_shipping_method_id ${o.orgName}:`, updErr);
				process.exit(1);
			}
		}
		log(`${o.methods.length} shipping methods on ${o.orgName}`);
	}
	return byOrgAndName;
}

async function seedShows(orgIds: Map<string, string>): Promise<void> {
	const showIdByKey = new Map<string, string>();
	for (const s of SHOWS) {
		const orgId = orgIds.get(s.orgName)!;
		const key = `${s.orgName}::${s.showName}`;
		let showId = showIdByKey.get(key);
		if (!showId) {
			const { data, error } = await supa
				.from('shows')
				.insert({ organization_id: orgId, name: s.showName, is_active: true })
				.select('id')
				.single();
			await mustInsert(`show ${s.showName}`, { data, error });
			showId = data!.id;
			showIdByKey.set(key, showId);
		}
		const { error: sdErr } = await supa.from('show_dates').insert({
			organization_id: orgId,
			show_id: showId,
			year: s.year,
			month: s.month,
			city: s.city,
			state: s.state,
			venue: s.venue
		});
		if (sdErr) {
			console.error(`✖ show_date ${s.showName} ${s.year}/${s.month}:`, sdErr);
			process.exit(1);
		}
		log(`show ${s.orgName}/${s.showName} ${s.year}-${String(s.month).padStart(2, '0')}`);
	}
}

// Per-member territory assignments. Org owners (admins) are attached to
// every default territory in their org — admins typically have full coverage.
// Sales reps get a realistic subset (e.g. Maya covers Northeast + Southeast).
async function seedMemberTerritories(
	orgIds: Map<string, string>,
	memberIds: Map<string, string>
): Promise<void> {
	const territoriesByOrg = new Map<string, Map<string, string>>();
	for (const o of ORGS) {
		const orgId = orgIds.get(o.name)!;
		const { data: tlist, error } = await supa
			.from('territories')
			.select('id, name')
			.eq('organization_id', orgId);
		if (error) {
			console.error(`✖ territories fetch ${o.name}:`, error);
			process.exit(1);
		}
		const map = new Map((tlist ?? []).map((t) => [t.name as string, t.id as string]));
		territoriesByOrg.set(o.name, map);
	}

	const assignments: Array<{ orgName: string; email: string; territoryNames: string[] }> = [
		// Admin owners cover every default territory.
		{
			orgName: 'SH Showroom',
			email: 'sofia@sofiahernandez.co',
			territoryNames: ['Northeast', 'Southeast', 'Midwest', 'West Coast']
		},
		{
			orgName: 'Lauren Mackey',
			email: 'lauren@laurenmackey.co',
			territoryNames: ['Northeast', 'Southeast', 'Midwest', 'West Coast']
		},
		{
			orgName: 'Elise Varga',
			email: 'hello@elisevarga.com',
			territoryNames: ['Northeast', 'Southeast', 'Midwest', 'West Coast']
		},
		// Maya (sales) covers a subset.
		{
			orgName: 'SH Showroom',
			email: 'maya@sofiahernandez.co',
			territoryNames: ['Northeast', 'Southeast']
		},
		// Noor (Elise Varga's second admin) covers all (admins get full view).
		{
			orgName: 'Elise Varga',
			email: 'noor@elisevarga.com',
			territoryNames: ['Northeast', 'Southeast', 'Midwest', 'West Coast']
		}
	];

	const rows: Array<{ organization_member_id: string; territory_id: string }> = [];
	for (const a of assignments) {
		const memberId = memberIds.get(`${a.orgName}::${a.email}`);
		const tmap = territoriesByOrg.get(a.orgName);
		if (!memberId || !tmap) continue;
		for (const name of a.territoryNames) {
			const tid = tmap.get(name);
			if (tid) rows.push({ organization_member_id: memberId, territory_id: tid });
		}
	}
	if (rows.length === 0) return;
	const { error } = await supa.from('member_territories').insert(rows);
	if (error) {
		console.error('✖ member_territories insert:', error);
		process.exit(1);
	}
	log(`${rows.length} member-territory assignments`);
}

// Attach rep-side users to each org_connection so the brand can see them as
// "connection members" and the connection-driven UI on /connections/* has data.
// Pattern: rep org owner is always attached with manages_others=true; extras
// attach where they exist in the rep org.
async function seedConnectionMembers(
	orgIds: Map<string, string>,
	userIds: Map<string, string>
): Promise<void> {
	const { data: connections, error: cErr } = await supa
		.from('org_connections')
		.select('id, rep_org_id');
	if (cErr || !connections) {
		console.error('✖ org_connections fetch:', cErr);
		process.exit(1);
	}

	const repOrgMembers: Record<string, Array<{ email: string; managesOthers: boolean }>> = {
		'SH Showroom': [
			{ email: 'sofia@sofiahernandez.co', managesOthers: true },
			{ email: 'maya@sofiahernandez.co', managesOthers: false }
		],
		'Lauren Mackey': [{ email: 'lauren@laurenmackey.co', managesOthers: true }]
	};

	// Reverse-map org id → name so we don't need an embedded select.
	const nameByOrgId = new Map<string, string>();
	for (const [name, id] of orgIds) nameByOrgId.set(id, name);

	const rows: Array<{
		org_connection_id: string;
		profile_id: string;
		manages_others: boolean;
	}> = [];
	for (const c of connections as Array<{ id: string; rep_org_id: string }>) {
		const repOrgName = nameByOrgId.get(c.rep_org_id) ?? '';
		const members = repOrgMembers[repOrgName] ?? [];
		for (const m of members) {
			const profileId = userIds.get(m.email);
			if (!profileId) continue;
			rows.push({
				org_connection_id: c.id,
				profile_id: profileId,
				manages_others: m.managesOthers
			});
		}
	}
	if (rows.length === 0) return;
	const { error } = await supa.from('connection_members').insert(rows);
	if (error) {
		console.error('✖ connection_members insert:', error);
		process.exit(1);
	}
	log(`${rows.length} connection-member assignments`);
}

async function seedConnections(
	orgIds: Map<string, string>,
	userIds: Map<string, string>
): Promise<void> {
	for (const c of CONNECTIONS) {
		const { error } = await supa.from('org_connections').insert({
			rep_org_id: orgIds.get(c.repOrg)!,
			brand_org_id: orgIds.get(c.brandOrg)!,
			status: 'active',
			commission_rate: c.commissionRate,
			connected_at: new Date().toISOString(),
			requested_by: userIds.get(ORGS.find((o) => o.name === c.repOrg)!.ownerEmail)!,
			approved_by: userIds.get(ORGS.find((o) => o.name === c.brandOrg)!.ownerEmail)!
		});
		if (error) {
			console.error(`✖ connection ${c.repOrg} ↔ ${c.brandOrg}:`, error);
			process.exit(1);
		}
		log(`connection ${c.repOrg} ↔ ${c.brandOrg} active`);
	}
}

// ─── Phase 2: data ──────────────────────────────────────────────────────────

// Per-account override matrix. Keyed by business name so the markdown
// can list exactly which accounts carry overrides. The intent is to give
// list pages a healthy mix of "uses default" and "has override" rows.
const ACCOUNT_OVERRIDES: Record<
	string,
	{
		commissionRateOverride?: number;
		orderMinimumOverride?: number;
		paymentTerms?: string;
		paymentPreference?: string;
		shippingMethod?: string;
	}
> = {
	'Tidepool 42': { commissionRateOverride: 15, paymentTerms: 'net_60' },
	'Fernwick Dry Goods': { commissionRateOverride: 8 },
	Quillwren: { orderMinimumOverride: 1500, shippingMethod: 'Express' },
	'The Fog Index': { paymentTerms: 'net_15' },
	'Ninebark Mercantile': { commissionRateOverride: 14, orderMinimumOverride: 1000 },
	'Maison Lumen': { paymentTerms: 'cod', paymentPreference: 'credit_card' },
	'Ember & Oak Boutique': { commissionRateOverride: 10, shippingMethod: 'Ground' },
	'Marigold Threadworks': { paymentTerms: 'net_30' },
	'Fjord Atelier': { commissionRateOverride: 13 },
	'Saltwind Supply Co': {
		commissionRateOverride: 11,
		orderMinimumOverride: 800,
		shippingMethod: 'Free over $2,500'
	}
};

async function seedAccounts(
	orgIds: Map<string, string>,
	userIds: Map<string, string>
): Promise<Map<string, string>> {
	const eliseOrgId = orgIds.get('Elise Varga')!;
	const eliseUserId = userIds.get('hello@elisevarga.com')!;
	const rows = ACCOUNTS.map((row, i) => {
		const [biz, fname, lname, city, state] = row;
		const rowNum = i + 1;
		const ov = ACCOUNT_OVERRIDES[biz] ?? {};
		return {
			organization_id: eliseOrgId,
			business_name: biz,
			contact_first_name: fname,
			contact_last_name: lname,
			contact_email: `${fname.replace(/\s+/g, '').toLowerCase()}@${sanitize(biz)}.com`,
			phone: `(${String(200 + rowNum).padStart(3, '0')}) 555-${String((rowNum * 17) % 10000).padStart(4, '0')}`,
			address_line1: `${100 + ((hashString(biz) % 900) + 1)} Main St`,
			city,
			state,
			zip: String((hashString(biz) % 90000) + 10000).padStart(5, '0'),
			country: 'US',
			website: `https://${sanitize(biz)}.com`,
			payment_preference: ov.paymentPreference ?? 'credit_card',
			payment_terms: ov.paymentTerms ?? null,
			shipping_method: ov.shippingMethod ?? null,
			commission_rate_override: ov.commissionRateOverride ?? null,
			order_minimum_override: ov.orderMinimumOverride ?? null,
			is_active: true,
			created_at: isoTime(-(rowNum - 1) * (11 / 24))
		};
	});
	const { data, error } = await supa
		.from('accounts')
		.insert(rows)
		.select('id, business_name, contact_email, phone, address_line1, city, state, zip, country');
	await mustInsert('accounts', { data, error });
	log(`${data!.length} accounts inserted`);
	const byBiz = new Map<string, string>();
	for (const a of data!) byBiz.set(a.business_name, a.id);

	// One default Primary location per account, mirroring the migration backfill
	// pattern. New accounts inserted post-migration don't get auto-located, so
	// the seed has to do it explicitly or the order flow can't pick a ship-to.
	const locationRows = data!.map((a, i) => {
		const src = ACCOUNTS[i];
		const [, fname, lname] = src;
		return {
			account_id: a.id,
			organization_id: eliseOrgId,
			label: 'Primary',
			contact_first_name: fname,
			contact_last_name: lname,
			contact_email: a.contact_email,
			phone: a.phone,
			address_line1: a.address_line1,
			city: a.city,
			state: a.state,
			zip: a.zip,
			country: a.country,
			is_default: true,
			sort_order: 0
		};
	});
	const { error: locErr } = await supa.from('account_locations').insert(locationRows);
	if (locErr) {
		console.error('✖ account_locations insert:', locErr);
		process.exit(1);
	}
	log(`${locationRows.length} account locations inserted`);

	// Each account's contact gets a buyer-portal invite. role = buyer_admin
	// since the first invitee per account becomes its admin (mirrors
	// /api/buyer-invite/send logic).
	const inviteRows = data!.map((a) => ({
		account_id: a.id,
		organization_id: eliseOrgId,
		email: a.contact_email,
		invited_by: eliseUserId,
		role: 'buyer_admin'
	}));
	const { error: invErr } = await supa.from('buyer_invitations').insert(inviteRows);
	if (invErr) {
		console.error('✖ buyer_invitations insert:', invErr);
		process.exit(1);
	}
	log(`${inviteRows.length} buyer invitations sent`);

	return byBiz;
}

async function seedProductsAndVariants(
	orgIds: Map<string, string>
): Promise<Map<string, { productId: string; variants: Map<string, string> }>> {
	const eliseOrgId = orgIds.get('Elise Varga')!;
	// Look up the auto-created self-brand and the org's seasons.
	const { data: brand, error: brandErr } = await supa
		.from('brands')
		.select('id')
		.eq('organization_id', eliseOrgId)
		.eq('is_self_brand', true)
		.single();
	if (brandErr || !brand) {
		console.error('✖ Elise Varga self-brand not found:', brandErr);
		process.exit(1);
	}
	const { data: seasons } = await supa
		.from('seasons')
		.select('id, name')
		.eq('organization_id', eliseOrgId);
	const seasonIdByName = new Map((seasons ?? []).map((s) => [s.name, s.id]));

	// Cycle a small color palette so variants render with variety. (color
	// lives on product_variants, not products.)
	const PRODUCT_COLOR_CYCLE = ['Ivory', 'Black', 'Sand', 'Sage', 'Navy', 'Rose'];
	const colorByStyleNumber = new Map(
		PRODUCTS.map((p, i) => [p.style, PRODUCT_COLOR_CYCLE[i % PRODUCT_COLOR_CYCLE.length]])
	);
	const productRows = PRODUCTS.map((p, i) => ({
		organization_id: eliseOrgId,
		brand_id: brand.id,
		season_id: seasonIdByName.get(p.season)!,
		product_year: 2026,
		style_number: p.style,
		name: p.name,
		description: p.desc,
		wholesale_price: p.wholesale,
		retail_price: p.retail,
		category: 'Tops',
		subcategory: p.subcat,
		is_active: true,
		// ATS on every other style — enough to demo the badge filter without
		// pretending the whole linesheet is in stock.
		ats: i % 2 === 0
	}));
	const { data: inserted, error: pErr } = await supa
		.from('products')
		.insert(productRows)
		.select('id, style_number');
	await mustInsert('products', { data: inserted, error: pErr });
	log(`${inserted!.length} products inserted`);

	const byStyle = new Map<string, { productId: string; variants: Map<string, string> }>();
	const variantRows: Array<{
		product_id: string;
		size: string;
		color: string;
		sku: string;
		stock_qty: number;
		stock_threshold: number;
		price_override: number | null;
		is_active: boolean;
	}> = [];
	for (const row of inserted!) {
		byStyle.set(row.style_number, { productId: row.id, variants: new Map() });
		for (const size of SIZES) {
			// Sprinkle a price_override on ~10% of variants (XL of every-third
			// product) so the override badge shows on variant rows.
			const isOverride = size === 'XL' && hashString(row.style_number) % 3 === 0;
			variantRows.push({
				product_id: row.id,
				size,
				color: colorByStyleNumber.get(row.style_number) ?? 'Ivory',
				sku: `${row.style_number}-${size}`,
				stock_qty: 20 + (hashString(row.style_number + size) % 80),
				stock_threshold: 5,
				price_override: isOverride ? 158 : null,
				is_active: true
			});
		}
	}
	const { data: vInserted, error: vErr } = await supa
		.from('product_variants')
		.insert(variantRows)
		.select('id, product_id, size');
	await mustInsert('variants', { data: vInserted, error: vErr });
	log(`${vInserted!.length} variants inserted`);

	// Re-index variants back into byStyle map for order-line lookup.
	const productIdToStyle = new Map(inserted!.map((r) => [r.id, r.style_number]));
	for (const v of vInserted!) {
		const style = productIdToStyle.get(v.product_id)!;
		byStyle.get(style)!.variants.set(v.size, v.id);
	}
	return byStyle;
}

async function seedOrders(
	orgIds: Map<string, string>,
	userIds: Map<string, string>,
	accountIds: Map<string, string>,
	productMap: Map<string, { productId: string; variants: Map<string, string> }>
): Promise<void> {
	const eliseOrgId = orgIds.get('Elise Varga')!;
	const { data: brand } = await supa
		.from('brands')
		.select('id')
		.eq('organization_id', eliseOrgId)
		.eq('is_self_brand', true)
		.single();
	const { data: seasons } = await supa
		.from('seasons')
		.select('id, name')
		.eq('organization_id', eliseOrgId);
	const seasonIdByName = new Map((seasons ?? []).map((s) => [s.name, s.id]));

	// Default brand_terms row for the self-brand. Used as terms_id snapshot on
	// submitted+ orders.
	const { data: terms } = await supa
		.from('brand_terms')
		.select('id')
		.eq('brand_id', brand!.id)
		.eq('is_current', true)
		.maybeSingle();
	const termsId = terms?.id ?? null;

	// Resolve each account's default ship-to location so the order's
	// location_id (and bill_to_location_id) carries the correct ref.
	const accountLocationByAccount = new Map<string, string>();
	const { data: locs } = await supa
		.from('account_locations')
		.select('id, account_id, is_default')
		.eq('organization_id', eliseOrgId);
	for (const l of locs ?? []) {
		if (l.is_default) accountLocationByAccount.set(l.account_id, l.id);
	}

	// Per-rep-org: map source-type name → id, and show name → { show_id, show_date_id }.
	const sourceIds = new Map<string, Map<string, string>>();
	const showIds = new Map<string, Map<string, { show_id: string; show_date_id: string }>>();
	for (const orgName of ['SH Showroom', 'Lauren Mackey']) {
		const orgId = orgIds.get(orgName)!;
		const { data: sts } = await supa
			.from('source_types')
			.select('id, name')
			.eq('organization_id', orgId);
		const m = new Map<string, string>();
		for (const s of sts ?? []) m.set(s.name, s.id);
		sourceIds.set(orgName, m);

		const { data: sds } = await supa
			.from('show_dates')
			.select('id, show_id, shows!inner(name)')
			.eq('organization_id', orgId);
		const sm = new Map<string, { show_id: string; show_date_id: string }>();
		for (const sd of sds ?? []) {
			const show = Array.isArray(sd.shows) ? sd.shows[0] : sd.shows;
			if (show?.name) sm.set(show.name, { show_id: sd.show_id, show_date_id: sd.id });
		}
		showIds.set(orgName, sm);
	}

	let orderCount = 0;
	let lineCount = 0;
	let orderIndex = 0;
	const FALLBACK_NOTES = [
		'Buyer requested swap if FA26-310 stock runs low — call before substituting.',
		'Hold first delivery until 9/15 per buyer request.',
		'Includes a 12-pack rep sample order; do not bill twice.',
		'Buyer noted past late shipment from this account; flag with logistics.'
	];
	for (const o of ORDERS) {
		const repOrgId = orgIds.get(o.repOrgName)!;
		const repUserId = userIds.get(o.repEmail)!;
		const accountId = accountIds.get(o.accountBiz);
		if (!accountId) {
			console.error(`✖ order: account not found: ${o.accountBiz}`);
			process.exit(1);
		}
		const seasonId = seasonIdByName.get(o.season)!;

		let sourceTypeId: string | null = null;
		let showId: string | null = null;
		let showDateId: string | null = null;
		if (o.source.kind === 'source') {
			sourceTypeId = sourceIds.get(o.repOrgName)!.get(o.source.name)!;
		} else {
			const entry = showIds.get(o.repOrgName)!.get(o.source.showName)!;
			showId = entry.show_id;
			showDateId = entry.show_date_id;
		}

		// Compute order total client-side from line items so we can set
		// shipped_amount on the same insert. Mirrors what the recalc_order_total
		// trigger does after order_lines are inserted.
		const computedTotal = o.lines.reduce((sum, l) => {
			const p = PRODUCTS.find((pp) => pp.style === l.style);
			return sum + (p ? l.qty * p.wholesale : 0);
		}, 0);
		const isShipped = o.status === 'shipped' || o.status === 'delivered';
		const isSubmitted = o.status !== 'cancelled';
		const locationId = accountLocationByAccount.get(accountId) ?? null;

		const row = {
			organization_id: repOrgId,
			brand_id: brand!.id,
			account_id: accountId,
			location_id: locationId,
			bill_to_location_id: null,
			season_id: seasonId,
			order_year: 2026,
			order_type: 'order',
			status: o.status,
			source_type_id: sourceTypeId,
			show_id: showId,
			show_date_id: showDateId,
			rep_user_id: repUserId,
			created_by: repUserId,
			start_ship_date: isoDate(o.startOffset),
			expected_ship_date: isoDate(o.expectedOffset),
			submitted_at: isoTime(o.submittedOffset),
			confirmed_at: o.confirmedOffset != null ? isoTime(o.confirmedOffset) : null,
			shipped_at: o.shippedOffset != null ? isoTime(o.shippedOffset) : null,
			delivered_at: o.deliveredOffset != null ? isoTime(o.deliveredOffset) : null,
			cancelled_at: o.cancelledOffset != null ? isoTime(o.cancelledOffset) : null,
			cancelled_reason: o.cancelledReason ?? null,
			shipped_amount: isShipped ? computedTotal : null,
			notes:
				o.notes ??
				(orderIndex % 7 === 3 ? FALLBACK_NOTES[orderIndex % FALLBACK_NOTES.length] : null),
			po_number:
				o.poNumber ?? (orderIndex % 5 === 1 ? `PO-${(2604 + orderIndex * 13).toString()}` : null),
			payment_terms: o.paymentTerms ?? 'net_30',
			shipping_method: o.shippingMethod ?? 'Ground',
			terms_id: isSubmitted ? termsId : null,
			terms_agreed_by: isSubmitted ? repUserId : null,
			terms_agreed_at: isSubmitted ? isoTime(o.submittedOffset) : null
		};
		const { data: inserted, error: oErr } = await supa
			.from('orders')
			.insert(row)
			.select('id, order_number')
			.single();
		if (oErr || !inserted) {
			console.error(`✖ order insert (${o.accountBiz} / ${o.season} / ${o.status}):`, oErr);
			process.exit(1);
		}
		orderCount++;

		const lineRows = o.lines.map((l, i) => {
			const prod = productMap.get(l.style);
			if (!prod) {
				console.error(`✖ product not found: ${l.style}`);
				process.exit(1);
			}
			const variantId = prod.variants.get(l.size);
			if (!variantId) {
				console.error(`✖ variant not found: ${l.style} ${l.size}`);
				process.exit(1);
			}
			const p = PRODUCTS.find((pp) => pp.style === l.style)!;
			return {
				order_id: inserted.id,
				product_id: prod.productId,
				variant_id: variantId,
				style_number: l.style,
				description: p.name,
				size: l.size,
				qty: l.qty,
				unit_price: p.wholesale,
				sort_order: i
			};
		});
		const { error: lErr } = await supa.from('order_lines').insert(lineRows);
		if (lErr) {
			console.error(`✖ order_lines for ${inserted.order_number}:`, lErr);
			process.exit(1);
		}
		lineCount += lineRows.length;
		orderIndex++;
	}
	log(`${orderCount} orders + ${lineCount} lines inserted`);
}

// Accept 5 of the seeded buyer_invitations: create auth users, link them via
// account_users, and stamp the matching invitation with accepted_at. One of
// the 5 lands as `buyer_admin` so the team-management flows have data.
const ACCEPTED_BUYERS: ReadonlyArray<{
	accountBiz: string;
	displayName: string;
	role: 'buyer' | 'buyer_admin';
}> = [
	{ accountBiz: 'Tidepool 42', displayName: 'Katie Donovan', role: 'buyer_admin' },
	{ accountBiz: 'Fernwick Dry Goods', displayName: 'Ashley Pierce', role: 'buyer' },
	{ accountBiz: 'Quillwren', displayName: 'Samantha Ruiz', role: 'buyer' },
	{ accountBiz: 'The Fog Index', displayName: 'Priya Sharma', role: 'buyer' },
	{ accountBiz: 'Ninebark Mercantile', displayName: 'Megan Caldwell', role: 'buyer' }
];

async function seedAcceptedBuyers(
	orgIds: Map<string, string>,
	accountIds: Map<string, string>,
	productMap: Map<string, { productId: string; variants: Map<string, string> }>
): Promise<void> {
	const eliseOrgId = orgIds.get('Elise Varga')!;
	const eliseUserId = (
		await supa
			.from('organization_members')
			.select('profile_id')
			.eq('organization_id', eliseOrgId)
			.eq('role', 'admin')
			.order('created_at', { ascending: true })
			.limit(1)
			.single()
	).data?.profile_id as string | undefined;

	let accepted = 0;
	let firstBuyerProfileId: string | null = null;
	for (const b of ACCEPTED_BUYERS) {
		const accountId = accountIds.get(b.accountBiz);
		if (!accountId) {
			console.error(`✖ accepted buyer: account not found: ${b.accountBiz}`);
			process.exit(1);
		}
		// The invitation row holds the canonical email — pull it so we stay
		// consistent with seedAccounts.
		const { data: invite, error: invFetchErr } = await supa
			.from('buyer_invitations')
			.select('id, email')
			.eq('account_id', accountId)
			.eq('organization_id', eliseOrgId)
			.maybeSingle();
		if (invFetchErr || !invite) {
			console.error(`✖ buyer invite missing for ${b.accountBiz}:`, invFetchErr);
			process.exit(1);
		}

		const { data: authData, error: authErr } = await supa.auth.admin.createUser({
			email: invite.email,
			password: DEV_PASSWORD,
			email_confirm: true,
			user_metadata: { display_name: b.displayName }
		});
		if (authErr || !authData.user) {
			console.error(`✖ buyer auth user ${invite.email}:`, authErr);
			process.exit(1);
		}
		const profileId = authData.user.id;
		if (firstBuyerProfileId == null) firstBuyerProfileId = profileId;

		await supa.from('profiles').update({ display_name: b.displayName }).eq('id', profileId);

		const { error: auErr } = await supa.from('account_users').insert({
			account_id: accountId,
			profile_id: profileId,
			role: b.role,
			invited_by: eliseUserId ?? null,
			accepted_at: new Date().toISOString()
		});
		if (auErr) {
			console.error(`✖ account_users insert ${b.accountBiz}:`, auErr);
			process.exit(1);
		}

		await supa
			.from('buyer_invitations')
			.update({ accepted_at: new Date().toISOString(), role: b.role })
			.eq('id', invite.id);

		accepted++;
	}
	log(`${accepted} buyers accepted invitations`);

	// Cart for the first accepted buyer (Tidepool 42 / Katie). Pick four
	// distinct products so /shop and the cart-driven flows have data.
	if (firstBuyerProfileId) {
		const cartStyles = ['SP26-101', 'SP26-103', 'SU26-202', 'FA26-302'];
		const rows: Array<{ profile_id: string; product_id: string }> = [];
		for (const style of cartStyles) {
			const product = productMap.get(style);
			if (product) rows.push({ profile_id: firstBuyerProfileId, product_id: product.productId });
		}
		if (rows.length > 0) {
			const { error: cErr } = await supa.from('cart_items').insert(rows);
			if (cErr) {
				console.error('✖ cart_items insert:', cErr);
				process.exit(1);
			}
			log(`${rows.length} cart items seeded for first buyer`);
		}
	}
}

async function seedBrandProfile(
	orgIds: Map<string, string>,
	userIds: Map<string, string>
): Promise<void> {
	const eliseOrgId = orgIds.get('Elise Varga')!;
	const eliseUserId = userIds.get('hello@elisevarga.com')!;

	// Org-level identity (name, address, time_zone, currency, onboarding) is
	// already set in seedOrgs; commerce defaults in seedOrgCommerceDefaults.
	// This function only touches brand-scoped data: self-brand profile fields
	// and the brand_terms row.
	const { data: brand, error: brandErr } = await supa
		.from('brands')
		.update({
			website: 'https://elisevarga.com',
			contact_email: 'hello@elisevarga.com',
			contact_phone: '(212) 555-0184'
		})
		.eq('organization_id', eliseOrgId)
		.eq('is_self_brand', true)
		.select('id')
		.single();
	if (brandErr || !brand) {
		console.error('✖ Elise Varga self-brand update:', brandErr);
		process.exit(1);
	}
	log('Elise Varga org profile + self-brand profile set');

	// Brand-level T&Cs. is_current = true; the demote_prior trigger handles
	// any future versioning automatically.
	const { error: termsErr } = await supa.from('brand_terms').insert({
		brand_id: brand.id,
		organization_id: eliseOrgId,
		version: 1,
		title: 'Wholesale Terms & Conditions',
		body: 'Net-30 from invoice date. Past-due balances accrue 1.5% interest per month. Cancellations or changes within 14 days of the ship window may incur a restock fee equal to 15% of the affected line items. Damaged or short-shipped items must be reported within 7 days of delivery. By submitting this order, you agree to our standard wholesale terms.',
		is_current: true,
		created_by: eliseUserId
	});
	if (termsErr) {
		console.error('✖ Elise Varga brand_terms insert:', termsErr);
		process.exit(1);
	}
	log('Elise Varga brand terms inserted');
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

async function main() {
	const started = Date.now();
	console.log('🌱 Seeding Threadline demo data…');

	console.log('\n◆ Phase 1: prerequisites');
	const userIds = await seedUsers();
	const orgIds = await seedOrgs();
	const memberIds = await seedMemberships(userIds, orgIds);
	await seedOrgCommerceDefaults(orgIds);
	await seedOrgSalesTaxRates(orgIds);
	await seedOrgShippingMethods(orgIds);
	await seedShows(orgIds);
	await seedConnections(orgIds, userIds);
	await seedConnectionMembers(orgIds, userIds);
	await seedMemberTerritories(orgIds, memberIds);
	await seedBrandProfile(orgIds, userIds);

	console.log('\n◆ Phase 2: accounts');
	const accountIds = await seedAccounts(orgIds, userIds);

	console.log('\n◆ Phase 3: products & variants');
	const productMap = await seedProductsAndVariants(orgIds);
	await seedManualBrand(orgIds);

	console.log('\n◆ Phase 4: orders & lines');
	await seedOrders(orgIds, userIds, accountIds, productMap);

	console.log('\n◆ Phase 5: buyers & cart');
	await seedAcceptedBuyers(orgIds, accountIds, productMap);

	const secs = ((Date.now() - started) / 1000).toFixed(1);
	console.log(`\n✅ Done in ${secs}s.`);
	console.log(`   Dev password (all seeded users incl. buyers): ${DEV_PASSWORD}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
