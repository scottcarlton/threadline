/**
 * Monthly sales trend for Insights (SCO-148): the trailing 12 months, each
 * paired with the same month a year earlier so seasonality reads at a glance.
 *
 * Months are calendar months in UTC, matching how order dates are stored.
 * The current month is included and is partial by nature.
 */

export type TrendMeasure = 'revenue' | 'orders';

export type TrendPoint = { revenue: number; orders: number };

export type TrendMonth = {
	/** `YYYY-MM` of the recent month. */
	key: string;
	/** Short month name, e.g. "Mar". */
	label: string;
	year: number;
	current: TrendPoint;
	/** The same calendar month one year earlier. */
	prior: TrendPoint;
};

export type SalesTrend = {
	months: TrendMonth[];
	/** True when the window has no orders at all, in either year. */
	empty: boolean;
};

export const TREND_MONTHS = 12;

const MONTH_LABELS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

function monthKey(year: number, monthIndex: number): string {
	return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/** First instant of the oldest month the trend needs, prior year included. */
export function trendWindowStart(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TREND_MONTHS * 2 - 1), 1));
}

/** Buckets orders into the trailing months and their prior-year twins. */
export function buildSalesTrend(
	orders: Array<{ created_at: string; total_amount: number | string | null }>,
	now: Date
): SalesTrend {
	const totals = new Map<string, TrendPoint>();
	for (const o of orders) {
		const d = new Date(o.created_at);
		if (Number.isNaN(d.getTime())) continue;
		const key = monthKey(d.getUTCFullYear(), d.getUTCMonth());
		const point = totals.get(key) ?? { revenue: 0, orders: 0 };
		const amount = Number(o.total_amount);
		point.revenue += Number.isFinite(amount) ? amount : 0;
		point.orders += 1;
		totals.set(key, point);
	}

	const zero = (): TrendPoint => ({ revenue: 0, orders: 0 });
	const months: TrendMonth[] = [];
	for (let i = TREND_MONTHS - 1; i >= 0; i--) {
		const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
		const year = d.getUTCFullYear();
		const m = d.getUTCMonth();
		months.push({
			key: monthKey(year, m),
			label: MONTH_LABELS[m],
			year,
			current: totals.get(monthKey(year, m)) ?? zero(),
			prior: totals.get(monthKey(year - 1, m)) ?? zero()
		});
	}

	const empty = months.every((m) => m.current.orders === 0 && m.prior.orders === 0);
	return { months, empty };
}

/** Change from the prior-year month, or null when there is nothing to compare. */
export function changeFromPrior(current: number, prior: number): number | null {
	if (prior <= 0) return null;
	return (current - prior) / prior;
}

/** Gridline values for a y-axis from 0 to just above `max`, on round steps. */
export function niceTicks(max: number, count = 4): number[] {
	if (!(max > 0)) return [0, 1];
	const rough = max / count;
	const magnitude = 10 ** Math.floor(Math.log10(rough));
	const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= rough) ?? rough;
	const ticks: number[] = [];
	for (let v = 0; v < max + step; v += step) {
		ticks.push(Number(v.toPrecision(12)));
		if (v >= max) break;
	}
	return ticks;
}
