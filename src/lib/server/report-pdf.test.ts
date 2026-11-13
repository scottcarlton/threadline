import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateReportPdf } from './report-pdf.js';
import { buildReportChart } from '$lib/utils/report-chart.js';
import { reportTable } from '$lib/utils/report-columns.js';

/**
 * Smoke coverage, in the spirit of invoice-pdf.test.ts: no visual diffing,
 * but the failures a layout change causes (a throw on a missing field, a crash
 * paginating, an empty document) all surface here.
 */

const salesRows = (n: number) =>
	Array.from({ length: n }, (_, i) => ({
		name: `Account ${i + 1}`,
		orders: i + 1,
		revenue: (n - i) * 100
	}));

async function pages(bytes: Uint8Array) {
	return (await PDFDocument.load(bytes)).getPageCount();
}

describe('generateReportPdf', () => {
	it('renders a chart and a table with totals', async () => {
		const rows = salesRows(14);
		const bytes = await generateReportPdf({
			title: 'Sales by Account',
			orgName: 'Denise Org',
			filterLabel: 'Year 2026',
			generatedAt: new Date('2026-10-30'),
			chart: buildReportChart('sales-by-account', undefined, rows),
			table: reportTable('sales-by-account', undefined)!,
			rows
		});
		expect(await pages(bytes)).toBe(1);
	});

	it('paginates a long table', async () => {
		const rows = salesRows(120);
		const bytes = await generateReportPdf({
			title: 'Sales by Account',
			orgName: null,
			filterLabel: 'Year 2026',
			generatedAt: new Date(),
			chart: buildReportChart('sales-by-account', undefined, rows),
			table: reportTable('sales-by-account', undefined)!,
			rows
		});
		expect(await pages(bytes)).toBeGreaterThan(1);
	});

	it('renders an empty report without a chart', async () => {
		const bytes = await generateReportPdf({
			title: 'Order Pipeline',
			orgName: 'Acme',
			filterLabel: 'Current pipeline',
			generatedAt: new Date(),
			chart: null,
			table: reportTable('pipeline', undefined)!,
			rows: []
		});
		expect(await pages(bytes)).toBe(1);
	});

	it('survives missing fields on the widest table', async () => {
		const bytes = await generateReportPdf({
			title: 'Account Penetration',
			orgName: 'Acme',
			filterLabel: 'Year 2026',
			generatedAt: new Date(),
			chart: null,
			table: reportTable('account-penetration', 'brand')!,
			rows: [{ businessName: 'A very long account name that has to be truncated in its column' }]
		});
		expect(await pages(bytes)).toBe(1);
	});
});
