/**
 * How many styles the line sheet parser left out because their price, style
 * number, or name could not be read. Accepts the raw `unreadable` field from
 * /api/products/parse-linesheet, so callers can pass the JSON body through.
 */
export function unreadableCount(value: unknown): number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

/** Notice shown above an import preview, or null when nothing was left out. */
export function unreadableStylesNotice(value: unknown): string | null {
	const count = unreadableCount(value);
	if (count === 0) return null;
	if (count === 1) {
		return "1 style left out. We couldn't read its price, style number, or name. Add it by hand or check the line sheet.";
	}
	return `${count} styles left out. We couldn't read their price, style number, or name. Add them by hand or check the line sheet.`;
}
