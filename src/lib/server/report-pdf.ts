import type { PDFFont, rgb } from 'pdf-lib';
import { createPdfCanvas, type PdfCanvas } from './pdf-layout.js';
import type { ReportChart } from '$lib/utils/report-chart.js';
import type { ReportTable } from '$lib/utils/report-columns.js';

/**
 * A report as a PDF (SCO-151): title block, the SCO-150 bar chart, then the
 * table. Built from the same rows, chart and columns the page renders, so the
 * document is the page on paper, filter included.
 *
 * Uses the shared canvas in `pdf-layout.ts`, the same page setup and type scale
 * as order, invoice and credit memo PDFs.
 */

export interface ReportPdfInput {
	title: string;
	orgName: string | null;
	/** The filter the rows were loaded with, e.g. "Year 2026". */
	filterLabel: string;
	generatedAt: Date;
	chart: ReportChart | null;
	table: ReportTable;
	rows: Record<string, unknown>[];
}

const currency = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 0,
	maximumFractionDigits: 0
});

/** Bars that carry a printed value, matching the chart on the page. */
const LABELLED = 3;

export async function generateReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
	const c = await createPdfCanvas();
	const { gray } = c.colors;

	// --- Title block ---
	c.text(input.title, c.margin, c.y, { font: c.bold, size: 20 });
	if (input.orgName) c.rightText(input.orgName, c.y, { size: 11, color: gray });
	c.y -= 18;

	const generated = input.generatedAt.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
	c.text(input.filterLabel, c.margin, c.y, { size: 10, color: gray });
	c.rightText(`Generated ${generated}`, c.y, { size: 10, color: gray });
	c.y -= 10;
	c.divider();

	if (input.chart) drawChart(c, input.chart);

	if (input.rows.length === 0) {
		c.text('No data for this period.', c.margin, c.y, { size: 10, color: gray });
	} else {
		drawTable(c, input.table, input.rows);
	}

	return c.save();
}

function drawChart(c: PdfCanvas, chart: ReportChart): void {
	const rowHeight = 15;
	const labelWidth = 150;
	const valueWidth = 70;
	const barX = c.margin + labelWidth + 8;
	const barMaxWidth = c.contentWidth - labelWidth - 8 - valueWidth - 8;
	const barHeight = 7;

	const format = (v: number) =>
		chart.format === 'percent' ? `${Math.round(v)}%` : currency.format(v);
	const max = chart.format === 'percent' ? 100 : Math.max(...chart.bars.map((b) => b.value), 0);
	const labelled = new Set(
		chart.bars
			.map((b, i) => ({ v: b.value, i }))
			.sort((a, b) => b.v - a.v)
			.slice(0, LABELLED)
			.map((x) => x.i)
	);

	c.ensureSpace(24 + rowHeight * Math.min(chart.bars.length, 4));
	c.text(chart.title, c.margin, c.y, { font: c.bold, size: 11 });
	c.y -= 18;

	chart.bars.forEach((bar, i) => {
		c.ensureSpace(rowHeight + 20);
		const color = bar.isOther ? c.colors.gray : c.colors.black;
		const label = c.truncate(bar.label, labelWidth, c.regular, 9);
		c.text(label, c.margin, c.y - 9, { size: 9, color: bar.isOther ? c.colors.gray : undefined });

		// Baseline, then the bar. A tiny nonzero value keeps a sliver, as on screen.
		c.rect(barX, c.y - rowHeight + 2, 0.75, rowHeight - 2, c.colors.lightGray);
		if (max > 0 && bar.value > 0) {
			const w = Math.max((Math.min(bar.value, max) / max) * barMaxWidth, 1);
			c.rect(barX, c.y - 11, w, barHeight, color);
		}

		if (labelled.has(i)) {
			c.rightText(format(bar.value), c.y - 9, { size: 9, color: c.colors.gray });
		}
		c.y -= rowHeight;
	});

	c.y -= 12;
}

function drawTable(c: PdfCanvas, table: ReportTable, rows: Record<string, unknown>[]): void {
	const colGap = 5;
	const rowHeight = 18;
	const headerHeight = 22;
	const pad = 5;

	const totalWeight = table.columns.reduce((s, col) => s + col.weight, 0);
	const usable = c.contentWidth - pad * 2 - colGap * (table.columns.length - 1);
	const widths = table.columns.map((col) => (col.weight / totalWeight) * usable);

	const drawCells = (
		cells: string[],
		yText: number,
		options: { font: PDFFont; size: number; color?: ReturnType<typeof rgb> }
	) => {
		let x = c.margin + pad;
		table.columns.forEach((col, i) => {
			const display = c.truncate(cells[i] ?? '', widths[i], options.font, options.size);
			const textX =
				col.align === 'right'
					? x + widths[i] - options.font.widthOfTextAtSize(display, options.size)
					: x;
			c.text(display, textX, yText, {
				font: options.font,
				size: options.size,
				color: options.color
			});
			x += widths[i] + colGap;
		});
	};

	const drawHeader = () => {
		c.rect(c.margin, c.y - headerHeight + 4, c.contentWidth, headerHeight, c.colors.headerBg);
		drawCells(
			table.columns.map((col) => col.label),
			c.y - headerHeight + 11,
			{ font: c.bold, size: 8, color: c.colors.white }
		);
		c.y -= headerHeight + 2;
	};

	c.ensureSpace(headerHeight + rowHeight * Math.min(rows.length, 3) + 40);
	drawHeader();

	rows.forEach((row, i) => {
		// A new page repeats the header, so a long table stays readable.
		const before = c.y;
		c.ensureSpace(rowHeight + 30);
		if (c.y > before) drawHeader();

		if (i % 2 === 1) {
			c.rect(c.margin, c.y - rowHeight + 6, c.contentWidth, rowHeight, c.colors.lightGray);
		}
		drawCells(
			table.columns.map((col) => col.value(row)),
			c.y - rowHeight + 10,
			{ font: c.regular, size: 9 }
		);
		c.y -= rowHeight;
	});

	if (table.hasTotals) {
		c.ensureSpace(rowHeight + 10);
		c.rect(c.margin, c.y + 4, c.contentWidth, 1, c.colors.gray);
		drawCells(
			table.columns.map((col) => col.total?.(rows) ?? ''),
			c.y - rowHeight + 10,
			{ font: c.bold, size: 9 }
		);
		c.y -= rowHeight;
	}
}
