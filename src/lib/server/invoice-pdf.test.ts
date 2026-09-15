import { describe, it, expect } from 'vitest';
import { generateInvoicePdf, type InvoiceData } from './invoice-pdf.js';
import { generateOrderPdf, type OrderData } from './pdf.js';
import type { TableLine } from './pdf-layout.js';

/**
 * Smoke coverage for both documents.
 *
 * `pdf.ts` had no tests when its layout primitives were extracted into
 * `pdf-layout.ts` for this feature. These do not assert on visual output --
 * pdf-lib produces a binary and diffing it would be brittle -- but they do
 * catch the failure modes a refactor actually causes: a throw on a null field,
 * a crash paginating, or an empty document.
 */

const line = (overrides: Partial<TableLine> = {}): TableLine => ({
	style_number: 'A-1',
	description: 'Cotton shirt',
	color: 'Black',
	size: 'M',
	qty: 2,
	unit_price: 100,
	line_total: 200,
	...overrides
});

const invoice = (overrides: Partial<InvoiceData> = {}): InvoiceData => ({
	invoice_number: 'INV-ABC-00001',
	status: 'sent',
	issue_date: '2026-09-14',
	due_date: '2026-10-14',
	payment_terms: 'net_30',
	po_number: 'PO-9',
	bill_to_name: 'Buyer Co',
	bill_to_line1: '1 Main St',
	bill_to_line2: null,
	bill_to_city: 'Austin',
	bill_to_state: 'TX',
	bill_to_zip: '78701',
	bill_to_country: 'US',
	subtotal: 200,
	shipping_amount: 25,
	tax_amount: 20,
	total: 245,
	amount_paid: 0,
	orders: { order_number: 'ORD-1' },
	brands: { name: 'Test Brand' },
	...overrides
});

const order = (overrides: Partial<OrderData> = {}): OrderData => ({
	order_number: 'ORD-1',
	total_amount: 200,
	shipping_cost: 25,
	status: 'confirmed',
	notes: null,
	created_at: '2026-09-14T00:00:00.000Z',
	brands: { name: 'Test Brand' },
	accounts: null,
	seasons: null,
	shows: null,
	...overrides
});

function expectValidPdf(bytes: Uint8Array): void {
	expect(bytes.length).toBeGreaterThan(500);
	expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
}

describe('generateInvoicePdf', () => {
	it('renders a valid PDF', async () => {
		expectValidPdf(await generateInvoicePdf(invoice(), [line()]));
	});

	it('renders a draft, which has no number or dates', async () => {
		// The draft path is a real one: /api/invoices/[id]/pdf serves drafts to
		// the issuing brand org.
		expectValidPdf(
			await generateInvoicePdf(
				invoice({
					invoice_number: null,
					status: 'draft',
					issue_date: null,
					due_date: null,
					shipping_amount: null,
					tax_amount: null
				}),
				[line()]
			)
		);
	});

	it('renders with no lines', async () => {
		expectValidPdf(await generateInvoicePdf(invoice(), []));
	});

	it('renders with every optional field null', async () => {
		expectValidPdf(
			await generateInvoicePdf(
				invoice({
					invoice_number: null,
					issue_date: null,
					due_date: null,
					payment_terms: null,
					po_number: null,
					bill_to_name: null,
					bill_to_line1: null,
					bill_to_line2: null,
					bill_to_city: null,
					bill_to_state: null,
					bill_to_zip: null,
					bill_to_country: null,
					shipping_amount: null,
					tax_amount: null,
					orders: null,
					brands: null
				}),
				[line({ style_number: null, description: null, color: null, size: null })]
			)
		);
	});

	it('paginates a long invoice', async () => {
		const many = Array.from({ length: 120 }, (_, i) => line({ style_number: `A-${i}` }));
		const bytes = await generateInvoicePdf(invoice(), many);
		expectValidPdf(bytes);
		expect(bytes.length).toBeGreaterThan(5000);
	});

	it('renders the paid and balance rows once money has arrived', async () => {
		expectValidPdf(await generateInvoicePdf(invoice({ amount_paid: 100 }), [line()]));
	});

	it('accepts numeric strings, as PostgREST returns for NUMERIC', async () => {
		expectValidPdf(
			await generateInvoicePdf(
				invoice({ subtotal: '200.00', total: '245.00', tax_amount: '20.00' }),
				[line({ unit_price: '100.00', line_total: '200.00' })]
			)
		);
	});
});

describe('generateOrderPdf still works after the layout extraction', () => {
	it('renders a valid PDF', async () => {
		expectValidPdf(await generateOrderPdf(order(), [line()]));
	});

	it('renders without shipping, which skips the breakout rows', async () => {
		expectValidPdf(await generateOrderPdf(order({ shipping_cost: null }), [line()]));
	});

	it('renders with an account, notes, and a season', async () => {
		expectValidPdf(
			await generateOrderPdf(
				order({
					notes: 'Line one\nLine two',
					seasons: { name: 'SS26' },
					accounts: {
						business_name: 'Buyer Co',
						contact_first_name: 'Sam',
						contact_last_name: 'Lee',
						contact_email: 'sam@example.com',
						phone: '555-0100',
						address_line1: '1 Main St',
						address_line2: 'Suite 2',
						city: 'Austin',
						state: 'TX',
						zip: '78701',
						country: 'US'
					}
				}),
				[line()]
			)
		);
	});

	it('paginates a long order', async () => {
		const many = Array.from({ length: 120 }, (_, i) => line({ style_number: `A-${i}` }));
		expectValidPdf(await generateOrderPdf(order(), many));
	});
});
