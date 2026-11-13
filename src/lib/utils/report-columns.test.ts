import { describe, expect, it } from 'vitest';
import { reportFilterLabel, reportTable } from './report-columns';

const labels = (report: string, variant?: string) =>
	reportTable(report, variant)?.columns.map((c) => c.label);

describe('reportTable', () => {
	it('names the first column after the grouping', () => {
		expect(labels('sales-by-brand')?.[0]).toBe('Brand');
		expect(labels('sales-by-account')?.[0]).toBe('Account');
		expect(labels('sales-by-rep')?.[0]).toBe('Rep');
	});

	it('uses the brand table for the brand variant of sales-by-rep', () => {
		expect(labels('sales-by-rep', 'brand')).toEqual([
			'Rep',
			'Agency',
			'Orders',
			'Revenue',
			'Avg Order Value',
			'Last Order'
		]);
	});

	it('formats money, averages, and totals like the page', () => {
		const table = reportTable('sales-by-brand', undefined)!;
		const rows = [
			{ name: 'A', orders: 2, revenue: 1000 },
			{ name: 'B', orders: 0, revenue: 0 }
		];
		const [name, orders, avg, revenue] = table.columns;
		expect(avg.value(rows[0])).toBe('$500');
		expect(avg.value(rows[1])).toBe('$0');
		expect(revenue.value(rows[0])).toBe('$1,000');
		expect(table.hasTotals).toBe(true);
		expect(name.total?.(rows)).toBe('Total');
		expect(orders.total?.(rows)).toBe('2');
		expect(revenue.total?.(rows)).toBe('$1,000');
		expect(avg.total).toBeUndefined();
	});

	it('marks in-house agencies and inactive seasons in text', () => {
		const agency = reportTable('territory-coverage', 'brand')!.columns[0];
		expect(agency.value({ agencyName: 'Acme', source: 'in_house' })).toBe('Acme (In-house)');
		const season = reportTable('season-sell-through', 'brand')!.columns[0];
		expect(season.value({ seasonName: 'SS26', isActive: false })).toBe('SS26 (Inactive)');
	});

	it('writes None for a missing last order date', () => {
		const last = reportTable('account-penetration', 'brand')!.columns[6];
		expect(last.value({ lastOrderDate: null })).toBe('None');
	});

	it('capitalizes pipeline statuses', () => {
		expect(reportTable('pipeline', undefined)!.columns[0].value({ status: 'submitted' })).toBe(
			'Submitted'
		);
	});

	it('right-aligns every numeric column', () => {
		const table = reportTable('commission', undefined)!;
		const aligned = Object.fromEntries(table.columns.map((c) => [c.label, c.align]));
		expect(aligned).toMatchObject({ Brand: 'left', Amount: 'right', 'Rep Comm.': 'right' });
	});

	it.each(['territory-coverage', 'account-penetration', 'season-sell-through'])(
		'has no table for the brand-only %s without the brand variant',
		(report) => {
			expect(reportTable(report, undefined)).toBeNull();
		}
	);

	it('returns null for an unknown report', () => {
		expect(reportTable('nope', undefined)).toBeNull();
	});
});

describe('reportFilterLabel', () => {
	it('describes each filter the way the page sets it', () => {
		expect(reportFilterLabel('sales-by-brand', 2026)).toBe('Year 2026');
		expect(reportFilterLabel('product-performance', 2026, 30)).toBe('Last 30 days');
		expect(reportFilterLabel('pipeline', 2026)).toBe('Current pipeline');
	});
});
