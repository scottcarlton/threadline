import { describe, it, expect } from 'vitest';
import { classifyOrder, parseSpotlightParam, type SpotlightInput } from './order-spotlight.js';

const TODAY = '2026-04-29';

function order(partial: Partial<SpotlightInput>): SpotlightInput {
	return {
		status: 'submitted',
		start_ship_date: null,
		expected_ship_date: null,
		shipped_at: null,
		updated_at: null,
		...partial
	};
}

describe('classifyOrder', () => {
	it('returns empty for shipped orders', () => {
		expect(
			classifyOrder(
				order({ status: 'submitted', expected_ship_date: '2026-01-01', shipped_at: '2026-01-02' }),
				TODAY
			)
		).toEqual([]);
	});

	it('returns empty for delivered/cancelled orders', () => {
		expect(classifyOrder(order({ status: 'delivered' }), TODAY)).toEqual([]);
		expect(classifyOrder(order({ status: 'cancelled' }), TODAY)).toEqual([]);
	});

	it('flags overdue when expected_ship_date is past today', () => {
		expect(
			classifyOrder(order({ status: 'submitted', expected_ship_date: '2026-04-28' }), TODAY)
		).toContain('overdue');
		expect(
			classifyOrder(order({ status: 'confirmed', expected_ship_date: '2026-04-28' }), TODAY)
		).toContain('overdue');
	});

	it('does not flag overdue on the boundary day', () => {
		expect(
			classifyOrder(order({ status: 'submitted', expected_ship_date: TODAY }), TODAY)
		).not.toContain('overdue');
	});

	it('flags approaching_start when start is within 7 days', () => {
		expect(
			classifyOrder(
				order({ start_ship_date: '2026-05-05', expected_ship_date: '2026-05-20' }),
				TODAY
			)
		).toContain('approaching_start');
		expect(
			classifyOrder(
				order({ start_ship_date: '2026-05-06', expected_ship_date: '2026-05-20' }),
				TODAY
			)
		).toContain('approaching_start');
	});

	it('does not flag approaching_start beyond 7 days', () => {
		expect(
			classifyOrder(
				order({ start_ship_date: '2026-05-07', expected_ship_date: '2026-05-20' }),
				TODAY
			)
		).not.toContain('approaching_start');
	});

	it('flags in_window when today is between start and expected', () => {
		expect(
			classifyOrder(
				order({ start_ship_date: '2026-04-25', expected_ship_date: '2026-05-10' }),
				TODAY
			)
		).toContain('in_window');
	});

	it('flags approaching_complete when expected is within 7 days from today', () => {
		const buckets = classifyOrder(
			order({ start_ship_date: '2026-04-01', expected_ship_date: '2026-05-05' }),
			TODAY
		);
		expect(buckets).toContain('approaching_complete');
		expect(buckets).toContain('in_window');
	});

	it('flags stale_draft when draft updated_at is older than 21 days', () => {
		const old = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString();
		expect(classifyOrder(order({ status: 'draft', updated_at: old }))).toContain('stale_draft');
	});

	it('does not flag stale_draft for fresh drafts', () => {
		const fresh = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
		expect(classifyOrder(order({ status: 'draft', updated_at: fresh }))).not.toContain(
			'stale_draft'
		);
	});

	it('does not flag stale_draft for non-draft orders', () => {
		const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
		expect(classifyOrder(order({ status: 'submitted', updated_at: old }))).not.toContain(
			'stale_draft'
		);
	});
});

describe('parseSpotlightParam', () => {
	it('returns null for empty/missing', () => {
		expect(parseSpotlightParam(null)).toBeNull();
		expect(parseSpotlightParam('')).toBeNull();
		expect(parseSpotlightParam('garbage')).toBeNull();
	});

	it('returns "all" for all', () => {
		expect(parseSpotlightParam('all')).toBe('all');
	});

	it('returns the bucket for valid bucket names', () => {
		expect(parseSpotlightParam('overdue')).toBe('overdue');
		expect(parseSpotlightParam('stale_draft')).toBe('stale_draft');
	});
});
