/**
 * The columns of each report's table, as data, for documents that cannot reuse
 * the Svelte markup: the PDF export now, share snapshots next (SCO-151).
 *
 * Mirrors the tables in `routes/reports/[slug]/+page.svelte` column for column,
 * including which reports carry a totals row. When a table there changes, its
 * entry here changes with it.
 */

export type ReportColumnAlign = 'left' | 'right';

type Row = Record<string, unknown>;

export interface ReportColumn {
	label: string;
	align: ReportColumnAlign;
	/** Share of the table width, relative to the other columns. */
	weight: number;
	value: (row: Row) => string;
	/** The column's cell in the totals row; omitted cells are blank. */
	total?: (rows: Row[]) => string;
}

export interface ReportTable {
	columns: ReportColumn[];
	/** Whether the page renders a totals row for this report. */
	hasTotals: boolean;
}

const currency = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 0,
	maximumFractionDigits: 0
});

const num = (v: unknown): number => {
	const n = Number(v ?? 0);
	return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const money = (v: unknown) => currency.format(num(v));
const sum = (rows: Row[], key: string) => rows.reduce((s, r) => s + num(r[key]), 0);
const sumMoney = (key: string) => (rows: Row[]) => currency.format(sum(rows, key));
const sumCount = (key: string) => (rows: Row[]) => String(sum(rows, key));

function date(v: unknown): string {
	if (typeof v !== 'string' || !v) return 'None';
	return new Date(v).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "Agency" with the in-house badge the page shows, as text. */
const agency = (r: Row) => `${text(r.agencyName)}${r.source === 'in_house' ? ' (In-house)' : ''}`;

const col = (
	label: string,
	value: ReportColumn['value'],
	opts: Partial<Omit<ReportColumn, 'label' | 'value'>> = {}
): ReportColumn => ({
	label,
	value,
	align: opts.align ?? 'left',
	weight: opts.weight ?? 1,
	...opts
});
const right = (
	label: string,
	value: ReportColumn['value'],
	total?: ReportColumn['total']
): ReportColumn => col(label, value, { align: 'right', total });
const avgOrder = (r: Row) => money(num(r.orders) > 0 ? num(r.revenue) / num(r.orders) : 0);

export function reportTable(report: string, variant: string | undefined): ReportTable | null {
	const brand = variant === 'brand';
	switch (report) {
		case 'sales-by-brand':
		case 'sales-by-account':
		case 'sales-by-rep':
			if (report === 'sales-by-rep' && brand) {
				return {
					hasTotals: true,
					columns: [
						col('Rep', (r) => text(r.repName), { weight: 2, total: () => 'Total' }),
						col('Agency', agency, { weight: 2 }),
						right('Orders', (r) => text(r.orders), sumCount('orders')),
						right('Revenue', (r) => money(r.revenue), sumMoney('revenue')),
						right('Avg Order Value', (r) => money(r.avgOrderValue)),
						col('Last Order', (r) => date(r.lastOrderDate), { weight: 1.2 })
					]
				};
			}
			return {
				hasTotals: true,
				columns: [
					col(
						report === 'sales-by-brand'
							? 'Brand'
							: report === 'sales-by-account'
								? 'Account'
								: 'Rep',
						(r) => text(r.name),
						{ weight: 3, total: () => 'Total' }
					),
					right('Orders', (r) => text(r.orders), sumCount('orders')),
					right('Avg Order', avgOrder),
					right('Revenue', (r) => money(r.revenue), sumMoney('revenue'))
				]
			};
		case 'sales-by-territory':
			return {
				hasTotals: false,
				columns: [
					col('Territory', (r) => text(r.name), { weight: 3 }),
					right('Accounts', (r) => text(r.accountCount)),
					right('Orders', (r) => text(r.orders)),
					right('Revenue', (r) => money(r.revenue))
				]
			};
		case 'commission':
			return {
				hasTotals: true,
				columns: [
					col('Brand', (r) => text(r.brand), { weight: 1.5, total: () => 'Total' }),
					col('Account', (r) => text(r.account), { weight: 1.5 }),
					right('Amount', (r) => money(r.orderAmount), sumMoney('orderAmount')),
					right('Brand %', (r) => `${text(r.brandRate)}%`),
					right('Brand Comm.', (r) => money(r.brandCommission), sumMoney('brandCommission')),
					col('Rep', (r) => text(r.rep), { weight: 1.2 }),
					right('Rep %', (r) => `${text(r.repRate)}%`),
					right('Rep Comm.', (r) => money(r.repCommission), sumMoney('repCommission'))
				]
			};
		case 'pipeline':
			return {
				hasTotals: false,
				columns: [
					col('Status', (r) => capitalize(text(r.status)), { weight: 2 }),
					right('Orders', (r) => text(r.count)),
					right('Total Amount', (r) => money(r.total_amount))
				]
			};
		case 'season-comparison':
			return {
				hasTotals: false,
				columns: [
					col('Season', (r) => text(r.name), { weight: 3 }),
					right('Orders', (r) => text(r.orders)),
					right('Avg Order', avgOrder),
					right('Revenue', (r) => money(r.revenue))
				]
			};
		case 'show-performance':
			return {
				hasTotals: false,
				columns: [
					col('Show', (r) => text(r.show), { weight: 2 }),
					col('Location', (r) => text(r.location), { weight: 1.5 }),
					right('Appts', (r) => text(r.appointments)),
					right('Visits', (r) => text(r.visits)),
					right('New Accts', (r) => text(r.newAccounts)),
					right('Orders', (r) => text(r.orders)),
					right('Revenue', (r) => money(r.revenue))
				]
			};
		case 'product-performance':
			return {
				hasTotals: true,
				columns: [
					col('Style #', (r) => text(r.styleNumber)),
					col('Product', (r) => text(r.productName), { weight: 2, total: () => 'Total' }),
					right('Units', (r) => text(r.unitsOrdered), sumCount('unitsOrdered')),
					right('Revenue', (r) => money(r.revenue), sumMoney('revenue')),
					right('# Accounts', (r) => text(r.accounts), sumCount('accounts')),
					right('Velocity', (r) => num(r.velocityScore).toFixed(1)),
					col('Trend', (r) => text(r.trend || 'flat'))
				]
			};
		case 'territory-coverage':
			if (!brand) return null;
			return {
				hasTotals: true,
				columns: [
					col('Agency', agency, { weight: 2, total: () => 'Total' }),
					col('Territory', (r) => text(r.territoryName), { weight: 2 }),
					right('Accounts', (r) => text(r.accounts), sumCount('accounts')),
					right('Orders', (r) => text(r.orders), sumCount('orders')),
					right('Revenue', (r) => money(r.revenue), sumMoney('revenue'))
				]
			};
		case 'account-penetration':
			if (!brand) return null;
			return {
				hasTotals: true,
				columns: [
					col('Account', (r) => text(r.businessName), { weight: 2, total: () => 'Total' }),
					col('Agency', agency, { weight: 1.5 }),
					right('Orders', (r) => text(r.currentOrders ?? 0), sumCount('currentOrders')),
					right('Revenue', (r) => money(r.currentRevenue), sumMoney('currentRevenue')),
					right('Prior Year', (r) => money(r.priorRevenue), sumMoney('priorRevenue')),
					col('Trend', (r) => text(r.trend || 'flat'), { weight: 0.8 }),
					col('Last Order', (r) => date(r.lastOrderDate), { weight: 1.2 }),
					col('Status', (r) => (r.status === 'dormant' ? 'Dormant' : 'Active'), { weight: 0.8 })
				]
			};
		case 'season-sell-through':
			if (!brand) return null;
			return {
				hasTotals: true,
				columns: [
					col(
						'Season',
						(r) => `${text(r.seasonName)}${r.isActive === false ? ' (Inactive)' : ''}`,
						{
							weight: 2,
							total: () => 'Total'
						}
					),
					right('Catalog', (r) => text(r.productsInSeason ?? 0), sumCount('productsInSeason')),
					right('Sold', (r) => text(r.productsOrdered ?? 0), sumCount('productsOrdered')),
					right('Sell-through', (r) => `${text(r.sellThroughPct ?? 0)}%`),
					right('Units', (r) => text(r.totalUnits ?? 0), sumCount('totalUnits')),
					right('Orders', (r) => text(r.orders), sumCount('orders')),
					right('Accounts', (r) => text(r.accounts ?? 0)),
					right('Revenue', (r) => money(r.totalRevenue), sumMoney('totalRevenue'))
				]
			};
		default:
			return null;
	}
}

/** The filter the rows were loaded with, as the line under a document title. */
export function reportFilterLabel(report: string, year: number, daysBack?: number): string {
	if (report === 'product-performance') return `Last ${daysBack ?? 90} days`;
	if (report === 'pipeline') return 'Current pipeline';
	return `Year ${year}`;
}
