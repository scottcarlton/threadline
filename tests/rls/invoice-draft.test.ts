/**
 * Tests create_invoice_draft_for_order() and discard_draft_invoice_on_cancel(),
 * trigger behavior rather than row-level security. It lives under tests/rls
 * because that is the project's only live-database harness.
 *
 * This trigger is the only writer of `invoices` -- the table has no INSERT
 * policy at all -- so everything about how a draft comes into existence is
 * asserted here.
 *
 * Service-role client throughout. Every organization created is torn down
 * unconditionally in afterAll, with a name-prefix re-check so a bug in id
 * tracking still gets caught.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { loadPersonaIds, PERSONA_IDS, personaClient } from './setup/fixture.js';

const NAME_PREFIX = 'RLS Invoice Draft Test';

const createdOrgIds: string[] = [];

let orgId: string;
let brandId: string;
let accountId: string;
let locationId: string;
let stamp: number;

type OrderFields = Record<string, unknown>;

/** A confirmed order with two lines, ready to be walked into `preparing`. */
async function makeOrder(fields: OrderFields = {}): Promise<string> {
	const admin = adminClient();
	const { data, error } = await admin
		.from('orders')
		.insert({
			organization_id: orgId,
			brand_id: brandId,
			account_id: accountId,
			created_by: PERSONA_IDS.brandAAdmin!,
			status: 'confirmed',
			...fields
		})
		.select('id')
		.single();
	if (error) throw new Error(`order insert failed: ${error.message}`);
	const orderId = data.id as string;

	const { error: lineError } = await admin.from('order_lines').insert([
		{
			order_id: orderId,
			style_number: 'DRAFT-1',
			description: 'First',
			color: 'Black',
			size: 'M',
			qty: 2,
			unit_price: 100,
			sort_order: 0
		},
		{
			order_id: orderId,
			style_number: 'DRAFT-2',
			description: 'Second',
			color: 'White',
			size: 'L',
			qty: 1,
			unit_price: 50,
			sort_order: 1
		}
	]);
	if (lineError) throw new Error(`line insert failed: ${lineError.message}`);
	return orderId;
}

/**
 * Moves an order's status as a real brand-org member, not as service-role.
 *
 * reject_non_brand_fulfillment_status() (20260909000001) requires the writer
 * to be a member of a brand-type org owning the order's brand, and it fires
 * ahead of RLS, so it rejects service-role writes too -- under service-role
 * get_user_org_ids() is empty. brandAAdmin is granted membership of the
 * throwaway org in beforeAll precisely so this path is available.
 */
async function setStatus(orderId: string, status: string): Promise<void> {
	const client = await personaClient('brandAAdmin');
	const { error } = await client.from('orders').update({ status }).eq('id', orderId);
	if (error) throw new Error(`status -> ${status} failed: ${error.message}`);
}

async function invoiceFor(orderId: string) {
	const admin = adminClient();
	const { data, error } = await admin
		.from('invoices')
		.select('*')
		.eq('order_id', orderId)
		.maybeSingle();
	if (error) throw new Error(`invoice lookup failed: ${error.message}`);
	return data;
}

