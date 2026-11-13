import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadReport } from '$lib/server/reports/load-report.js';
import { generateReportPdf } from '$lib/server/report-pdf.js';
import { buildReportChart } from '$lib/utils/report-chart.js';
import { reportFilterLabel, reportTable } from '$lib/utils/report-columns.js';

/**
 * The report page as a PDF (SCO-151).
 *
 * Same access as the page: `loadReport` scopes rows to the signed-in viewer
 * exactly as the page does, and anyone who can open a report can already
 * download it as CSV. The query string carries the page's filter (`year` or
 * `days`), so the document matches what was on screen.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		throw error(401, 'Unauthorized');
	}

	const data = (await loadReport(locals, params.slug, url)) as {
		report: string;
		title: string;
		year: number;
		rows: Record<string, unknown>[];
		variant?: string;
		daysBack?: number;
	};

	const table = reportTable(data.report, data.variant);
	if (!table) throw error(404, 'Report not found');

	const pdfBytes = await generateReportPdf({
		title: data.title,
		orgName: locals.organization.name ?? null,
		filterLabel: reportFilterLabel(data.report, data.year, data.daysBack),
		generatedAt: new Date(),
		chart: buildReportChart(data.report, data.variant, data.rows),
		table,
		rows: data.rows
	});

	const suffix = data.report === 'product-performance' ? `${data.daysBack ?? 90}d` : data.year;
	return new Response(pdfBytes as Uint8Array & BlobPart, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${data.report}-${suffix}.pdf"`
		}
	});
};
