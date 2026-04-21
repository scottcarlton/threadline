import { paymentMethodLabel, paymentTermLabel } from '$lib/payment-methods';

/**
 * Shared read-only formatters for the Orders domain. Keep these pure so
 * they can be used from server loads and from components without a DOM.
 */

const MONTH_SHORT = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

export function seasonLabel(
	name: string | null | undefined,
	year: number | null | undefined
): string {
	const trimmed = name?.trim();
	if (trimmed && year) return `${trimmed} ${year}`;
	if (trimmed) return trimmed;
	if (year) return String(year);
	return '';
}

function formatShipDate(iso: string | null | undefined): string | null {
	if (!iso) return null;
	// Dates from Postgres come as YYYY-MM-DD strings; parse component-wise
	// to avoid timezone drift pulling the day across midnight.
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
	if (!m) return null;
	const month = Number(m[2]);
	const day = Number(m[3]);
	if (month < 1 || month > 12) return null;
	return `${MONTH_SHORT[month - 1]} ${day}`;
}

export function formatShipWindow(
	start: string | null | undefined,
	expected: string | null | undefined
): string {
	const a = formatShipDate(start);
	const b = formatShipDate(expected);
	if (a && b) return a === b ? a : `${a} – ${b}`;
	return a ?? b ?? '—';
}

export function formatLocation(
	loc:
		| {
				label?: string | null;
				city?: string | null;
				state?: string | null;
		  }
		| null
		| undefined
): string {
	if (!loc) return '—';
	const cityState = [loc.city, loc.state].filter(Boolean).join(', ');
	if (loc.label && cityState) return `${loc.label} · ${cityState}`;
	if (loc.label) return loc.label;
	if (cityState) return cityState;
	return '—';
}

export function formatPayment(
	method: string | null | undefined,
	terms: string | null | undefined
): string {
	const parts: string[] = [];
	if (method) parts.push(paymentMethodLabel(method));
	if (terms) parts.push(paymentTermLabel(terms));
	return parts.length > 0 ? parts.join(' · ') : '—';
}
