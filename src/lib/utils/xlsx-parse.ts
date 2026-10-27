// Excel (.xlsx) reader for the import flows. Produces the same `CsvRows`
// shape as `parseCSV` so a flow can hand either result to its preview
// builder without caring which format the user dropped.
//
// Only the first sheet is read. Exports from JOOR, NuORDER and Brandboom
// put the data on sheet one; a workbook with lines on a second sheet is out
// of scope for now.

import type { CsvRows } from './csv-parse.js';

type Cell = string | number | boolean | Date | null | undefined;

export function isXlsxFile(file: { name: string; type: string }): boolean {
	return (
		file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
		file.name.toLowerCase().endsWith('.xlsx')
	);
}

/**
 * Dates come back as `Date` objects in UTC. Import fields like ship date
 * want a plain calendar day, so emit `YYYY-MM-DD` and keep the time only
 * when the cell actually has one.
 */
function cellToString(cell: Cell): string {
	if (cell === null || cell === undefined) return '';
	if (cell instanceof Date) {
		if (Number.isNaN(cell.getTime())) return '';
		const iso = cell.toISOString();
		return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
	}
	return String(cell).trim();
}

/**
 * Turn raw sheet data into header + row records, matching `parseCSV`:
 * headers keep their case, row keys are lowercased headers, values are
 * trimmed strings. Leading and fully blank rows are dropped so a title row
 * gap or trailing formatting doesn't produce empty records.
 */
export function sheetDataToRows(data: Cell[][]): CsvRows {
	const records = data
		.map((row) => row.map(cellToString))
		.filter((row) => row.some((v) => v !== ''));
	if (records.length < 2) return { headers: [], rows: [] };

	const headers = records[0].map((h) => h.trim());
	const lowered = headers.map((h) => h.toLowerCase());

	const rows: Record<string, string>[] = [];
	for (let i = 1; i < records.length; i++) {
		const values = records[i];
		const row: Record<string, string> = {};
		for (let j = 0; j < lowered.length; j++) {
			row[lowered[j]] = values[j] ?? '';
		}
		rows.push(row);
	}
	return { headers, rows };
}

/**
 * Read the first sheet of an .xlsx file. The reader is imported lazily so
 * the CSV path doesn't pay for it.
 */
export async function parseXlsx(file: Blob): Promise<CsvRows> {
	const { readSheet } = await import('read-excel-file/browser');
	const data = (await readSheet(file)) as unknown as Cell[][];
	return sheetDataToRows(data);
}
