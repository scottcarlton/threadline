// Minimal CSV parser shared by the linesheet uploader and the legacy
// BulkImportModal paste path. Extracted unchanged from
// BulkImportModal.svelte:108-154 so both surfaces have a single source of
// truth and we can unit-test it.
//
// Supports double-quoted fields with embedded commas and `""` escaping.
// Does NOT support multi-line quoted fields — the splitter is line-based.
// That matches the original modal's behavior; if we hit a real CSV with
// embedded newlines we'll switch to a proper streaming parser.

export type CsvRows = {
	headers: string[]; // preserved-case headers from the first row
	rows: Record<string, string>[]; // each row keyed by lowercased header
};

export function parseCSV(text: string): CsvRows {
	const lines = text
		.trim()
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l);
	if (lines.length < 2) return { headers: [], rows: [] };

	const headers = parseCSVLine(lines[0]).map((h) => h.trim());
	const lowered = headers.map((h) => h.toLowerCase());

	const rows: Record<string, string>[] = [];
	for (let i = 1; i < lines.length; i++) {
		const values = parseCSVLine(lines[i]);
		const row: Record<string, string> = {};
		for (let j = 0; j < lowered.length; j++) {
			row[lowered[j]] = values[j]?.trim() ?? '';
		}
		rows.push(row);
	}
	return { headers, rows };
}

export function parseCSVLine(line: string): string[] {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === ',' && !inQuotes) {
			result.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	result.push(current);
	return result;
}
