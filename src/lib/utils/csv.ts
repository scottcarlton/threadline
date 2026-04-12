export function escapeCSVValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	const str = String(value);
	if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/**
 * Generates a CSV string from an array of objects.
 * Returns null for empty data.
 */
export function generateCSVString(data: Record<string, unknown>[]): string | null {
	if (data.length === 0) return null;

	const headers = Object.keys(data[0]);
	const csvRows = [
		headers.map(escapeCSVValue).join(','),
		...data.map((row) => headers.map((h) => escapeCSVValue(row[h])).join(','))
	];

	return csvRows.join('\n');
}

/**
 * Generates a CSV string from an array of objects and triggers a browser download.
 */
export function downloadCSV(data: Record<string, unknown>[], filename: string): void {
	const csvString = generateCSVString(data);
	if (!csvString) return;

	const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);

	const link = document.createElement('a');
	link.setAttribute('href', url);
	link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
