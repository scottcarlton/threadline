/**
 * SCO-187: issuing a credit memo, against the live local database.
 *
 * What this pins, beyond "it works":
 *
 *   1. Only the issuing brand can issue, only from `received`, and only once.
 *      A non-member is refused by the NULL arm, not waved through (SCO-189).
 *   2. The database derives the subtotal, the applied invoice and the total;
 *      the caller only states the three deductions. And the total it derives
 *      is the same one the page previewed: returnCreditTotal() and
 *      issue_credit_memo() are held together here, for both pricing modes.
 *   3. The freeze actually fires once the memo is issued, on the return and on
 *      its lines, for the service role too. Verified, not assumed from the
 *      schema ticket.
 *   4. Numbers come from the stored counter, per organization.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient } from './setup/clients.js';
import { loadPersonaIds, PERSONA_IDS, personaClient } from './setup/fixture.js';
import { returnCreditTotal } from '../../src/lib/utils/return-credit-total.js';

const NAME_PREFIX = 'RLS Credit Memo Test';

const createdOrgIds: string[] = [];
let orgId: string;
let orgSlug: string;
let brandId: string;
let accountId: string;
let stamp: number;

type Issued = {
	status: string;
	credit_memo_number: string | null;
	credit_subtotal: string | number;
	restocking_fee: string | number;
	shipping_deduction: string | number;
	credit_tax: string | number;
	credit_total: string | number;
	applied_invoice_id: string | null;
};

async function makeReturn(opts: {
	status?: string;
	orderId?: string | null;
	lines?: Array<{ qty: number; unitPrice: number }>;
}): Promise<string> {
	const admin = adminClient();
	const { data: ra, error } = await admin
		.from('return_authorizations')
		.insert({
			organization_id: orgId,
			brand_id: brandId,
			account_id: accountId,
			order_id: opts.orderId ?? null,
			status: opts.status ?? 'received',
			requested_by: PERSONA_IDS.brandAAdmin!,
			created_by: PERSONA_IDS.brandAAdmin!
		})
		.select('id')
		.single();
	if (error) throw new Error(`return insert failed: ${error.message}`);

	const lines = opts.lines ?? [{ qty: 2, unitPrice: 100 }];
	const { error: lineError } = await admin.from('return_lines').insert(
		lines.map((l, i) => ({
			return_id: ra.id,
			style_number: `CM-${i}`,
			qty: l.qty,
			unit_price: l.unitPrice,
			sort_order: i
		}))
	);
	if (lineError) throw new Error(`line insert failed: ${lineError.message}`);
	return ra.id as string;
}

/** An order on this org's brand with an issued invoice of subtotal 400, tax 32. */
async function makeInvoicedOrder(): Promise<{ orderId: string; invoiceId: string }> {
	const admin = adminClient();
	const { data: order, error } = await admin
		.from('orders')
		.insert({
			organization_id: orgId,
			brand_id: brandId,
			account_id: accountId,
			created_by: PERSONA_IDS.brandAAdmin!,
			status: 'delivered'
		})
		.select('id')
		.single();
	if (error) throw new Error(`order insert failed: ${error.message}`);

	const { data: invoice, error: invoiceError } = await admin
		.from('invoices')
		.insert({
			organization_id: orgId,
			order_org_id: orgId,
			brand_id: brandId,
			account_id: accountId,
			order_id: order.id,
			status: 'sent',
			invoice_number: `INV-CMT-${stamp}-${Math.random().toString(36).slice(2, 7)}`,
			subtotal: 400,
			tax_amount: 32,
			total: 432
		})
		.select('id')
		.single();
	if (invoiceError) throw new Error(`invoice insert failed: ${invoiceError.message}`);
	return { orderId: order.id as string, invoiceId: invoice.id as string };
}

async function issueAs(
	persona: 'brandAAdmin' | 'brandBAdmin',
	returnId: string,
	amounts = { fee: 0, shipping: 0, tax: 0 }
) {
	const client = await personaClient(persona);
	return client.rpc('issue_credit_memo', {
		p_return_id: returnId,
		p_restocking_fee: amounts.fee,
		p_shipping_deduction: amounts.shipping,
		p_credit_tax: amounts.tax
	});
}

