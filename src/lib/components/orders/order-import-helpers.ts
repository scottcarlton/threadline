// Order-specific helpers for the OrderImportFlow.
//
// Mirrors product-import-helpers / account-import-helpers. Truly
// shared bits (pacing constants, sleep, CSV escape) are duplicated for
// now — once all three flows are live we'll lift them into a single
// shared module.

// ─── Loading-state pacing ────────────────────────────────────────────

export const SCANNING_MIN_MS = 1500;
export const PREPARING_MIN_MS = 1500;
export const TOTAL_LOADING_MIN_MS = 6000;

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureMinElapsed(stageStart: number, minMs: number): Promise<void> {
	const remaining = minMs - (Date.now() - stageStart);
	if (remaining > 0) await sleep(remaining);
}

// ─── CSV column auto-mapper ──────────────────────────────────────────

export type OrderFieldKey =
	| 'account'
	| 'style_number'
	| 'qty'
	| 'unit_price'
	| 'color'
	| 'size'
	| 'expected_ship_date'
	| 'notes';

const SUGGESTIONS: Record<OrderFieldKey, string[]> = {
	account: [
		'account',
		'accountname',
		'businessname',
		'business',
		'customer',
		'customername',
		'buyer',
		'store',
		'storename'
	],
	style_number: ['stylenumber', 'style', 'styleno', 'sku', 'itemnumber', 'itemno', 'styleid'],
	qty: ['qty', 'quantity', 'units', 'count', 'amount'],
	unit_price: ['unitprice', 'price', 'priceperunit', 'rate'],
	color: ['color', 'colour', 'colorway'],
	size: ['size'],
	expected_ship_date: [
		'expectedshipdate',
		'shipdate',
		'expectedship',
		'shipby',
		'requestedshipdate',
		'eta'
	],
	notes: ['notes', 'note', 'comments', 'memo']
};

function normalize(header: string): string {
	return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const FIELD_ORDER: OrderFieldKey[] = [
	'unit_price',
	'expected_ship_date',
	'style_number',
	'account',
	'qty',
	'color',
	'size',
	'notes'
];

export function suggestOrderColumn(header: string): OrderFieldKey | null {
	const norm = normalize(header);
	if (!norm) return null;
	for (const field of FIELD_ORDER) {
		if (SUGGESTIONS[field].includes(norm)) return field;
	}
	for (const field of FIELD_ORDER) {
		for (const synonym of SUGGESTIONS[field]) {
			if (norm.includes(synonym) || synonym.includes(norm)) return field;
		}
	}
	return null;
}

// ─── CSV → preview row ───────────────────────────────────────────────

export type OrderPreviewBuild = {
	previewRows: Record<string, unknown>[];
	previewUnmapped: string[];
};

export function buildOrderPreviewFromCsv(
	headers: string[],
	rows: Record<string, string>[]
): OrderPreviewBuild {
	const fieldByHeader = new Map<string, OrderFieldKey | null>();
	for (const h of headers) {
		fieldByHeader.set(h, suggestOrderColumn(h));
	}
	const headerByField = new Map<OrderFieldKey, string>();
	for (const [h, f] of fieldByHeader) {
		if (f) headerByField.set(f, h);
	}
	const previewRows = rows.map((row) => {
		const out: Record<string, unknown> = {};
		for (const [field, header] of headerByField) {
			out[field] = row[header.toLowerCase()] ?? '';
		}
		return out;
	});
	const previewUnmapped = headers.filter((h) => !fieldByHeader.get(h));
	return { previewRows, previewUnmapped };
}

// ─── Display formatters ──────────────────────────────────────────────

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatOrderPrice(v: unknown): string {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? moneyFmt.format(n) : '';
}

// ─── CSV template download ───────────────────────────────────────────

const TEMPLATE_HEADERS: OrderFieldKey[] = [
	'account',
	'style_number',
	'qty',
	'unit_price',
	'color',
	'size',
	'expected_ship_date',
	'notes'
];

const TEMPLATE_EXAMPLE_ROW = [
	'Acme Boutique',
	'CT-01',
	'12',
	'24.00',
	'Black',
	'M',
	'2026-09-15',
	'Rush — needed for Fall floor set.'
];

function csvCell(v: string): string {
	if (/["\n,]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
	return v;
}

function csvRow(cells: string[]): string {
	return cells.map(csvCell).join(',');
}

export function downloadOrderCsvTemplate(filename = 'threadline-orders-template.csv'): void {
	// Leading BOM (U+FEFF) signals UTF-8 to Excel.
	const csv = '\uFEFF' + [csvRow([...TEMPLATE_HEADERS]), csvRow(TEMPLATE_EXAMPLE_ROW)].join('\n');
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
