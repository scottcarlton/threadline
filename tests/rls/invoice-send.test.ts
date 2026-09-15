/**
 * Tests generate_invoice_number() and send_invoice(), the transition that
 * turns a draft into an issued document. Trigger/function behavior rather than
 * row-level security, living under tests/rls because that is the project's
 * only live-database harness.
 *
 * Numbering is the part worth the coverage. 20260909000002 had to fix two
 * numbering bugs on expenses -- a COUNT(*)-derived sequence that collided
 * after a delete, and a global uniqueness constraint that collided across orgs
 * with similar slugs. Invoices copy the fixed generator, and both of those
 * failure modes are reproduced here against invoices so the fix cannot quietly
 * regress.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { loadPersonaIds, PERSONA_IDS, personaClient } from './setup/fixture.js';

const NAME_PREFIX = 'RLS Invoice Send Test';

const createdOrgIds: string[] = [];

let orgId: string;
let brandId: string;
let accountId: string;
let stamp: number;

/** A second org whose slug shares its first three characters with the first. */
let twinOrgId: string;
let twinBrandId: string;
let twinAccountId: string;

async function makeDraft(opts: {
	org?: string;
	brand?: string;
	account?: string;
	lines?: Array<{ qty: number; unit_price: number; style_number?: string }>;
	shippingCost?: number;
	paymentTerms?: string;
}): Promise<{ orderId: string; invoiceId: string }> {
	const admin = adminClient();
	const org = opts.org ?? orgId;
	const brand = opts.brand ?? brandId;
	const account = opts.account ?? accountId;

	const { data: order, error } = await admin
		.from('orders')
		.insert({
			organization_id: org,
			brand_id: brand,
			account_id: account,
			created_by: PERSONA_IDS.brandAAdmin!,
			status: 'confirmed',
			shipping_cost: opts.shippingCost ?? null,
			payment_terms: opts.paymentTerms ?? null
		})
		.select('id')
		.single();
	if (error) throw new Error(`order insert failed: ${error.message}`);
	const orderId = order.id as string;

	const lines = opts.lines ?? [{ qty: 2, unit_price: 100 }];
	const { error: lineError } = await admin.from('order_lines').insert(
		lines.map((l, i) => ({
			order_id: orderId,
			style_number: l.style_number ?? `SEND-${i}`,
			qty: l.qty,
			unit_price: l.unit_price,
			sort_order: i
		}))
	);
	if (lineError) throw new Error(`line insert failed: ${lineError.message}`);

	const client = await personaClient('brandAAdmin');
	const { error: statusError } = await client
		.from('orders')
		.update({ status: 'preparing' })
		.eq('id', orderId);
	if (statusError) throw new Error(`status -> preparing failed: ${statusError.message}`);

	const { data: invoice } = await admin
		.from('invoices')
		.select('id')
		.eq('order_id', orderId)
		.single();

	return { orderId, invoiceId: invoice!.id as string };
}

/**
 * Sends as a real brand-org member rather than service-role. send_invoice()
 * authorizes its caller through get_user_role(), which resolves to whoever
 * holds the session; under service-role there is no auth.uid() for it to
 * identify, so the call is correctly rejected.
 */
async function send(invoiceId: string, dueDate: string | null = null) {
	const admin = await personaClient('brandAAdmin');
	const { data, error } = await admin.rpc('send_invoice', {
		p_invoice_id: invoiceId,
		p_due_date: dueDate,
		p_issue_date: '2026-09-14'
	});
	if (error) throw new Error(`send_invoice failed: ${error.message}`);
	return data as Record<string, unknown>;
}

async function createOrg(label: string, slug: string): Promise<string> {
	const admin = adminClient();
	const { data, error } = await admin
		.from('organizations')
		.insert({
			name: `${NAME_PREFIX} (${label})`,
			slug,
			org_type: 'brand',
			order_number_prefix: `RLSSEND${label}${stamp}-`,
			taxes_pricing_display: 'exclusive',
			taxes_us_sales_tax_enabled: true,
			taxes_us_general_rate: 10,
			shipping_from_state: 'NY'
		})
		.select('id')
		.single();
	if (error || !data) throw new Error(`org ${label} failed: ${error?.message}`);
	const id = data.id as string;
	createdOrgIds.push(id);

	const { error: memberError } = await admin.from('organization_members').insert({
		organization_id: id,
		profile_id: PERSONA_IDS.brandAAdmin!,
		role: 'admin'
	});
	if (memberError) throw new Error(`membership ${label} failed: ${memberError.message}`);
	return id;
}

