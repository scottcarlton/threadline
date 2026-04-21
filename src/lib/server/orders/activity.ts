// Shape raw order_audits rows into a humanized, timeline-ready list of
// entries. The DB stores one audit row per line INSERT/UPDATE/DELETE and per
// status/field change (see supabase/migrations/20260414000003_order_audits.sql).
// Rendering those as-is produces walls of "line_added · line_added · …"
// noise. This helper collapses consecutive line_added events from the same
// actor into a single "N lines added" entry and decorates everything with
// actor names.
//
// Kept free of Supabase imports so it's trivially unit-testable — the caller
// fetches the raw rows and a profile-name lookup and hands them in.

export type RawAudit = {
	id: string;
	order_id: string;
	actor_id: string | null;
	event_type:
		| 'status_changed'
		| 'field_changed'
		| 'line_added'
		| 'line_removed'
		| 'line_changed'
		| 'order_created'
		| 'order_cancelled';
	field: string | null;
	before_value: unknown;
	after_value: unknown;
	created_at: string;
};

type LineSnapshot = {
	style_number?: string | null;
	description?: string | null;
	color?: string | null;
	size?: string | null;
	qty?: number | null;
	unit_price?: number | null;
};

export type ActivityEntry = {
	/** ID of the first raw audit in the bucket (stable key for iterating). */
	id: string;
	kind: 'status' | 'content';
	title: string;
	subtitle: string | null;
	actor_name: string | null;
	at: string;
	/** 1 for single-event entries, N for aggregated ones. */
	event_count: number;
};

// Consecutive line_added events from the same actor within this window are
// treated as one logical add (e.g. a batch save of several sizes/colors).
const LINE_ADD_BUCKET_MS = 60_000;

/**
 * Collapse raw `order_audits` rows into rendering-ready entries. Input is
 * expected in descending-time order (newest first), matching the index on
 * `order_audits (order_id, created_at desc)`.
 */
export function aggregateOrderActivity(
	audits: RawAudit[],
	profileNames: ReadonlyMap<string, string | null>
): ActivityEntry[] {
	const out: ActivityEntry[] = [];
	let i = 0;
	while (i < audits.length) {
		const a = audits[i];

		if (a.event_type === 'line_added') {
			// Walk forward collecting consecutive line_added rows from the same
			// actor within LINE_ADD_BUCKET_MS of the bucket's first row.
			const bucket: RawAudit[] = [a];
			const firstAt = Date.parse(a.created_at);
			let j = i + 1;
			while (j < audits.length) {
				const next = audits[j];
				if (next.event_type !== 'line_added') break;
				if (next.actor_id !== a.actor_id) break;
				const dt = Math.abs(firstAt - Date.parse(next.created_at));
				if (dt > LINE_ADD_BUCKET_MS) break;
				bucket.push(next);
				j++;
			}
			out.push(describeLineAddBucket(bucket, profileNames));
			i = j;
			continue;
		}

		out.push(describeSingle(a, profileNames));
		i++;
	}
	return out;
}

function actorNameFor(
	audit: Pick<RawAudit, 'actor_id'>,
	profileNames: ReadonlyMap<string, string | null>
): string | null {
	if (!audit.actor_id) return null;
	return profileNames.get(audit.actor_id) ?? null;
}

