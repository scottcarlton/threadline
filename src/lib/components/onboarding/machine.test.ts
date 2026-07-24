import { describe, it, expect } from 'vitest';
import {
	resumePhaseIndex,
	nextCursor,
	phaseStatus,
	canGoPrev,
	canGoNext,
	isSkippable,
	type MachinePhase
} from './machine';

// Mirrors the shape of the real flow: 4 phases, general has 3 required subs.
const phases: MachinePhase[] = [
	{
		id: 'general',
		subs: [
			{ id: 'name', required: true },
			{ id: 'orgType', required: true },
			{ id: 'orgName', required: true }
		]
	},
	{ id: 'import', subs: [{ id: 'accounts' }, { id: 'products' }, { id: 'orders' }] },
	{ id: 'settings', subs: [{ id: 'address' }, { id: 'terms' }] },
	{ id: 'integrations', subs: [{ id: 'accounting' }, { id: 'email' }] }
];

describe('resumePhaseIndex', () => {
	it('defaults to phase 0 when no step persisted', () => {
		expect(resumePhaseIndex(null, 4)).toBe(0);
		expect(resumePhaseIndex(undefined, 4)).toBe(0);
	});

	it('maps 1-based step to 0-based phase index', () => {
		expect(resumePhaseIndex(1, 4)).toBe(0);
		expect(resumePhaseIndex(2, 4)).toBe(1); // resume at Import after General
		expect(resumePhaseIndex(4, 4)).toBe(3);
	});

	it('clamps out-of-range steps into [0, phaseCount-1]', () => {
		expect(resumePhaseIndex(99, 4)).toBe(3);
		expect(resumePhaseIndex(0, 4)).toBe(0);
		expect(resumePhaseIndex(-5, 4)).toBe(0);
	});

	it('never returns negative for a zero-phase config', () => {
		expect(resumePhaseIndex(1, 0)).toBe(0);
	});
});

describe('nextCursor', () => {
	it('advances to the next sub within a phase', () => {
		expect(nextCursor({ phaseIndex: 0, subIndex: 0 }, phases)).toEqual({
			cursor: { phaseIndex: 0, subIndex: 1 },
			completed: false
		});
	});

	it('rolls into the next phase after the last sub', () => {
		expect(nextCursor({ phaseIndex: 0, subIndex: 2 }, phases)).toEqual({
			cursor: { phaseIndex: 1, subIndex: 0 },
			completed: false
		});
	});

	it('signals completion at the final sub of the final phase', () => {
		const last = { phaseIndex: 3, subIndex: 1 };
		expect(nextCursor(last, phases)).toEqual({ cursor: last, completed: true });
	});

	it('walks the entire flow to completion without skipping phases', () => {
		let cursor = { phaseIndex: 0, subIndex: 0 };
		const visited: string[] = [];
		for (let i = 0; i < 50; i++) {
			visited.push(`${cursor.phaseIndex}.${cursor.subIndex}`);
			const r = nextCursor(cursor, phases);
			if (r.completed) break;
			cursor = r.cursor;
		}
		expect(visited).toEqual(['0.0', '0.1', '0.2', '1.0', '1.1', '1.2', '2.0', '2.1', '3.0', '3.1']);
	});
});

describe('phaseStatus', () => {
	it('marks earlier phases done, current active, later upcoming', () => {
		const cursor = { phaseIndex: 1, subIndex: 0 };
		expect(phaseStatus(0, cursor, false)).toBe('done');
		expect(phaseStatus(1, cursor, false)).toBe('active');
		expect(phaseStatus(2, cursor, false)).toBe('upcoming');
	});

	it('marks every phase done when the flow is complete', () => {
		const cursor = { phaseIndex: 3, subIndex: 1 };
		for (let i = 0; i < phases.length; i++) {
			expect(phaseStatus(i, cursor, true)).toBe('done');
		}
	});
});

describe('canGoPrev / canGoNext', () => {
	it('canGoPrev is false at the first sub, true afterwards', () => {
		expect(canGoPrev({ phaseIndex: 0, subIndex: 0 })).toBe(false);
		expect(canGoPrev({ phaseIndex: 0, subIndex: 1 })).toBe(true);
	});

	it('canGoNext is false at the last sub of a phase', () => {
		expect(canGoNext({ phaseIndex: 0, subIndex: 1 }, phases)).toBe(true);
		expect(canGoNext({ phaseIndex: 0, subIndex: 2 }, phases)).toBe(false);
	});
});

describe('isSkippable', () => {
	it('required subs cannot be skipped', () => {
		expect(isSkippable({ id: 'name', required: true })).toBe(false);
	});

	it('non-required subs can be skipped', () => {
		expect(isSkippable({ id: 'accounts' })).toBe(true);
	});

	it('undefined is not skippable', () => {
		expect(isSkippable(undefined)).toBe(false);
	});
});