beforeAll(async () => {
	await loadPersonaIds();
	const admin = adminClient();
	stamp = Date.now();

	// Two slugs sharing their first three characters. The invoice number
	// embeds UPPER(LEFT(slug, 3)), so these two orgs produce identical
	// discriminators and would collide under a global unique constraint --
	// exactly the bug 20260909000002 fixed for expenses.
	orgId = await createOrg('A', `sendtest-a-${stamp}`);
	twinOrgId = await createOrg('B', `sendtest-b-${stamp}`);

	const brandOf = async (org: string): Promise<string> => {
		const { data, error } = await admin
			.from('brands')
			.select('id')
			.eq('organization_id', org)
			.limit(1)
			.single();
		if (error || !data) throw new Error(`brand lookup failed: ${error?.message}`);
		return data.id as string;
	};
	brandId = await brandOf(orgId);
	twinBrandId = await brandOf(twinOrgId);

	const accountOf = async (org: string, label: string): Promise<string> => {
		const { data, error } = await admin
			.from('accounts')
			.insert({
				organization_id: org,
				business_name: `${NAME_PREFIX} ${label}`,
				state: 'CA',
				country: 'US'
			})
			.select('id')
			.single();
		if (error || !data) throw new Error(`account failed: ${error?.message}`);
		return data.id as string;
	};
	accountId = await accountOf(orgId, 'Buyer A');
	twinAccountId = await accountOf(twinOrgId, 'Buyer B');
});

afterAll(async () => {
	const admin = adminClient();
	if (createdOrgIds.length > 0) {
		const { data: orders } = await admin
			.from('orders')
			.select('id')
			.in('organization_id', createdOrgIds);
		const orderIds = (orders ?? []).map((o) => (o as { id: string }).id);
		if (orderIds.length > 0) {
			await admin.from('order_lines').delete().in('order_id', orderIds);
		}
		const { error } = await admin.from('organizations').delete().in('id', createdOrgIds);
		if (error) throw new Error(`invoice-send cleanup failed: ${error.message}`);
	}
	const { data: leaked, error } = await admin
		.from('organizations')
		.select('id')
		.like('name', `${NAME_PREFIX}%`);
	if (error) throw new Error(`invoice-send cleanup verification failed: ${error.message}`);
	if ((leaked ?? []).length > 0) {
		throw new Error(`invoice-send cleanup left ${(leaked ?? []).length} organization(s) behind`);
	}
});

describe('generate_invoice_number', () => {
	it('issues a padded, per-org number on send', async () => {
		const { invoiceId } = await makeDraft({});
		const sent = await send(invoiceId);
		expect(sent.invoice_number).toMatch(/^INV-SEN-\d{5}$/);
	});

	it('advances the sequence', async () => {
		const a = await send((await makeDraft({})).invoiceId);
		const b = await send((await makeDraft({})).invoiceId);
		const seq = (n: unknown) => Number(String(n).split('-')[2]);
		expect(seq(b.invoice_number)).toBe(seq(a.invoice_number) + 1);
	});

	it('does not reuse a number after a draft is deleted', async () => {
		// The expense bug this guards against: a COUNT(*)-derived sequence
		// drops when a row is deleted and hands the next insert a value that is
		// still in use. A stored counter only ever advances. Drafts are
		// deletable by design, so this is reachable by ordinary use.
		const admin = adminClient();
		const first = await send((await makeDraft({})).invoiceId);

		const throwaway = await makeDraft({});
		await admin.from('invoices').delete().eq('id', throwaway.invoiceId);

		const second = await send((await makeDraft({})).invoiceId);
		expect(second.invoice_number).not.toBe(first.invoice_number);

		const { data: all } = await admin
			.from('invoices')
			.select('invoice_number')
			.eq('organization_id', orgId)
			.not('invoice_number', 'is', null);
		const numbers = (all ?? []).map((r) => (r as { invoice_number: string }).invoice_number);
		expect(new Set(numbers).size).toBe(numbers.length);
	});

	it('does not collide across orgs whose slugs share three characters', async () => {
		// Both orgs render the same "SEN" discriminator. Uniqueness is scoped
		// to (organization_id, invoice_number), so identical strings in
		// different orgs are fine -- and must be, or the second org cannot
		// invoice at all.
		const mine = await send((await makeDraft({})).invoiceId);
		const theirs = await send(
			(await makeDraft({ org: twinOrgId, brand: twinBrandId, account: twinAccountId })).invoiceId
		);
		expect(String(mine.invoice_number).split('-')[1]).toBe(
			String(theirs.invoice_number).split('-')[1]
		);
		// Different orgs, so both succeeded regardless of the string matching.
		expect(theirs.status).toBe('sent');
	});
});

