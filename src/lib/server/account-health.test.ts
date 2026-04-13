import { describe, it, expect } from 'vitest';
import { computeAccountHealth } from './account-health.js';
import { createMockSupabase } from '$lib/test-helpers/supabase-mock.js';
import { makeOrder, makeAccount } from '$lib/test-helpers/fixtures.js';

const currentYear = new Date().getFullYear();
const priorYear = currentYear - 1;

function daysAgo(n: number): string {
	return new Date(Date.now() - n * 86400000).toISOString();
}

function buildSupabase(accounts: Record<string, unknown>[], orders: Record<string, unknown>[]) {
	return createMockSupabase({
		orders: { data: orders },
		accounts: { data: accounts }
	});
}

describe('computeAccountHealth', () => {
	it('labels a new account (<90 days, no orders) as "new" with score 0', async () => {
		const supabase = buildSupabase([makeAccount({ id: 'a1', created_at: daysAgo(30) })], []);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		expect(health).toBeDefined();
		expect(health!.label).toBe('new');
		expect(health!.score).toBe(0);
		expect(health!.signals).toContain('New account — no orders yet');
	});

	it('labels an inactive account (>90 days, no orders) with score 10', async () => {
		const supabase = buildSupabase([makeAccount({ id: 'a1', created_at: daysAgo(200) })], []);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		expect(health!.label).toBe('inactive');
		expect(health!.score).toBe(10);
		expect(health!.signals).toContain('No orders placed');
	});

	it('skips archived accounts', async () => {
		const supabase = buildSupabase(
			[makeAccount({ id: 'a1', archived_at: '2025-01-01T00:00:00Z' })],
			[]
		);
		const result = await computeAccountHealth(supabase, 'org-1');
		expect(result.has('a1')).toBe(false);
	});

	it('scores recency: recent order (<30 days) gets 30 points', async () => {
		const supabase = buildSupabase(
			[makeAccount({ id: 'a1', created_at: daysAgo(365) })],
			[
				makeOrder({
					account_id: 'a1',
					created_at: daysAgo(10),
					order_year: currentYear,
					total_amount: 60000
				})
			]
		);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		// Recency 30 + Frequency 15 (1 ytd) + Monetary 25 ($60k) + Growth 15 (new customer this year) = 85
		expect(health!.score).toBe(85);
		expect(health!.label).toBe('excellent');
	});

	it('scores recency: order 45 days ago gets 25 points', async () => {
		const supabase = buildSupabase(
			[makeAccount({ id: 'a1', created_at: daysAgo(365) })],
			[
				makeOrder({
					account_id: 'a1',
					created_at: daysAgo(45),
					order_year: currentYear,
					total_amount: 1000
				})
			]
		);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		// Recency 25 + Frequency 15 (1 ytd) + Monetary 10 ($1k) + Growth 15 (new this year) = 65
		expect(health!.score).toBe(65);
		expect(health!.label).toBe('good');
	});

	it('scores recency: order 75 days ago gets 20 points', async () => {
		const supabase = buildSupabase(
			[makeAccount({ id: 'a1', created_at: daysAgo(365) })],
			[
				makeOrder({
					account_id: 'a1',
					created_at: daysAgo(75),
					order_year: currentYear,
					total_amount: 1000
				})
			]
		);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		// Recency 20 + Frequency 15 + Monetary 10 + Growth 15 = 60
		expect(health!.score).toBe(60);
	});

	it('scores recency: order 120 days ago gets 10 points with signal', async () => {
		const supabase = buildSupabase(
			[makeAccount({ id: 'a1', created_at: daysAgo(365) })],
			[
				makeOrder({
					account_id: 'a1',
					created_at: daysAgo(120),
					order_year: currentYear,
					total_amount: 1000
				})
			]
		);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		expect(health!.signals).toEqual(expect.arrayContaining([expect.stringContaining('days ago')]));
	});

	it('scores frequency: 5+ YTD orders gets 25 points', async () => {
		const orders = Array.from({ length: 6 }, (_, i) =>
			makeOrder({
				account_id: 'a1',
				created_at: daysAgo(10 + i * 5),
				order_year: currentYear,
				total_amount: 10000
			})
		);
		const supabase = buildSupabase([makeAccount({ id: 'a1', created_at: daysAgo(365) })], orders);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		// Recency 30 + Frequency 25 + Monetary 25 ($60k ytd) + Growth 15 (new this year) = 95
		expect(health!.score).toBe(95);
		expect(health!.label).toBe('excellent');
	});

	it('scores monetary: $50k+ YTD gets 25 points', async () => {
		const supabase = buildSupabase(
			[makeAccount({ id: 'a1', created_at: daysAgo(365) })],
			[
				makeOrder({
					account_id: 'a1',
					created_at: daysAgo(5),
					order_year: currentYear,
					total_amount: 55000
				})
			]
		);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		// Recency 30 + Frequency 15 + Monetary 25 + Growth 15 = 85
		expect(health!.score).toBe(85);
	});

	it('scores growth: 20%+ YoY adds 20 points with signal', async () => {
		const supabase = buildSupabase(
			[makeAccount({ id: 'a1', created_at: daysAgo(730) })],
			[
				makeOrder({
					account_id: 'a1',
					created_at: daysAgo(400),
					order_year: priorYear,
					total_amount: 10000
				}),
				makeOrder({
					account_id: 'a1',
					created_at: daysAgo(5),
					order_year: currentYear,
					total_amount: 15000
				})
			]
		);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		// YoY growth = 50%, so +20 for growth
		expect(health!.yoyGrowth).toBe(50);
		expect(health!.signals).toEqual(
			expect.arrayContaining([expect.stringContaining('Growing 50% YoY')])
		);
	});

	it('scores growth: negative YoY adds declining signal', async () => {
		const supabase = buildSupabase(
			[makeAccount({ id: 'a1', created_at: daysAgo(730) })],
			[
				makeOrder({
					account_id: 'a1',
					created_at: daysAgo(400),
					order_year: priorYear,
					total_amount: 20000
				}),
				makeOrder({
					account_id: 'a1',
					created_at: daysAgo(5),
					order_year: currentYear,
					total_amount: 10000
				})
			]
		);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		expect(health!.yoyGrowth).toBe(-50);
		expect(health!.signals).toEqual(
			expect.arrayContaining([expect.stringContaining('Declining 50% YoY')])
		);
	});

	it('caps score at 35 for accounts that ordered last year but not this year', async () => {
		const supabase = buildSupabase(
			[makeAccount({ id: 'a1', created_at: daysAgo(730) })],
			[
				makeOrder({
					account_id: 'a1',
					created_at: daysAgo(400),
					order_year: priorYear,
					total_amount: 50000
				})
			]
		);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		expect(health!.score).toBeLessThanOrEqual(35);
		expect(health!.signals).toContain('Ordered last year but not this year');
		// Score is 10 (recency 5 + growth 5), capped at 35, so label is 'inactive' (<20)
		expect(health!.label).toBe('inactive');
	});

	it('computes correct metrics: lifetimeRevenue, avgOrderValue, ytdOrders', async () => {
		const supabase = buildSupabase(
			[makeAccount({ id: 'a1', created_at: daysAgo(730) })],
			[
				makeOrder({
					account_id: 'a1',
					order_year: priorYear,
					total_amount: 3000,
					created_at: daysAgo(400)
				}),
				makeOrder({
					account_id: 'a1',
					order_year: currentYear,
					total_amount: 5000,
					created_at: daysAgo(10)
				}),
				makeOrder({
					account_id: 'a1',
					order_year: currentYear,
					total_amount: 7000,
					created_at: daysAgo(5)
				})
			]
		);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		expect(health!.totalOrders).toBe(3);
		expect(health!.ytdOrders).toBe(2);
		expect(health!.lifetimeRevenue).toBe(15000);
		expect(health!.ytdRevenue).toBe(12000);
		expect(health!.avgOrderValue).toBe(5000);
	});

	it('handles multiple accounts independently', async () => {
		const supabase = buildSupabase(
			[
				makeAccount({ id: 'a1', created_at: daysAgo(30) }),
				makeAccount({ id: 'a2', created_at: daysAgo(365) })
			],
			[
				makeOrder({
					account_id: 'a2',
					order_year: currentYear,
					total_amount: 60000,
					created_at: daysAgo(5)
				})
			]
		);
		const result = await computeAccountHealth(supabase, 'org-1');

		expect(result.get('a1')!.label).toBe('new');
		expect(result.get('a2')!.label).toBe('excellent');
	});

	it('handles null/empty data from supabase gracefully', async () => {
		const supabase = createMockSupabase({
			orders: { data: null },
			accounts: { data: null }
		});
		const result = await computeAccountHealth(supabase, 'org-1');
		expect(result.size).toBe(0);
	});

	it('assigns correct label thresholds', async () => {
		// Recency 10 (120 days) + Frequency 15 (1 ytd) + Monetary 5 ($500) + Growth 15 (new this year) = 45 → fair
		const supabase = buildSupabase(
			[makeAccount({ id: 'a1', created_at: daysAgo(365) })],
			[
				makeOrder({
					account_id: 'a1',
					created_at: daysAgo(120),
					order_year: currentYear,
					total_amount: 500
				})
			]
		);
		const result = await computeAccountHealth(supabase, 'org-1');
		const health = result.get('a1');

		expect(health!.score).toBe(45);
		expect(health!.label).toBe('fair');
	});
});
