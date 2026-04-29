export type SpotlightBucket =
	| 'overdue'
	| 'approaching_start'
	| 'in_window'
	| 'approaching_complete'
	| 'stale_draft';

export const SPOTLIGHT_BUCKETS: SpotlightBucket[] = [
	'overdue',
	'approaching_start',
	'in_window',
	'approaching_complete',
	'stale_draft'
];

export const SPOTLIGHT_LABELS: Record<SpotlightBucket, string> = {
	overdue: 'Overdue',
	approaching_start: 'Starts soon (<7d)',
	in_window: 'Needs shipped (within window)',
	approaching_complete: 'Closing soon (<7d)',
	stale_draft: 'Stale (>21d)'
};

export const APPROACHING_DAYS = 7;
export const STALE_DRAFT_DAYS = 21;

export type SpotlightInput = {
	status: string | null | undefined;
	start_ship_date: string | null | undefined;
	expected_ship_date: string | null | undefined;
	shipped_at: string | null | undefined;
	updated_at: string | null | undefined;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function addDays(yyyymmdd: string, days: number): string {
	const d = new Date(`${yyyymmdd}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return isoDate(d);
}

export function classifyOrder(
	o: SpotlightInput,
	today: string = isoDate(new Date())
): SpotlightBucket[] {
	const buckets: SpotlightBucket[] = [];
	const status = o.status ?? '';
	const shipped = o.shipped_at != null;
	const inFlight = (status === 'submitted' || status === 'confirmed') && !shipped;
	const start = o.start_ship_date ?? null;
	const expected = o.expected_ship_date ?? null;

	if (inFlight && expected && expected < today) {
		buckets.push('overdue');
	}

	if (inFlight && start && start > today) {
		const cutoff = addDays(today, APPROACHING_DAYS);
		if (start <= cutoff) buckets.push('approaching_start');
	}

	if (inFlight && start && expected && start <= today && today <= expected) {
		buckets.push('in_window');
	}

	if (inFlight && expected && expected > today) {
		const cutoff = addDays(today, APPROACHING_DAYS);
		if (expected <= cutoff) buckets.push('approaching_complete');
	}

	if (status === 'draft' && o.updated_at) {
		const staleCutoff = new Date(Date.now() - STALE_DRAFT_DAYS * DAY_MS);
		if (new Date(o.updated_at) < staleCutoff) buckets.push('stale_draft');
	}

	return buckets;
}

export function matchesBucket(
	o: SpotlightInput,
	bucket: SpotlightBucket | 'all',
	today?: string
): boolean {
	const matched = classifyOrder(o, today);
	if (bucket === 'all') return matched.length > 0;
	return matched.includes(bucket);
}

export function parseSpotlightParam(
	value: string | null | undefined
): SpotlightBucket | 'all' | null {
	if (!value) return null;
	if (value === 'all') return 'all';
	return (SPOTLIGHT_BUCKETS as string[]).includes(value) ? (value as SpotlightBucket) : null;
}