describe('send_invoice', () => {
	it('stamps status, dates, and sent_at', async () => {
		const { invoiceId } = await makeDraft({ paymentTerms: 'net_30' });
		const sent = await send(invoiceId, '2026-10-14');

		expect(sent.status).toBe('sent');
		expect(sent.issue_date).toBe('2026-09-14');
		expect(sent.due_date).toBe('2026-10-14');
		expect(sent.sent_at).not.toBeNull();
	});

	it('issues without a due date when none is supplied', async () => {
		// `other` terms yield null from dueDateFromTerms, and the invoice is
		// issued with a blank due date rather than an invented deadline.
		const { invoiceId } = await makeDraft({ paymentTerms: 'other' });
		const sent = await send(invoiceId, null);
		expect(sent.status).toBe('sent');
		expect(sent.due_date).toBeNull();
	});

	it('bills what it lists: subtotal comes from the invoice lines', async () => {
		// The brand short-ships by editing the draft's lines. The document must
		// bill the edited lines, not the original order.
		const admin = adminClient();
		const { invoiceId } = await makeDraft({ lines: [{ qty: 10, unit_price: 100 }] });

		const { data: lines } = await admin
			.from('invoice_lines')
			.select('id')
			.eq('invoice_id', invoiceId);
		await admin
			.from('invoice_lines')
			.update({ qty: 8 })
			.eq('id', (lines![0] as { id: string }).id);

		const sent = await send(invoiceId);
		expect(Number(sent.subtotal)).toBe(800);
		// Tax follows the shipped quantity, not the ordered one.
		expect(Number(sent.tax_amount)).toBe(80);
		expect(Number(sent.total)).toBe(880);
	});

	it('picks up shipping quoted after the draft was created', async () => {
		const admin = adminClient();
		const { orderId, invoiceId } = await makeDraft({});

		// Freight is usually priced between `preparing` and send.
		await admin.from('orders').update({ shipping_cost: 30 }).eq('id', orderId);

		const sent = await send(invoiceId);
		expect(Number(sent.shipping_amount)).toBe(30);
		expect(Number(sent.total)).toBe(200 + 30 + 20);
	});

	it('excludes tax from the total under inclusive pricing', async () => {
		const admin = adminClient();
		await admin
			.from('organizations')
			.update({ taxes_pricing_display: 'inclusive' })
			.eq('id', orgId);

		const { invoiceId } = await makeDraft({ shippingCost: 10 });
		const sent = await send(invoiceId);

		expect(Number(sent.total)).toBe(210);
		expect(Number(sent.tax_amount)).toBeGreaterThan(0);

		await admin
			.from('organizations')
			.update({ taxes_pricing_display: 'exclusive' })
			.eq('id', orgId);
	});

	it('refuses to issue the same invoice twice', async () => {
		const client = await personaClient('brandAAdmin');
		const { invoiceId } = await makeDraft({});
		await send(invoiceId);

		const { error } = await client.rpc('send_invoice', {
			p_invoice_id: invoiceId,
			p_due_date: null,
			p_issue_date: '2026-09-14'
		});
		expect(error).not.toBeNull();
	});

	it('does not consume a number on a rejected second send', async () => {
		const admin = adminClient();
		const { invoiceId } = await makeDraft({});
		await send(invoiceId);

		const { data: before } = await admin
			.from('organizations')
			.select('next_invoice_number')
			.eq('id', orgId)
			.single();

		const client = await personaClient('brandAAdmin');
		await client.rpc('send_invoice', {
			p_invoice_id: invoiceId,
			p_due_date: null,
			p_issue_date: '2026-09-14'
		});

		const { data: after } = await admin
			.from('organizations')
			.select('next_invoice_number')
			.eq('id', orgId)
			.single();

		// The status guard runs before generate_invoice_number(), so a rejected
		// send leaves the counter alone.
		expect(after!.next_invoice_number).toBe(before!.next_invoice_number);
	});

	it('errors on an unknown invoice', async () => {
		const client = await personaClient('brandAAdmin');
		const { error } = await client.rpc('send_invoice', {
			p_invoice_id: '00000000-0000-4000-8000-000000000000',
			p_due_date: null,
			p_issue_date: '2026-09-14'
		});
		expect(error).not.toBeNull();
	});
});

describe('the freeze trigger and the send path', () => {
	it('does not fire on send, because OLD.status is still draft', async () => {
		// send_invoice writes the number and the frozen money in the same
		// UPDATE that moves status off 'draft'. reject_sent_invoice_edits()
		// keys on OLD.status, so it correctly lets that one through.
		const { invoiceId } = await makeDraft({});
		const sent = await send(invoiceId);
		expect(sent.invoice_number).not.toBeNull();
	});

	it('freezes the document once issued', async () => {
		const admin = adminClient();
		const { invoiceId } = await makeDraft({});
		await send(invoiceId);

		const { error } = await admin.from('invoices').update({ total: 1 }).eq('id', invoiceId);
		expect(error?.code).toBe('42501');
	});

	it('still allows status to move after issuing', async () => {
		const admin = adminClient();
		const { invoiceId } = await makeDraft({});
		await send(invoiceId);

		const { error } = await admin
			.from('invoices')
			.update({ status: 'paid', paid_at: new Date().toISOString() })
			.eq('id', invoiceId);
		expect(error).toBeNull();
	});
});
