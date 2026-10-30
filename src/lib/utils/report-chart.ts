/**
 * The chart above a report's table (SCO-150).
 *
 * Pure: takes the same rows the table renders and returns the bars to draw, so
 * the chart can never disagree with the table or ignore a filter. Every report
 * is one series of categories, so the answer is always a single bar chart; what
 * varies is which field is measured and how the bars are ordered:
 *
 * - ranked: largest first, top {@link TOP_N} with the rest folded into "Other"
 * - stage: the order workflow, draft to delivered
 * - given: the server's order, kept as is (seasons, which carry no sortable key)
 */

export type ReportChartFormat = 'currency' | 'percent';

export interface ReportChartBar {
	label: string;
	value: number;
	/** The folded remainder of a ranked chart. */
	isOther?: boolean;
	/** How many rows an "Other" bar stands for. */
	count?: number;
}

export interface ReportChart {
	title: string;
	format: ReportChartFormat;
	bars: ReportChartBar[];
}

/** Bars shown before the remainder folds into "Other". */
export const TOP_N = 10;

/** OrderStatus order, minus cancelled, which no pipeline query returns. */
const PIPELINE_STAGES = ['draft', 'submitted', 'confirmed', 'preparing', 'shipped', 'delivered'];

type Row = Record<string, unknown>;

const num = (v: unknown): number => {
	const n = Number(v ?? 0);
	return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown, fallback = 'Unknown'): string =>
	typeof v === 'string' && v.trim() ? v : fallback;

/** Largest first, then the tail summed into one "Other" bar. */
export function rankAndFold(bars: ReportChartBar[], n: number = TOP_N): ReportChartBar[] {
	const sorted = [...bars].sort((a, b) => b.value - a.value);
	if (sorted.length <= n + 1) return sorted;
	const tail = sorted.slice(n);
	return [
		...sorted.slice(0, n),
		{
			label: 'Other',
			value: tail.reduce((s, b) => s + b.value, 0),
			isOther: true,
			count: tail.length
		}
	];
}

/** Sum values that share a label, keeping first-seen order. */
function sumByLabel(bars: ReportChartBar[]): ReportChartBar[] {
	const map = new Map<string, number>();
	for (const b of bars) map.set(b.label, (map.get(b.label) ?? 0) + b.value);
	return Array.from(map, ([label, value]) => ({ label, value }));
}

function byStage(bars: ReportChartBar[]): ReportChartBar[] {
	const rank = (label: string) => {
		const i = PIPELINE_STAGES.indexOf(label.toLowerCase());
		return i === -1 ? PIPELINE_STAGES.length : i;
	};
	return [...bars].sort((a, b) => rank(a.label) - rank(b.label));
}

function ranked(title: string, rows: Row[], label: (r: Row) => string, value: (r: Row) => number) {
	return {
		title,
		format: 'currency' as const,
		bars: rankAndFold(sumByLabel(rows.map((r) => ({ label: label(r), value: value(r) }))))
	};
}

/**
 * The chart for a report, or `null` when there is nothing worth drawing: an
 * unknown report, no rows, or every value zero.
 */
export function buildReportChart(
	report: string,
	variant: string | undefined,
	rows: Row[]
): ReportChart | null {
	const chart = select(report, variant, rows);
	if (!chart || chart.bars.length === 0) return null;
	if (chart.bars.every((b) => b.value === 0)) return null;
	return chart;
}

function select(report: string, variant: string | undefined, rows: Row[]): ReportChart | null {
	const brand = variant === 'brand';
	switch (report) {
		case 'sales-by-brand':
			return ranked(
				'Revenue by brand',
				rows,
				(r) => str(r.name),
				(r) => num(r.revenue)
			);
		case 'sales-by-account':
			return ranked(
				'Revenue by account',
				rows,
				(r) => str(r.name),
				(r) => num(r.revenue)
			);
		case 'sales-by-territory':
			return ranked(
				'Revenue by territory',
				rows,
				(r) => str(r.name),
				(r) => num(r.revenue)
			);
		case 'sales-by-rep':
			return ranked(
				'Revenue by rep',
				rows,
				(r) => str(brand ? r.repName : r.name),
				(r) => num(r.revenue)
			);
		case 'commission':
			// One row per order; the chart rolls them up to the brand paying it.
			return ranked(
				'Commission by brand',
				rows,
				(r) => str(r.brand),
				(r) => num(r.brandCommission)
			);
		case 'show-performance':
			return ranked(
				'Revenue by show',
				rows,
				(r) => str(r.show),
				(r) => num(r.revenue)
			);
		case 'product-performance':
			return ranked(
				'Revenue by product',
				rows,
				(r) => str(r.productName, str(r.styleNumber)),
				(r) => num(r.revenue)
			);
		case 'territory-coverage':
			if (!brand) return null;
			return ranked(
				'Revenue by territory',
				rows,
				(r) => `${str(r.territoryName)} (${str(r.agencyName)})`,
				(r) => num(r.revenue)
			);
		case 'account-penetration':
			if (!brand) return null;
			return ranked(
				'Revenue by account',
				rows,
				(r) => str(r.businessName),
				(r) => num(r.currentRevenue)
			);
		case 'pipeline':
			return {
				title: 'Order value by status',
				format: 'currency',
				bars: byStage(rows.map((r) => ({ label: str(r.status), value: num(r.total_amount) })))
			};
		case 'season-comparison':
			// The server sorts newest year first; the chart reads top to bottom
			// in time, so oldest first. Order within a year is kept.
			return {
				title: 'Revenue by season',
				format: 'currency',
				bars: [...rows]
					.map((r, i) => ({ r, i }))
					.sort((a, b) => num(a.r.year) - num(b.r.year) || a.i - b.i)
					.map(({ r }) => ({ label: str(r.name), value: num(r.revenue) }))
			};
		case 'season-sell-through':
			if (!brand) return null;
			return {
				title: 'Sell-through by season',
				format: 'percent',
				bars: rows.map((r) => ({ label: str(r.seasonName), value: num(r.sellThroughPct) }))
			};
		default:
			return null;
	}
}
