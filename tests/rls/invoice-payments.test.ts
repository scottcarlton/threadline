/**
 * Tests recalc_invoice_amount_paid() and void_invoice().
 *
 * The invariant worth protecting: `invoices.amount_paid` and `invoices.status`
 * are both DERIVED from the `invoice_payments` rows. No sequence of edits
 * should be able to leave an invoice marked paid with nothing recorded against
 * it, or marked sent with the money already in. Every case below is an attempt
 * to produce that drift.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { loadPersonaIds, PERSONA_IDS, personaClient } from './setup/fixture.js';

const NAME_PREFIX = 'RLS Invoice Payments Test';

const createdOrgIds: string[] = [];
let orgId: string;
let brandId: string;
let accountId: string;
let stamp: number;

/** An issued invoice for `total`, ready to be paid against. */
async function issuedInvoice(total = 1000): Promise<string> {
	const admin = adminClient();
	const { data: order, error } = await admin
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

	const { error: lineError } = await admin
		.from('order_lines')
		.insert({ order_id: order.id, style_number: 'PAY-1', qty: 1, unit_price: total });
	if (lineError) throw new Error(`line insert failed: ${lineError.message}`);

	const client = await personaClient('brandAAdmin');
	const { error: statusError } = await client
		.from('orders')
		.update({ status: 'preparing' })
		.eq('id', order.id);
	if (statusError) throw new Error(`preparing failed: ${statusError.message}`);

	const { data: invoice } = await admin
		.from('invoices')
		.select('id')
		.eq('order_id', order.id)
		.single();

	// send_invoice() authorizes its caller, so this has to be a real member of
	// the issuing org rather than service-role, which has no identity for
	// get_user_role() to resolve. SCO-189.
	const sender = await personaClient('brandAAdmin');
	const { error: sendError } = await sender.rpc('send_invoice', {
		p_invoice_id: invoice!.id,
		p_due_date: null,
		p_issue_date: '2026-09-14'
	});
	if (sendError) throw new Error(`send failed: ${sendError.message}`);
	return invoice!.id as string;
}

async function pay(invoiceId: string, amount: number): Promise<string> {
	const admin = adminClient();
	const { data, error } = await admin
		.from('invoice_payments')
		.insert({
			invoice_id: invoiceId,
			organization_id: orgId,
			amount,
			paid_on: '2026-09-14',
			method: 'check'
		})
		.select('id')
		.single();
	if (error) throw new Error(`payment insert failed: ${error.message}`);
	return data.id as string;
}

async function read(invoiceId: string) {
	const admin = adminClient();
	const { data } = await admin
		.from('invoices')
		.select('status, total, amount_paid, paid_at, voided_at, void_reason, invoice_number')
		.eq('id', invoiceId)
		.single();
	return data!;
}

