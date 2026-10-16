import { describe, it, expect } from 'vitest';
import { invoiceJustSettled, invoicePaidNotification } from './paid-notification.js';

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
