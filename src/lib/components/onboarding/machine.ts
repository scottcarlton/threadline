// Pure phase/sub-step cursor logic for the onboarding flow. Kept free of Svelte
// runes and the DOM so it can be unit-tested in isolation — the +page.svelte
// component holds the reactive state and delegates movement/derivation here.

export interface MachineSub {
	id: string;
	required?: boolean;
}

export interface MachinePhase {
	id: string;
	subs: MachineSub[];
}

export interface Cursor {
	phaseIndex: number;
	subIndex: number;
}

export type PhaseStatus = 'done' | 'active' | 'upcoming';

/**
 * Resume: `onboarding_step` is the 1-based phase to resume at (the org row only
 * exists once General Information is done). Convert to a 0-based phase index,
 * clamped into range. Missing/invalid → phase 0.
 */
export function resumePhaseIndex(
	onboardingStep: number | null | undefined,
	phaseCount: number
): number {
	const idx = (onboardingStep ?? 1) - 1;
	if (!Number.isFinite(idx)) return 0;
	return Math.min(Math.max(idx, 0), Math.max(phaseCount - 1, 0));
}

/**
 * Advance one sub-step: next sub within the phase, else roll into the next
 * phase's first sub, else signal completion (cursor unchanged).
 */
export function nextCursor(
	cursor: Cursor,
	phases: MachinePhase[]
): { cursor: Cursor; completed: boolean } {
	const phase = phases[cursor.phaseIndex];
	if (phase && cursor.subIndex < phase.subs.length - 1) {
		return {
			cursor: { phaseIndex: cursor.phaseIndex, subIndex: cursor.subIndex + 1 },
			completed: false
		};
	}
	if (cursor.phaseIndex < phases.length - 1) {
		return { cursor: { phaseIndex: cursor.phaseIndex + 1, subIndex: 0 }, completed: false };
	}
	return { cursor, completed: true };
}

/** Roadmap phase state, given the cursor and whether the whole flow is done. */
export function phaseStatus(phaseIndex: number, cursor: Cursor, completed: boolean): PhaseStatus {
	if (completed) return 'done';
	if (phaseIndex < cursor.phaseIndex) return 'done';
	if (phaseIndex === cursor.phaseIndex) return 'active';
	return 'upcoming';
}

/** Within-phase chevron bounds. */
export function canGoPrev(cursor: Cursor): boolean {
	return cursor.subIndex > 0;
}

export function canGoNext(cursor: Cursor, phases: MachinePhase[]): boolean {
	const phase = phases[cursor.phaseIndex];
	return !!phase && cursor.subIndex < phase.subs.length - 1;
}

/** Required sub-steps cannot be skipped. */
export function isSkippable(sub: MachineSub | undefined): boolean {
	return !!sub && !sub.required;
}

// ── Stat cards ────────────────────────────────────────────────────────────
// One card per import step. The label is derived here and nowhere else: when
// the skip path and the import path each chose their own wording, a single
// step could show two contradictory cards ("0 Members Added" next to
// "10 Members Invited").

export interface SavedStat {
	key?: string;
	n: string;
	label: string;
	note?: string;
}

export interface Stat {
	key: string;
	n: string;
	label: string;
	note?: string;
	display: number;
}

export function statLabel(key: string, n: number): string {
	const one = n === 1;
	if (key === 'brands') return one ? 'Brand Added' : 'Brands Added';
	if (key === 'members') return one ? 'Member Added' : 'Members Added';
	if (key === 'accounts') return one ? 'Account Added' : 'Accounts Added';
	if (key === 'products') return one ? 'Product Added' : 'Products Added';
	if (key === 'orders') return one ? 'Order Added' : 'Orders Added';
	return '';
}

/** Rows saved before stats were keyed carry only a label; map them back. */
export function statKeyFromLabel(label: string): string {
	const l = label.toLowerCase();
	if (l.startsWith('brand')) return 'brands';
	if (l.startsWith('member')) return 'members';
	if (l.startsWith('account')) return 'accounts';
	if (l.startsWith('product')) return 'products';
	if (l.startsWith('order')) return 'orders';
	return label;
}

/**
 * Collapse saved stats to one row per step, keeping the most recent, and
 * relabel through `statLabel` so old wording can't survive alongside current
 * wording for the same step. Order of first appearance is preserved.
 */
export function restoreStats(rows: SavedStat[] | null | undefined): Stat[] {
	const byKey = new Map<string, { key: string; n: string; note?: string }>();
	for (const r of rows ?? []) {
		const key = r.key ?? statKeyFromLabel(r.label);
		byKey.set(key, { key, n: r.n, note: r.note });
	}
	return [...byKey.values()].map((r) => ({
		...r,
		label: statLabel(r.key, Number(r.n) || 0),
		display: Number(r.n) || 0
	}));
}

// ── Org type from free text ───────────────────────────────────────────────
// The org-type question offers cards, but the prompt bar is always there, so
// typing the answer has to work too. Matching lives here so the accepted
// wordings are tested rather than discovered by a user typing "sales rep".

export type OrgTypeValue = 'brand' | 'rep' | 'retailer';

const ORG_TYPE_ALIASES: Record<OrgTypeValue, string[]> = {
	brand: ['brand', 'brands', 'label', 'manufacturer', 'vendor'],
	rep: [
		'rep',
		'reps',
		'sales rep',
		'sales representative',
		'independent sales rep',
		'independent sales representative',
		'independent rep',
		'isr',
		'showroom',
		'agency'
	],
	retailer: ['retailer', 'retail', 'retailers', 'store', 'boutique', 'shop', 'buyer']
};

/**
 * Resolve typed input to an org type, or null when it isn't recognisable.
 * Punctuation and casing are ignored; "a brand" and "I'm a Brand." both match.
 */
export function matchOrgType(input: string | null | undefined): OrgTypeValue | null {
	if (!input) return null;
	const cleaned = input
		.toLowerCase()
		.replace(/[^a-z\s]/g, ' ')
		.replace(/\b(i'?m|i am|we'?re|we are|a|an|the)\b/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!cleaned) return null;

	for (const [value, aliases] of Object.entries(ORG_TYPE_ALIASES) as [OrgTypeValue, string[]][]) {
		if (aliases.includes(cleaned)) return value;
	}
	// Fall back to a contained alias so "independent sales rep for 6 brands"
	// still resolves. Longest alias first, or "rep" would beat "sales rep".
	const byLength = (Object.entries(ORG_TYPE_ALIASES) as [OrgTypeValue, string[]][])
		.flatMap(([value, aliases]) => aliases.map((a) => ({ value, alias: a })))
		.sort((a, b) => b.alias.length - a.alias.length);
	for (const { value, alias } of byLength) {
		if (new RegExp(`\\b${alias}\\b`).test(cleaned)) return value;
	}
	return null;
}
