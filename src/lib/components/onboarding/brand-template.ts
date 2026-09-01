// CSV template for the preflight "brands" import — the rep's list of brands
// they carry. Brands have no import flow outside preflight (the app creates
// them one at a time at /brands/new), so the template lives here alongside
// the members one.
//
// Headers mirror what parseBrands() reads and what /brands/new collects, so a
// downloaded template round-trips without any column mapping.

const TEMPLATE_HEADERS = [
	'brand',
	'contact first name',
	'contact last name',
	'email',
	'phone',
	'website',
	'commission',
	'notes'
];

const TEMPLATE_EXAMPLE_ROWS = [
	[
		'Marlowe Studio',
		'Ana',
		'Ruiz',
		'ana@marlowestudio.com',
		'212-555-0142',
		'marlowestudio.com',
		'12',
		'Spring delivery only'
	],
	['Halden', 'Tom', 'Byrne', 'tom@halden.co', '', 'halden.co', '10', '']
];

function csvCell(v: string): string {
	if (/["\n,]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
	return v;
}

function csvRow(cells: string[]): string {
	return cells.map(csvCell).join(',');
}

export function downloadBrandCsvTemplate(filename = 'threadline-brands-template.csv'): void {
	// Leading BOM (U+FEFF) signals UTF-8 to Excel — without it, Excel
	// often guesses Windows-1252 and mangles non-ASCII characters.
	const csv =
		'\uFEFF' + [csvRow(TEMPLATE_HEADERS), ...TEMPLATE_EXAMPLE_ROWS.map(csvRow)].join('\n');
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
