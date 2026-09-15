import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';
import {
	expectDeleteAllowed,
	expectDeleteDenied,
	expectHidden,
	expectInsertDenied,
	expectUpdateAllowed,
	expectUpdateDenied,
	expectVisible
} from './setup/assert.js';

/**
 * RLS for `invoices`, `invoice_lines`, `invoice_payments` (SCO-174).
 *
 * Three actors read an invoice and each keys off a different column, so the
 * cases below are grouped by reader rather than by table:
 *
 *   brand  -> brand_id IN get_user_brand_ids(organization_id)
 *   rep    -> order_org_id IN get_user_org_ids()
 *             AND order_org_id <> organization_id
 *             AND status <> 'draft'
 *   buyer  -> account_id IN get_buyer_account_ids()
 *             AND status <> 'draft'
 *
 * The `order_org_id <> organization_id` clause on the rep arm is not
 * decoration. Policies are OR'd, so without it that arm fires for a
 * brand-internal order (whose order org is the issuing org) and hands every
 * member of the brand org a row the brand-scoped arm withheld. The
 * "member scoped to one brand" case below is what caught it.
 *
 * The fixture rows are shaped so each one isolates a single rule; see the
 * comment on the invoice ids in setup/ids.ts.
 *
 * The invoice is owned by the *issuing brand org*. On a federated order that
 * is not the order's own org, which is why `order_org_id` exists at all and
 * why the rep arm below reads orgRepA while the row lives in orgBrandA.
 */