beforeAll(async () => {
	await loadPersonaIds();
	const admin = adminClient();
	stamp = Date.now();

	const { data: org, error: orgError } = await admin
		.from('organizations')
		.insert({
			name: `${NAME_PREFIX} (brand)`,
			slug: `rls-draft-${stamp}`,
			org_type: 'brand',
			// order_number is globally UNIQUE and derived from the slug, so a
			// throwaway org needs its own prefix in this shared database.
			order_number_prefix: `RLSDRAFT${stamp}-`,
			taxes_pricing_display: 'exclusive',
			taxes_us_sales_tax_enabled: true,
			taxes_us_general_rate: 10,
			shipping_from_state: 'NY'
		})
		.select('id')
		.single();
	if (orgError || !org) throw new Error(`org insert failed: ${orgError?.message}`);
	orgId = org.id as string;
	createdOrgIds.push(orgId);

	const { data: selfBrand, error: brandError } = await admin
		.from('brands')
		.select('id')
		.eq('organization_id', orgId)
		.limit(1)
		.single();
	if (brandError || !selfBrand) throw new Error(`self brand lookup failed: ${brandError?.message}`);
	brandId = selfBrand.id as string;

	const { data: account, error: accountError } = await admin
		.from('accounts')
		.insert({
			organization_id: orgId,
			business_name: `${NAME_PREFIX} Buyer Co`,
			address_line1: '1 Account Way',
			city: 'Austin',
			state: 'TX',
			zip: '78701',
			country: 'US'
		})
		.select('id')
		.single();
	if (accountError || !account) throw new Error(`account failed: ${accountError?.message}`);
	accountId = account.id as string;

	const { data: location, error: locationError } = await admin
		.from('account_locations')
		.insert({
			account_id: accountId,
			organization_id: orgId,
			label: 'Billing',
			address_line1: '99 Billing Blvd',
			address_line2: 'Suite 4',
			city: 'Los Angeles',
			state: 'CA',
			zip: '90001',
			country: 'US'
		})
		.select('id')
		.single();
	if (locationError || !location) throw new Error(`location failed: ${locationError?.message}`);
	locationId = location.id as string;

	// Fulfillment statuses are brand-only and the rule is actor-based, so the
	// suite needs a real member of this brand org to walk orders into
	// `preparing`. Borrowing the shared fixture's brand admin is cheaper than
	// standing up another auth user.
	const { error: memberError } = await admin.from('organization_members').insert({
		organization_id: orgId,
		profile_id: PERSONA_IDS.brandAAdmin!,
		role: 'admin'
	});
	if (memberError) throw new Error(`membership failed: ${memberError.message}`);
});

afterAll(async () => {
	const admin = adminClient();
	if (createdOrgIds.length > 0) {
		// order_lines_audit is an AFTER DELETE trigger on order_lines that
		// writes to order_audits referencing order_id. Letting the lines
		// cascade with the orders races that insert against the parent's own
		// deletion. Same fix as the shared fixture teardown.
		const { data: orders } = await admin
			.from('orders')
			.select('id')
			.in('organization_id', createdOrgIds);
		const orderIds = (orders ?? []).map((o) => (o as { id: string }).id);
		if (orderIds.length > 0) {
			await admin.from('order_lines').delete().in('order_id', orderIds);
		}
		const { error } = await admin.from('organizations').delete().in('id', createdOrgIds);
		if (error) throw new Error(`invoice-draft cleanup failed: ${error.message}`);
	}
	const { data: leaked, error } = await admin
		.from('organizations')
		.select('id')
		.like('name', `${NAME_PREFIX}%`);
	if (error) throw new Error(`invoice-draft cleanup verification failed: ${error.message}`);
	if ((leaked ?? []).length > 0) {
		throw new Error(`invoice-draft cleanup left ${(leaked ?? []).length} organization(s) behind`);
	}
});

