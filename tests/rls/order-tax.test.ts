/**
 * Tests compute_order_tax(), the tax rule itself, not row-level security.
 * It lives under tests/rls because that is the project's only live-database
 * harness and this logic exists solely in Postgres.
 *
 * It exists solely in Postgres on purpose. A rep writes the order but cannot
 * read the brand's tax config -- `organizations` has no rep-to-brand SELECT
 * policy and `organization_sales_tax_rates` is `is_org_member` only -- so a
 * SECURITY DEFINER function is the only thing that can resolve it without
 * exposing it. There is deliberately no TypeScript twin: two implementations
 * of tax rules drift, and this is the one place in the product where being
 * wrong is a legal problem rather than a UX problem.
 *
 * Service-role client throughout; RLS is irrelevant to the function. Every
 * organization created here is torn down unconditionally in afterAll, and the
 * teardown re-checks by name prefix so a bug in id tracking still gets caught.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { loadPersonaIds, PERSONA_IDS } from './setup/fixture.js';

const NAME_PREFIX = 'RLS Order Tax Test';

const createdOrgIds: string[] = [];

/** Brand org under test, plus its auto-created self brand. */
let brandOrgId: string;
let brandId: string;
/** Rep org and a manual brand it owns, for the `source = 'brand'` branch. */
let repOrgId: string;
let manualBrandId: string;

/** Accounts standing in for different ship-to addresses. */
let accountCa: string;
let accountTx: string;
let accountNoState: string;
let accountUk: string;

type TaxConfig = {
	taxes_pricing_display?: 'exclusive' | 'inclusive';
	taxes_us_sales_tax_enabled?: boolean;
	taxes_us_general_rate?: number | null;
	taxes_vat_enabled?: boolean;
	taxes_vat_rate?: number | null;
	taxes_gst_enabled?: boolean;
	taxes_gst_rate?: number | null;
	shipping_from_state?: string | null;
};

const ALL_OFF: Required<TaxConfig> = {
	taxes_pricing_display: 'exclusive',
	taxes_us_sales_tax_enabled: false,
	taxes_us_general_rate: null,
	taxes_vat_enabled: false,
	taxes_vat_rate: null,
	taxes_gst_enabled: false,
	taxes_gst_rate: null,
	shipping_from_state: 'NY'
};

async function setOrgConfig(config: TaxConfig): Promise<void> {
	const admin = adminClient();
	const { error } = await admin
		.from('organizations')
		.update({ ...ALL_OFF, ...config })
		.eq('id', brandOrgId);
	if (error) throw new Error(`org config update failed: ${error.message}`);
}

async function setOrgRates(
	rows: Array<{ state_code: string; rate: number; tax_type: 'origin' | 'destination' }>
): Promise<void> {
	const admin = adminClient();
	await admin.from('organization_sales_tax_rates').delete().eq('organization_id', brandOrgId);
	if (rows.length === 0) return;
	const { error } = await admin
		.from('organization_sales_tax_rates')
		.insert(rows.map((r) => ({ ...r, organization_id: brandOrgId })));
	if (error) throw new Error(`rate insert failed: ${error.message}`);
}

/** Calls the function directly so each case asserts on the number itself. */
async function tax(opts: {
	brand?: string;
	accountId?: string | null;
	subtotal?: number;
}): Promise<number | null> {
	const admin = adminClient();
	const { data, error } = await admin.rpc('compute_order_tax', {
		p_brand_id: opts.brand ?? brandId,
		p_location_id: null,
		p_account_id: opts.accountId ?? null,
		p_subtotal: opts.subtotal ?? 1000
	});
	if (error) throw new Error(`compute_order_tax failed: ${error.message}`);
	return data === null ? null : Number(data);
}

