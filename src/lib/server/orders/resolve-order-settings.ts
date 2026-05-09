import type { SupabaseClient } from '@supabase/supabase-js';

// Commerce settings for an order, normalized so callers don't have to
// branch on org_type. Source-of-truth depends on the brand's owning org:
//   - org_type='brand' → reads from `organizations` and the
//     `organization_*` satellite tables (existing BO behavior)
//   - org_type='rep'   → reads from `brands` and the new `brand_*`
//     satellite tables (Phase 1 manual brand commerce)
//
// `source` is exposed on each result so call-sites that need to know
// (e.g. order numbering reads from a different table) can branch.
//
// Numeric coercions: Postgres NUMERIC comes back as string from PostgREST.
// Coerce on read so consumers can do plain math.
export type BrandCommerceSettings = {
	source: 'organization' | 'brand';
	brand_id: string;
	owner_org_id: string;

	// Order numbering / minimums
	order_number_prefix: string | null;
	order_number_pad_width: number | null;
	order_minimum_enabled: boolean;
	order_minimum_amount: number | null;
	handling_fee_amount: number;
	default_commission_rate: number;

	// Payments
	accepted_payment_methods: string[];
	default_payment_method: string | null;
	default_payment_terms: string | null;

	// Shipping
	default_shipping_method: string | null;
	default_shipping_method_id: string | null;

	// Taxes (display + general rates only — per-state rates live in the
	// satellite tables; consumers query those when needed)
	taxes_pricing_display: 'exclusive' | 'inclusive';
	taxes_us_sales_tax_enabled: boolean;
	taxes_us_general_rate: number | null;
	taxes_vat_enabled: boolean;
	taxes_vat_rate: number | null;
	taxes_gst_enabled: boolean;
	taxes_gst_rate: number | null;

	// Returns
	returns_window_days: number;
	returns_buyer_pays_shipping: boolean;
};

type BrandRow = {
	id: string;
	organization_id: string;
	// rep-side commerce columns (nullable; populated only on manual brands)
	order_number_prefix: string | null;
	order_number_pad_width: number | null;
	order_minimum_enabled: boolean | null;
	order_minimum_amount: number | string | null;
	handling_fee_amount: number | string | null;
	default_commission_rate: number | string | null;
	accepted_payment_methods: string[] | null;
	default_payment_method: string | null;
	default_payment_terms: string | null;
	default_shipping_method_id: string | null;
	taxes_pricing_display: 'exclusive' | 'inclusive' | null;
	taxes_us_sales_tax_enabled: boolean | null;
	taxes_us_general_rate: number | string | null;
	taxes_vat_enabled: boolean | null;
	taxes_vat_rate: number | string | null;
	taxes_gst_enabled: boolean | null;
	taxes_gst_rate: number | string | null;
	returns_window_days: number | null;
	returns_buyer_pays_shipping: boolean | null;
	organizations: {
		id: string;
		org_type: 'brand' | 'rep';
		// org-side commerce columns
		order_number_prefix: string | null;
		order_number_pad_width: number | null;
		order_minimum_enabled: boolean | null;
		order_minimum_amount: number | string | null;
		handling_fee_amount: number | string | null;
		default_commission_rate: number | string | null;
		accepted_payment_methods: string[] | null;
		default_payment_method: string | null;
		default_payment_terms: string | null;
		default_shipping_method: string | null;
		default_shipping_method_id: string | null;
		taxes_pricing_display: 'exclusive' | 'inclusive' | null;
		taxes_us_sales_tax_enabled: boolean | null;
		taxes_us_general_rate: number | string | null;
		taxes_vat_enabled: boolean | null;
		taxes_vat_rate: number | string | null;
		taxes_gst_enabled: boolean | null;
		taxes_gst_rate: number | string | null;
		returns_window_days: number | null;
		returns_buyer_pays_shipping: boolean | null;
	} | null;
};

const BRAND_SELECT = `
	id, organization_id,
	order_number_prefix, order_number_pad_width,
	order_minimum_enabled, order_minimum_amount, handling_fee_amount,
	default_commission_rate,
	accepted_payment_methods, default_payment_method, default_payment_terms,
	default_shipping_method_id,
	taxes_pricing_display, taxes_us_sales_tax_enabled, taxes_us_general_rate,
	taxes_vat_enabled, taxes_vat_rate, taxes_gst_enabled, taxes_gst_rate,
	returns_window_days, returns_buyer_pays_shipping,
	organizations(
		id, org_type,
		order_number_prefix, order_number_pad_width,
		order_minimum_enabled, order_minimum_amount, handling_fee_amount,
		default_commission_rate,
		accepted_payment_methods, default_payment_method, default_payment_terms,
		default_shipping_method, default_shipping_method_id,
		taxes_pricing_display, taxes_us_sales_tax_enabled, taxes_us_general_rate,
		taxes_vat_enabled, taxes_vat_rate, taxes_gst_enabled, taxes_gst_rate,
		returns_window_days, returns_buyer_pays_shipping
	)
`;

