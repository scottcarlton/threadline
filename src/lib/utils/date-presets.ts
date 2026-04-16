// Presets for the /orders date-range filter. Keep logic pure so the
// orders page and tests can share it without a Svelte/Supabase context.

export const DATE_PRESET_IDS = [
	'all',
	'last_7_days',
	'last_30_days',
	'last_90_days',
	'this_month',
	'last_month',
	'custom'
] as const;
export type DatePresetId = (typeof DATE_PRESET_IDS)[number];

export const DATE_PRESET_LABELS: Record<DatePresetId, string> = {
	all: 'All time',
	last_7_days: 'Last 7 days',
	last_30_days: 'Last 30 days',
	last_90_days: 'Last 90 days',
	this_month: 'This month',
	last_month: 'Last month',
	custom: 'Custom…'
};

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

// Format a Date's LOCAL calendar day as YYYY-MM-DD. We format by the
// user's local clock so "today" in the UI matches "today" on their
// wall — the ~timezone skew on the server-side created_at comparison
// is documented as an accepted v1 tradeoff.
function formatLocalDate(d: Date): string {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(d: Date, days: number): Date {
	const copy = new Date(d);
	copy.setDate(copy.getDate() + days);
	return copy;
}

// Window for a preset relative to `now`. Returns null for 'all' (no
// filter) and 'custom' (user supplies the window themselves).
export function computePreset(
	preset: DatePresetId,
	now: Date = new Date()
): { from: string; to: string } | null {
	if (preset === 'all' || preset === 'custom') return null;
	const today = formatLocalDate(now);

	switch (preset) {
		case 'last_7_days':
			return { from: formatLocalDate(addDays(now, -6)), to: today };
		case 'last_30_days':
			return { from: formatLocalDate(addDays(now, -29)), to: today };
		case 'last_90_days':
			return { from: formatLocalDate(addDays(now, -89)), to: today };
		case 'this_month': {
			const first = new Date(now.getFullYear(), now.getMonth(), 1);
			return { from: formatLocalDate(first), to: today };
		}
		case 'last_month': {
			const firstOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			// Day 0 of the current month = last day of the previous month.
			const lastOfLast = new Date(now.getFullYear(), now.getMonth(), 0);
			return { from: formatLocalDate(firstOfLast), to: formatLocalDate(lastOfLast) };
		}
	}
}

// Given from/to pulled out of the URL, figure out which preset (if
// any) matches. The dropdown uses this to self-describe its current
// selection. If nothing matches, we're in 'custom'.
export function matchPreset(
	from: string | null,
	to: string | null,
	now: Date = new Date()
): DatePresetId {
	if (!from && !to) return 'all';
	if (!from || !to) return 'custom';
	const candidates: DatePresetId[] = [
		'last_7_days',
		'last_30_days',
		'last_90_days',
		'this_month',
		'last_month'
	];
	for (const preset of candidates) {
		const window = computePreset(preset, now);
		if (window && window.from === from && window.to === to) return preset;
	}
	return 'custom';
}

// Server helper: given a YYYY-MM-DD "to" date, return the YYYY-MM-DD
// for the day AFTER it so we can do `.lt(created_at, ...)` and still
// include the full "to" day. Operates in UTC because the comparison
// against TIMESTAMPTZ on the DB side uses UTC midnight.
export function incrementDate(yyyymmdd: string): string {
	const [y, m, d] = yyyymmdd.split('-').map(Number);
	const next = new Date(Date.UTC(y, m - 1, d + 1));
	return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}
