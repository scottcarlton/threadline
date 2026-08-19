import { describe, it, expect } from 'vitest';
import {
	resumePhaseIndex,
	nextCursor,
	phaseStatus,
	canGoPrev,
	canGoNext,
	isSkippable,
	statLabel,
	restoreStats,
	matchOrgType,
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

describe('stat cards', () => {
	it('derives one label per step, singular and plural', () => {
		expect(statLabel('members', 1)).toBe('Member Added');
		expect(statLabel('members', 10)).toBe('Members Added');
		expect(statLabel('accounts', 2)).toBe('Accounts Added');
		expect(statLabel('products', 0)).toBe('Products Added');
		expect(statLabel('orders', 0)).toBe('Orders Added');
	});

	it('restores every saved step, not just the first', () => {
		const restored = restoreStats([
			{ key: 'members', n: '10', label: 'Members Added' },
			{ key: 'accounts', n: '2', label: 'Accounts Added' },
			{ key: 'orders', n: '0', label: 'Orders Added', note: 'Skipped for now' }
		]);
		expect(restored.map((s) => s.key)).toEqual(['members', 'accounts', 'orders']);
		expect(restored.map((s) => s.display)).toEqual([10, 2, 0]);
		expect(restored[2].note).toBe('Skipped for now');
	});

	it('collapses a skipped row and a later import of the same step into one card', () => {
		const restored = restoreStats([
			{ n: '0', label: 'Members Added', note: 'Skipped for now' },
			{ n: '10', label: 'Members Invited' }
		]);
		expect(restored).toHaveLength(1);
		expect(restored[0].key).toBe('members');
		expect(restored[0].label).toBe('Members Added');
		expect(restored[0].display).toBe(10);
		expect(restored[0].note).toBeUndefined();
	});

	it('keeps a zero count visible rather than dropping the card', () => {
		const restored = restoreStats([{ key: 'products', n: '0', label: 'Products Added' }]);
		expect(restored).toHaveLength(1);
		expect(restored[0].display).toBe(0);
	});

	it('handles an empty or missing list', () => {
		expect(restoreStats([])).toEqual([]);
		expect(restoreStats(null)).toEqual([]);
	});
});

describe('matchOrgType', () => {
	it('matches the three card labels as typed', () => {
		expect(matchOrgType('Brand')).toBe('brand');
		expect(matchOrgType('Independent Sales Rep')).toBe('rep');
		expect(matchOrgType('Retailer')).toBe('retailer');
	});

	it('ignores case, punctuation and filler words', () => {
		expect(matchOrgType('  brand. ')).toBe('brand');
		expect(matchOrgType("I'm a brand")).toBe('brand');
		expect(matchOrgType('We are a retailer')).toBe('retailer');
	});

	it('accepts common industry wordings', () => {
		expect(matchOrgType('sales rep')).toBe('rep');
		expect(matchOrgType('ISR')).toBe('rep');
		expect(matchOrgType('showroom')).toBe('rep');
		expect(matchOrgType('boutique')).toBe('retailer');
		expect(matchOrgType('retail')).toBe('retailer');
	});

	it('prefers the longest alias inside a sentence', () => {
		// "rep" alone must not win over "independent sales rep".
		expect(matchOrgType('independent sales rep for six brands')).toBe('rep');
	});

	it('returns null for anything unrecognisable', () => {
		expect(matchOrgType('')).toBe(null);
		expect(matchOrgType(null)).toBe(null);
		expect(matchOrgType('not sure yet')).toBe(null);
		expect(matchOrgType('12345')).toBe(null);
	});
});
