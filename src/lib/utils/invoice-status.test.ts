import { describe, it, expect } from 'vitest';
import { invoiceDisplayStatus, invoiceBalance, computeInvoiceMetrics } from './invoice-status.js';

const TODAY = '2026-09-14';

const inv = (overrides: Record<string, unknown> = {}) =>
	({
		status: 'sent',
		due_date: '2026-10-14',
		total: 100,
		amount_paid: 0,
		...overrides
	}) as Parameters<typeof invoiceDisplayStatus>[0] &
		Parameters<typeof invoiceBalance>[0] &
		Parameters<typeof computeInvoiceMetrics>[0][number];

describe('invoiceDisplayStatus', () => {
	it('passes through a status that cannot be overdue', () => {
		for (const status of ['draft', 'paid', 'void']) {
			expect(invoiceDisplayStatus(inv({ status, due_date: '2020-01-01' }), TODAY)).toBe(status);
		}
	});

	it('reports sent and partial as overdue once the due date has passed', () => {
		expect(invoiceDisplayStatus(inv({ status: 'sent', due_date: '2026-09-13' }), TODAY)).toBe(
			'overdue'
		);
		expect(invoiceDisplayStatus(inv({ status: 'partial', due_date: '2026-09-13' }), TODAY)).toBe(
			'overdue'
		);
	});

	it('is not overdue on the due date itself', () => {
		// Due today means due today, not late.
		expect(invoiceDisplayStatus(inv({ due_date: TODAY }), TODAY)).toBe('sent');
	});

	it('is never overdue without a due date', () => {
		// `other` payment terms produce no due date. Inventing a deadline to
		// chase someone for missing it would be the actual bug.
		expect(invoiceDisplayStatus(inv({ due_date: null }), TODAY)).toBe('sent');
	});
});

describe('invoiceBalance', () => {
	it('is the unpaid remainder', () => {
		expect(invoiceBalance(inv({ total: 100, amount_paid: 30 }))).toBe(70);
	});

	it('is zero for a void invoice regardless of its total', () => {
		expect(invoiceBalance(inv({ status: 'void', total: 100, amount_paid: 0 }))).toBe(0);
	});

	it('handles the numeric strings PostgREST returns', () => {
		expect(invoiceBalance(inv({ total: '100.00', amount_paid: '30.00' }))).toBe(70);
	});
});

describe('computeInvoiceMetrics', () => {
	it('counts drafts without owing anything for them', () => {
		// An unsent invoice is not owed yet, so it must not inflate outstanding.
		const m = computeInvoiceMetrics([inv({ status: 'draft', total: 500 })], TODAY);
		expect(m.draftCount).toBe(1);
		expect(m.outstanding).toBe(0);
		expect(m.outstandingCount).toBe(0);
	});

	it('excludes void invoices entirely', () => {
		const m = computeInvoiceMetrics([inv({ status: 'void', total: 500 })], TODAY);
		expect(m.outstanding).toBe(0);
		expect(m.paidThisPeriod).toBe(0);
		expect(m.draftCount).toBe(0);
	});

	it('counts a paid invoice as collected, not outstanding', () => {
		const m = computeInvoiceMetrics([inv({ status: 'paid', total: 200, amount_paid: 200 })], TODAY);
		expect(m.paidThisPeriod).toBe(200);
		expect(m.outstanding).toBe(0);
	});

	it('counts only the unpaid balance of a partial as outstanding', () => {
		const m = computeInvoiceMetrics(
			[inv({ status: 'partial', total: 200, amount_paid: 50 })],
			TODAY
		);
		expect(m.outstanding).toBe(150);
		expect(m.outstandingCount).toBe(1);
	});

	it('counts overdue inside outstanding, not alongside it', () => {
		// Overdue is a subset. Adding them would double-count what is owed.
		const m = computeInvoiceMetrics(
			[
				inv({ status: 'sent', due_date: '2026-09-13', total: 100 }),
				inv({ status: 'sent', due_date: '2026-12-01', total: 300 })
			],
			TODAY
		);
		expect(m.outstanding).toBe(400);
		expect(m.outstandingCount).toBe(2);
		expect(m.overdue).toBe(100);
		expect(m.overdueCount).toBe(1);
	});

	it('returns zeroes for an empty list', () => {
		expect(computeInvoiceMetrics([], TODAY)).toEqual({
			outstanding: 0,
			outstandingCount: 0,
			overdue: 0,
			overdueCount: 0,
			draftCount: 0,
			paidThisPeriod: 0
		});
	});
});