describe('draft creation on preparing', () => {
	it('creates exactly one draft, with no number', async () => {
		const orderId = await makeOrder();
		expect(await invoiceFor(orderId)).toBeNull();

		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);

		expect(invoice).not.toBeNull();
		expect(invoice!.status).toBe('draft');
		// Numbering is deferred to send so a cancelled draft cannot gap the
		// issued sequence.
		expect(invoice!.invoice_number).toBeNull();
		expect(invoice!.issue_date).toBeNull();
		expect(invoice!.due_date).toBeNull();
	});

	it('is owned by the brand org, not the order org', async () => {
		// Here they happen to be the same org. The column is asserted anyway
		// because on a federated order they diverge, and this is the
		// distinction the whole invoice RLS model rests on.
		const orderId = await makeOrder();
		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);
		expect(invoice!.organization_id).toBe(orgId);
		expect(invoice!.order_org_id).toBe(orgId);
		expect(invoice!.brand_id).toBe(brandId);
		expect(invoice!.account_id).toBe(accountId);
	});

	it('snapshots the lines, preserving order', async () => {
		const admin = adminClient();
		const orderId = await makeOrder();
		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);

		const { data: lines } = await admin
			.from('invoice_lines')
			.select('*')
			.eq('invoice_id', invoice!.id)
			.order('sort_order');

		expect(lines).toHaveLength(2);
		expect(lines![0]).toMatchObject({
			style_number: 'DRAFT-1',
			description: 'First',
			color: 'Black',
			size: 'M',
			qty: 2,
			sort_order: 0
		});
		expect(Number(lines![0].unit_price)).toBe(100);
		// line_total is GENERATED ALWAYS on invoice_lines, so this proves the
		// generated column computed rather than the trigger inserting a value.
		expect(Number(lines![0].line_total)).toBe(200);
		expect(Number(lines![1].line_total)).toBe(50);
	});

	it('carries the money across from the order', async () => {
		const orderId = await makeOrder({ shipping_cost: 25 });
		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);

		// 2*100 + 1*50 merchandise, 10% general rate, exclusive pricing.
		expect(Number(invoice!.subtotal)).toBe(250);
		expect(Number(invoice!.shipping_amount)).toBe(25);
		expect(Number(invoice!.tax_amount)).toBe(25);
		expect(Number(invoice!.total)).toBe(300);
	});

	it('leaves shipping null when the brand has not quoted it yet', async () => {
		// The common case at `preparing`: the box is not packed, so there is no
		// freight number. Null is honest; zero would be a claim.
		const orderId = await makeOrder();
		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);
		expect(invoice!.shipping_amount).toBeNull();
		expect(Number(invoice!.total)).toBe(275);
	});

	it('excludes tax from the total under inclusive pricing', async () => {
		const admin = adminClient();
		await admin
			.from('organizations')
			.update({ taxes_pricing_display: 'inclusive' })
			.eq('id', orgId);

		const orderId = await makeOrder({ shipping_cost: 10 });
		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);

		// Tax is already inside the line prices, so the payable total is
		// merchandise + shipping. Adding tax again would double-charge.
		expect(Number(invoice!.total)).toBe(260);
		expect(Number(invoice!.tax_amount)).toBeGreaterThan(0);

		await admin
			.from('organizations')
			.update({ taxes_pricing_display: 'exclusive' })
			.eq('id', orgId);
	});

	it('prefers the explicit bill-to location', async () => {
		const orderId = await makeOrder({ bill_to_location_id: locationId });
		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);

		expect(invoice!.bill_to_name).toBe(`${NAME_PREFIX} Buyer Co`);
		expect(invoice!.bill_to_line1).toBe('99 Billing Blvd');
		expect(invoice!.bill_to_line2).toBe('Suite 4');
		expect(invoice!.bill_to_city).toBe('Los Angeles');
		expect(invoice!.bill_to_state).toBe('CA');
	});

	it('derives bill-to from the ship-to location when none is set', async () => {
		// 20260421000002: "bill_to_location_id NULL means the UI derives
		// bill-to from ship-to".
		const orderId = await makeOrder({ location_id: locationId });
		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);
		expect(invoice!.bill_to_line1).toBe('99 Billing Blvd');
	});

	it("falls back to the account's own address when there is no location", async () => {
		const orderId = await makeOrder();
		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);
		expect(invoice!.bill_to_line1).toBe('1 Account Way');
		expect(invoice!.bill_to_city).toBe('Austin');
	});

	it('copies the order terms and PO number', async () => {
		const orderId = await makeOrder({ payment_terms: 'net_30', po_number: 'PO-123' });
		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);
		expect(invoice!.payment_terms).toBe('net_30');
		expect(invoice!.po_number).toBe('PO-123');
	});

	it('does not change when the order is edited afterwards', async () => {
		// The whole reason lines and bill-to are snapshotted rather than
		// joined: a document the buyer has already seen must not move.
		const admin = adminClient();
		const orderId = await makeOrder();
		await setStatus(orderId, 'preparing');
		const before = await invoiceFor(orderId);

		await admin.from('order_lines').insert({
			order_id: orderId,
			style_number: 'ADDED-LATER',
			qty: 5,
			unit_price: 1000
		});

		const after = await invoiceFor(orderId);
		expect(Number(after!.subtotal)).toBe(Number(before!.subtotal));

		const { data: lines } = await admin
			.from('invoice_lines')
			.select('style_number')
			.eq('invoice_id', before!.id);
		expect(lines).toHaveLength(2);
		expect(lines!.map((l) => l.style_number)).not.toContain('ADDED-LATER');
	});

	it('does not create a second invoice when preparing is re-entered', async () => {
		const admin = adminClient();
		const orderId = await makeOrder();
		await setStatus(orderId, 'preparing');
		const first = await invoiceFor(orderId);

		// There is no cancelled -> preparing edge today; this drives the
		// re-entry guard directly so a future graph change cannot surprise us.
		await admin.from('orders').update({ status: 'confirmed' }).eq('id', orderId);
		await setStatus(orderId, 'preparing');

		const { data: all } = await admin.from('invoices').select('id').eq('order_id', orderId);
		expect(all).toHaveLength(1);
		expect(all![0].id).toBe(first!.id);
	});

	it('creates nothing on other status transitions', async () => {
		const orderId = await makeOrder({ status: 'draft' });
		await setStatus(orderId, 'submitted');
		expect(await invoiceFor(orderId)).toBeNull();
		await setStatus(orderId, 'confirmed');
		expect(await invoiceFor(orderId)).toBeNull();
	});

	it('handles an order with no lines', async () => {
		const admin = adminClient();
		const { data, error } = await admin
			.from('orders')
			.insert({
				organization_id: orgId,
				brand_id: brandId,
				account_id: accountId,
				created_by: PERSONA_IDS.brandAAdmin!,
				status: 'confirmed'
			})
			.select('id')
			.single();
		if (error) throw new Error(`order insert failed: ${error.message}`);
		const orderId = data.id as string;

		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);
		expect(invoice).not.toBeNull();
		expect(Number(invoice!.subtotal)).toBe(0);

		const { data: lines } = await admin
			.from('invoice_lines')
			.select('id')
			.eq('invoice_id', invoice!.id);
		expect(lines).toHaveLength(0);
	});

	it('cannot be reached by a freeform order at all', async () => {
		// orders_freeform_only_draft (20260413000003) is
		// CHECK (account_id IS NOT NULL OR status = 'draft'), so an order with
		// no account cannot leave draft. It can never reach `preparing` and so
		// never produces an invoice. This is why the trigger has no
		// freeform_name fallback.
		const admin = adminClient();
		const { data, error } = await admin
			.from('orders')
			.insert({
				organization_id: orgId,
				brand_id: brandId,
				freeform_name: 'Walk-in Buyer',
				created_by: PERSONA_IDS.brandAAdmin!,
				status: 'draft'
			})
			.select('id')
			.single();
		if (error) throw new Error(`freeform order insert failed: ${error.message}`);

		await expect(setStatus(data.id as string, 'preparing')).rejects.toThrow();
		expect(await invoiceFor(data.id as string)).toBeNull();
	});
});

describe('cancelling an order', () => {
	it('discards an unsent draft', async () => {
		// Safe precisely because a draft holds no number: nothing was issued,
		// so nothing gaps.
		const orderId = await makeOrder();
		await setStatus(orderId, 'preparing');
		expect(await invoiceFor(orderId)).not.toBeNull();

		await setStatus(orderId, 'cancelled');
		expect(await invoiceFor(orderId)).toBeNull();
	});

	it('leaves a sent invoice alone, to be voided instead', async () => {
		const admin = adminClient();
		const orderId = await makeOrder();
		await setStatus(orderId, 'preparing');
		const invoice = await invoiceFor(orderId);

		// Stand in for SCO-177's send: give it a number and move it off draft.
		const { error } = await admin
			.from('invoices')
			.update({ status: 'sent', invoice_number: `INV-DRAFTTEST-${stamp}` })
			.eq('id', invoice!.id);
		if (error) throw new Error(`send simulation failed: ${error.message}`);

		await setStatus(orderId, 'cancelled');

		const after = await invoiceFor(orderId);
		expect(after).not.toBeNull();
		expect(after!.status).toBe('sent');
		expect(after!.invoice_number).toBe(`INV-DRAFTTEST-${stamp}`);
	});
});