beforeAll(async () => {
	await loadPersonaIds();
	const admin = adminClient();
	const stamp = Date.now();

	// A brand-type org fires auto_create_self_brand, so the brands row comes
	// for free.
	const { data: org, error: orgError } = await admin
		.from('organizations')
		.insert({
			name: `${NAME_PREFIX} (brand)`,
			slug: `rls-tax-brand-${stamp}`,
			org_type: 'brand',
			// orders.order_number is globally UNIQUE and generate_order_number()
			// derives it from the org slug, so a throwaway org needs its own
			// prefix or it collides with whatever else is in this shared
			// database. The seed fixture sets one for the same reason.
			order_number_prefix: `RLSTAX${stamp}-`
		})
		.select('id')
		.single();
	if (orgError || !org) throw new Error(`org insert failed: ${orgError?.message}`);
	brandOrgId = org.id as string;
	createdOrgIds.push(brandOrgId);

	const { data: selfBrand, error: brandError } = await admin
		.from('brands')
		.select('id')
		.eq('organization_id', brandOrgId)
		.limit(1)
		.single();
	if (brandError || !selfBrand) throw new Error(`self brand lookup failed: ${brandError?.message}`);
	brandId = selfBrand.id as string;

	const { data: repOrg, error: repError } = await admin
		.from('organizations')
		.insert({ name: `${NAME_PREFIX} (rep)`, slug: `rls-tax-rep-${stamp}`, org_type: 'rep' })
		.select('id')
		.single();
	if (repError || !repOrg) throw new Error(`rep org insert failed: ${repError?.message}`);
	repOrgId = repOrg.id as string;
	createdOrgIds.push(repOrgId);

	const { data: manualBrand, error: manualError } = await admin
		.from('brands')
		.insert({
			organization_id: repOrgId,
			name: `${NAME_PREFIX} Manual Brand`,
			taxes_pricing_display: 'exclusive',
			taxes_us_sales_tax_enabled: true,
			taxes_us_general_rate: 7,
			shipping_from_state: 'NY'
		})
		.select('id')
		.single();
	if (manualError || !manualBrand) throw new Error(`manual brand failed: ${manualError?.message}`);
	manualBrandId = manualBrand.id as string;

	const mkAccount = async (label: string, fields: Record<string, unknown>): Promise<string> => {
		const { data, error } = await admin
			.from('accounts')
			.insert({
				organization_id: brandOrgId,
				business_name: `${NAME_PREFIX} ${label}`,
				...fields
			})
			.select('id')
			.single();
		if (error || !data) throw new Error(`account ${label} failed: ${error?.message}`);
		return data.id as string;
	};

	accountCa = await mkAccount('CA', { state: 'CA', country: 'US' });
	accountTx = await mkAccount('TX', { state: 'TX', country: 'US' });
	accountNoState = await mkAccount('no state', { state: null, country: null });
	accountUk = await mkAccount('UK', { state: null, country: 'GB' });
});

afterAll(async () => {
	const admin = adminClient();
	if (createdOrgIds.length > 0) {
		// order_lines_audit is an AFTER DELETE trigger on order_lines that
		// inserts into order_audits referencing order_id. If order_lines
		// cascade-delete as part of dropping the organizations, that insert
		// races the parent order's own deletion and fails the FK. Deleting the
		// lines first, while the orders still exist, gives the trigger a live
		// order row to point at. Same reason and same fix as the shared
		// fixture teardown in setup/fixture.ts.
		const { data: orders } = await admin
			.from('orders')
			.select('id')
			.in('organization_id', createdOrgIds);
		const orderIds = (orders ?? []).map((o) => (o as { id: string }).id);
		if (orderIds.length > 0) {
			await admin.from('order_lines').delete().in('order_id', orderIds);
		}

		const { error } = await admin.from('organizations').delete().in('id', createdOrgIds);
		if (error) throw new Error(`order-tax cleanup failed: ${error.message}`);
	}
	const { data: leaked, error } = await admin
		.from('organizations')
		.select('id')
		.like('name', `${NAME_PREFIX}%`);
	if (error) throw new Error(`order-tax cleanup verification failed: ${error.message}`);
	if ((leaked ?? []).length > 0) {
		throw new Error(`order-tax cleanup left ${(leaked ?? []).length} organization(s) behind`);
	}
});

