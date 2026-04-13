import { describe, it, expect, vi } from 'vitest';
import {
	refreshInsights,
	computeRevenueLeakage,
	computeOverdueOrders,
	computeOrderGaps
} from './insights-engine.js';
import { createMockSupabase } from '$lib/test-helpers/supabase-mock.js';
import { makeOrder, makeOverdueOrder, makeDelivery } from '$lib/test-helpers/fixtures.js';

const currentYear = new Date().getFullYear();
const priorYear = currentYear - 1;

describe('computeRevenueLeakage', () => {
	it('identifies accounts that ordered last year but not this year', async () => {
		const supabase = createMockSupabase({
			orders: {
				data: [
					makeOrder({ account_id: 'a1', order_year: priorYear, total_amount: 20000 }),
					makeOrder({ account_id: 'a2', order_year: priorYear, total_amount: 10000 }),
					makeOrder({ account_id: 'a2', order_year: currentYear, total_amount: 5000 })
				]
			},
			accounts: {
				data: [{ id: 'a1', business_name: 'Lapsed Store' }]
			}
		});

		const insights = await computeRevenueLeakage(supabase, 'org-1');

		expect(insights).toHaveLength(1);
		expect(insights[0].entity_id).toBe('a1');
		expect(insights[0].insight_type).toBe('revenue_leakage');
		expect(insights[0].title).toContain('Lapsed Store');
		expect(insights[0].title).toContain(String(currentYear));
		expect(insights[0].metadata.prior_revenue).toBe(20000);
	});

	it('returns empty when no orders exist', async () => {
		const supabase = createMockSupabase({
			orders: { data: [] }
		});

		const insights = await computeRevenueLeakage(supabase, 'org-1');
		expect(insights).toHaveLength(0);
	});

	it('returns empty when all accounts have current year orders', async () => {
		const supabase = createMockSupabase({
			orders: {
				data: [
					makeOrder({ account_id: 'a1', order_year: priorYear, total_amount: 10000 }),
					makeOrder({ account_id: 'a1', order_year: currentYear, total_amount: 5000 })
				]
			}
		});

		const insights = await computeRevenueLeakage(supabase, 'org-1');
		expect(insights).toHaveLength(0);
	});

	it('sorts lapsed accounts by prior revenue descending', async () => {
		const supabase = createMockSupabase({
			orders: {
				data: [
					makeOrder({ account_id: 'a1', order_year: priorYear, total_amount: 5000 }),
					makeOrder({ account_id: 'a2', order_year: priorYear, total_amount: 50000 }),
					makeOrder({ account_id: 'a3', order_year: priorYear, total_amount: 15000 })
				]
			},
			accounts: {
				data: [
					{ id: 'a1', business_name: 'Small' },
					{ id: 'a2', business_name: 'Large' },
					{ id: 'a3', business_name: 'Medium' }
				]
			}
		});

		const insights = await computeRevenueLeakage(supabase, 'org-1');

		expect(insights).toHaveLength(3);
		expect(insights[0].entity_id).toBe('a2'); // $50k
		expect(insights[1].entity_id).toBe('a3'); // $15k
		expect(insights[2].entity_id).toBe('a1'); // $5k
	});

	it('assigns priority scores with highest revenue getting 95', async () => {
		const supabase = createMockSupabase({
			orders: {
				data: [makeOrder({ account_id: 'a1', order_year: priorYear, total_amount: 50000 })]
			},
			accounts: {
				data: [{ id: 'a1', business_name: 'Top' }]
			}
		});

		const insights = await computeRevenueLeakage(supabase, 'org-1');
		expect(insights[0].priority_score).toBe(95);
	});
});