async function setPricing(display: 'inclusive' | 'exclusive') {
	const { error } = await adminClient()
		.from('organizations')
		.update({ taxes_pricing_display: display })
		.eq('id', orgId);
	if (error) throw new Error(`pricing update failed: ${error.message}`);
}

beforeAll(async () => {
	await loadPersonaIds();
	const admin = adminClient();
	stamp = Date.now();
	orgSlug = `cmemo-${stamp}`;

	const { data: org, error } = await admin
		.from('organizations')
		.insert({
			name: `${NAME_PREFIX} (brand)`,
			slug: orgSlug,
			org_type: 'brand',
			order_number_prefix: `RLSCM${stamp}-`
		})
		.select('id')
		.single();
	if (error || !org) throw new Error(`org insert failed: ${error?.message}`);
	orgId = org.id as string;
	createdOrgIds.push(orgId);

	const { error: memberError } = await admin.from('organization_members').insert({
		organization_id: orgId,
		profile_id: PERSONA_IDS.brandAAdmin!,
		role: 'admin'
	});
	if (memberError) throw new Error(`membership failed: ${memberError.message}`);

	const { data: brand } = await admin
		.from('brands')
		.select('id')
		.eq('organization_id', orgId)
		.limit(1)
		.single();
	brandId = brand!.id as string;

	const { data: account } = await admin
		.from('accounts')
		.insert({ organization_id: orgId, business_name: `${NAME_PREFIX} Buyer` })
		.select('id')
		.single();
	accountId = account!.id as string;
});

afterAll(async () => {
	const admin = adminClient();
	if (createdOrgIds.length > 0) {
		const { error } = await admin.from('organizations').delete().in('id', createdOrgIds);
		if (error) throw new Error(`credit-memo cleanup failed: ${error.message}`);
	}
	const { data: leaked } = await admin
		.from('organizations')
		.select('id')
		.like('name', `${NAME_PREFIX}%`);
	if ((leaked ?? []).length > 0) {
		throw new Error(`cleanup left ${(leaked ?? []).length} organization(s) behind`);
	}
});

describe('who may issue', () => {
	it('anon cannot execute it at all', async () => {
		const id = await makeReturn({});
		const { error } = await anonClient().rpc('issue_credit_memo', {
			p_return_id: id,
			p_restocking_fee: 0,
			p_shipping_deduction: 0,
			p_credit_tax: 0
		});
		expect(error?.code).toBe('42501');
	});

	it('an admin of another org is refused, not waved through', async () => {
		// brandBAdmin has no role in this org, so get_user_role() is NULL. A
		// bare `NOT IN` would let that through; the explicit NULL arm must not.
		const id = await makeReturn({});
		const { error } = await issueAs('brandBAdmin', id);
		expect(error?.message).toContain('Only the issuing brand can issue a credit memo');

		const { data } = await adminClient()
			.from('return_authorizations')
			.select('credit_memo_number, status')
			.eq('id', id)
			.single();
		expect(data).toEqual({ credit_memo_number: null, status: 'received' });
	});

	it('only from received', async () => {
		for (const status of ['requested', 'approved', 'declined', 'cancelled']) {
			const id = await makeReturn({ status });
			const { error } = await issueAs('brandAAdmin', id);
			expect(error?.message, status).toContain('issued once the goods are received');
		}
	});

	it('only once', async () => {
		const id = await makeReturn({});
		expect((await issueAs('brandAAdmin', id)).error).toBeNull();
		const { error } = await issueAs('brandAAdmin', id);
		expect(error?.message).toContain('already has credit memo');
	});

	it('refuses a negative deduction', async () => {
		const id = await makeReturn({});
		const { error } = await issueAs('brandAAdmin', id, { fee: -5, shipping: 0, tax: 0 });
		expect(error?.message).toContain('must each be zero or more');
	});
});