describe('invoices RLS', () => {
	beforeAll(async () => {
		await loadPersonaIds();
	});

	describe('brand org (the issuer)', () => {
		it('admin sees invoices for every brand in the org', async () => {
			const client = await personaClient('brandAAdmin');
			await expectVisible(client, 'invoices', RLS_IDS.invoiceSentRepA);
			await expectVisible(client, 'invoices', RLS_IDS.invoiceSentBrandA2);
		});

		it('admin sees its own drafts', async () => {
			const client = await personaClient('brandAAdmin');
			await expectVisible(client, 'invoices', RLS_IDS.invoiceDraftRepA);
		});

		it("member scoped to one brand cannot see another brand's invoice", async () => {
			// brandAMember has a member_brand_access row for A1 only, so the A2
			// invoice must be invisible even though it is in their own org.
			// This is the case a plain is_org_member policy would have missed.
			const client = await personaClient('brandAMember');
			await expectVisible(client, 'invoices', RLS_IDS.invoiceSentRepA);
			await expectHidden(client, 'invoices', RLS_IDS.invoiceSentBrandA2);
		});

		it('a different brand org sees nothing', async () => {
			const client = await personaClient('brandBAdmin');
			await expectHidden(client, 'invoices', RLS_IDS.invoiceSentRepA);
			await expectHidden(client, 'invoices', RLS_IDS.invoiceSentBrandA2);
			await expectHidden(client, 'invoices', RLS_IDS.invoiceDraftRepA);
		});
	});

	describe('rep org (the order owner)', () => {
		it('sees a sent invoice for an order in its org', async () => {
			const client = await personaClient('repAAdmin');
			await expectVisible(client, 'invoices', RLS_IDS.invoiceSentRepA);
		});

		it('cannot see a draft, even for its own order', async () => {
			// The governing rule: a draft is the brand's working document.
			// invoiceDraftRepA is on an orgRepA order, so only `status <> 'draft'`
			// is keeping it hidden here.
			const client = await personaClient('repAAdmin');
			await expectHidden(client, 'invoices', RLS_IDS.invoiceDraftRepA);
		});

		it('cannot see an invoice for an order in the brand org', async () => {
			const client = await personaClient('repAAdmin');
			await expectHidden(client, 'invoices', RLS_IDS.invoiceSentBrandA2);
		});

		it('an unrelated rep org sees nothing', async () => {
			const client = await personaClient('repBAdmin');
			await expectHidden(client, 'invoices', RLS_IDS.invoiceSentRepA);
			await expectHidden(client, 'invoices', RLS_IDS.invoiceDraftRepA);
		});

		it('cannot update or delete an invoice it can read', async () => {
			const client = await personaClient('repAAdmin');
			await expectUpdateDenied(client, 'invoices', RLS_IDS.invoiceSentRepA, {
				status: 'paid'
			});
			await expectDeleteDenied(client, 'invoices', RLS_IDS.invoiceSentRepA);
		});
	});

	describe('buyer', () => {
		it('sees sent invoices for their own account', async () => {
			const client = await personaClient('buyer');
			await expectVisible(client, 'invoices', RLS_IDS.invoiceSentRepA);
			await expectVisible(client, 'invoices', RLS_IDS.invoiceSentBrandA2);
		});

		it('cannot see a draft for their own account', async () => {
			const client = await personaClient('buyer');
			await expectHidden(client, 'invoices', RLS_IDS.invoiceDraftRepA);
		});

		it('cannot update or delete', async () => {
			const client = await personaClient('buyer');
			await expectUpdateDenied(client, 'invoices', RLS_IDS.invoiceSentRepA, {
				status: 'paid'
			});
			await expectDeleteDenied(client, 'invoices', RLS_IDS.invoiceSentRepA);
		});
	});

	describe('anon', () => {
		it('sees nothing', async () => {
			const client = anonClient();
			await expectHidden(client, 'invoices', RLS_IDS.invoiceSentRepA);
			await expectHidden(client, 'invoices', RLS_IDS.invoiceSentBrandA2);
			await expectHidden(client, 'invoices', RLS_IDS.invoiceDraftRepA);
		});
	});

	describe('INSERT is closed to everyone', () => {
		// There is no INSERT policy on invoices at all. Invoices are created
		// only by the SECURITY DEFINER trigger that fires when an order enters
		// `preparing` (SCO-176), which makes "a rep cannot invent an invoice"
		// true by construction rather than by a check someone could widen.
		const row = (organizationId: string, orderOrgId: string) => ({
			organization_id: organizationId,
			order_id: RLS_IDS.orderRepBOnBrandB,
			brand_id: RLS_IDS.brandA1,
			order_org_id: orderOrgId,
			status: 'draft',
			subtotal: 1,
			total: 1
		});

		it('brand admin cannot insert', async () => {
			const client = await personaClient('brandAAdmin');
			await expectInsertDenied(client, 'invoices', row(RLS_IDS.orgBrandA, RLS_IDS.orgRepA));
		});

		it('rep admin cannot insert', async () => {
			const client = await personaClient('repAAdmin');
			await expectInsertDenied(client, 'invoices', row(RLS_IDS.orgRepA, RLS_IDS.orgRepA));
		});

		it('buyer cannot insert', async () => {
			const client = await personaClient('buyer');
			await expectInsertDenied(client, 'invoices', row(RLS_IDS.orgBrandA, RLS_IDS.orgRepA));
		});
	});

	describe('UPDATE', () => {
		it('brand admin can update a draft', async () => {
			const client = await personaClient('brandAAdmin');
			await expectUpdateAllowed(client, 'invoices', RLS_IDS.invoiceDraftRepA, {
				po_number: `RLS-${Date.now()}`
			});
		});

		it('sales cannot update: issuing a bill is not a sales action', async () => {
			const client = await personaClient('brandASales');
			await expectUpdateDenied(client, 'invoices', RLS_IDS.invoiceDraftRepA, {
				po_number: 'nope'
			});
		});

		it('guest cannot update', async () => {
			const client = await personaClient('brandAGuest');
			await expectUpdateDenied(client, 'invoices', RLS_IDS.invoiceDraftRepA, {
				po_number: 'nope'
			});
		});

		it('a sent invoice rejects edits to frozen columns', async () => {
			// reject_sent_invoice_edits() fires before RLS, so the service-role
			// client is the honest way to prove the trigger and not a policy is
			// what stops this.
			const admin = adminClient();
			const { error } = await admin
				.from('invoices')
				.update({ total: 999 })
				.eq('id', RLS_IDS.invoiceSentRepA);
			// insufficient_privilege, raised by the trigger.
			if (error?.code !== '42501') {
				throw new Error(`expected 42501 from the freeze trigger, got ${error?.code ?? 'no error'}`);
			}
		});

		it('a sent invoice still allows status and payment fields to move', async () => {
			const admin = adminClient();
			const { error } = await admin
				.from('invoices')
				.update({ status: 'partial' })
				.eq('id', RLS_IDS.invoiceSentRepA);
			if (error) throw new Error(`status should not be frozen: ${error.message}`);
			// Put it back so later specs see the fixture as seeded.
			await admin.from('invoices').update({ status: 'sent' }).eq('id', RLS_IDS.invoiceSentRepA);
		});
	});

	describe('DELETE', () => {
		it('a sent invoice cannot be deleted, only voided', async () => {
			// Deleting an issued invoice would gap the numbering sequence, which
			// is the one thing invoice numbering cannot tolerate.
			const client = await personaClient('brandAAdmin');
			await expectDeleteDenied(client, 'invoices', RLS_IDS.invoiceSentRepA);
		});

		it('member cannot delete a draft', async () => {
			const client = await personaClient('brandAMember');
			await expectDeleteDenied(client, 'invoices', RLS_IDS.invoiceDraftRepA);
		});

		it('admin can delete a draft', async () => {
			// Seeded and torn down here rather than reusing a fixture row, so the
			// shared fixture survives this spec.
			const admin = adminClient();
			const probeId = '0f500000-0000-4000-8000-0000000007f1';
			const { error: seedError } = await admin.from('invoices').insert({
				id: probeId,
				organization_id: RLS_IDS.orgBrandA,
				order_id: RLS_IDS.orderRepBOnBrandB,
				brand_id: RLS_IDS.brandA1,
				order_org_id: RLS_IDS.orgRepB,
				created_by: PERSONA_IDS.brandAAdmin!,
				status: 'draft',
				subtotal: 1,
				total: 1
			});
			if (seedError) throw new Error(`probe seed failed: ${seedError.message}`);

			const client = await personaClient('brandAAdmin');
			await expectDeleteAllowed(client, 'invoices', probeId);
		});
	});

	describe('invoice_lines inherit invoice visibility', () => {
		it('brand admin sees lines', async () => {
			const client = await personaClient('brandAAdmin');
			await expectVisible(client, 'invoice_lines', RLS_IDS.invoiceLineSentRepA);
		});

		it('rep sees lines of a sent invoice', async () => {
			const client = await personaClient('repAAdmin');
			await expectVisible(client, 'invoice_lines', RLS_IDS.invoiceLineSentRepA);
		});

		it('an unrelated brand org does not', async () => {
			const client = await personaClient('brandBAdmin');
			await expectHidden(client, 'invoice_lines', RLS_IDS.invoiceLineSentRepA);
		});

		it('cannot be written once the parent is sent', async () => {
			const client = await personaClient('brandAAdmin');
			await expectInsertDenied(client, 'invoice_lines', {
				invoice_id: RLS_IDS.invoiceSentRepA,
				style_number: 'NOPE',
				qty: 1,
				unit_price: 1
			});
		});

		it('can be written while the parent is a draft', async () => {
			const admin = adminClient();
			const client = await personaClient('brandAAdmin');
			const { data, error } = await client
				.from('invoice_lines')
				.insert({
					invoice_id: RLS_IDS.invoiceDraftRepA,
					style_number: 'RLS-DRAFT',
					qty: 1,
					unit_price: 10
				})
				.select('id')
				.single();
			if (error) throw new Error(`draft line insert should be allowed: ${error.message}`);
			await admin
				.from('invoice_lines')
				.delete()
				.eq('id', (data as { id: string }).id);
		});
	});

	describe('invoice_payments', () => {
		it('brand admin sees payments', async () => {
			const client = await personaClient('brandAAdmin');
			await expectVisible(client, 'invoice_payments', RLS_IDS.invoicePaymentSentRepA);
		});

		it('rep sees that their order was paid', async () => {
			const client = await personaClient('repAAdmin');
			await expectVisible(client, 'invoice_payments', RLS_IDS.invoicePaymentSentRepA);
		});

		it('buyer sees their own payment history', async () => {
			const client = await personaClient('buyer');
			await expectVisible(client, 'invoice_payments', RLS_IDS.invoicePaymentSentRepA);
		});

		it('an unrelated brand org does not', async () => {
			const client = await personaClient('brandBAdmin');
			await expectHidden(client, 'invoice_payments', RLS_IDS.invoicePaymentSentRepA);
		});

		it('member cannot record a payment: it is the money record', async () => {
			// One step tighter than the admin/owner/member that may send.
			const client = await personaClient('brandAMember');
			await expectInsertDenied(client, 'invoice_payments', {
				invoice_id: RLS_IDS.invoiceSentRepA,
				organization_id: RLS_IDS.orgBrandA,
				amount: 5,
				paid_on: '2026-09-10'
			});
		});

		it('rep cannot record a payment', async () => {
			const client = await personaClient('repAAdmin');
			await expectInsertDenied(client, 'invoice_payments', {
				invoice_id: RLS_IDS.invoiceSentRepA,
				organization_id: RLS_IDS.orgBrandA,
				amount: 5,
				paid_on: '2026-09-10'
			});
		});

		it('cannot be recorded against a draft', async () => {
			const client = await personaClient('brandAAdmin');
			await expectInsertDenied(client, 'invoice_payments', {
				invoice_id: RLS_IDS.invoiceDraftRepA,
				organization_id: RLS_IDS.orgBrandA,
				amount: 5,
				paid_on: '2026-09-10'
			});
		});

		it('admin can record a payment against a sent invoice', async () => {
			const admin = adminClient();
			const client = await personaClient('brandAAdmin');
			const { data, error } = await client
				.from('invoice_payments')
				.insert({
					invoice_id: RLS_IDS.invoiceSentRepA,
					organization_id: RLS_IDS.orgBrandA,
					amount: 5,
					paid_on: '2026-09-10',
					method: 'check'
				})
				.select('id')
				.single();
			if (error) throw new Error(`admin payment insert should be allowed: ${error.message}`);
			await admin
				.from('invoice_payments')
				.delete()
				.eq('id', (data as { id: string }).id);
		});
	});
});

