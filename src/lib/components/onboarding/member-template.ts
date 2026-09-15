// CSV template for the preflight "members" import. Accounts, products, and
// orders already ship one from their own import helpers; members has no import
// flow outside onboarding, so it lives here.
//
// Headers mirror what parseMembers() in /onboarding reads, so a downloaded
// template round-trips without any column mapping.

const TEMPLATE_HEADERS = ['email', 'first name', 'last name', 'role', 'commission'];

const TEMPLATE_EXAMPLE_ROWS = [
	['jane@yourcompany.com', 'Jane', 'Doe', 'admin', ''],
	['sam@yourcompany.com', 'Sam', 'Rivera', 'sales', '10']
];

function csvCell(v: string): string {
	if (/["\n,]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
	return v;
}

function csvRow(cells: string[]): string {
	return cells.map(csvCell).join(',');
}

export function downloadMemberCsvTemplate(filename = 'threadline-members-template.csv'): void {
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