function num(v: number | string | null | undefined, fallback: number): number {
	if (v === null || v === undefined) return fallback;
	const n = typeof v === 'string' ? Number(v) : v;
	return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: number | string | null | undefined): number | null {
	if (v === null || v === undefined) return null;
	const n = typeof v === 'string' ? Number(v) : v;
	return Number.isFinite(n) ? n : null;
}

// Project a single row (already joined to its organization) to the
// normalized commerce-settings shape.
export function projectBrandSettings(row: BrandRow): BrandCommerceSettings {
	const org = row.organizations;
	if (!org) {
		throw new Error(`Brand ${row.id} has no joined organization row`);
	}

	if (org.org_type === 'rep') {
		// Manual brand path — read everything from the brand row, fall back to
		// safe defaults when the rep hasn't configured commerce yet.
		return {
			source: 'brand',
			brand_id: row.id,
			owner_org_id: row.organization_id,
			order_number_prefix: row.order_number_prefix,
			order_number_pad_width: row.order_number_pad_width,
			order_minimum_enabled: row.order_minimum_enabled ?? false,
			order_minimum_amount: numOrNull(row.order_minimum_amount),
			handling_fee_amount: num(row.handling_fee_amount, 0),
			default_commission_rate: num(row.default_commission_rate, 10),
			accepted_payment_methods: row.accepted_payment_methods ?? [],
			default_payment_method: row.default_payment_method,
			default_payment_terms: row.default_payment_terms,
			default_shipping_method: null,
			default_shipping_method_id: row.default_shipping_method_id,
			taxes_pricing_display: row.taxes_pricing_display ?? 'exclusive',
			taxes_us_sales_tax_enabled: row.taxes_us_sales_tax_enabled ?? false,
			taxes_us_general_rate: numOrNull(row.taxes_us_general_rate),
			taxes_vat_enabled: row.taxes_vat_enabled ?? false,
			taxes_vat_rate: numOrNull(row.taxes_vat_rate),
			taxes_gst_enabled: row.taxes_gst_enabled ?? false,
			taxes_gst_rate: numOrNull(row.taxes_gst_rate),
			returns_window_days: row.returns_window_days ?? 0,
			returns_buyer_pays_shipping: row.returns_buyer_pays_shipping ?? false
		};
	}

	// BO path — read everything from the organization row.
	return {
		source: 'organization',
		brand_id: row.id,
		owner_org_id: row.organization_id,
		order_number_prefix: org.order_number_prefix,
		order_number_pad_width: org.order_number_pad_width,
		order_minimum_enabled: org.order_minimum_enabled ?? false,
		order_minimum_amount: numOrNull(org.order_minimum_amount),
		handling_fee_amount: num(org.handling_fee_amount, 0),
		default_commission_rate: num(org.default_commission_rate, 10),
		accepted_payment_methods: org.accepted_payment_methods ?? [],
		default_payment_method: org.default_payment_method,
		default_payment_terms: org.default_payment_terms,
		default_shipping_method: org.default_shipping_method,
		default_shipping_method_id: org.default_shipping_method_id,
		taxes_pricing_display: org.taxes_pricing_display ?? 'exclusive',
		taxes_us_sales_tax_enabled: org.taxes_us_sales_tax_enabled ?? false,
		taxes_us_general_rate: numOrNull(org.taxes_us_general_rate),
		taxes_vat_enabled: org.taxes_vat_enabled ?? false,
		taxes_vat_rate: numOrNull(org.taxes_vat_rate),
		taxes_gst_enabled: org.taxes_gst_enabled ?? false,
		taxes_gst_rate: numOrNull(org.taxes_gst_rate),
		returns_window_days: org.returns_window_days ?? 0,
		returns_buyer_pays_shipping: org.returns_buyer_pays_shipping ?? false
	};
}

// Resolve commerce settings for a list of brand IDs. Returns a Map keyed
// by brand_id. Brands not found (RLS-filtered or deleted) are simply
// absent from the map — callers should handle missing keys.
export async function resolveOrderSettings(
	supabase: SupabaseClient,
	brandIds: string[]
): Promise<Map<string, BrandCommerceSettings>> {
	const out = new Map<string, BrandCommerceSettings>();
	const ids = Array.from(new Set(brandIds.filter(Boolean)));
	if (ids.length === 0) return out;

	const { data, error } = await supabase.from('brands').select(BRAND_SELECT).in('id', ids);
	if (error) throw error;

	for (const raw of (data ?? []) as unknown as BrandRow[]) {
		out.set(raw.id, projectBrandSettings(raw));
	}
	return out;
}
