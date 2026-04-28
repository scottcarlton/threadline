import { describe, it, expect } from 'vitest';
import { projectBrandSettings } from './resolve-order-settings.js';

// projectBrandSettings is a pure function — given a brand row joined to
// its owning organization, it normalizes commerce settings into a single
// shape, branching on org_type. These tests cover both branches without
// needing a database.
//
// Concurrency on the order-number trigger lives in Postgres
// (generate_order_number, migration 20260426000001) and is exercised
// manually against the local supabase docker DB in the verification step
// of this PR — it can't be unit-tested without integration infrastructure
// the repo doesn't currently have.

const baseOrg = {
	id: 'org-bo-1',
	org_type: 'brand' as const,
	order_number_prefix: 'BO-',
	order_number_pad_width: 6,
	order_minimum_enabled: true,
	order_minimum_amount: '500.00',
	handling_fee_amount: '10.00',
	default_commission_rate: '12.50',
	accepted_payment_methods: ['credit_card', 'ach'],
	default_payment_method: 'credit_card',
	default_payment_terms: 'net_30',
	default_shipping_method: 'Ground',
	default_shipping_method_id: 'org-ship-1',
	taxes_pricing_display: 'inclusive' as const,
	taxes_us_sales_tax_enabled: true,
	taxes_us_general_rate: '8.25',
	taxes_vat_enabled: false,
	taxes_vat_rate: null,
	taxes_gst_enabled: false,
	taxes_gst_rate: null,
	returns_window_days: 30,
	returns_buyer_pays_shipping: true
};

const baseBrandRowForBo = {
	id: 'brand-1',
	organization_id: 'org-bo-1',
	// Brand-side commerce columns are NULL for BO-owned brands. The
	// resolver should ignore them and read from `organizations`.
	order_number_prefix: null,
	order_number_pad_width: null,
	order_minimum_enabled: null,
	order_minimum_amount: null,
	handling_fee_amount: null,
	default_commission_rate: null,
	accepted_payment_methods: null,
	default_payment_method: null,
	default_payment_terms: null,
	default_shipping_method_id: null,
	taxes_pricing_display: null,
	taxes_us_sales_tax_enabled: null,
	taxes_us_general_rate: null,
	taxes_vat_enabled: null,
	taxes_vat_rate: null,
	taxes_gst_enabled: null,
	taxes_gst_rate: null,
	returns_window_days: null,
	returns_buyer_pays_shipping: null,
	organizations: baseOrg
};

