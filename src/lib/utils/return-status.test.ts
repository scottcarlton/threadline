import { describe, expect, it } from 'vitest';
import {
	computeReturnMetrics,
	RETURN_DISPOSITION_LABELS,
	RETURN_STATUS_LABELS,
	returnCreditIssued,
	returnIsOpen,
	returnLinesValue,
	returnNeedsAction,
	returnQueueRank,
	returnUnits,
	type ReturnListRow
} from './return-status';
import type { ReturnDisposition, ReturnStatus } from '$lib/types/database';

const ALL_STATUSES: ReturnStatus[] = [
	'requested',
	'approved',
	'declined',
	'received',
	'closed',
	'cancelled'
];

const row = (over: Partial<ReturnListRow> = {}): ReturnListRow =>
	({
		id: 'ra-1',
		status: 'requested',
		credit_memo_number: null,
		credit_total: 0,
		...over
	}) as ReturnListRow;

describe('labels', () => {
	it('has a label for every status', () => {
		for (const s of ALL_STATUSES) expect(RETURN_STATUS_LABELS[s]).toBeTruthy();
	});

	it('calls `closed` Credited, not Closed', () => {
		// The column names the state machine; the label has to name what happened
		// to the person reading it. A return only reaches closed by being credited.
		expect(RETURN_STATUS_LABELS.closed).toBe('Credited');
	});

	it('has a label for every disposition', () => {
		const all: ReturnDisposition[] = ['restock', 'damaged', 'destroy'];
		for (const d of all) expect(RETURN_DISPOSITION_LABELS[d]).toBeTruthy();
	});
});

describe('returnIsOpen', () => {
	it('is true only while the return is still moving', () => {
		expect(returnIsOpen('requested')).toBe(true);
		expect(returnIsOpen('approved')).toBe(true);
		expect(returnIsOpen('received')).toBe(true);
	});

	it('is false once settled', () => {
		expect(returnIsOpen('declined')).toBe(false);
		expect(returnIsOpen('closed')).toBe(false);
		expect(returnIsOpen('cancelled')).toBe(false);
	});
});

describe('returnNeedsAction', () => {
	it('queues open returns for the issuing brand', () => {
		expect(returnNeedsAction('requested', true)).toBe(true);
		expect(returnNeedsAction('approved', true)).toBe(true);
		expect(returnNeedsAction('received', true)).toBe(true);
	});

	it('never queues anything for a rep or buyer', () => {
		// Approve, decline, receive and credit are all brand acts; there is no rep
		// or buyer UPDATE policy. Telling them to act would be telling them to do
		// something they are not permitted to do.
		for (const s of ALL_STATUSES) expect(returnNeedsAction(s, false)).toBe(false);
	});

	it('does not queue a settled return even for the brand', () => {
		expect(returnNeedsAction('closed', true)).toBe(false);
		expect(returnNeedsAction('declined', true)).toBe(false);
		expect(returnNeedsAction('cancelled', true)).toBe(false);
	});
});

describe('returnQueueRank', () => {
	it('puts a pending request above everything', () => {
		// Somebody is waiting on an answer.
		expect(returnQueueRank('requested')).toBeLessThan(returnQueueRank('approved'));
		expect(returnQueueRank('requested')).toBeLessThan(returnQueueRank('received'));
		expect(returnQueueRank('requested')).toBeLessThan(returnQueueRank('closed'));
	});

	it('orders the open states by how far along they are', () => {
		expect(returnQueueRank('approved')).toBeLessThan(returnQueueRank('received'));
	});

	it('drops every settled state into one bucket below the open ones', () => {
		const settled = [
			returnQueueRank('declined'),
			returnQueueRank('closed'),
			returnQueueRank('cancelled')
		];
		expect(new Set(settled).size).toBe(1);
		expect(Math.min(...settled)).toBeGreaterThan(returnQueueRank('received'));
	});
});

describe('returnUnits', () => {
	it('sums quantities rather than counting lines', () => {
		expect(returnUnits([{ qty: 3 }, { qty: 2 }])).toBe(5);
	});

	it('is zero for no lines', () => {
		expect(returnUnits([])).toBe(0);
	});

	it('accepts the strings Supabase returns for numeric columns', () => {
		expect(returnUnits([{ qty: '4' }])).toBe(4);
	});

	it('treats a null quantity as zero', () => {
		expect(returnUnits([{ qty: null }, { qty: 2 }])).toBe(2);
	});
});

describe('returnLinesValue', () => {
	it('multiplies quantity by unit price', () => {
		expect(returnLinesValue([{ qty: 2, unit_price: 120 }])).toBe(240);
	});

	it('sums across lines', () => {
		expect(
			returnLinesValue([
				{ qty: 2, unit_price: 120 },
				{ qty: 1, unit_price: 40 }
			])
		).toBe(280);
	});

	it('accepts NUMERIC strings', () => {
		expect(returnLinesValue([{ qty: '2', unit_price: '12.50' }])).toBe(25);
	});
});

describe('returnCreditIssued', () => {
	it('is true once a memo number exists', () => {
		expect(returnCreditIssued({ credit_memo_number: 'CM-CAT-00001' })).toBe(true);
	});

	it('is false before issue', () => {
		expect(returnCreditIssued({ credit_memo_number: null })).toBe(false);
	});
});

describe('computeReturnMetrics', () => {
	it('counts open and requested separately', () => {
		const m = computeReturnMetrics([
			row({ status: 'requested' }),
			row({ status: 'approved' }),
			row({ status: 'closed' })
		]);
		expect(m.openCount).toBe(2);
		expect(m.requestedCount).toBe(1);
	});

	it('sums credited totals only where a memo was issued', () => {
		const m = computeReturnMetrics([
			row({ status: 'closed', credit_memo_number: 'CM-1', credit_total: 240 }),
			row({ status: 'closed', credit_memo_number: 'CM-2', credit_total: 60 })
		]);
		expect(m.creditedTotal).toBe(300);
	});

	it('ignores the zeroed money on returns nobody has credited yet', () => {
		// credit_total defaults to 0 from creation, so summing every row would
		// fold uncredited returns into a figure that reads as real.
		const m = computeReturnMetrics([
			row({ status: 'requested', credit_total: 0 }),
			row({ status: 'closed', credit_memo_number: 'CM-1', credit_total: 240 })
		]);
		expect(m.creditedTotal).toBe(240);
	});

	it('is all zeroes for an empty list', () => {
		expect(computeReturnMetrics([])).toEqual({
			openCount: 0,
			requestedCount: 0,
			creditedTotal: 0
		});
	});
});
