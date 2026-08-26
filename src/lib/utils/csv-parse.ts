// Minimal CSV parser shared by the linesheet uploader and the legacy
// BulkImportModal paste path. Extracted unchanged from
// BulkImportModal.svelte:108-154 so both surfaces have a single source of
// truth and we can unit-test it.
//
// Supports double-quoted fields with embedded commas, `""` escaping, and
// embedded NEWLINES.
//
// The newline support is not optional polish. A JOOR line sheet export puts
// multi-line marketing copy in its Description column, and the previous
// line-based splitter turned every one of those newlines into a bogus
// record: 641 real rows read as 1301 misaligned ones, silently corrupting
// every column to the right of the description.

export type CsvRows = {
	headers: string[]; // preserved-case headers from the first row
	rows: Record<string, string>[]; // each row keyed by lowercased header
};

export function parseCSV(text: string): CsvRows {
	const records = parseCSVRecords(text);
	if (records.length < 2) return { headers: [], rows: [] };

	const headers = records[0].map((h) => h.trim());
	const lowered = headers.map((h) => h.toLowerCase());

	const rows: Record<string, string>[] = [];
	for (let i = 1; i < records.length; i++) {
		const values = records[i];
		const row: Record<string, string> = {};
		for (let j = 0; j < lowered.length; j++) {
			row[lowered[j]] = values[j]?.trim() ?? '';
		}
		rows.push(row);
	}
	return { headers, rows };
}

/**
 * Split the whole document into records, tracking quote state ACROSS line
 * breaks so a quoted field may contain them. Handles LF, CRLF and bare CR.
 *
 * Blank records are dropped so a trailing newline doesn't produce a row of
 * empty strings.
 */
export function parseCSVRecords(text: string): string[][] {
	const records: string[][] = [];
	let record: string[] = [];
	let field = '';
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];

		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
			continue;
		}

		if (ch === '"') {
			inQuotes = true;
		} else if (ch === ',') {
			record.push(field);
			field = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && text[i + 1] === '\n') i++;
			record.push(field);
			field = '';
			records.push(record);
			record = [];
		} else {
			field += ch;
		}
	}

	// Flush whatever the final line left open (the file may not end in a newline).
	if (field.length > 0 || record.length > 0) {
		record.push(field);
		records.push(record);
	}

	return records.filter((r) => !(r.length === 1 && r[0].trim() === ''));
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
