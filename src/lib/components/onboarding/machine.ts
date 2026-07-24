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