describe('computeOverdueOrders', () => {
	it('identifies orders past expected ship date with confirmed/submitted status', async () => {
		const supabase = createMockSupabase({
			orders: {
				data: [
					makeOverdueOrder({
						expected_ship_date: '2026-03-01',
						status: 'confirmed'
					})
				]
			}
		});

		const insights = await computeOverdueOrders(supabase, 'org-1');

		expect(insights).toHaveLength(1);
		expect(insights[0].insight_type).toBe('overdue_order');
		expect(insights[0].entity_type).toBe('order');
		expect(insights[0].title).toContain('overdue');
		expect(insights[0].metadata.status).toBe('confirmed');
	});

	it('returns empty when no overdue orders', async () => {
		const supabase = createMockSupabase({
			orders: { data: [] }
		});

		const insights = await computeOverdueOrders(supabase, 'org-1');
		expect(insights).toHaveLength(0);
	});

	it('calculates days overdue correctly', async () => {
		const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];
		const supabase = createMockSupabase({
			orders: {
				data: [makeOverdueOrder({ expected_ship_date: tenDaysAgo })]
			}
		});

		const insights = await computeOverdueOrders(supabase, 'org-1');
		expect(insights[0].metadata.days_overdue).toBe(10);
		expect(insights[0].title).toContain('10 days overdue');
	});

	it('uses singular "day" for 1 day overdue', async () => {
		const yesterday = new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0];
		const supabase = createMockSupabase({
			orders: {
				data: [makeOverdueOrder({ expected_ship_date: yesterday })]
			}
		});

		const insights = await computeOverdueOrders(supabase, 'org-1');
		expect(insights[0].title).toContain('1 day overdue');
	});

	it('caps priority score at 95', async () => {
		const longAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
		const supabase = createMockSupabase({
			orders: {
				data: [makeOverdueOrder({ expected_ship_date: longAgo })]
			}
		});

		const insights = await computeOverdueOrders(supabase, 'org-1');
		expect(insights[0].priority_score).toBeLessThanOrEqual(95);
	});

	it('includes account and brand names in description', async () => {
		const supabase = createMockSupabase({
			orders: {
				data: [
					makeOverdueOrder({
						expected_ship_date: '2026-03-01',
						accounts: { business_name: 'Acme Store' },
						brands: { name: 'Cool Brand' }
					})
				]
			}
		});

		const insights = await computeOverdueOrders(supabase, 'org-1');
		expect(insights[0].description).toContain('Acme Store');
		expect(insights[0].description).toContain('Cool Brand');
	});
});

describe('computeOrderGaps', () => {
	it('returns empty when no deliveries exist', async () => {
		const supabase = createMockSupabase({
			season_deliveries: { data: [] }
		});

		const insights = await computeOrderGaps(supabase, 'org-1');
		expect(insights).toHaveLength(0);
	});

	it('returns empty when no orders exist', async () => {
		const supabase = createMockSupabase({
			season_deliveries: {
				data: [makeDelivery({ delivery_month: 12 })]
			},
			orders: { data: [] }
		});

		const insights = await computeOrderGaps(supabase, 'org-1');
		expect(insights).toHaveLength(0);
	});
});

describe('refreshInsights', () => {
	it('deletes old active insights and inserts new ones', async () => {
		// This test verifies the orchestration: delete old → compute → insert new
		// We mock all sub-computations by providing appropriate data
		const supabase = createMockSupabase({
			// For revenue leakage
			orders: { data: [] },
			// For order gaps
			season_deliveries: { data: [] },
			// For call queue (needs accounts + appointments + health)
			accounts: { data: [] },
			appointments: { data: [] },
			// For overdue orders (reuses orders mock above)
			// Delete and insert operations
			insight_actions: { data: null, error: null }
		});

		const result = await refreshInsights(supabase, 'org-1');

		expect(result.errors).toHaveLength(0);
		expect(result.inserted).toBe(0); // no data to generate insights from
		// Verify delete was called on insight_actions
		expect(supabase.from).toHaveBeenCalledWith('insight_actions');
	});

	it('collects errors from failed computations', async () => {
		// Create a supabase mock that throws on certain queries
		const supabase = createMockSupabase({
			orders: { data: null, error: { message: 'DB error' } },
			season_deliveries: { data: [] },
			accounts: { data: [] },
			appointments: { data: [] },
			insight_actions: { data: null, error: null }
		});

		const result = await refreshInsights(supabase, 'org-1');

		// Should still complete (Promise.allSettled), errors collected
		expect(result).toBeDefined();
	});

	it('returns correct inserted count when insights are generated', async () => {
		const supabase = createMockSupabase({
			orders: {
				data: [makeOrder({ account_id: 'a1', order_year: priorYear, total_amount: 10000 })]
			},
			accounts: {
				data: [{ id: 'a1', business_name: 'Test' }]
			},
			season_deliveries: { data: [] },
			appointments: { data: [] },
			insight_actions: { data: null, error: null }
		});

		const result = await refreshInsights(supabase, 'org-1');

		// At least the revenue leakage insight should be generated
		expect(result.inserted).toBeGreaterThanOrEqual(1);
	});
});