describe('compute_order_tax', () => {
	describe('nothing configured', () => {
		it('owes zero, not null: the brand has decided it does not charge tax', async () => {
			await setOrgConfig({});
			await setOrgRates([]);
			expect(await tax({ accountId: accountCa })).toBe(0);
		});
	});

	describe('exclusive vs inclusive', () => {
		it('exclusive adds tax on top of the subtotal', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, taxes_us_general_rate: 10 });
			await setOrgRates([]);
			expect(await tax({ accountId: accountCa, subtotal: 1000 })).toBe(100);
		});

		it('inclusive backs tax out of the subtotal', async () => {
			// 1000 already contains 10%, so the tax portion is
			// 1000 - 1000/1.1 = 90.91, not 100. Reversing these overcharges
			// every buyer by the full rate.
			await setOrgConfig({
				taxes_pricing_display: 'inclusive',
				taxes_us_sales_tax_enabled: true,
				taxes_us_general_rate: 10
			});
			await setOrgRates([]);
			expect(await tax({ accountId: accountCa, subtotal: 1000 })).toBe(90.91);
		});
	});

	describe('US rate resolution', () => {
		it('uses a destination row matching the ship-to state', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true });
			await setOrgRates([{ state_code: 'CA', rate: 8, tax_type: 'destination' }]);
			expect(await tax({ accountId: accountCa })).toBe(80);
		});

		it('uses an origin row on the ship-from state when ship-to has none', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, shipping_from_state: 'NY' });
			await setOrgRates([{ state_code: 'NY', rate: 4, tax_type: 'origin' }]);
			expect(await tax({ accountId: accountCa })).toBe(40);
		});

		it('destination beats origin when both could match', async () => {
			// Origin sourcing is normally an intrastate rule, so the buyer's
			// state wins when the two disagree.
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, shipping_from_state: 'NY' });
			await setOrgRates([
				{ state_code: 'CA', rate: 8, tax_type: 'destination' },
				{ state_code: 'NY', rate: 4, tax_type: 'origin' }
			]);
			expect(await tax({ accountId: accountCa })).toBe(80);
		});

		it('ignores an origin row that matches only the ship-to state', async () => {
			// A row's sourcing mode decides which address selects it. A CA
			// origin row is about selling *from* CA, not shipping *to* it.
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, shipping_from_state: 'NY' });
			await setOrgRates([{ state_code: 'CA', rate: 8, tax_type: 'origin' }]);
			expect(await tax({ accountId: accountCa })).toBe(0);
		});

		it('ignores a destination row that matches only the ship-from state', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, shipping_from_state: 'NY' });
			await setOrgRates([{ state_code: 'NY', rate: 4, tax_type: 'destination' }]);
			expect(await tax({ accountId: accountCa })).toBe(0);
		});

		it('falls back to the US-wide general rate when no row matches', async () => {
			// 20260425000007 defines taxes_us_general_rate as the rate that
			// "applies when no per-state rate matches; works alongside the
			// per-state table".
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, taxes_us_general_rate: 6 });
			await setOrgRates([{ state_code: 'TX', rate: 9, tax_type: 'destination' }]);
			expect(await tax({ accountId: accountCa })).toBe(60);
		});

		it('prefers a matching per-state row over the general rate', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, taxes_us_general_rate: 6 });
			await setOrgRates([{ state_code: 'CA', rate: 8, tax_type: 'destination' }]);
			expect(await tax({ accountId: accountCa })).toBe(80);
		});

		it('applies the right per-state row for each destination', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true });
			await setOrgRates([
				{ state_code: 'CA', rate: 8, tax_type: 'destination' },
				{ state_code: 'TX', rate: 5, tax_type: 'destination' }
			]);
			expect(await tax({ accountId: accountCa })).toBe(80);
			expect(await tax({ accountId: accountTx })).toBe(50);
		});

		it('owes nothing when no row matches and no general rate is set', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true });
			await setOrgRates([]);
			expect(await tax({ accountId: accountCa })).toBe(0);
		});

		it('is undetermined, not zero, when neither address has a state', async () => {
			// A per-state row could still change the answer once a ship-to is
			// known, so claiming $0 would be a claim we cannot support.
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, shipping_from_state: null });
			await setOrgRates([]);
			expect(await tax({ accountId: accountNoState })).toBeNull();
		});

		it('is undetermined even when a general rate exists', async () => {
			await setOrgConfig({
				taxes_us_sales_tax_enabled: true,
				taxes_us_general_rate: 6,
				shipping_from_state: null
			});
			await setOrgRates([]);
			expect(await tax({ accountId: accountNoState })).toBeNull();
		});

		it('still resolves when only the ship-from state is known', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, shipping_from_state: 'NY' });
			await setOrgRates([{ state_code: 'NY', rate: 4, tax_type: 'origin' }]);
			expect(await tax({ accountId: accountNoState })).toBe(40);
		});
	});

	describe('country routing', () => {
		it('applies only one system when several are enabled', async () => {
			// The three flags are independent in the schema. Without routing a
			// UK sale from a brand with US tax and VAT both on is taxed twice.
			await setOrgConfig({
				taxes_us_sales_tax_enabled: true,
				taxes_us_general_rate: 10,
				taxes_vat_enabled: true,
				taxes_vat_rate: 20
			});
			await setOrgRates([]);
			expect(await tax({ accountId: accountUk })).toBe(200);
			expect(await tax({ accountId: accountCa })).toBe(100);
		});

		it('applies GST for a non-US sale when only GST is enabled', async () => {
			await setOrgConfig({ taxes_gst_enabled: true, taxes_gst_rate: 5 });
			await setOrgRates([]);
			expect(await tax({ accountId: accountUk })).toBe(50);
		});

		it('prefers VAT over GST when both are enabled', async () => {
			await setOrgConfig({
				taxes_vat_enabled: true,
				taxes_vat_rate: 20,
				taxes_gst_enabled: true,
				taxes_gst_rate: 5
			});
			await setOrgRates([]);
			expect(await tax({ accountId: accountUk })).toBe(200);
		});

		it('owes nothing on a US sale when only VAT is configured', async () => {
			await setOrgConfig({ taxes_vat_enabled: true, taxes_vat_rate: 20 });
			await setOrgRates([]);
			expect(await tax({ accountId: accountCa })).toBe(0);
		});

		it('owes nothing on a non-US sale when only US sales tax is configured', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, taxes_us_general_rate: 10 });
			await setOrgRates([]);
			expect(await tax({ accountId: accountUk })).toBe(0);
		});

		it('treats a null country as US, matching the column default', async () => {
			// accounts.country and account_locations.country are both
			// TEXT DEFAULT 'US', so an empty value means nobody changed it.
			await setOrgConfig({
				taxes_us_sales_tax_enabled: true,
				taxes_us_general_rate: 10,
				shipping_from_state: 'NY'
			});
			await setOrgRates([]);
			expect(await tax({ accountId: accountNoState })).toBe(100);
		});
	});

	describe('manual brands read config off the brand row', () => {
		it('uses the brand general rate, not the rep org', async () => {
			// A rep-owned brand keeps its commerce settings on `brands`; the
			// owning rep org has no tax config at all.
			expect(await tax({ brand: manualBrandId, accountId: accountCa })).toBe(70);
		});

		it('uses brand_sales_tax_rates ahead of the brand general rate', async () => {
			const admin = adminClient();
			const { error } = await admin.from('brand_sales_tax_rates').insert({
				brand_id: manualBrandId,
				state_code: 'CA',
				rate: 9,
				tax_type: 'destination'
			});
			if (error) throw new Error(`brand rate insert failed: ${error.message}`);
			expect(await tax({ brand: manualBrandId, accountId: accountCa })).toBe(90);
			await admin.from('brand_sales_tax_rates').delete().eq('brand_id', manualBrandId);
		});
	});

	describe('degenerate inputs', () => {
		it('owes nothing on a zero subtotal', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, taxes_us_general_rate: 10 });
			await setOrgRates([]);
			expect(await tax({ accountId: accountCa, subtotal: 0 })).toBe(0);
		});

		it('owes nothing on a zero rate', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, taxes_us_general_rate: 0 });
			await setOrgRates([]);
			expect(await tax({ accountId: accountCa })).toBe(0);
		});

		it('rounds to cents', async () => {
			await setOrgConfig({ taxes_us_sales_tax_enabled: true, taxes_us_general_rate: 8.25 });
			await setOrgRates([]);
			// 33.33 * 0.0825 = 2.749725
			expect(await tax({ accountId: accountCa, subtotal: 33.33 })).toBe(2.75);
		});

		it('returns null for an unknown brand', async () => {
			expect(await tax({ brand: '00000000-0000-4000-8000-000000000000' })).toBeNull();
		});
	});
});