function describeLineAddBucket(
	bucket: RawAudit[],
	profileNames: ReadonlyMap<string, string | null>
): ActivityEntry {
	const snapshots = bucket.map((b) => (b.after_value ?? {}) as LineSnapshot);
	const total = bucket.length;

	// Group snapshots by (style_number, color) so the subtitle can read
	// "Sophie Blouse · Black (XS, S, M)" rather than listing every row.
	const groups = new Map<string, { label: string; color: string | null; sizes: string[] }>();
	for (const snap of snapshots) {
		const styleLabel = snap.description ?? snap.style_number ?? 'Item';
		const color = snap.color ?? null;
		const key = `${styleLabel}|${color ?? ''}`;
		let group = groups.get(key);
		if (!group) {
			group = { label: styleLabel, color, sizes: [] };
			groups.set(key, group);
		}
		if (snap.size) group.sizes.push(snap.size);
	}

	let subtitle: string | null = null;
	const groupEntries = [...groups.values()];
	if (groupEntries.length === 1) {
		const g = groupEntries[0];
		const sizeStr = g.sizes.length > 0 ? ` (${g.sizes.join(', ')})` : '';
		subtitle = g.color ? `${g.label} · ${g.color}${sizeStr}` : `${g.label}${sizeStr}`;
	} else if (groupEntries.length > 1) {
		subtitle = groupEntries.map((g) => (g.color ? `${g.label} · ${g.color}` : g.label)).join(' · ');
	}

	return {
		id: bucket[0].id,
		kind: 'content',
		title: `${total} ${total === 1 ? 'line' : 'lines'} added`,
		subtitle,
		actor_name: actorNameFor(bucket[0], profileNames),
		at: bucket[0].created_at,
		event_count: total
	};
}

function describeSingle(
	a: RawAudit,
	profileNames: ReadonlyMap<string, string | null>
): ActivityEntry {
	const actor_name = actorNameFor(a, profileNames);
	const base = {
		id: a.id,
		actor_name,
		at: a.created_at,
		event_count: 1
	} as const;

	switch (a.event_type) {
		case 'order_created':
			return { ...base, kind: 'status', title: 'Order created', subtitle: null };
		case 'status_changed': {
			const from = asText(a.before_value);
			const to = asText(a.after_value);
			return {
				...base,
				kind: 'status',
				title: to ? `Marked ${to}` : 'Status changed',
				subtitle: from && to ? `${titleize(from)} → ${titleize(to)}` : null
			};
		}
		case 'order_cancelled':
			return { ...base, kind: 'status', title: 'Order cancelled', subtitle: null };
		case 'line_removed': {
			const snap = (a.before_value ?? {}) as LineSnapshot;
			const label = snap.description ?? snap.style_number ?? 'Line';
			const parts = [snap.color, snap.size].filter((x): x is string => !!x);
			return {
				...base,
				kind: 'content',
				title: 'Line removed',
				subtitle: parts.length > 0 ? `${label} · ${parts.join(' · ')}` : label
			};
		}
		case 'line_changed': {
			const before = (a.before_value ?? {}) as LineSnapshot;
			const after = (a.after_value ?? {}) as LineSnapshot;
			const label = after.description ?? after.style_number ?? before.style_number ?? 'Line';
			const changes: string[] = [];
			if (before.qty !== after.qty) changes.push(`qty ${before.qty ?? 0} → ${after.qty ?? 0}`);
			if (before.color !== after.color)
				changes.push(`color ${before.color ?? '—'} → ${after.color ?? '—'}`);
			if (before.size !== after.size)
				changes.push(`size ${before.size ?? '—'} → ${after.size ?? '—'}`);
			return {
				...base,
				kind: 'content',
				title: 'Line changed',
				subtitle: changes.length > 0 ? `${label} · ${changes.join(' · ')}` : label
			};
		}
		case 'line_added': {
			// Shouldn't normally hit this branch — line_added flows through the
			// bucket path — but keep a solo fallback for safety.
			const snap = (a.after_value ?? {}) as LineSnapshot;
			const label = snap.description ?? snap.style_number ?? 'Line';
			const parts = [snap.color, snap.size].filter((x): x is string => !!x);
			return {
				...base,
				kind: 'content',
				title: '1 line added',
				subtitle: parts.length > 0 ? `${label} · ${parts.join(' · ')}` : label
			};
		}
		case 'field_changed': {
			const from = asText(a.before_value);
			const to = asText(a.after_value);
			return {
				...base,
				kind: 'content',
				title: a.field ? `${humanize(a.field)} changed` : 'Field changed',
				subtitle: from && to ? `${from} → ${to}` : (to ?? from ?? null)
			};
		}
	}
}

function asText(value: unknown): string | null {
	if (value == null) return null;
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return null;
}

function titleize(s: string): string {
	if (!s) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function humanize(field: string): string {
	// "start_ship_date" → "Start ship date"
	return titleize(field.replaceAll('_', ' '));
}
