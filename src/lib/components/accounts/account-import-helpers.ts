// Account-specific helpers for the AccountImportFlow.
//
// Mirrors the shape of product-import-helpers.ts but with account
// fields. Once AccountImportFlow + OrderImportFlow are both live the
// truly-shared bits (timing constants, sleep, CSV escape, template
// download) can be lifted into a shared module — for now keep flat to
// avoid premature abstraction.

// ─── Loading-state pacing ────────────────────────────────────────────
// Same minimums as the product flow so the UX feels consistent across
// every import surface.

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
// Same fuzzy-match pattern as csv-column-suggest.ts but the alias set
// is account-shaped. Headers normalize via lowercase + strip non-alnum
// (so "Business Name", "business_name", "BUSINESSNAME" all collide).

export type AccountFieldKey =
	| 'business_name'
	| 'contact_first_name'
	| 'contact_last_name'
	| 'contact_email'
	| 'phone'
	| 'address_line1'
	| 'city'
	| 'state'
	| 'zip';

const SUGGESTIONS: Record<AccountFieldKey, string[]> = {
	business_name: [
		'businessname',
		'business',
		'name',
		'accountname',
		'account',
		'company',
		'companyname',
		'customer',
		'customername',
		'storename',
		'store'
	],
	contact_first_name: ['firstname', 'contactfirstname', 'firstcontact', 'first'],
	contact_last_name: ['lastname', 'contactlastname', 'lastnamecontact', 'last', 'surname'],
	contact_email: ['email', 'contactemail', 'emailaddress', 'mail'],
	phone: ['phone', 'phonenumber', 'tel', 'telephone', 'contactphone', 'mobile'],
	address_line1: ['address', 'addressline1', 'addressline', 'street', 'streetaddress'],
	city: ['city', 'town'],
	state: ['state', 'province', 'region'],
	zip: ['zip', 'zipcode', 'postalcode', 'postal', 'postcode']
};

function normalize(header: string): string {
	return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Most-specific-wins ordering so e.g. "contact email" beats "email" if
// both fields ever overlapped on a substring match.
const FIELD_ORDER: AccountFieldKey[] = [
	'contact_first_name',
	'contact_last_name',
	'contact_email',
	'business_name',
	'phone',
	'address_line1',
	'city',
	'state',
	'zip'
];

export function suggestAccountColumn(header: string): AccountFieldKey | null {
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

export type AccountPreviewBuild = {
	previewRows: Record<string, unknown>[];
	previewUnmapped: string[];
};

export function buildAccountPreviewFromCsv(
	headers: string[],
	rows: Record<string, string>[]
): AccountPreviewBuild {
	const fieldByHeader = new Map<string, AccountFieldKey | null>();
	for (const h of headers) {
		fieldByHeader.set(h, suggestAccountColumn(h));
	}
	const headerByField = new Map<AccountFieldKey, string>();
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

// ─── CSV template download ───────────────────────────────────────────

const TEMPLATE_HEADERS: AccountFieldKey[] = [
	'business_name',
	'contact_first_name',
	'contact_last_name',
	'contact_email',
	'phone',
	'address_line1',
	'city',
	'state',
	'zip'
];

const TEMPLATE_EXAMPLE_ROW = [
	'Acme Boutique',
	'Jane',
	'Doe',
	'jane@acmeboutique.com',
	'(555) 555-1234',
	'123 Main Street',
	'San Francisco',
	'CA',
	'94102'
];

function csvCell(v: string): string {
	if (/["\n,]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
	return v;
}

function csvRow(cells: string[]): string {
	return cells.map(csvCell).join(',');
}

export function downloadAccountCsvTemplate(filename = 'threadline-accounts-template.csv'): void {
	// Leading BOM (U+FEFF) signals UTF-8 to Excel — without it, Excel
	// often guesses Windows-1252 and mangles non-ASCII characters.
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