beforeAll(async () => {
	await loadPersonaIds();
	const admin = adminClient();
	stamp = Date.now();

	const { data: org, error } = await admin
		.from('organizations')
		.insert({
			name: `${NAME_PREFIX} (brand)`,
			slug: `paytest-${stamp}`,
			org_type: 'brand',
			order_number_prefix: `RLSPAY${stamp}-`
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
		const { data: orders } = await admin
			.from('orders')
			.select('id')
			.in('organization_id', createdOrgIds);
		const orderIds = (orders ?? []).map((o) => (o as { id: string }).id);
		if (orderIds.length > 0) {
			await admin.from('order_lines').delete().in('order_id', orderIds);
		}
		const { error } = await admin.from('organizations').delete().in('id', createdOrgIds);
		if (error) throw new Error(`invoice-payments cleanup failed: ${error.message}`);
	}
	const { data: leaked } = await admin
		.from('organizations')
		.select('id')
		.like('name', `${NAME_PREFIX}%`);
	if ((leaked ?? []).length > 0) {
		throw new Error(`invoice-payments cleanup left ${(leaked ?? []).length} org(s) behind`);
	}
});

describe('recalc_invoice_amount_paid', () => {
	it('moves a part-paid invoice to partial', async () => {
		const id = await issuedInvoice(1000);
		await pay(id, 400);
		const inv = await read(id);
		expect(inv.status).toBe('partial');
		expect(Number(inv.amount_paid)).toBe(400);
		expect(inv.paid_at).toBeNull();
	});

	it('sums multiple payments', async () => {
		const id = await issuedInvoice(1000);
		await pay(id, 400);
		await pay(id, 350);
		const inv = await read(id);
		expect(Number(inv.amount_paid)).toBe(750);
		expect(inv.status).toBe('partial');
	});

	it('moves to paid and stamps paid_at when the balance clears', async () => {
		const id = await issuedInvoice(1000);
		await pay(id, 600);
		await pay(id, 400);
		const inv = await read(id);
		expect(inv.status).toBe('paid');
		expect(Number(inv.amount_paid)).toBe(1000);
		expect(inv.paid_at).not.toBeNull();
	});

	it('accepts an overpayment rather than refusing to record it', async () => {
		// Buyers overpay. An accounting record that cannot represent what
		// happened is worse than one showing a negative balance.
		const id = await issuedInvoice(1000);
		await pay(id, 1200);
		const inv = await read(id);
		expect(inv.status).toBe('paid');
		expect(Number(inv.amount_paid)).toBe(1200);
	});

	it('walks status back when a payment is removed', async () => {
		// The drift case: if status were stored independently, deleting a
		// payment would leave an invoice marked paid with nothing behind it.
		const admin = adminClient();
		const id = await issuedInvoice(1000);
		const first = await pay(id, 600);
		await pay(id, 400);
		expect((await read(id)).status).toBe('paid');

		await admin.from('invoice_payments').delete().eq('id', first);

		const inv = await read(id);
		expect(inv.status).toBe('partial');
		expect(Number(inv.amount_paid)).toBe(400);
		// paid_at must describe the current state, not the first time it was
		// ever true.
		expect(inv.paid_at).toBeNull();
	});

	it('returns to sent when every payment is removed', async () => {
		const admin = adminClient();
		const id = await issuedInvoice(1000);
		const p = await pay(id, 500);
		await admin.from('invoice_payments').delete().eq('id', p);

		const inv = await read(id);
		expect(inv.status).toBe('sent');
		expect(Number(inv.amount_paid)).toBe(0);
	});

	it('follows an edited payment amount', async () => {
		const admin = adminClient();
		const id = await issuedInvoice(1000);
		const p = await pay(id, 400);
		await admin.from('invoice_payments').update({ amount: 1000 }).eq('id', p);

		const inv = await read(id);
		expect(inv.status).toBe('paid');
		expect(Number(inv.amount_paid)).toBe(1000);
	});

	it('does not move a voided invoice off void', async () => {
		// A withdrawn document does not come back because money arrived.
		const id = await issuedInvoice(1000);
		await (
			await personaClient('brandAAdmin')
		).rpc('void_invoice', { p_invoice_id: id, p_reason: 'test' });

		await pay(id, 1000);
		const inv = await read(id);
		expect(inv.status).toBe('void');
		expect(Number(inv.amount_paid)).toBe(1000);
	});
});

describe('void_invoice', () => {
	it('withdraws an issued invoice but keeps its number', async () => {
		// Deleting would gap the sequence, which is the one thing invoice
		// numbering cannot tolerate.
		const id = await issuedInvoice(500);
		const before = await read(id);

		await (
			await personaClient('brandAAdmin')
		).rpc('void_invoice', { p_invoice_id: id, p_reason: 'Order cancelled' });

		const inv = await read(id);
		expect(inv.status).toBe('void');
		expect(inv.invoice_number).toBe(before.invoice_number);
		expect(inv.voided_at).not.toBeNull();
		expect(inv.void_reason).toBe('Order cancelled');
	});

	it('is idempotent', async () => {
		const id = await issuedInvoice(500);
		await (
			await personaClient('brandAAdmin')
		).rpc('void_invoice', { p_invoice_id: id, p_reason: 'first' });
		const { error } = await (
			await personaClient('brandAAdmin')
		).rpc('void_invoice', { p_invoice_id: id, p_reason: 'second' });
		expect(error).toBeNull();
		expect((await read(id)).void_reason).toBe('first');
	});

	it('normalizes a blank reason to null', async () => {
		const id = await issuedInvoice(500);
		await (
			await personaClient('brandAAdmin')
		).rpc('void_invoice', { p_invoice_id: id, p_reason: '   ' });
		expect((await read(id)).void_reason).toBeNull();
	});

	it('refuses a draft, which is deleted rather than voided', async () => {
		const admin = adminClient();
		const { data: order } = await admin
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
		await admin
			.from('order_lines')
			.insert({ order_id: order!.id, style_number: 'D-1', qty: 1, unit_price: 10 });
		const client = await personaClient('brandAAdmin');
		await client.from('orders').update({ status: 'preparing' }).eq('id', order!.id);

		const { data: draft } = await admin
			.from('invoices')
			.select('id')
			.eq('order_id', order!.id)
			.single();

		const { error } = await (
			await personaClient('brandAAdmin')
		).rpc('void_invoice', {
			p_invoice_id: draft!.id,
			p_reason: null
		});
		expect(error).not.toBeNull();
	});

	it('errors on an unknown invoice', async () => {
		const { error } = await (
			await personaClient('brandAAdmin')
		).rpc('void_invoice', {
			p_invoice_id: '00000000-0000-4000-8000-000000000000',
			p_reason: null
		});
		expect(error).not.toBeNull();
	});

	it('refuses a member: voiding is an accounting act', async () => {
		// The invoices UPDATE policy admits member, so this rule cannot live
		// there. void_invoice() checks the role itself.
		const admin = adminClient();
		const id = await issuedInvoice(500);

		const { error: memberError } = await admin.from('organization_members').insert({
			organization_id: orgId,
			profile_id: PERSONA_IDS.brandAMember!,
			role: 'member'
		});
		if (memberError) throw new Error(`member insert failed: ${memberError.message}`);

		const memberClient = await personaClient('brandAMember');
		const { error } = await memberClient.rpc('void_invoice', {
			p_invoice_id: id,
			p_reason: 'nope'
		});
		expect(error).not.toBeNull();
		expect((await read(id)).status).not.toBe('void');

		await admin
			.from('organization_members')
			.delete()
			.eq('organization_id', orgId)
			.eq('profile_id', PERSONA_IDS.brandAMember!);
	});
});