/**
 * The order detail page renders its invoice panel from exactly one query:
 * `invoices` filtered by `order_id`, through the RLS-respecting client. It does
 * not re-state the visibility rule in TypeScript, so what the panel shows is
 * whatever these return.
 *
 * That makes this the real test of the panel. Asserting on the rendered markup
 * would only prove the component can draw a box; this proves a rep and a buyer
 * cannot learn that a draft exists.
 */
describe('the order detail invoice panel query', () => {
	const byOrder = async (persona: Parameters<typeof personaClient>[0], orderId: string) => {
		const client = await personaClient(persona);
		const { data, error } = await client
			.from('invoices')
			.select('id, invoice_number, status')
			.eq('order_id', orderId)
			.maybeSingle();
		if (error) throw new Error(`panel query failed: ${error.message}`);
		return data;
	};

	it('gives the issuing brand org its invoice', async () => {
		const row = await byOrder('brandAAdmin', RLS_IDS.orderRepAOnBrandA);
		expect(row?.id).toBe(RLS_IDS.invoiceSentRepA);
	});

	it('gives the rep the sent invoice for its own order', async () => {
		// The rep sold it, so it is their commission basis.
		const row = await byOrder('repAAdmin', RLS_IDS.orderRepAOnBrandA);
		expect(row?.id).toBe(RLS_IDS.invoiceSentRepA);
	});

	it('returns nothing to the rep for a draft, so the panel cannot render', async () => {
		// The whole point: not an empty panel, not a "pending" state. Nothing
		// comes back, so the page has no way to hint that a draft exists.
		const row = await byOrder('repAAdmin', RLS_IDS.orderRepAForDraft);
		expect(row).toBeNull();
	});

	it('returns nothing to the buyer for a draft', async () => {
		const row = await byOrder('buyer', RLS_IDS.orderRepAForDraft);
		expect(row).toBeNull();
	});

	it('gives the buyer a sent invoice for their own account', async () => {
		const row = await byOrder('buyer', RLS_IDS.orderBrandAInternal);
		expect(row?.id).toBe(RLS_IDS.invoiceSentBrandA2);
	});

	it('returns nothing to an unrelated rep org', async () => {
		const row = await byOrder('repBAdmin', RLS_IDS.orderRepAOnBrandA);
		expect(row).toBeNull();
	});

	it('returns nothing to a brand member scoped to another brand', async () => {
		// brandAMember has member_brand_access for A1 only, and the A2 invoice
		// is on the brand-internal order.
		const row = await byOrder('brandAMember', RLS_IDS.orderBrandAInternal);
		expect(row).toBeNull();
	});
});
