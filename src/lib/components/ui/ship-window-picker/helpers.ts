export function sameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function isBefore(a: Date, b: Date): boolean {
	return startOfDay(a).getTime() < startOfDay(b).getTime();
}

export function isAfter(a: Date, b: Date): boolean {
	return startOfDay(a).getTime() > startOfDay(b).getTime();
}

export function isBetween(d: Date, start: Date, end: Date): boolean {
	const t = startOfDay(d).getTime();
	return t >= startOfDay(start).getTime() && t <= startOfDay(end).getTime();
}

export function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function addMonths(d: Date, n: number): Date {
	return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

export function daysBetween(a: Date, b: Date): number {
	const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
	return Math.round(ms / 86_400_000);
}

export function formatDateShort(d: Date): string {
	const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const months = [
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
	return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

export function toLocalDate(iso: string): Date {
	return new Date(`${iso}T00:00:00`);
}

export function toISODate(d: Date): string {
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

export type SeasonWindow = {
	startDate: Date;
	endDate: Date;
};

export type SeasonDeliveryLike = {
	delivery_month: number;
	delivery_day: number;
};

export function deriveSeasonWindow(
	deliveries: SeasonDeliveryLike[],
	orderYear: number
): SeasonWindow | null {
	if (deliveries.length === 0) return null;

	let earliestMonth = Infinity;
	let latestMonth = -Infinity;
	let latestDay = 1;

	for (const d of deliveries) {
		if (d.delivery_month < earliestMonth) earliestMonth = d.delivery_month;
		if (
			d.delivery_month > latestMonth ||
			(d.delivery_month === latestMonth && d.delivery_day > latestDay)
		) {
			latestMonth = d.delivery_month;
			latestDay = d.delivery_day;
		}
	}

	return {
		startDate: new Date(orderYear, earliestMonth - 1, 1),
		endDate: new Date(orderYear, latestMonth - 1, latestDay)
	};
}

export function isDisabled(d: Date, window: SeasonWindow | null): boolean {
	if (!window) return false;
	return isBefore(d, window.startDate);
}

export function defaultRange(window: SeasonWindow | null): { start: Date; end: Date } | null {
	if (!window) return null;
	const start = window.startDate;
	const end = endOfMonth(start);
	const clampedEnd = isAfter(end, window.endDate) ? window.endDate : end;
	return { start, end: clampedEnd };
}