describe('recalc_order_tax trigger', () => {
	let orderId: string;

	it('populates tax_amount when an order is created', async () => {
		const admin = adminClient();
		await setOrgConfig({ taxes_us_sales_tax_enabled: true, taxes_us_general_rate: 10 });
		await setOrgRates([]);

		// orders.created_by is NOT NULL and this throwaway org has no members,
		// so borrow a profile from the shared fixture the way
		// expense-numbering.test.ts does. Nothing here depends on who it is.
		const { data, error } = await admin
			.from('orders')
			.insert({
				organization_id: brandOrgId,
				brand_id: brandId,
				account_id: accountCa,
				created_by: PERSONA_IDS.brandAAdmin!,
				status: 'draft'
			})
			.select('id, tax_amount, total_amount')
			.single();
		if (error) throw new Error(`order insert failed: ${error.message}`);
		orderId = data.id as string;

		// No lines yet, so the subtotal is zero and so is the tax.
		expect(Number(data.total_amount)).toBe(0);
		expect(Number(data.tax_amount)).toBe(0);
	});

	it('recalculates when a line changes, via update_order_total', async () => {
		// update_order_total is an AFTER trigger on order_lines that updates
		// orders.total_amount; that UPDATE fires recalc_order_tax with the new
		// subtotal already in place. No second trigger on order_lines needed.
		const admin = adminClient();
		const { error } = await admin.from('order_lines').insert({
			order_id: orderId,
			style_number: 'TAX-1',
			qty: 2,
			unit_price: 500
		});
		if (error) throw new Error(`line insert failed: ${error.message}`);

		const { data } = await admin
			.from('orders')
			.select('total_amount, tax_amount')
			.eq('id', orderId)
			.single();
		expect(Number(data!.total_amount)).toBe(1000);
		expect(Number(data!.tax_amount)).toBe(100);
	});

	it('never folds tax into total_amount, which feeds commission', async () => {
		const admin = adminClient();
		const { data } = await admin
			.from('orders')
			.select('total_amount, tax_amount')
			.eq('id', orderId)
			.single();
		// Merchandise only: 2 * 500. Tax sits alongside it, never inside it.
		expect(Number(data!.total_amount)).toBe(1000);
		expect(Number(data!.tax_amount)).toBe(100);
	});

	it('recalculates when the ship-to account changes', async () => {
		const admin = adminClient();
		await setOrgRates([{ state_code: 'TX', rate: 5, tax_type: 'destination' }]);

		const { data, error } = await admin
			.from('orders')
			.update({ account_id: accountTx })
			.eq('id', orderId)
			.select('tax_amount')
			.single();
		if (error) throw new Error(`order update failed: ${error.message}`);
		expect(Number(data.tax_amount)).toBe(50);
	});
});
