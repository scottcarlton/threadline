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

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
	{ email: 'hello@elisevarga.com', displayName: 'Elise Varga' },
	{ email: 'sofia@sofiahernandez.co', displayName: 'Sofia Hernandez' },
	{ email: 'lauren@laurenmackey.co', displayName: 'Lauren Mackey' }
] as const;

const ORGS = [
	{
		name: 'Elise Varga',
		slug: 'elise-varga',
		orgType: 'brand',
		ownerEmail: 'hello@elisevarga.com'
	},
	{
		name: 'SH Showroom',
		slug: 'sh-showroom',
		orgType: 'rep',
		ownerEmail: 'sofia@sofiahernandez.co'
	},
	{
		name: 'Lauren Mackey',
		slug: 'lauren-mackey',
		orgType: 'rep',
		ownerEmail: 'lauren@laurenmackey.co'
	}
] as const;

const CONNECTIONS = [
	{ repOrg: 'SH Showroom', brandOrg: 'Elise Varga' },
	{ repOrg: 'Lauren Mackey', brandOrg: 'Elise Varga' }
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

type OrderStatus = 'submitted' | 'confirmed' | 'shipped' | 'delivered';
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
		await supa.from('profiles').update({ display_name: u.displayName }).eq('id', data.user.id);
		log(`user ${u.email} → ${data.user.id}`);
	}
	return byEmail;
}

async function seedOrgs(userIds: Map<string, string>): Promise<Map<string, string>> {
	const byName = new Map<string, string>();
	for (const o of ORGS) {
		const { data, error } = await supa
			.from('organizations')
			.insert({ name: o.name, slug: o.slug, org_type: o.orgType })
			.select('id')
			.single();
		await mustInsert(`org ${o.name}`, { data, error });
		byName.set(o.name, data!.id);
		log(`org ${o.name} → ${data!.id}`);
	}
	return byName;
}

async function seedMemberships(
	userIds: Map<string, string>,
	orgIds: Map<string, string>
): Promise<void> {
	for (const o of ORGS) {
		const { error } = await supa.from('organization_members').insert({
			organization_id: orgIds.get(o.name)!,
			profile_id: userIds.get(o.ownerEmail)!,
			role: 'admin',
			accepted_at: new Date().toISOString()
		});
		if (error) {
			console.error(`✖ membership ${o.ownerEmail} → ${o.name}:`, error);
			process.exit(1);
		}
		log(`member ${o.ownerEmail} is admin of ${o.name}`);
	}
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

async function seedConnections(
	orgIds: Map<string, string>,
	userIds: Map<string, string>
): Promise<void> {
	for (const c of CONNECTIONS) {
		const { error } = await supa.from('org_connections').insert({
			rep_org_id: orgIds.get(c.repOrg)!,
			brand_org_id: orgIds.get(c.brandOrg)!,
			status: 'active',
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

async function seedAccounts(orgIds: Map<string, string>): Promise<Map<string, string>> {
	const eliseOrgId = orgIds.get('Elise Varga')!;
	const rows = ACCOUNTS.map((row, i) => {
		const [biz, fname, lname, city, state] = row;
		const rowNum = i + 1;
		return {
			organization_id: eliseOrgId,
			business_name: biz,
			contact_first_name: fname,
			contact_last_name: lname,
			contact_email: `${fname.replace(/\s+/g, '').toLowerCase()}@${sanitize(biz)}.com`,
			phone: `(${String(200 + rowNum).padStart(3, '0')}) 555-${String((rowNum * 17) % 10000).padStart(4, '0')}`,
			city,
			state,
			zip: String((hashString(biz) % 90000) + 10000).padStart(5, '0'),
			country: 'US',
			website: `https://${sanitize(biz)}.com`,
			is_active: true,
			created_at: isoTime(-(rowNum - 1) * (11 / 24))
		};
	});
	const { data, error } = await supa.from('accounts').insert(rows).select('id, business_name');
	await mustInsert('accounts', { data, error });
	log(`${data!.length} accounts inserted`);
	const byBiz = new Map<string, string>();
	for (const a of data!) byBiz.set(a.business_name, a.id);
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

	const productRows = PRODUCTS.map((p) => ({
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
		ats: false
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
		sku: string;
		stock_qty: number;
		stock_threshold: number;
		is_active: boolean;
	}> = [];
	for (const row of inserted!) {
		byStyle.set(row.style_number, { productId: row.id, variants: new Map() });
		for (const size of SIZES) {
			variantRows.push({
				product_id: row.id,
				size,
				sku: `${row.style_number}-${size}`,
				stock_qty: 20 + (hashString(row.style_number + size) % 80),
				stock_threshold: 5,
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

		const row = {
			organization_id: repOrgId,
			brand_id: brand!.id,
			account_id: accountId,
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
			delivered_at: o.deliveredOffset != null ? isoTime(o.deliveredOffset) : null
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
	}
	log(`${orderCount} orders + ${lineCount} lines inserted`);
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

async function main() {
	const started = Date.now();
	console.log('🌱 Seeding Threadline demo data…');

	console.log('\n◆ Phase 1: prerequisites');
	const userIds = await seedUsers();
	const orgIds = await seedOrgs(userIds);
	await seedMemberships(userIds, orgIds);
	await seedShows(orgIds);
	await seedConnections(orgIds, userIds);

	console.log('\n◆ Phase 2: accounts');
	const accountIds = await seedAccounts(orgIds);

	console.log('\n◆ Phase 3: products & variants');
	const productMap = await seedProductsAndVariants(orgIds);

	console.log('\n◆ Phase 4: orders & lines');
	await seedOrders(orgIds, userIds, accountIds, productMap);

	const secs = ((Date.now() - started) / 1000).toFixed(1);
	console.log(`\n✅ Done in ${secs}s.`);
	console.log(`   Dev password for all three users: ${DEV_PASSWORD}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