describe('projectBrandSettings', () => {
	it('reads from organizations when org_type is brand', () => {
		const result = projectBrandSettings(baseBrandRowForBo);

		expect(result.source).toBe('organization');
		expect(result.brand_id).toBe('brand-1');
		expect(result.owner_org_id).toBe('org-bo-1');

		// All scalar fields come from the org, even when the brand has NULLs.
		expect(result.order_number_prefix).toBe('BO-');
		expect(result.order_number_pad_width).toBe(6);
		expect(result.order_minimum_enabled).toBe(true);
		expect(result.order_minimum_amount).toBe(500);
		expect(result.handling_fee_amount).toBe(10);
		expect(result.default_commission_rate).toBe(12.5);
		expect(result.accepted_payment_methods).toEqual(['credit_card', 'ach']);
		expect(result.default_payment_method).toBe('credit_card');
		expect(result.default_payment_terms).toBe('net_30');
		expect(result.default_shipping_method).toBe('Ground');
		expect(result.default_shipping_method_id).toBe('org-ship-1');
		expect(result.taxes_pricing_display).toBe('inclusive');
		expect(result.taxes_us_sales_tax_enabled).toBe(true);
		expect(result.taxes_us_general_rate).toBe(8.25);
		expect(result.returns_window_days).toBe(30);
		expect(result.returns_buyer_pays_shipping).toBe(true);
	});

	it('reads from brands when org_type is rep (manual brand path)', () => {
		const repBrandRow = {
			id: 'brand-manual-1',
			organization_id: 'org-rep-1',
			order_number_prefix: 'MAN-',
			order_number_pad_width: 4,
			order_minimum_enabled: false,
			order_minimum_amount: null,
			handling_fee_amount: '5.00',
			default_commission_rate: '15.00',
			accepted_payment_methods: ['check', 'wire'],
			default_payment_method: 'check',
			default_payment_terms: 'net_60',
			default_shipping_method_id: 'brand-ship-1',
			taxes_pricing_display: 'exclusive' as const,
			taxes_us_sales_tax_enabled: false,
			taxes_us_general_rate: null,
			taxes_vat_enabled: true,
			taxes_vat_rate: '20.00',
			taxes_gst_enabled: false,
			taxes_gst_rate: null,
			returns_window_days: 14,
			returns_buyer_pays_shipping: false,
			organizations: {
				id: 'org-rep-1',
				org_type: 'rep' as const,
				// Org-side commerce columns are mostly defaults / unused — the rep
				// org doesn't take payments itself. The resolver must ignore
				// them when org_type is 'rep'.
				order_number_prefix: 'IGNORED',
				order_number_pad_width: 99,
				order_minimum_enabled: true,
				order_minimum_amount: '99999.99',
				handling_fee_amount: '99.99',
				default_commission_rate: '99.99',
				accepted_payment_methods: ['ignored'],
				default_payment_method: 'ignored',
				default_payment_terms: 'ignored',
				default_shipping_method: 'ignored',
				default_shipping_method_id: 'ignored',
				taxes_pricing_display: 'inclusive' as const,
				taxes_us_sales_tax_enabled: true,
				taxes_us_general_rate: '99.99',
				taxes_vat_enabled: false,
				taxes_vat_rate: null,
				taxes_gst_enabled: true,
				taxes_gst_rate: '99.99',
				returns_window_days: 999,
				returns_buyer_pays_shipping: true
			}
		};

		const result = projectBrandSettings(repBrandRow);

		expect(result.source).toBe('brand');
		expect(result.brand_id).toBe('brand-manual-1');
		expect(result.owner_org_id).toBe('org-rep-1');

		expect(result.order_number_prefix).toBe('MAN-');
		expect(result.order_number_pad_width).toBe(4);
		expect(result.order_minimum_enabled).toBe(false);
		expect(result.order_minimum_amount).toBeNull();
		expect(result.handling_fee_amount).toBe(5);
		expect(result.default_commission_rate).toBe(15);
		expect(result.accepted_payment_methods).toEqual(['check', 'wire']);
		expect(result.default_payment_method).toBe('check');
		expect(result.default_payment_terms).toBe('net_60');
		// rep brands don't have a free-text default_shipping_method legacy
		// column — only the FK-typed default_shipping_method_id.
		expect(result.default_shipping_method).toBeNull();
		expect(result.default_shipping_method_id).toBe('brand-ship-1');
		expect(result.taxes_pricing_display).toBe('exclusive');
		expect(result.taxes_us_sales_tax_enabled).toBe(false);
		expect(result.taxes_us_general_rate).toBeNull();
		expect(result.taxes_vat_enabled).toBe(true);
		expect(result.taxes_vat_rate).toBe(20);
		expect(result.returns_window_days).toBe(14);
		expect(result.returns_buyer_pays_shipping).toBe(false);
	});

	it('falls back to safe defaults when manual brand commerce fields are NULL', () => {
		// New manual brand created before the rep configures commerce — most
		// columns are still NULL. The resolver should not crash; it should
		// emit defaults that let order creation succeed (numbering with a
		// blank prefix + minimum pad of 1 in the trigger).
		const unconfiguredRepBrand = {
			...baseBrandRowForBo,
			id: 'brand-fresh',
			organization_id: 'org-rep-2',
			organizations: {
				id: 'org-rep-2',
				org_type: 'rep' as const,
				order_number_prefix: null,
				order_number_pad_width: null,
				order_minimum_enabled: null,
				order_minimum_amount: null,
				handling_fee_amount: null,
				default_commission_rate: null,
				accepted_payment_methods: null,
				default_payment_method: null,
				default_payment_terms: null,
				default_shipping_method: null,
				default_shipping_method_id: null,
				taxes_pricing_display: null,
				taxes_us_sales_tax_enabled: null,
				taxes_us_general_rate: null,
				taxes_vat_enabled: null,
				taxes_vat_rate: null,
				taxes_gst_enabled: null,
				taxes_gst_rate: null,
				returns_window_days: null,
				returns_buyer_pays_shipping: null
			}
		};

		const result = projectBrandSettings(unconfiguredRepBrand);

		expect(result.source).toBe('brand');
		expect(result.order_minimum_enabled).toBe(false);
		expect(result.order_minimum_amount).toBeNull();
		expect(result.handling_fee_amount).toBe(0);
		expect(result.default_commission_rate).toBe(10);
		expect(result.accepted_payment_methods).toEqual([]);
		expect(result.taxes_pricing_display).toBe('exclusive');
		expect(result.taxes_us_sales_tax_enabled).toBe(false);
		expect(result.returns_window_days).toBe(0);
		expect(result.returns_buyer_pays_shipping).toBe(false);
	});

	it('coerces NUMERIC strings from PostgREST to numbers', () => {
		// Postgres NUMERIC columns come back as JS strings via PostgREST's
		// JSON encoding. The projection must coerce so consumers can do
		// plain arithmetic without explicit Number(...) wrapping.
		const result = projectBrandSettings(baseBrandRowForBo);
		expect(typeof result.order_minimum_amount).toBe('number');
		expect(typeof result.handling_fee_amount).toBe('number');
		expect(typeof result.default_commission_rate).toBe('number');
		expect(typeof result.taxes_us_general_rate).toBe('number');
	});

	it('throws when the joined organization is missing', () => {
		const orphan = { ...baseBrandRowForBo, organizations: null };
		expect(() => projectBrandSettings(orphan)).toThrow();
	});
});
