import { describe, it, expect } from 'vitest';

// Mirror of the pctDelta helper in +server.ts. Kept in sync by hand;
// extracted here so we can exercise its edge cases without the full
// Supabase/Anthropic surface.
function pctDelta(current: number, previous: number): string {
	if (previous === 0) return current === 0 ? 'flat' : 'new activity';
	const delta = ((current - previous) / previous) * 100;
	if (Math.abs(delta) < 1) return 'flat';
	return `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`;
}

describe('pctDelta', () => {
	it('returns "flat" when both sides are 0', () => {
		expect(pctDelta(0, 0)).toBe('flat');
	});

	it('returns "new activity" when previous is 0 and current is not', () => {
		expect(pctDelta(5, 0)).toBe('new activity');
	});

	it('returns a positive delta with + sign', () => {
		expect(pctDelta(120, 100)).toBe('+20%');
	});

	it('returns a negative delta without + sign', () => {
		expect(pctDelta(80, 100)).toBe('-20%');
	});

	it('returns "flat" when delta is under 1%', () => {
		expect(pctDelta(1005, 1000)).toBe('flat');
	});
});