describe('what it writes', () => {
	it('derives the subtotal from the lines, closes the return, and numbers it', async () => {
		const id = await makeReturn({
			lines: [
				{ qty: 2, unitPrice: 100 },
				{ qty: 1, unitPrice: 37.5 }
			]
		});
		const { data, error } = await issueAs('brandAAdmin', id, { fee: 20, shipping: 12.5, tax: 0 });
		expect(error).toBeNull();
		const memo = data as Issued;

		expect(memo.status).toBe('closed');
		expect(Number(memo.credit_subtotal)).toBe(237.5);
		expect(Number(memo.restocking_fee)).toBe(20);
		expect(Number(memo.shipping_deduction)).toBe(12.5);
		expect(Number(memo.credit_total)).toBe(205);
		expect(memo.credit_memo_number).toMatch(
			new RegExp(`^CM-${orgSlug.slice(0, 3).toUpperCase()}-\\d{5}$`)
		);
		// Free entry: there is no invoice to credit against.
		expect(memo.applied_invoice_id).toBeNull();
	});

	it('floors the total at zero', async () => {
		const id = await makeReturn({ lines: [{ qty: 1, unitPrice: 10 }] });
		const { data } = await issueAs('brandAAdmin', id, { fee: 25, shipping: 0, tax: 0 });
		expect(Number((data as Issued).credit_total)).toBe(0);
	});

	it('numbers consecutively from the stored counter', async () => {
		const a = (await issueAs('brandAAdmin', await makeReturn({}))).data as Issued;
		const b = (await issueAs('brandAAdmin', await makeReturn({}))).data as Issued;
		const n = (memo: Issued) => Number(memo.credit_memo_number!.split('-').pop());
		expect(n(b)).toBe(n(a) + 1);
	});

	it('links the issued invoice of an order-derived return', async () => {
		const { orderId, invoiceId } = await makeInvoicedOrder();
		const id = await makeReturn({ orderId });
		const { data } = await issueAs('brandAAdmin', id);
		expect((data as Issued).applied_invoice_id).toBe(invoiceId);
	});
});

describe('the total matches the preview', () => {
	// The page shows returnCreditTotal() live; the database computes its own.
	// If these two ever disagree, the brand issues a memo for a number it was
	// not shown.
	const amounts = { fee: 20, shipping: 5, tax: 16 };

	for (const display of ['exclusive', 'inclusive'] as const) {
		it(`under ${display} pricing`, async () => {
			await setPricing(display);
			const { orderId } = await makeInvoicedOrder();
			const id = await makeReturn({ orderId, lines: [{ qty: 2, unitPrice: 100 }] });

			const { data, error } = await issueAs('brandAAdmin', id, amounts);
			expect(error).toBeNull();

			const expected = returnCreditTotal({
				creditSubtotal: 200,
				restockingFee: amounts.fee,
				shippingDeduction: amounts.shipping,
				creditTax: amounts.tax,
				inclusive: display === 'inclusive'
			});
			expect(Number((data as Issued).credit_total)).toBe(expected);
			// Tax is recorded either way; inclusive only changes whether it is added.
			expect(Number((data as Issued).credit_tax)).toBe(16);
		});
	}

	it('treats a return with no invoice as exclusive, whatever the org setting', async () => {
		await setPricing('inclusive');
		const id = await makeReturn({ lines: [{ qty: 1, unitPrice: 100 }] });
		const { data } = await issueAs('brandAAdmin', id, { fee: 0, shipping: 0, tax: 8 });
		expect(Number((data as Issued).credit_total)).toBe(108);
		await setPricing('exclusive');
	});
});

describe('the freeze', () => {
	it('fires on the return and its lines once issued, even for the service role', async () => {
		const id = await makeReturn({});
		expect((await issueAs('brandAAdmin', id)).error).toBeNull();
		const admin = adminClient();

		const { error: moneyError } = await admin
			.from('return_authorizations')
			.update({ credit_total: 999 })
			.eq('id', id);
		expect(moneyError?.message).toContain('frozen');

		const { error: lineError } = await admin
			.from('return_lines')
			.update({ qty: 9 })
			.eq('return_id', id);
		expect(lineError?.message).toContain('frozen');
	});
});
