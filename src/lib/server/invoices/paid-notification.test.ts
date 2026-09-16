import { describe, it, expect } from 'vitest';
import {
	invoiceJustSettled,
	invoicePaidNotification,
	repCommissionNotification
} from './paid-notification.js';

describe('invoiceJustSettled', () => {
	it('fires on the crossing into paid', () => {
		expect(invoiceJustSettled('sent', 'paid')).toBe(true);
		expect(invoiceJustSettled('partial', 'paid')).toBe(true);
	});

	it('does not fire again on a payment against an already-paid invoice', () => {
		// The case worth naming. Overpayment is allowed, so `paid -> paid` is an
		// ordinary transition, and a bare `after === 'paid'` check would announce
		// the invoice paid every time more money arrived against it.
		expect(invoiceJustSettled('paid', 'paid')).toBe(false);
	});

	it('does not fire on a payment that leaves a balance', () => {
		expect(invoiceJustSettled('sent', 'partial')).toBe(false);
		expect(invoiceJustSettled('partial', 'partial')).toBe(false);
	});

	it('does not fire for a void invoice', () => {
		// recalc_invoice_amount_paid() leaves a voided invoice on `void` no matter
		// what arrives, so this should never happen; asserting it means a change
		// to that rule shows up here rather than as a spurious notification.
		expect(invoiceJustSettled('void', 'void')).toBe(false);
	});

	it('does not fire when the status could not be read back', () => {
		// A failed re-read must not be treated as a settlement.
		expect(invoiceJustSettled('partial', null)).toBe(false);
		expect(invoiceJustSettled('partial', undefined)).toBe(false);
	});
});

describe('invoicePaidNotification', () => {
	it('names the invoice and the amount', () => {
		const n = invoicePaidNotification({
			id: 'inv-1',
			invoice_number: 'INV-CAT-00002',
			total: 1750
		});
		expect(n.type).toBe('invoice_paid');
		expect(n.title).toBe('Invoice paid');
		expect(n.body).toBe('INV-CAT-00002 has been paid in full ($1,750.00)');
		expect(n.link).toBe('/invoices/inv-1');
	});

	it('handles the numeric strings PostgREST returns', () => {
		const n = invoicePaidNotification({ id: 'inv-1', invoice_number: 'X', total: '1750.00' });
		expect(n.body).toContain('$1,750.00');
	});

	it('degrades to a readable sentence without a number', () => {
		// Unreachable in practice, since numbering happens on send and a draft
		// cannot take a payment. This is about not rendering "Invoice null".
		const n = invoicePaidNotification({ id: 'inv-1', invoice_number: null, total: 10 });
		expect(n.body).toBe('An invoice has been paid in full ($10.00)');
	});
});

describe('repCommissionNotification', () => {
	it('names the invoice and order, and links to the order', () => {
		// Links to the order, not the invoice: a rep has no /invoices route, and
		// the order page is where commission is already displayed.
		const n = repCommissionNotification({
			orderId: 'ord-1',
			orderNumber: 'DEN-000002',
			invoiceNumber: 'INV-CAT-00004'
		});
		expect(n.type).toBe('commission_earned');
		expect(n.title).toBe('Commission earned');
		expect(n.body).toBe(
			'INV-CAT-00004 for order DEN-000002 has been paid, so your commission on it is earned'
		);
		expect(n.link).toBe('/orders/ord-1');
	});

	it('carries no amount', () => {
		// Commission resolves from three different places and the order page does
		// not collapse them server-side. Quoting a figure here would be a second,
		// divergent calculation of someone's pay.
		const n = repCommissionNotification({
			orderId: 'ord-1',
			orderNumber: 'DEN-1',
			invoiceNumber: 'INV-1'
		});
		expect(n.body).not.toMatch(/[$%]/);
		expect(n.body).not.toMatch(/\d+\.\d\d/);
	});

	it('reads sensibly when the numbers are missing', () => {
		const n = repCommissionNotification({
			orderId: 'ord-1',
			orderNumber: null,
			invoiceNumber: null
		});
		expect(n.body).toBe(
			'The invoice for your order has been paid, so your commission on it is earned'
		);
	});
});
